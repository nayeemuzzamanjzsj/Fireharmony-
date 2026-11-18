import { query, getPool } from '../db.js';
import { runTick } from '../ingest.js';
import { ApiHandler } from '../types.js';

export const handleIngestPoke: ApiHandler = async (_ctx) => {
  const pool = getPool();
  if (!pool) {
    return {
      status: 200,
      json: { started: false, reason: 'database not configured' },
    };
  }

  try {
    // 15-minute cooldown rule enforced in database
    const lastRunRes = await query<{ minutes_ago: number }>(`
      SELECT EXTRACT(EPOCH FROM (now() - finished_at)) / 60 as minutes_ago
      FROM ingest_runs
      WHERE status IN ('ok', 'partial') AND finished_at IS NOT NULL
      ORDER BY id DESC
      LIMIT 1
    `);

    if (lastRunRes.rows.length > 0) {
      const minsAgo = Number(lastRunRes.rows[0].minutes_ago);
      if (minsAgo < 15) {
        return {
          status: 200,
          json: { started: false, reason: 'cooldown_active', minutes_remaining: Math.ceil(15 - minsAgo) },
        };
      }
    }

    // Check if lease is currently locked
    const lockRes = await query<{ is_locked: boolean }>(`
      SELECT (locked_until > now()) as is_locked
      FROM ingest_lock
      WHERE name = 'tick'
    `);

    if (lockRes.rows.length > 0 && lockRes.rows[0].is_locked) {
      return {
        status: 200,
        json: { started: false, reason: 'already_running' },
      };
    }

    // Trigger runTick(60000) in the background (fire-and-forget)
    // In Vercel environment, waitUntil could be used if available
    setImmediate(() => {
      runTick(60000).catch((err) => {
        console.error('Background poke runTick error:', err.message);
      });
    });

    return {
      status: 200,
      json: { started: true },
    };
  } catch (err: any) {
    return {
      status: 200,
      json: { started: false, error: err.message },
    };
  }
};
