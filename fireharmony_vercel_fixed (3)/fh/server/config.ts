import dotenv from 'dotenv';
dotenv.config();

export const CONFIG = {
  BBOX: process.env.BBOX || '88.0,20.5,92.7,26.7',
  get DATABASE_URL() {
    return process.env.DATABASE_URL || '';
  },
  get FIRMS_MAP_KEY() {
    return process.env.FIRMS_MAP_KEY || '';
  },
  get CRON_SECRET() {
    return process.env.CRON_SECRET || '';
  },
  get ADMIN_PIN() {
    return process.env.ADMIN_PIN || '';
  },
  get DB_SIZE_LIMIT_MB() {
    const val = Number(process.env.DB_SIZE_LIMIT_MB);
    return Number.isFinite(val) && val > 0 ? val : 500;
  },
};

export function redactFirmsKey(input: string): string {
  const key = process.env.FIRMS_MAP_KEY;
  if (!key || key.length < 4) return input;
  return input.replaceAll(key, '[REDACTED_FIRMS_KEY]');
}
