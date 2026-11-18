import { createVercelHandler } from '../server/vercelAdapter.js';
import { handleResults } from '../server/handlers/results.js';
export default createVercelHandler(handleResults);
