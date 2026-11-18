import { createVercelHandler } from '../server/vercelAdapter.js';
import { handleMeta } from '../server/handlers/meta.js';
export default createVercelHandler(handleMeta);
