import { runFullAnalysis } from '../stats.js';
import { ApiHandler } from '../types.js';
import { query, getPool } from '../db.js';

export const handleDistricts: ApiHandler = async (ctx) => {
  const pool = getPool();
  if (!pool) {
    return {
      status: 200,
      json: { empty: true, districts: [] },
    };
  }

  let from = ctx.query.from;
  let to = ctx.query.to;
  const nrt = ctx.query.nrt === '1';

  if (!from || !to) {
    const rangeRes = await query<{ min_d: string; max_d: string }>(
      'SELECT min(acq_date)::text as min_d, max(acq_date)::text as max_d FROM detections'
    );
    if (!rangeRes.rows[0]?.max_d) {
      return {
        status: 200,
        json: { empty: true, districts: [] },
      };
    }
    to = rangeRes.rows[0].max_d;
    const maxObj = new Date(to + 'T00:00:00Z');
    maxObj.setUTCDate(maxObj.getUTCDate() - 89);
    from = maxObj.toISOString().slice(0, 10);
    if (from < rangeRes.rows[0].min_d) from = rangeRes.rows[0].min_d;
  }

  const res = await runFullAnalysis(from, to, nrt);
  if (!res.bundle) {
    return {
      status: 200,
      json: { empty: true, districts: [] },
    };
  }

  return {
    status: 200,
    json: {
      provenance: res.bundle.results.provenance,
      districts: res.bundle.districts,
    },
  };
};
