import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { handleHealth } from './server/handlers/health.js';
import { handleMeta } from './server/handlers/meta.js';
import { handleSnapshot } from './server/handlers/snapshot.js';
import { handleResults } from './server/handlers/results.js';
import { handleEvents } from './server/handlers/events.js';
import { handleCalendar } from './server/handlers/calendar.js';
import { handleDistricts } from './server/handlers/districts.js';
import { handlePersistent } from './server/handlers/persistent.js';
import {
  handleValidation,
  handleValidationSample,
  handleValidationReview,
} from './server/handlers/validation.js';
import { handleIngestTick } from './server/handlers/ingestTick.js';
import { handleIngestPoke } from './server/handlers/ingestPoke.js';
import { ApiHandler, ApiContext } from './server/types.js';
import { runTick } from './server/ingest.js';
import { initSpatialData } from './server/spatial.js';
import { ensureSchema } from './server/db.js';

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';

app.use(express.json());

function adaptExpress(handler: ApiHandler) {
  return async (req: express.Request, res: express.Response) => {
    try {
      const query: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.query)) {
        if (typeof v === 'string') query[k] = v;
      }
      const ctx: ApiContext = {
        method: req.method,
        query,
        headers: req.headers as Record<string, string>,
        body: req.body,
      };
      const result = await handler(ctx);
      if (result.headers) {
        for (const [hk, hv] of Object.entries(result.headers)) {
          res.setHeader(hk, hv);
        }
      }
      if (typeof result.json === 'string') {
        res.status(result.status).send(result.json);
      } else {
        res.status(result.status).json(result.json);
      }
    } catch (err: any) {
      console.error('Express handler error:', err);
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  };
}

// API Routes
app.get('/api/health', adaptExpress(handleHealth));
app.get('/api/meta', adaptExpress(handleMeta));
app.get('/api/snapshot', adaptExpress(handleSnapshot));
app.get('/api/results', adaptExpress(handleResults));
app.get('/api/events', adaptExpress(handleEvents));
app.get('/api/calendar', adaptExpress(handleCalendar));
app.get('/api/districts', adaptExpress(handleDistricts));
app.get('/api/persistent', adaptExpress(handlePersistent));
app.get('/api/validation', adaptExpress(handleValidation));
app.get('/api/validation/sample', adaptExpress(handleValidationSample));
app.post('/api/validation/review', adaptExpress(handleValidationReview));
app.get('/api/ingest/tick', adaptExpress(handleIngestTick));
app.get('/api/ingest/poke', adaptExpress(handleIngestPoke));

async function startServer() {
  // Pre-load spatial index and schema
  initSpatialData();
  ensureSchema().catch((e) => console.warn('Schema init notice:', e.message));

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, () => {
    console.log(`FireHarmony running on port ${port} (mode: ${isProd ? 'production' : 'development'})`);
  });

  // Background Ingestion for standalone server (AI Studio / local, not Vercel)
  if (!process.env.VERCEL) {
    // Startup tick after 3 seconds
    setTimeout(() => {
      runTick(200000).catch((err) => {
        console.warn('Initial startup tick notice:', err.message);
      });
    }, 3000);

    // Every 30 minutes
    setInterval(() => {
      runTick(200000).catch((err) => {
        console.warn('Scheduled 30m tick notice:', err.message);
      });
    }, 30 * 60 * 1000);
  }
}

startServer().catch((err) => {
  console.error('Failed to start FireHarmony server:', err);
});
