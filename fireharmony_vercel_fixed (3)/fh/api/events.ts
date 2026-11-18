import { createVercelHandler } from '../server/vercelAdapter.js';
import { handleEvents } from '../server/handlers/events.js';
export default createVercelHandler(handleEvents);
