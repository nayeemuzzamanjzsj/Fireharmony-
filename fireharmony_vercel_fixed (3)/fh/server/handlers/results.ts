import { runFullAnalysis } from '../stats.js';
import { ApiHandler } from '../types.js';
import { query, getPool } from '../db.js';

export const handleResults: ApiHandler = async (ctx) => {
  const pool = getPool();
  if (!pool) {
    return {
      status: 200,
      json: { empty: true, message: 'DATABASE_URL is not configured' },
    };
  }

  let from = ctx.query.from;
  let to = ctx.query.to;
  const nrt = ctx.query.nrt === '1';

  // If no date range supplied, find default range in detections
  if (!from || !to) {
    const rangeRes = await query<{ min_d: string; max_d: string }>(
      'SELECT min(acq_date)::text as min_d, max(acq_date)::text as max_d FROM detections'
    );
    if (!rangeRes.rows[0]?.max_d) {
      return {
        status: 200,
        json: { empty: true, message: 'No detections stored in database yet' },
      };
    }
    to = rangeRes.rows[0].max_d;
    const maxObj = new Date(to + 'T00:00:00Z');
    maxObj.setUTCDate(maxObj.getUTCDate() - 89);
    from = maxObj.toISOString().slice(0, 10);
    if (from < rangeRes.rows[0].min_d) from = rangeRes.rows[0].min_d;
  }

  const res = await runFullAnalysis(from, to, nrt);
  if (res.error) {
    return {
      status: 400,
      json: {
        error: res.error,
        monthlyCountsOnly: res.monthlyCountsOnly,
      },
    };
  }

  if (!res.bundle) {
    return {
      status: 200,
      json: { empty: true, message: 'No detections available for selected window' },
    };
  }

  return {
    status: 200,
    json: res.bundle.results,
  };
};
