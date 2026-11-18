import { createVercelHandler } from '../server/vercelAdapter.js';
import { handleHealth } from '../server/handlers/health.js';
export default createVercelHandler(handleHealth);
