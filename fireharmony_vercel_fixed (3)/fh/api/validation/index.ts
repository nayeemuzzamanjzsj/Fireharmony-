import { createVercelHandler } from '../../server/vercelAdapter.js';
import { handleValidation } from '../../server/handlers/validation.js';
export default createVercelHandler(handleValidation);
