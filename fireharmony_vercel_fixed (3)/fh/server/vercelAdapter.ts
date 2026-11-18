import { ApiHandler, ApiContext } from './types.js';

export function createVercelHandler(handler: ApiHandler) {
  return async (req: any, res: any) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const query: Record<string, string> = {};
      url.searchParams.forEach((val, key) => {
        query[key] = val;
      });

      const ctx: ApiContext = {
        method: req.method || 'GET',
        query,
        headers: req.headers || {},
        body: req.body,
      };

      const result = await handler(ctx);

      if (result.headers) {
        for (const [k, v] of Object.entries(result.headers)) {
          res.setHeader(k, v);
        }
      }

      if (typeof result.json === 'string') {
        res.status(result.status).send(result.json);
      } else {
        res.status(result.status).json(result.json);
      }
    } catch (err: any) {
      console.error('Unhandled Vercel API error:', err);
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  };
}
