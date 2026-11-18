import { createVercelHandler } from '../../server/vercelAdapter.js';
import {
  handleValidationSample,
  handleValidationReview,
} from '../../server/handlers/validation.js';

// Shared function for /api/validation/sample and /api/validation/review
// (merged to stay under Vercel Hobby's 12-function limit).
const sample = createVercelHandler(handleValidationSample);
const review = createVercelHandler(handleValidationReview);

export default function handler(req: any, res: any) {
  const pathname = new URL(req.url, 'http://localhost').pathname.replace(/\/+$/, '');
  if (pathname.endsWith('/sample')) return sample(req, res);
  if (pathname.endsWith('/review')) return review(req, res);
  return res.status(404).json({ error: 'Not found' });
}
