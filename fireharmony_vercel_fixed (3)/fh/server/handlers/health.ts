import { CONFIG } from '../config.js';
import { query, getDatabaseSize, ensureSchema, getPool } from '../db.js';
import { areBoundariesLoaded, initSpatialData } from '../spatial.js';
import { ApiHandler } from '../types.js';

export const handleHealth: ApiHandler = async (_ctx) => {
  const notes: string[] = [];
  const key_present = Boolean(CONFIG.FIRMS_MAP_KEY && CONFIG.FIRMS_MAP_KEY.trim().length > 0);
  if (!key_present) {
    notes.push('FIRMS_MAP_KEY is not configured');
  }

  const pool = getPool();
  if (!pool) {
    notes.push('DATABASE_URL is not configured');
    const { bytes, limit_bytes } = await getDatabaseSize();
    return {
      status: 200,
      json: {
        db_ok: false,
        schema_ok: false,
        boundaries_loaded: areBoundariesLoaded(),
        districts_count: 0,
        db_size_bytes: bytes,
        db_limit_bytes: limit_bytes,
        detections_count: 0,
        last_tick: null,
        products: [],
        key_present,
        notes,
      },
    };
  }

  let db_ok = false;
  let schema_ok = false;
  let districts_count = 0;
  let detections_count = 0;
  let last_tick: any = null;
  const products: any[] = [];

  try {
    const sRes = await ensureSchema();
    schema_ok = sRes.ok;
    if (!schema_ok && sRes.error) {
      notes.push(`Schema error: ${sRes.error}`);
    }

    const distRes = await query<{ count: string }>('SELECT COUNT(*)::text as count FROM districts');
    districts_count = parseInt(distRes.rows[0]?.count || '0', 10);

    const detRes = await query<{ count: string }>('SELECT COUNT(*)::text as count FROM detections');
    detections_count = parseInt(detRes.rows[0]?.count || '0', 10);
    db_ok = true;

    // Last tick from ingest_runs
    const runRes = await query<any>(
      'SELECT started_at, finished_at, status, requests, rows_upserted, error FROM ingest_runs ORDER BY id DESC LIMIT 1'
    );
    if (runRes.rows.length > 0) {
      last_tick = runRes.rows[0];
    }

    // Products coverage summary
    const prodCovRes = await query<any>(`
      SELECT
        product,
        min(day)::text as first_day,
        max(day)::text as last_day,
        count(*)::int as coverage_days,
        count(*) FILTER (WHERE sp = true)::int as sp_days,
        count(*) FILTER (WHERE sp = false)::int as nrt_days
      FROM ingest_coverage
      GROUP BY product
    `);

    // Backfill state
    const bfRes = await query<any>(`
      SELECT product, start_date::text, start_is_assumed, cursor_date::text, done
      FROM backfill_state
    `);
    const bfMap: Record<string, any> = {};
    for (const b of bfRes.rows) {
      bfMap[b.product] = b;
    }

    const today = new Date();
    for (const p of prodCovRes.rows) {
      const bf = bfMap[p.product] || null;
      let missing_days_since_start = 0;
      if (bf && bf.start_date) {
        const start = new Date(bf.start_date);
        const daysTotal = Math.max(0, Math.floor((today.getTime() - start.getTime()) / (86400 * 1000)));
        missing_days_since_start = Math.max(0, daysTotal - p.coverage_days);
      }

      products.push({
        product: p.product,
        first_day: p.first_day,
        last_day: p.last_day,
        coverage_days: p.coverage_days,
        missing_days_since_start,
        sp_days: p.sp_days,
        nrt_days: p.nrt_days,
        backfill: bf
          ? {
              cursor_date: bf.cursor_date,
              start_date: bf.start_date,
              start_is_assumed: bf.start_is_assumed,
              done: bf.done,
            }
          : null,
      });
    }
  } catch (err: any) {
    notes.push(`Database query error: ${err.message}`);
  }

  // Ensure spatial data is checked
  if (!areBoundariesLoaded()) {
    initSpatialData();
  }

  const { bytes, limit_bytes } = await getDatabaseSize();
  if (bytes >= limit_bytes * 0.85) {
    notes.push(`Database size (${Math.round(bytes / 1024 / 1024)} MB) is near limit (${CONFIG.DB_SIZE_LIMIT_MB} MB)`);
  }

  return {
    status: 200,
    json: {
      db_ok,
      schema_ok,
      boundaries_loaded: areBoundariesLoaded(),
      districts_count,
      db_size_bytes: bytes,
      db_limit_bytes: limit_bytes,
      detections_count,
      last_tick,
      products,
      key_present,
      notes,
    },
  };
};
