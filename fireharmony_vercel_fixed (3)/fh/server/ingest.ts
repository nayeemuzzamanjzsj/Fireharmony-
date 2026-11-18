import { CONFIG, redactFirmsKey } from './config.js';
import { query, getDatabaseSize, ensureSchema, getPool } from './db.js';
import {
  fetchFirmsArea,
  fetchDataAvailability,
  ParsedDetection,
  AvailabilityRange,
} from './firmsClient.js';
import { rebuildSnapshot } from './snapshot.js';

export function getProductPlatforms(product: string): number[] {
  const p = product.toUpperCase();
  if (p.includes('MODIS')) return [1, 2, 0];
  if (p.includes('SNPP')) return [3];
  if (p.includes('NOAA20') || p.includes('NOAA-20')) return [4];
  if (p.includes('NOAA21') || p.includes('NOAA-21')) return [5];
  return [];
}

export function buildUpsertSql(): string {
  return `INSERT INTO detections (acq_date, acq_time, platform, lat_i, lon_i, frp, conf_class, conf_raw, night, sp, district)
    SELECT
      d::date, t::smallint, p::smallint, lat::integer, lon::integer,
      frp::real, cc::smallint, cr::smallint, n::boolean, s::boolean, dist::smallint
    FROM unnest(
      $1::text[], $2::smallint[], $3::smallint[], $4::integer[], $5::integer[],
      $6::real[], $7::smallint[], $8::smallint[], $9::boolean[], $10::boolean[], $11::smallint[]
    ) AS t(d, t, p, lat, lon, frp, cc, cr, n, s, dist)
    ON CONFLICT (acq_date, platform, acq_time, lat_i, lon_i)
    DO UPDATE SET
      frp = EXCLUDED.frp,
      conf_class = EXCLUDED.conf_class,
      conf_raw = EXCLUDED.conf_raw,
      night = EXCLUDED.night,
      sp = EXCLUDED.sp,
      district = EXCLUDED.district`;
}

export async function bulkUpsertDetections(rows: ParsedDetection[]): Promise<number> {
  if (rows.length === 0) return 0;
  const acq_dates = rows.map((r) => r.acq_date);
  const acq_times = rows.map((r) => r.acq_time);
  const platforms = rows.map((r) => r.platform);
  const lat_is = rows.map((r) => r.lat_i);
  const lon_is = rows.map((r) => r.lon_i);
  const frps = rows.map((r) => r.frp);
  const conf_classes = rows.map((r) => r.conf_class);
  const conf_raws = rows.map((r) => r.conf_raw);
  const nights = rows.map((r) => r.night);
  const sps = rows.map((r) => r.sp);
  const districts = rows.map((r) => r.district);

  await query(buildUpsertSql(), [
    acq_dates,
    acq_times,
    platforms,
    lat_is,
    lon_is,
    frps,
    conf_classes,
    conf_raws,
    nights,
    sps,
    districts,
  ]);
  return rows.length;
}

export function planFiveDayChunks(startDateStr: string, endDateStr: string): { start: string; days: number }[] {
  // Plan chunks from endDateStr backward to startDateStr, newest first, max 5 days
  const chunks: { start: string; days: number }[] = [];
  const start = new Date(startDateStr + 'T00:00:00Z');
  let currentEnd = new Date(endDateStr + 'T00:00:00Z');

  while (currentEnd >= start) {
    const chunkStart = new Date(currentEnd);
    chunkStart.setUTCDate(chunkStart.getUTCDate() - 4); // 5 days: chunkStart .. currentEnd

    if (chunkStart < start) {
      // Partial chunk at the very beginning
      const days = Math.round((currentEnd.getTime() - start.getTime()) / (86400 * 1000)) + 1;
      chunks.push({
        start: start.toISOString().slice(0, 10),
        days: Math.max(1, Math.min(5, days)),
      });
      break;
    } else {
      chunks.push({
        start: chunkStart.toISOString().slice(0, 10),
        days: 5,
      });
      currentEnd = new Date(chunkStart);
      currentEnd.setUTCDate(currentEnd.getUTCDate() - 1);
    }
  }

  return chunks;
}

