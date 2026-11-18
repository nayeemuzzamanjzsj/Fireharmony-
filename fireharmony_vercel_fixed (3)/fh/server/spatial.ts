import fs from 'node:fs';
import path from 'node:path';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import bbox from '@turf/bbox';
import RBush from 'rbush';

interface DistrictBBoxItem {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  districtId: number;
  feature: any;
}

let adm0Loaded = false;
let adm0Feature: any = null;
let adm0Bbox: [number, number, number, number] | null = null;

let adm2Tree: RBush<DistrictBBoxItem> | null = null;
let adm2Features: any[] = [];

// Memoization cache: (lat_i, lon_i) -> { inBangladesh: boolean, districtId: number | null }
// Limit cache size to 500,000 entries
const spatialCache = new Map<number, { inBangladesh: boolean; districtId: number | null }>();

function coordKey(lat_i: number, lon_i: number): number {
  // pack into unique 64-bit integer or float: (lat_i * 1000000) + lon_i
  // Since lat_i ~ 205000..267000 and lon_i ~ 880000..927000
  return lat_i * 10000000 + lon_i;
}

export function initSpatialData(): boolean {
  if (adm0Loaded && adm2Tree) return true;

  try {
    const adm0Path = path.resolve(process.cwd(), 'data/boundaries/bgd_adm0.geojson');
    let adm2Path = path.resolve(process.cwd(), 'data/boundaries/bgd_adm2.geojson');
    if (!fs.existsSync(adm2Path)) {
      adm2Path = path.resolve(process.cwd(), 'public/geo/bgd_adm2.simplified.geojson');
    }

    if (!fs.existsSync(adm0Path) || !fs.existsSync(adm2Path)) {
      console.warn(`Boundary files missing: adm0=${fs.existsSync(adm0Path)}, adm2=${fs.existsSync(adm2Path)}`);
      return false;
    }

    const adm0Data = JSON.parse(fs.readFileSync(adm0Path, 'utf8'));
    adm0Feature = adm0Data.features ? adm0Data.features[0] : adm0Data;
    adm0Bbox = bbox(adm0Feature) as [number, number, number, number];

    const adm2Data = JSON.parse(fs.readFileSync(adm2Path, 'utf8'));
    adm2Features = adm2Data.features || [];

    const tree = new (RBush as any)() as RBush<DistrictBBoxItem>;
    const items: DistrictBBoxItem[] = [];

    for (let i = 0; i < adm2Features.length; i++) {
      const feat = adm2Features[i];
      const [minX, minY, maxX, maxY] = bbox(feat);
      items.push({
        minX,
        minY,
        maxX,
        maxY,
        districtId: i,
        feature: feat,
      });
    }

    tree.load(items);
    adm2Tree = tree;
    adm0Loaded = true;
    console.log(`Spatial indexing initialized: ADM0 bbox=[${adm0Bbox}], ADM2 features=${items.length}`);
    return true;
  } catch (err: any) {
    console.error('Failed to init spatial data:', err.message);
    return false;
  }
}

export function filterAndAssignDistrict(
  lat_i: number,
  lon_i: number
): { inBangladesh: boolean; districtId: number | null } {
  const key = coordKey(lat_i, lon_i);
  const cached = spatialCache.get(key);
  if (cached) return cached;

  if (!adm0Loaded || !adm2Tree || !adm0Bbox) {
    const ok = initSpatialData();
    if (!ok) {
      // Boundaries not available, fail safe
      return { inBangladesh: false, districtId: null };
    }
  }

  const lat = lat_i / 10000;
  const lon = lon_i / 10000;

  // Prefilter with ADM0 bbox
  const [bMinX, bMinY, bMaxX, bMaxY] = adm0Bbox!;
  if (lon < bMinX || lon > bMaxX || lat < bMinY || lat > bMaxY) {
    const res = { inBangladesh: false, districtId: null };
    if (spatialCache.size < 500000) spatialCache.set(key, res);
    return res;
  }

  // Boolean point in polygon for ADM0
  const pt = [lon, lat];
  let inBgd = false;
  try {
    inBgd = booleanPointInPolygon(pt, adm0Feature);
  } catch {
    inBgd = false;
  }

  if (!inBgd) {
    const res = { inBangladesh: false, districtId: null };
    if (spatialCache.size < 500000) spatialCache.set(key, res);
    return res;
  }

  // District lookup using RBush bbox prefilter
  const candidates = adm2Tree!.search({
    minX: lon,
    minY: lat,
    maxX: lon,
    maxY: lat,
  });

  let assignedDistrict: number | null = null;
  for (const cand of candidates) {
    try {
      if (booleanPointInPolygon(pt, cand.feature)) {
        assignedDistrict = cand.districtId;
        break;
      }
    } catch {
      // Continue searching
    }
  }

  // If inside ADM0 but slight boundary discrepancy with ADM2 coast, default to candidate or null
  if (assignedDistrict === null && candidates.length > 0) {
    assignedDistrict = candidates[0].districtId;
  }

  const res = { inBangladesh: true, districtId: assignedDistrict };
  if (spatialCache.size < 500000) spatialCache.set(key, res);
  return res;
}

export function areBoundariesLoaded(): boolean {
  return adm0Loaded && adm2Tree !== null;
}
