import { CONFIG, redactFirmsKey } from './config.js';
import { filterAndAssignDistrict } from './spatial.js';

export interface ParsedDetection {
  acq_date: string; // YYYY-MM-DD
  acq_time: number; // 0..2359
  platform: number; // 1 Terra, 2 Aqua, 3 SNPP, 4 NOAA20, 5 NOAA21, 0 unknown MODIS
  lat_i: number;
  lon_i: number;
  frp: number | null;
  conf_class: number; // 0 low, 1 nominal, 2 high
  conf_raw: number | null;
  night: boolean;
  sp: boolean;
  district: number | null;
}

export interface AvailabilityRange {
  product: string;
  min_date: string;
  max_date: string;
}

// Global rate limiting tracker (max 4 req / sec -> min 260ms between requests)
let lastRequestTime = 0;

async function throttleRate() {
  const minIntervalMs = 260;
  const now = Date.now();
  const waitMs = minIntervalMs - (now - lastRequestTime);
  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  lastRequestTime = Date.now();
}

export function resolvePlatform(
  source: string,
  satelliteCol?: string
): { platform: number; warning?: string } {
  const upperSource = source.toUpperCase();
  if (upperSource.includes('SNPP')) return { platform: 3 };
  if (upperSource.includes('NOAA20') || upperSource.includes('NOAA-20')) return { platform: 4 };
  if (upperSource.includes('NOAA21') || upperSource.includes('NOAA-21')) return { platform: 5 };

  if (upperSource.includes('MODIS')) {
    const sat = (satelliteCol || '').trim().toUpperCase();
    if (sat.startsWith('T') || sat === 'TERRA') return { platform: 1 };
    if (sat.startsWith('A') || sat === 'AQUA') return { platform: 2 };
    return { platform: 0, warning: `Unknown MODIS satellite: "${satelliteCol}"` };
  }

  return { platform: 0, warning: `Unknown source: "${source}"` };
}

export function resolveConfidence(
  source: string,
  confValue: string | undefined
): { conf_class: number; conf_raw: number | null } {
  const val = (confValue || '').trim();
  const upperSource = source.toUpperCase();
  if (upperSource.includes('MODIS')) {
    const raw = parseInt(val, 10);
    if (isNaN(raw)) return { conf_class: 1, conf_raw: null };
    let conf_class = 1; // nominal
    if (raw < 30) conf_class = 0; // low
    else if (raw >= 80) conf_class = 2; // high
    return { conf_class, conf_raw: raw };
  } else {
    // VIIRS: l / n / h
    const lower = val.toLowerCase();
    if (lower === 'l' || lower === 'low') return { conf_class: 0, conf_raw: null };
    if (lower === 'h' || lower === 'high') return { conf_class: 2, conf_raw: null };
    return { conf_class: 1, conf_raw: null }; // nominal
  }
}

export function parseFirmsCsv(
  source: string,
  csvText: string,
  isSp: boolean
): { rows: ParsedDetection[]; droppedOutsideBgd: number; warnings: string[] } {
  const trimmed = csvText.trim();
  if (!trimmed) {
    throw new Error('Invalid FIRMS response: empty response body');
  }

  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const headerLine = lines[0];
  if (!headerLine.toLowerCase().startsWith('latitude,')) {
    throw new Error(
      `Invalid FIRMS response: first line does not start with "latitude," (received: "${headerLine.slice(0, 80)}")`
    );
  }

  // Header-only response indicates zero detections for requested range
  if (lines.length === 1) {
    return { rows: [], droppedOutsideBgd: 0, warnings: [] };
  }

  const headers = headerLine.split(',').map((h) => h.trim().toLowerCase());
  const colIndex: Record<string, number> = {};
  for (let i = 0; i < headers.length; i++) {
    colIndex[headers[i]] = i;
  }

  const rows: ParsedDetection[] = [];
  const warnings: string[] = [];
  let droppedOutsideBgd = 0;

  for (let li = 1; li < lines.length; li++) {
    const cols = lines[li].split(',').map((c) => c.trim());
    if (cols.length < 4) continue;

    const latStr = colIndex['latitude'] !== undefined ? cols[colIndex['latitude']] : cols[0];
    const lonStr = colIndex['longitude'] !== undefined ? cols[colIndex['longitude']] : cols[1];
    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);
    if (isNaN(lat) || isNaN(lon)) continue;

    const lat_i = Math.round(lat * 10000);
    const lon_i = Math.round(lon * 10000);

    // Spatial filter: Drop points outside Bangladesh ADM0 polygon & assign district
    const spatialInfo = filterAndAssignDistrict(lat_i, lon_i);
    if (!spatialInfo.inBangladesh) {
      droppedOutsideBgd++;
      continue;
    }

    // Platform
    const satVal = colIndex['satellite'] !== undefined ? cols[colIndex['satellite']] : undefined;
    const { platform, warning: platWarn } = resolvePlatform(source, satVal);
    if (platWarn) warnings.push(platWarn);

    // Confidence
    const confVal = colIndex['confidence'] !== undefined ? cols[colIndex['confidence']] : undefined;
    const { conf_class, conf_raw } = resolveConfidence(source, confVal);

    // Acquisition Date & Time
    const acq_date = colIndex['acq_date'] !== undefined ? cols[colIndex['acq_date']] : '';
    const rawTime = colIndex['acq_time'] !== undefined ? cols[colIndex['acq_time']] : '0';
    const paddedTime = rawTime.padStart(4, '0');
    const acq_time = parseInt(paddedTime, 10) || 0;

    // FRP
    let frp: number | null = null;
    if (colIndex['frp'] !== undefined) {
      const parsedFrp = parseFloat(cols[colIndex['frp']]);
      if (!isNaN(parsedFrp)) frp = parsedFrp;
    }

    // Night indicator
    let night = false;
    if (colIndex['daynight'] !== undefined) {
      night = cols[colIndex['daynight']].toUpperCase() === 'N';
    }

    rows.push({
      acq_date,
      acq_time,
      platform,
      lat_i,
      lon_i,
      frp,
      conf_class,
      conf_raw,
      night,
      sp: isSp,
      district: spatialInfo.districtId,
    });
  }

  return { rows, droppedOutsideBgd, warnings };
}

