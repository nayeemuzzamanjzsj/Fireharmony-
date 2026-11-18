import { createVercelHandler } from '../server/vercelAdapter.js';
import { handleDistricts } from '../server/handlers/districts.js';
export default createVercelHandler(handleDistricts);
