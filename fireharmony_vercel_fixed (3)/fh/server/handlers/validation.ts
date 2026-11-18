import { CONFIG } from '../config.js';
import { query, getPool } from '../db.js';
import { runFullAnalysis, generateValidationSample } from '../stats.js';
import { wilsonInterval } from '../analysis/math.js';
import { ApiHandler } from '../types.js';

export const handleValidation: ApiHandler = async (_ctx) => {
  const pool = getPool();
  if (!pool) {
    return {
      status: 200,
      json: { status: 'no_reviews', reviews: [], summary: {} },
    };
  }

  try {
    const reviewsRes = await query<{
      sample_id: string;
      outcome: string;
      imagery_source: string;
      imagery_date: string;
      notes: string;
      reviewed_at: string;
    }>(
      `SELECT sample_id, outcome, imagery_source, imagery_date::text, notes, reviewed_at::text
       FROM validation_reviews
       ORDER BY reviewed_at DESC`
    );

    if (reviewsRes.rows.length === 0) {
      return {
        status: 200,
        json: {
          status: 'no_reviews',
          total_reviews: 0,
          strata_summary: {},
        },
      };
    }

    const total = reviewsRes.rows.length;
    const outcomeCounts: Record<string, number> = {
      burn_scar_or_fire: 0,
      smoke_only: 0,
      industrial_like: 0,
      not_determinable: 0,
    };

    for (const r of reviewsRes.rows) {
      if (outcomeCounts[r.outcome] !== undefined) {
        outcomeCounts[r.outcome]++;
      } else {
        outcomeCounts[r.outcome] = 1;
      }
    }

    const intervals: Record<string, any> = {};
    for (const [out, count] of Object.entries(outcomeCounts)) {
      intervals[out] = {
        count,
        interval: wilsonInterval(count, total),
      };
    }

    return {
      status: 200,
      json: {
        status: 'ok',
        total_reviews: total,
        indicative_note: total < 30 ? `indicative only (n = ${total})` : undefined,
        outcome_breakdown: intervals,
        reviews: reviewsRes.rows,
      },
    };
  } catch (err: any) {
    return {
      status: 500,
      json: { error: err.message },
    };
  }
};

export const handleValidationSample: ApiHandler = async (ctx) => {
  const pool = getPool();
  if (!pool) {
    return {
      status: 200,
      json: { sample: [], strata_counts: {} },
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
        json: { sample: [], strata_counts: {} },
      };
    }
    to = rangeRes.rows[0].max_d;
    const maxObj = new Date(to + 'T00:00:00Z');
    maxObj.setUTCDate(maxObj.getUTCDate() - 89);
    from = maxObj.toISOString().slice(0, 10);
    if (from < rangeRes.rows[0].min_d) from = rangeRes.rows[0].min_d;
  }

  const res = await runFullAnalysis(from, to, nrt);
  if (!res.bundle || res.bundle.events.length === 0) {
    return {
      status: 200,
      json: { sample: [], strata_counts: {} },
    };
  }

  const valSample = generateValidationSample(res.bundle.events);
  return {
    status: 200,
    json: valSample,
  };
};

export const handleValidationReview: ApiHandler = async (ctx) => {
  const adminPin = CONFIG.ADMIN_PIN;
  if (!adminPin || adminPin.trim() === '') {
    return {
      status: 403,
      json: { error: 'ADMIN_PIN is not configured on the server' },
    };
  }

  const incomingPin = ctx.headers['x-admin-pin'] || ctx.headers['X-Admin-Pin'];
  if (!incomingPin || incomingPin !== adminPin) {
    return {
      status: 401,
      json: { error: 'Invalid or missing admin PIN' },
    };
  }

  const body = ctx.body || {};
  const { sample_id, outcome, imagery_source, imagery_date, notes } = body;

  const validOutcomes = ['burn_scar_or_fire', 'smoke_only', 'industrial_like', 'not_determinable'];
  if (!sample_id || !outcome || !validOutcomes.includes(outcome)) {
    return {
      status: 400,
      json: {
        error: `Invalid review submission. outcome must be one of: ${validOutcomes.join(', ')}`,
      },
    };
  }

  try {
    await query(
      `INSERT INTO validation_reviews (sample_id, outcome, imagery_source, imagery_date, notes, reviewed_at)
       VALUES ($1, $2, $3, $4::date, $5, now())
       ON CONFLICT (sample_id) DO UPDATE SET
         outcome = EXCLUDED.outcome,
         imagery_source = EXCLUDED.imagery_source,
         imagery_date = EXCLUDED.imagery_date,
         notes = EXCLUDED.notes,
         reviewed_at = now()`,
      [sample_id, outcome, imagery_source || 'Unknown', imagery_date || null, notes || '']
    );

    return {
      status: 200,
      json: { success: true, sample_id, outcome },
    };
  } catch (err: any) {
    return {
      status: 500,
      json: { error: err.message },
    };
  }
};
