import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import area from '@turf/area';
import { CONFIG } from './config.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;
let schemaEnsured = false;
let schemaError: string | null = null;
let districtsReportedProperties: string[] = [];

export function getPool(): pg.Pool | null {
  const connStr = CONFIG.DATABASE_URL;
  if (!connStr || connStr.trim() === '') {
    return null;
  }
  if (!pool) {
    const isLocal = connStr.includes('localhost') || connStr.includes('127.0.0.1');
    pool = new Pool({
      connectionString: connStr,
      max: 3,
      ssl: isLocal ? false : { rejectUnauthorized: false },
    });
    pool.on('error', (err) => {
      console.error('Unexpected pg pool error:', err.message);
    });
  }
  return pool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: any[]
): Promise<pg.QueryResult<T>> {
  const p = getPool();
  if (!p) {
    throw new Error('DATABASE_URL is not configured');
  }
  await ensureSchema();
  // Supabase transaction pooled: use anonymous queries without prepared statement names
  return p.query<T>(text, params);
}

export async function ensureSchema(): Promise<{ ok: boolean; error?: string }> {
  if (schemaEnsured) return { ok: true };
  if (schemaError) return { ok: false, error: schemaError };

  const p = getPool();
  if (!p) {
    return { ok: false, error: 'DATABASE_URL is not configured' };
  }

  const ddl = `
    CREATE TABLE IF NOT EXISTS detections (
      acq_date DATE NOT NULL,
      acq_time SMALLINT NOT NULL,
      platform SMALLINT NOT NULL,
      lat_i INTEGER NOT NULL,
      lon_i INTEGER NOT NULL,
      frp REAL,
      conf_class SMALLINT,
      conf_raw SMALLINT,
      night BOOLEAN,
      sp BOOLEAN NOT NULL,
      district SMALLINT,
      PRIMARY KEY (acq_date, platform, acq_time, lat_i, lon_i)
    );

    CREATE TABLE IF NOT EXISTS ingest_coverage (
      product TEXT NOT NULL,
      day DATE NOT NULL,
      sp BOOLEAN NOT NULL,
      rows INTEGER NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (product, day)
    );

    CREATE TABLE IF NOT EXISTS backfill_state (
      product TEXT PRIMARY KEY,
      start_date DATE,
      start_is_assumed BOOLEAN DEFAULT false,
      cursor_date DATE,
      done BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS ingest_runs (
      id BIGSERIAL PRIMARY KEY,
      job TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL,
      finished_at TIMESTAMPTZ,
      status TEXT NOT NULL,
      requests INTEGER DEFAULT 0,
      rows_upserted INTEGER DEFAULT 0,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS ingest_lock (
      name TEXT PRIMARY KEY,
      locked_until TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS districts (
      id SMALLINT PRIMARY KEY,
      name TEXT,
      division TEXT,
      area_km2 REAL
    );

    CREATE TABLE IF NOT EXISTS stats_cache (
      key TEXT PRIMARY KEY,
      computed_at TIMESTAMPTZ NOT NULL,
      json JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS validation_reviews (
      sample_id TEXT PRIMARY KEY,
      outcome TEXT NOT NULL,
      imagery_source TEXT,
      imagery_date DATE,
      notes TEXT,
      reviewed_at TIMESTAMPTZ DEFAULT now()
    );

    -- Helper indexes for performance
    CREATE INDEX IF NOT EXISTS idx_detections_date ON detections (acq_date);
    CREATE INDEX IF NOT EXISTS idx_detections_district ON detections (district);
    CREATE INDEX IF NOT EXISTS idx_detections_sp ON detections (sp);
    CREATE INDEX IF NOT EXISTS idx_coverage_day ON ingest_coverage (day);
  `;

  try {
    await p.query(ddl);
    await seedDistrictsOnce(p);
    schemaEnsured = true;
    return { ok: true };
  } catch (err: any) {
    schemaError = err.message || String(err);
    console.error('Failed to ensure schema:', schemaError);
    return { ok: false, error: schemaError || undefined };
  }
}

async function seedDistrictsOnce(p: pg.Pool) {
  try {
    const existing = await p.query<{ count: string }>('SELECT COUNT(*)::text as count FROM districts');
    if (parseInt(existing.rows[0].count, 10) > 0) {
      return;
    }

    let adm2Path = path.resolve(process.cwd(), 'data/boundaries/bgd_adm2.geojson');
    if (!fs.existsSync(adm2Path)) {
      adm2Path = path.resolve(process.cwd(), 'public/geo/bgd_adm2.simplified.geojson');
    }
    if (!fs.existsSync(adm2Path)) {
      console.warn(`District geojson not found at ${adm2Path}, skipping seed`);
      return;
    }

    const geojson = JSON.parse(fs.readFileSync(adm2Path, 'utf8'));
    if (!geojson.features || !Array.isArray(geojson.features)) {
      return;
    }

    // Inspect property names found
    const firstProps = geojson.features[0]?.properties || {};
    districtsReportedProperties = Object.keys(firstProps);
    console.log('Seeding districts from bgd_adm2.geojson. Found property fields:', districtsReportedProperties);

    for (let i = 0; i < geojson.features.length; i++) {
      const feat = geojson.features[i];
      const props = feat.properties || {};
      const name = props.shapeName || props.NAME_2 || props.name || props.ADM2_EN || `District ${i}`;
      const division = props.division || props.NAME_1 || props.ADM1_EN || props.shapeGroup || null;
      // Area in km2 from @turf/area (which gives square meters)
      let areaKm2 = 0;
      try {
        const areaSqM = area(feat as any);
        areaKm2 = areaSqM / 1_000_000;
      } catch {
        areaKm2 = 0;
      }

      await p.query(
        `INSERT INTO districts (id, name, division, area_km2)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, division = EXCLUDED.division, area_km2 = EXCLUDED.area_km2`,
        [i, name, division, areaKm2]
      );
    }
    console.log(`Seeded ${geojson.features.length} districts successfully.`);
  } catch (err: any) {
    console.error('Error during seedDistrictsOnce:', err.message);
  }
}

export function getReportedDistrictProperties(): string[] {
  return districtsReportedProperties;
}

export async function getDatabaseSize(): Promise<{ bytes: number; limit_bytes: number }> {
  const limitBytes = CONFIG.DB_SIZE_LIMIT_MB * 1024 * 1024;
  const p = getPool();
  if (!p) return { bytes: 0, limit_bytes: limitBytes };

  try {
    const res = await p.query<{ size_bytes: string }>(
      'SELECT pg_database_size(current_database())::text as size_bytes'
    );
    const bytes = parseInt(res.rows[0]?.size_bytes || '0', 10);
    return { bytes, limit_bytes: limitBytes };
  } catch {
    return { bytes: 0, limit_bytes: limitBytes };
  }
}
