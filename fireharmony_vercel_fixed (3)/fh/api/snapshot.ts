import { createVercelHandler } from '../server/vercelAdapter.js';
import { handleSnapshot } from '../server/handlers/snapshot.js';
export default createVercelHandler(handleSnapshot);
