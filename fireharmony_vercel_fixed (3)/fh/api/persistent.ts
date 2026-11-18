import { createVercelHandler } from '../server/vercelAdapter.js';
import { handlePersistent } from '../server/handlers/persistent.js';
export default createVercelHandler(handlePersistent);
