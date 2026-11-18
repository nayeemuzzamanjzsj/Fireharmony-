import { createVercelHandler } from '../server/vercelAdapter.js';
import { handleCalendar } from '../server/handlers/calendar.js';
export default createVercelHandler(handleCalendar);
