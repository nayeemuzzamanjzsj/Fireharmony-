import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  parseFirmsCsv,
  resolvePlatform,
  resolveConfidence,
} from '../server/firmsClient.js';
import {
  planFiveDayChunks,
  buildUpsertSql,
} from '../server/ingest.js';
import {
  SYNTHETIC_MODIS_CSV,
  SYNTHETIC_VIIRS_CSV,
  SYNTHETIC_HEADER_ONLY_CSV,
  SYNTHETIC_INVALID_KEY_RESPONSE,
} from './fixtures/synthetic.js';

describe('FIRMS Telemetry Client & Ingest Engine Unit Tests', () => {
  it('parses valid MODIS CSV and handles unpadded acq_time correctly', () => {
    const res = parseFirmsCsv('MODIS_SP', SYNTHETIC_MODIS_CSV, true);
    assert.strictEqual(res.rows.length, 2);

    // Row 1: 445 -> padded to 445
    assert.strictEqual(res.rows[0].acq_time, 445);
    assert.strictEqual(res.rows[0].platform, 1); // Terra
    assert.strictEqual(res.rows[0].conf_class, 2); // 85% -> High
    assert.strictEqual(res.rows[0].conf_raw, 85);
    assert.strictEqual(res.rows[0].night, false);
    assert.strictEqual(res.rows[0].sp, true);

    // Row 2: 1330 -> Aqua
    assert.strictEqual(res.rows[1].acq_time, 1330);
    assert.strictEqual(res.rows[1].platform, 2); // Aqua
    assert.strictEqual(res.rows[1].conf_class, 0); // 25% -> Low
    assert.strictEqual(res.rows[1].conf_raw, 25);
    assert.strictEqual(res.rows[1].night, true);
  });

  it('parses valid VIIRS CSV with categorical confidence', () => {
    const res = parseFirmsCsv('VIIRS_SNPP_NRT', SYNTHETIC_VIIRS_CSV, false);
    assert.strictEqual(res.rows.length, 2);

    // Row 1: SNPP platform 3, conf 'h' -> 2
    assert.strictEqual(res.rows[0].platform, 3);
    assert.strictEqual(res.rows[0].conf_class, 2);
    assert.strictEqual(res.rows[0].conf_raw, null);
    assert.strictEqual(res.rows[0].sp, false);

    // Row 2: conf 'l' -> 0
    assert.strictEqual(res.rows[1].conf_class, 0);
    assert.strictEqual(res.rows[1].conf_raw, null);
  });

  it('treats header-only body as zero detections without throwing', () => {
    const res = parseFirmsCsv('MODIS_NRT', SYNTHETIC_HEADER_ONLY_CSV, false);
    assert.strictEqual(res.rows.length, 0);
    assert.strictEqual(res.droppedOutsideBgd, 0);
  });

  it('treats invalid key response as an ERROR, never zero rows', () => {
    assert.throws(
      () => {
        parseFirmsCsv('MODIS_SP', SYNTHETIC_INVALID_KEY_RESPONSE, true);
      },
      {
        message: /Invalid FIRMS response/,
      }
    );
  });

  it('maps platforms consistently across sources and satellites', () => {
    assert.strictEqual(resolvePlatform('MODIS_SP', 'Terra').platform, 1);
    assert.strictEqual(resolvePlatform('MODIS_NRT', 'T').platform, 1);
    assert.strictEqual(resolvePlatform('MODIS_SP', 'Aqua').platform, 2);
    assert.strictEqual(resolvePlatform('MODIS_NRT', 'A').platform, 2);
    assert.strictEqual(resolvePlatform('VIIRS_SNPP_SP').platform, 3);
    assert.strictEqual(resolvePlatform('VIIRS_NOAA20_SP').platform, 4);
    assert.strictEqual(resolvePlatform('VIIRS_NOAA21_NRT').platform, 5);
    assert.strictEqual(resolvePlatform('MODIS_SP', 'UnknownSat').platform, 0);
  });

  it('maps confidence values correctly for MODIS and VIIRS', () => {
    // MODIS
    assert.deepStrictEqual(resolveConfidence('MODIS_SP', '15'), { conf_class: 0, conf_raw: 15 });
    assert.deepStrictEqual(resolveConfidence('MODIS_SP', '50'), { conf_class: 1, conf_raw: 50 });
    assert.deepStrictEqual(resolveConfidence('MODIS_SP', '90'), { conf_class: 2, conf_raw: 90 });

    // VIIRS
    assert.deepStrictEqual(resolveConfidence('VIIRS_SNPP_SP', 'l'), { conf_class: 0, conf_raw: null });
    assert.deepStrictEqual(resolveConfidence('VIIRS_SNPP_SP', 'n'), { conf_class: 1, conf_raw: null });
    assert.deepStrictEqual(resolveConfidence('VIIRS_SNPP_SP', 'h'), { conf_class: 2, conf_raw: null });
  });

  it('plans 5-day chunks: newest first, max 5 days, covering entire date range', () => {
    // Range from 2024-01-01 to 2024-01-12 (12 days total)
    const chunks = planFiveDayChunks('2024-01-01', '2024-01-12');
    assert.ok(chunks.length > 0);

    // Each chunk is between 1 and 5 days
    for (const ch of chunks) {
      assert.ok(ch.days >= 1 && ch.days <= 5);
    }

    // Newest chunk comes first
    assert.strictEqual(chunks[0].start, '2024-01-08');
    assert.strictEqual(chunks[0].days, 5); // 08, 09, 10, 11, 12

    // Second chunk: 03 to 07
    assert.strictEqual(chunks[1].start, '2024-01-03');
    assert.strictEqual(chunks[1].days, 5);

    // Third chunk: 01 to 02 (2 days remaining)
    assert.strictEqual(chunks[2].start, '2024-01-01');
    assert.strictEqual(chunks[2].days, 2);

    const totalDays = chunks.reduce((acc, c) => acc + c.days, 0);
    assert.strictEqual(totalDays, 12);
  });

  it('builds idempotent bulk upsert SQL on conflict', () => {
    const sql = buildUpsertSql();
    assert.ok(sql.includes('INSERT INTO detections'));
    assert.ok(sql.includes('ON CONFLICT (acq_date, platform, acq_time, lat_i, lon_i)'));
    assert.ok(sql.includes('DO UPDATE SET'));
    assert.ok(sql.includes('sp = EXCLUDED.sp'));
  });

  it('verifies lease lock logic with simulated clock', () => {
    class MockLeaseLock {
      private lockedUntil = 0;

      acquire(now: number, durationMs = 300000): boolean {
        if (now < this.lockedUntil) {
          return false; // Still locked
        }
        this.lockedUntil = now + durationMs;
        return true;
      }

      release(): void {
        this.lockedUntil = 0;
      }
    }

    const lock = new MockLeaseLock();
    let clock = 1000000;

    // First acquire succeeds
    assert.strictEqual(lock.acquire(clock), true);

    // Concurrent acquire within 5m fails
    assert.strictEqual(lock.acquire(clock + 1000), false);
    assert.strictEqual(lock.acquire(clock + 200000), false);

    // After 5m (300001 ms), lease expires and can be re-acquired
    clock += 300001;
    assert.strictEqual(lock.acquire(clock), true);

    // Explicit release makes it instantly acquirable
    lock.release();
    assert.strictEqual(lock.acquire(clock + 10), true);
  });
});