export async function runTick(budgetMs = 200000): Promise<{
  status: 'ok' | 'partial' | 'error' | 'skipped';
  skipped?: string;
  requests?: number;
  rows_upserted?: number;
  error?: string;
}> {
  if (!CONFIG.DATABASE_URL) {
    return { status: 'error', error: 'DATABASE_URL is not configured' };
  }
  if (!CONFIG.FIRMS_MAP_KEY) {
    return { status: 'error', error: 'FIRMS_MAP_KEY is not configured' };
  }

  const schemaRes = await ensureSchema();
  if (!schemaRes.ok) {
    return { status: 'error', error: `Schema check failed: ${schemaRes.error}` };
  }

  const startTime = Date.now();

  // Try to acquire lease lock
  await query(`
    INSERT INTO ingest_lock (name, locked_until)
    VALUES ('tick', now() - interval '1 second')
    ON CONFLICT (name) DO NOTHING
  `);

  const lockRes = await query(`
    UPDATE ingest_lock
    SET locked_until = now() + interval '5 minutes'
    WHERE name = 'tick' AND locked_until < now()
  `);

  if (lockRes.rowCount === 0) {
    return { status: 'skipped', skipped: 'another run active' };
  }

  // Create ingest_runs entry
  const runRow = await query<{ id: string }>(
    `INSERT INTO ingest_runs (job, started_at, status)
     VALUES ('tick', now(), 'running')
     RETURNING id`
  );
  const runId = runRow.rows[0].id;

  let requestCount = 0;
  let rowsUpserted = 0;
  let runStatus: 'ok' | 'partial' | 'error' = 'ok';
  let runError: string | null = null;
  let storageGuardTriggered = false;

  const refreshLock = async () => {
    await query(`UPDATE ingest_lock SET locked_until = now() + interval '5 minutes' WHERE name = 'tick'`);
  };

  const isStorageExceeded = async () => {
    const { bytes, limit_bytes } = await getDatabaseSize();
    if (bytes >= limit_bytes * 0.85) {
      storageGuardTriggered = true;
      runError = 'storage guard: database size exceeded 85% of limit';
      return true;
    }
    return false;
  };

  try {
    // Check data availability
    const avail = await fetchDataAvailability();
    if (avail.rawError) {
      runError = avail.rawError;
    }

    // Step A: FORWARD (NRT for last 5 days)
    const forwardProducts = ['MODIS_NRT', 'VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT'];
    for (const prod of forwardProducts) {
      if (Date.now() - startTime > budgetMs) {
        runStatus = 'partial';
        break;
      }
      if (await isStorageExceeded()) break;

      try {
        requestCount++;
        const res = await fetchFirmsArea(prod, 5);
        if (res.rows.length > 0) {
          await bulkUpsertDetections(res.rows);
          rowsUpserted += res.rows.length;
        }

        // Record coverage for last 5 days
        const today = new Date();
        for (let d = 0; d < 5; d++) {
          const dayDate = new Date(today);
          dayDate.setUTCDate(today.getUTCDate() - d);
          const dayStr = dayDate.toISOString().slice(0, 10);
          const dayRows = res.rows.filter((r) => r.acq_date === dayStr).length;

          await query(
            `INSERT INTO ingest_coverage (product, day, sp, rows, fetched_at)
             VALUES ($1, $2::date, false, $3, now())
             ON CONFLICT (product, day) DO UPDATE
             SET rows = CASE WHEN ingest_coverage.sp = true THEN ingest_coverage.rows ELSE EXCLUDED.rows END,
                 fetched_at = now()`,
            [prod, dayStr, dayRows]
          );
        }
      } catch (err: any) {
        console.warn(`Forward fetch error for ${prod}:`, redactFirmsKey(err.message));
        if (err.message.includes('Rate limit') || err.message.includes('429')) {
          runError = err.message;
          runStatus = 'error';
          break;
        }
      }
      await refreshLock();
    }

    // Step B: SP UPGRADE
    // For each product-day stored as NRT where SP now exists, fetch SP and replace
    if (runStatus !== 'error' && !storageGuardTriggered && Date.now() - startTime < budgetMs) {
      const spMap: Record<string, string> = {
        MODIS_NRT: 'MODIS_SP',
        VIIRS_SNPP_NRT: 'VIIRS_SNPP_SP',
        VIIRS_NOAA20_NRT: 'VIIRS_NOAA20_SP',
      };

      for (const [nrtProd, spProd] of Object.entries(spMap)) {
        if (Date.now() - startTime > budgetMs) {
          runStatus = 'partial';
          break;
        }
        const spMaxDate = avail.ranges[spProd]?.max_date;
        if (!spMaxDate) continue;

        const upgradeCandidates = await query<{ day: string }>(
          `SELECT day::text FROM ingest_coverage
           WHERE product = $1 AND sp = false AND day <= $2::date
           ORDER BY day DESC
           LIMIT 10`,
          [nrtProd, spMaxDate]
        );

        for (const row of upgradeCandidates.rows) {
          if (Date.now() - startTime > budgetMs) {
            runStatus = 'partial';
            break;
          }
          if (await isStorageExceeded()) break;

          try {
            requestCount++;
            const spRes = await fetchFirmsArea(spProd, 1, row.day);
            const platforms = getProductPlatforms(nrtProd);

            // In ONE transaction: delete NRT rows for this product on this day and insert SP rows
            const client = await getPool()!.connect();
            try {
              await client.query('BEGIN');
              await client.query(
                `DELETE FROM detections
                 WHERE acq_date = $1::date AND platform = ANY($2::smallint[]) AND sp = false`,
                [row.day, platforms]
              );
              if (spRes.rows.length > 0) {
                // Upsert SP rows
                const acq_dates = spRes.rows.map((r) => r.acq_date);
                const acq_times = spRes.rows.map((r) => r.acq_time);
                const plats = spRes.rows.map((r) => r.platform);
                const lat_is = spRes.rows.map((r) => r.lat_i);
                const lon_is = spRes.rows.map((r) => r.lon_i);
                const frps = spRes.rows.map((r) => r.frp);
                const conf_classes = spRes.rows.map((r) => r.conf_class);
                const conf_raws = spRes.rows.map((r) => r.conf_raw);
                const nights = spRes.rows.map((r) => r.night);
                const sps = spRes.rows.map((r) => r.sp);
                const districts = spRes.rows.map((r) => r.district);

                await client.query(buildUpsertSql(), [
                  acq_dates,
                  acq_times,
                  plats,
                  lat_is,
                  lon_is,
                  frps,
                  conf_classes,
                  conf_raws,
                  nights,
                  sps,
                  districts,
                ]);
                rowsUpserted += spRes.rows.length;
              }

              await client.query(
                `INSERT INTO ingest_coverage (product, day, sp, rows, fetched_at)
                 VALUES ($1, $2::date, true, $3, now())
                 ON CONFLICT (product, day) DO UPDATE
                 SET sp = true, rows = EXCLUDED.rows, fetched_at = now()`,
                [spProd, row.day, spRes.rows.length]
              );

              await client.query('COMMIT');
            } catch (txErr) {
              await client.query('ROLLBACK');
              throw txErr;
            } finally {
              client.release();
            }
          } catch (err: any) {
            console.warn(`SP upgrade error for ${spProd} on ${row.day}:`, redactFirmsKey(err.message));
          }
          await refreshLock();
        }
      }
    }

    // Step C: GAP HEALING
    if (runStatus !== 'error' && !storageGuardTriggered && Date.now() - startTime < budgetMs) {
      let gapRequests = 0;
      const todayIso = new Date().toISOString().slice(0, 10);
      const spProducts = ['MODIS_SP', 'VIIRS_SNPP_SP', 'VIIRS_NOAA20_SP'];

      for (const prod of spProducts) {
        if (gapRequests >= 40 || Date.now() - startTime > budgetMs) break;
        const pRange = avail.ranges[prod];
        if (!pRange) continue;

        // Find missing days between start_date and today - 1
        const missingDaysRes = await query<{ missing_day: string }>(
          `SELECT d::date::text as missing_day
           FROM generate_series($1::date, ($2::date - interval '1 day'), '1 day'::interval) d
           LEFT JOIN ingest_coverage c ON c.day = d::date AND c.product = $3
           WHERE c.day IS NULL
           ORDER BY d DESC
           LIMIT $4`,
          [pRange.min_date, todayIso, prod, 40 - gapRequests]
        );

        for (const row of missingDaysRes.rows) {
          if (gapRequests >= 40 || Date.now() - startTime > budgetMs) break;
          if (await isStorageExceeded()) break;

          try {
            gapRequests++;
            requestCount++;
            const useSp = pRange.max_date && row.missing_day <= pRange.max_date;
            const fetchSource = useSp ? prod : prod.replace('_SP', '_NRT');
            const res = await fetchFirmsArea(fetchSource, 1, row.missing_day);

            if (res.rows.length > 0) {
              await bulkUpsertDetections(res.rows);
              rowsUpserted += res.rows.length;
            }

            await query(
              `INSERT INTO ingest_coverage (product, day, sp, rows, fetched_at)
               VALUES ($1, $2::date, $3, $4, now())
               ON CONFLICT (product, day) DO UPDATE
               SET rows = EXCLUDED.rows, sp = EXCLUDED.sp, fetched_at = now()`,
              [prod, row.missing_day, useSp, res.rows.length]
            );
          } catch (err: any) {
            console.warn(`Gap healing error for ${prod} on ${row.missing_day}:`, redactFirmsKey(err.message));
          }
          await refreshLock();
        }
      }
    }

    // Step D: BACKFILL (Newest first backward in 5-day chunks toward start_date)
    if (runStatus !== 'error' && !storageGuardTriggered && Date.now() - startTime < budgetMs) {
      const backfillProducts = ['MODIS_SP', 'VIIRS_SNPP_SP', 'VIIRS_NOAA20_SP'];

      for (const prod of backfillProducts) {
        if (Date.now() - startTime > budgetMs) {
          runStatus = 'partial';
          break;
        }
        if (await isStorageExceeded()) break;

        const pRange = avail.ranges[prod];
        if (!pRange) continue;

        // Initialize backfill state if not present
        await query(
          `INSERT INTO backfill_state (product, start_date, start_is_assumed, cursor_date, done)
           VALUES ($1, $2::date, $3, $4::date, false)
           ON CONFLICT (product) DO NOTHING`,
          [prod, pRange.min_date, !!avail.rawError, pRange.max_date]
        );

        const stateRes = await query<{
          cursor_date: string;
          start_date: string;
          done: boolean;
        }>(`SELECT cursor_date::text, start_date::text, done FROM backfill_state WHERE product = $1`, [
          prod,
        ]);

        const state = stateRes.rows[0];
        if (!state || state.done) continue;

        let cursorDate = new Date(state.cursor_date + 'T00:00:00Z');
        const startDate = new Date(state.start_date + 'T00:00:00Z');

        while (cursorDate >= startDate && Date.now() - startTime < budgetMs) {
          if (await isStorageExceeded()) break;

          // 5-day chunk ending at cursorDate
          const chunkStartDate = new Date(cursorDate);
          chunkStartDate.setUTCDate(chunkStartDate.getUTCDate() - 4);
          const effectiveStartDate = chunkStartDate < startDate ? startDate : chunkStartDate;
          const days = Math.round((cursorDate.getTime() - effectiveStartDate.getTime()) / (86400 * 1000)) + 1;

          const dateStr = effectiveStartDate.toISOString().slice(0, 10);

          try {
            requestCount++;
            const res = await fetchFirmsArea(prod, days, dateStr);
            if (res.rows.length > 0) {
              await bulkUpsertDetections(res.rows);
              rowsUpserted += res.rows.length;
            }

            // Write coverage for each day in this chunk
            for (let d = 0; d < days; d++) {
              const currentD = new Date(effectiveStartDate);
              currentD.setUTCDate(effectiveStartDate.getUTCDate() + d);
              const dayStr = currentD.toISOString().slice(0, 10);
              const count = res.rows.filter((r) => r.acq_date === dayStr).length;

              await query(
                `INSERT INTO ingest_coverage (product, day, sp, rows, fetched_at)
                 VALUES ($1, $2::date, true, $3, now())
                 ON CONFLICT (product, day) DO UPDATE
                 SET rows = EXCLUDED.rows, sp = true, fetched_at = now()`,
                [prod, dayStr, count]
              );
            }

            // Move cursor backward
            const nextCursor = new Date(effectiveStartDate);
            nextCursor.setUTCDate(effectiveStartDate.getUTCDate() - 1);

            const isDone = nextCursor < startDate;
            await query(
              `UPDATE backfill_state
               SET cursor_date = $1::date, done = $2, updated_at = now()
               WHERE product = $3`,
              [nextCursor.toISOString().slice(0, 10), isDone, prod]
            );

            if (isDone) break;
            cursorDate = nextCursor;
          } catch (err: any) {
            console.warn(`Backfill chunk error for ${prod} (${dateStr}):`, redactFirmsKey(err.message));
            break;
          }

          await refreshLock();
        }
      }
    }

    // Step E: Rebuild snapshot cache if new rows upserted or no error
    if (rowsUpserted > 0 || runStatus === 'ok') {
      await rebuildSnapshot();
    }
  } catch (err: any) {
    runStatus = 'error';
    runError = redactFirmsKey(err.message || String(err));
    console.error('Ingest tick error:', runError);
  } finally {
    // Release lease lock
    try {
      await query(`UPDATE ingest_lock SET locked_until = now() - interval '1 second' WHERE name = 'tick'`);
      await query(
        `UPDATE ingest_runs
         SET finished_at = now(), status = $1, requests = $2, rows_upserted = $3, error = $4
         WHERE id = $5`,
        [runStatus, requestCount, rowsUpserted, runError, runId]
      );
    } catch (e: any) {
      console.error('Failed to finalize ingest run:', e.message);
    }
  }

  return {
    status: runStatus,
    requests: requestCount,
    rows_upserted: rowsUpserted,
    error: runError || undefined,
  };
}
