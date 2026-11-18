import { createVercelHandler } from '../../server/vercelAdapter.js';
import { handleIngestTick } from '../../server/handlers/ingestTick.js';
import { handleIngestPoke } from '../../server/handlers/ingestPoke.js';

// Shared function for /api/ingest/tick and /api/ingest/poke
// (merged to stay under Vercel Hobby's 12-function limit).
const tick = createVercelHandler(handleIngestTick);
const poke = createVercelHandler(handleIngestPoke);

export default function handler(req: any, res: any) {
  const pathname = new URL(req.url, 'http://localhost').pathname.replace(/\/+$/, '');
  if (pathname.endsWith('/tick')) return tick(req, res);
  if (pathname.endsWith('/poke')) return poke(req, res);
  return res.status(404).json({ error: 'Not found' });
}