export async function fetchFirmsArea(
  source: string,
  dayRange: number,
  dateStr?: string
): Promise<{ rows: ParsedDetection[]; rawCount: number }> {
  const key = CONFIG.FIRMS_MAP_KEY;
  if (!key) {
    throw new Error('FIRMS_MAP_KEY is not configured');
  }

  const validDayRange = Math.max(1, Math.min(5, Math.round(dayRange)));
  const bbox = CONFIG.BBOX;
  let url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/${source}/${bbox}/${validDayRange}`;
  if (dateStr) {
    url += `/${dateStr}`;
  }

  const isSp = source.toUpperCase().endsWith('_SP');
  const maxRetries = 4;
  let attempt = 0;
  let lastErr: Error | null = null;

  while (attempt < maxRetries) {
    attempt++;
    await throttleRate();

    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'FireHarmony-NASA-SpaceApps/1.0',
        },
      });

      if (resp.status === 429) {
        throw new Error('Rate limit exceeded (HTTP 429) from NASA FIRMS API');
      }

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
      }

      const text = await resp.text();
      if (text.toLowerCase().includes('rate limit') || text.toLowerCase().includes('exceeded limit')) {
        throw new Error(`FIRMS rate limit message received: ${text.slice(0, 120)}`);
      }

      const parsed = parseFirmsCsv(source, text, isSp);
      return {
        rows: parsed.rows,
        rawCount: parsed.rows.length + parsed.droppedOutsideBgd,
      };
    } catch (err: any) {
      lastErr = err;
      const redactedMsg = redactFirmsKey(err.message || String(err));
      console.warn(`FIRMS fetch attempt ${attempt}/${maxRetries} failed: ${redactedMsg}`);

      if (err.message.includes('Rate limit') || err.message.includes('429')) {
        // Stop the whole run immediately on rate limit
        throw err;
      }

      if (attempt < maxRetries) {
        // Exponential backoff: 500ms, 1000ms, 2000ms
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 250));
      }
    }
  }

  throw new Error(`FIRMS fetch failed after ${maxRetries} attempts: ${lastErr ? redactFirmsKey(lastErr.message) : 'unknown error'}`);
}

export async function fetchDataAvailability(): Promise<{
  ranges: Record<string, AvailabilityRange>;
  rawError?: string;
}> {
  const key = CONFIG.FIRMS_MAP_KEY;
  if (!key) {
    return {
      ranges: getAssumedAvailability(),
      rawError: 'FIRMS_MAP_KEY is not configured',
    };
  }

  const url = `https://firms.modaps.eosdis.nasa.gov/api/data_availability/csv/${key}/ALL`;
  try {
    await throttleRate();
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    }
    const text = await resp.text();
    const lines = text.trim().split(/\r?\n/);
    const ranges: Record<string, AvailabilityRange> = {};

    for (const line of lines) {
      const parts = line.split(',').map((p) => p.trim());
      // Look for rows holding product id and two ISO dates (YYYY-MM-DD)
      const dateParts = parts.filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p));
      if (dateParts.length >= 2) {
        const prodId = parts[0];
        ranges[prodId] = {
          product: prodId,
          min_date: dateParts[0],
          max_date: dateParts[1],
        };
      }
    }

    if (Object.keys(ranges).length === 0) {
      return {
        ranges: getAssumedAvailability(),
        rawError: `Failed to parse data availability CSV (lines: ${lines.length}). Used assumed start dates.`,
      };
    }

    return { ranges };
  } catch (err: any) {
    const rawError = redactFirmsKey(err.message || String(err));
    return {
      ranges: getAssumedAvailability(),
      rawError: `Availability fetch error: ${rawError}. Used assumed start dates.`,
    };
  }
}

export function getAssumedAvailability(): Record<string, AvailabilityRange> {
  const today = new Date().toISOString().slice(0, 10);
  return {
    MODIS_SP: { product: 'MODIS_SP', min_date: '2000-11-01', max_date: today },
    MODIS_NRT: { product: 'MODIS_NRT', min_date: today, max_date: today },
    VIIRS_SNPP_SP: { product: 'VIIRS_SNPP_SP', min_date: '2012-01-19', max_date: today },
    VIIRS_SNPP_NRT: { product: 'VIIRS_SNPP_NRT', min_date: today, max_date: today },
    VIIRS_NOAA20_SP: { product: 'VIIRS_NOAA20_SP', min_date: '2018-04-01', max_date: today },
    VIIRS_NOAA20_NRT: { product: 'VIIRS_NOAA20_NRT', min_date: today, max_date: today },
    VIIRS_NOAA21_NRT: { product: 'VIIRS_NOAA21_NRT', min_date: '2023-01-01', max_date: today },
  };
}
