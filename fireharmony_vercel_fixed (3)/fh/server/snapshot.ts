import { query } from './db.js';

export interface CompactSnapshot {
  generated_at: string;
  first_day: string | null;
  last_day: string | null;
  rows: number;
  products: string[];
  field_order: string[];
  data: (string | number | null)[][];
}

const FIELD_ORDER = [
  'acq_date',
  'acq_time',
  'platform',
  'lat_i',
  'lon_i',
  'frp',
  'conf_class',
  'night',
  'sp',
  'district',
];

export async function rebuildSnapshot(): Promise<CompactSnapshot | null> {
  try {
    // Find the latest date in detections
    const maxDateRes = await query<{ max_date: string }>(
      'SELECT max(acq_date)::text as max_date FROM detections'
    );
    const maxDateStr = maxDateRes.rows[0]?.max_date;
    if (!maxDateStr) {
      // Empty database
      const emptySnapshot: CompactSnapshot = {
        generated_at: new Date().toISOString(),
        first_day: null,
        last_day: null,
        rows: 0,
        products: [],
        field_order: FIELD_ORDER,
        data: [],
      };
      await query(
        `INSERT INTO stats_cache (key, computed_at, json)
         VALUES ('snapshot', now(), $1::jsonb)
         ON CONFLICT (key) DO UPDATE SET computed_at = now(), json = EXCLUDED.json`,
        [JSON.stringify(emptySnapshot)]
      );
      return emptySnapshot;
    }

    // Grab up to 30 days of data ending at max_date
    // Order by date descending, limit rows if needed to cap ~2MB
    // Each row in compact format is ~60 bytes in JSON, so 30,000 rows ~ 1.8MB
    const rowsRes = await query<{
      acq_date: string;
      acq_time: number;
      platform: number;
      lat_i: number;
      lon_i: number;
      frp: number | null;
      conf_class: number;
      night: boolean;
      sp: boolean;
      district: number | null;
    }>(
      `SELECT acq_date::text, acq_time, platform, lat_i, lon_i, frp, conf_class, night, sp, district
       FROM detections
       WHERE acq_date >= ($1::date - interval '30 days')
       ORDER BY acq_date DESC, acq_time DESC
       LIMIT 35000`,
      [maxDateStr]
    );

    const compactData: (string | number | null)[][] = rowsRes.rows.map((r) => [
      r.acq_date,
      r.acq_time,
      r.platform,
      r.lat_i,
      r.lon_i,
      r.frp !== null ? Math.round(r.frp * 10) / 10 : null,
      r.conf_class,
      r.night ? 1 : 0,
      r.sp ? 1 : 0,
      r.district,
    ]);

    // Distinct products in snapshot
    const prodsRes = await query<{ product: string }>(
      `SELECT DISTINCT product FROM ingest_coverage WHERE day >= ($1::date - interval '30 days')`,
      [maxDateStr]
    );

    const minDate = compactData.length > 0 ? (compactData[compactData.length - 1][0] as string) : null;
    const maxDate = compactData.length > 0 ? (compactData[0][0] as string) : null;

    const snapshot: CompactSnapshot = {
      generated_at: new Date().toISOString(),
      first_day: minDate,
      last_day: maxDate,
      rows: compactData.length,
      products: prodsRes.rows.map((p) => p.product),
      field_order: FIELD_ORDER,
      data: compactData,
    };

    await query(
      `INSERT INTO stats_cache (key, computed_at, json)
       VALUES ('snapshot', now(), $1::jsonb)
       ON CONFLICT (key) DO UPDATE SET computed_at = now(), json = EXCLUDED.json`,
      [JSON.stringify(snapshot)]
    );

    return snapshot;
  } catch (err: any) {
    console.error('Failed to rebuild snapshot:', err.message);
    return null;
  }
}

export async function getCachedSnapshot(): Promise<CompactSnapshot | null> {
  try {
    const res = await query<{ json: CompactSnapshot }>(
      `SELECT json FROM stats_cache WHERE key = 'snapshot'`
    );
    if (res.rows.length > 0) {
      return res.rows[0].json;
    }
  } catch {
    // DB not available or uninitialized
  }
  return null;
}
