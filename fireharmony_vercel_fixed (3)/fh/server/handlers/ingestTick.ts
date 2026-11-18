import { CONFIG } from '../config.js';
import { runTick } from '../ingest.js';
import { ApiHandler } from '../types.js';

export const handleIngestTick: ApiHandler = async (ctx) => {
  const secret = CONFIG.CRON_SECRET;
  if (!secret) {
    return {
      status: 401,
      json: { error: 'CRON_SECRET is not configured' },
    };
  }

  const authHeader = ctx.headers['authorization'] || ctx.headers['Authorization'];
  const expected = `Bearer ${secret}`;

  if (!authHeader || authHeader !== expected) {
    return {
      status: 401,
      json: { error: 'Unauthorized: invalid or missing Authorization header' },
    };
  }

  const result = await runTick(200000);
  return {
    status: 200,
    json: result,
  };
};
