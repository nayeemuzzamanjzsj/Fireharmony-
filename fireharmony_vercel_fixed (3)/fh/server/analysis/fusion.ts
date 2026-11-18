import crypto from 'node:crypto';
import RBush from 'rbush';
import { haversineKm } from './math.js';

export interface RawDetectionItem {
  acq_date: string;
  acq_time: number;
  platform: number; // 1 Terra, 2 Aqua, 3 SNPP, 4 NOAA20, 5 NOAA21, 0 unknown
  lat_i: number;
  lon_i: number;
  frp: number | null;
  conf_class: number;
  conf_raw: number | null;
  night: boolean;
  sp: boolean;
  district: number | null;
}

export interface FusedEvent {
  id: string;
  centroid_lat: number;
  centroid_lon: number;
  start_date: string;
  end_date: string;
  start_time: number;
  end_time: number;
  duration_hours: number;
  extent_km: number;
  member_count: number;
  platforms: number[];
  families: ('MODIS' | 'VIIRS')[];
  overpasses_count: number;
  active_days_count: number;
  night_share: number;
  district: number | null;
  frp_modis_sum: number;
  frp_viirs_sum: number;
  frp_total_sum: number;
  frp_min: number | null;
  frp_max: number | null;
  conf_high_count: number;
  conf_nominal_count: number;
  conf_low_count: number;
  is_persistent: boolean;
  label:
    | 'Multi-sensor agreement'
    | 'Single sensor, multiple passes'
    | 'Single observation'
    | 'Suspected persistent heat';
  members: RawDetectionItem[];
}

interface SpatialIndexItem {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  index: number;
}

export function parseMinutes(dateStr: string, timeNum: number): number {
  const d = new Date(dateStr + 'T00:00:00Z');
  const hh = Math.floor(timeNum / 100);
  const mm = timeNum % 100;
  return Math.floor(d.getTime() / 60000) + hh * 60 + mm;
}

export function isModisPlatform(p: number): boolean {
  return p === 1 || p === 2 || p === 0;
}

export function isViirsPlatform(p: number): boolean {
  return p === 3 || p === 4 || p === 5;
}

export function fuseEvents(
  detections: RawDetectionItem[],
  persistentCellsSet: Set<string> = new Set()
): FusedEvent[] {
  if (detections.length === 0) return [];

  const n = detections.length;
  const lats = new Float64Array(n);
  const lons = new Float64Array(n);
  const times = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const d = detections[i];
    lats[i] = d.lat_i / 10000;
    lons[i] = d.lon_i / 10000;
    times[i] = parseMinutes(d.acq_date, d.acq_time);
  }

  // 1.5 km in degrees approx 0.015
  const degMargin = 0.016;
  const tree = new (RBush as any)() as RBush<SpatialIndexItem>;
  const items: SpatialIndexItem[] = [];

  for (let i = 0; i < n; i++) {
    items.push({
      minX: lons[i] - degMargin,
      minY: lats[i] - degMargin,
      maxX: lons[i] + degMargin,
      maxY: lats[i] + degMargin,
      index: i,
    });
  }
  tree.load(items);

  // Single-linkage clustering with BFS / Disjoint-Set
  const visited = new Uint8Array(n);
  const events: FusedEvent[] = [];

  for (let i = 0; i < n; i++) {
    if (visited[i]) continue;

    visited[i] = 1;
    const queue = [i];
    const clusterIndices: number[] = [i];

    let minLat = lats[i];
    let maxLat = lats[i];
    let minLon = lons[i];
    let maxLon = lons[i];
    let minTime = times[i];
    let maxTime = times[i];

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const currLat = lats[curr];
      const currLon = lons[curr];
      const currTime = times[curr];

      const candidates = tree.search({
        minX: currLon - degMargin,
        minY: currLat - degMargin,
        maxX: currLon + degMargin,
        maxY: currLat + degMargin,
      });

      for (const cand of candidates) {
        const j = cand.index;
        if (visited[j]) continue;

        // Temporal threshold: 6 hours = 360 min
        const dt = Math.abs(currTime - times[j]);
        if (dt > 360) continue;

        // Spatial threshold: 1.5 km
        const distKm = haversineKm(currLat, currLon, lats[j], lons[j]);
        if (distKm > 1.5) continue;

        // Check if adding j exceeds max duration 48h (2880m) or max extent 5.0km
        const newMinTime = Math.min(minTime, times[j]);
        const newMaxTime = Math.max(maxTime, times[j]);
        if (newMaxTime - newMinTime > 2880) continue;

        const newMinLat = Math.min(minLat, lats[j]);
        const newMaxLat = Math.max(maxLat, lats[j]);
        const newMinLon = Math.min(minLon, lons[j]);
        const newMaxLon = Math.max(maxLon, lons[j]);
        const extentApprox = haversineKm(newMinLat, newMinLon, newMaxLat, newMaxLon);
        if (extentApprox > 5.0) continue;

        // Accept node into cluster
        visited[j] = 1;
        queue.push(j);
        clusterIndices.push(j);

        minLat = newMinLat;
        maxLat = newMaxLat;
        minLon = newMinLon;
        maxLon = newMaxLon;
        minTime = newMinTime;
        maxTime = newMaxTime;
      }
    }

    // Build fused event from cluster members
    const members = clusterIndices.map((idx) => detections[idx]);

    // Member keys sorted for deterministic ID hash
    const memberKeys = members.map(
      (m) => `${m.acq_date}_${m.platform}_${m.acq_time}_${m.lat_i}_${m.lon_i}`
    );
    memberKeys.sort();
    const hash = crypto.createHash('sha256').update(memberKeys.join('|')).digest('hex').slice(0, 16);

    let sumLat = 0;
    let sumLon = 0;
    const platsSet = new Set<number>();
    const overpassSet = new Set<string>();
    const daysSet = new Set<string>();
    let nightCount = 0;
    let frpModisSum = 0;
    let frpViirsSum = 0;
    let frpMin: number | null = null;
    let frpMax: number | null = null;
    let confHigh = 0;
    let confNom = 0;
    let confLow = 0;
    let persistentCount = 0;
    const districtVotes: Record<number, number> = {};

    for (const m of members) {
      sumLat += m.lat_i / 10000;
      sumLon += m.lon_i / 10000;
      platsSet.add(m.platform);
      overpassSet.add(`${m.platform}_${m.acq_date}_${m.acq_time}`);
      daysSet.add(m.acq_date);
      if (m.night) nightCount++;

      if (m.frp !== null && m.frp > 0) {
        if (isModisPlatform(m.platform)) frpModisSum += m.frp;
        else if (isViirsPlatform(m.platform)) frpViirsSum += m.frp;

        if (frpMin === null || m.frp < frpMin) frpMin = m.frp;
        if (frpMax === null || m.frp > frpMax) frpMax = m.frp;
      }

      if (m.conf_class === 2) confHigh++;
      else if (m.conf_class === 0) confLow++;
      else confNom++;

      if (m.district !== null) {
        districtVotes[m.district] = (districtVotes[m.district] || 0) + 1;
      }

      const cellKey = `${Math.floor(m.lat_i / 100)},${Math.floor(m.lon_i / 100)}`;
      if (persistentCellsSet.has(cellKey)) {
        persistentCount++;
      }
    }

    // District mode
    let modeDistrict: number | null = null;
    let maxVotes = -1;
    for (const [distStr, votes] of Object.entries(districtVotes)) {
      if (votes > maxVotes) {
        maxVotes = votes;
        modeDistrict = parseInt(distStr, 10);
      }
    }

    const hasModis = Array.from(platsSet).some(isModisPlatform);
    const hasViirs = Array.from(platsSet).some(isViirsPlatform);
    const families: ('MODIS' | 'VIIRS')[] = [];
    if (hasModis) families.push('MODIS');
    if (hasViirs) families.push('VIIRS');

    const isPersistent = persistentCount > members.length / 2;

    // Descriptive labels only
    let label: FusedEvent['label'] = 'Single observation';
    if (isPersistent) {
      label = 'Suspected persistent heat';
    } else if (hasModis && hasViirs) {
      label = 'Multi-sensor agreement';
    } else if (overpassSet.size > 1) {
      label = 'Single sensor, multiple passes';
    } else {
      label = 'Single observation';
    }

    // Sort members chronologically
    members.sort((a, b) => {
      const ta = parseMinutes(a.acq_date, a.acq_time);
      const tb = parseMinutes(b.acq_date, b.acq_time);
      return ta - tb;
    });

    const durationHours = Math.round(((maxTime - minTime) / 60) * 10) / 10;
    const extentKm = Math.round(haversineKm(minLat, minLon, maxLat, maxLon) * 10) / 10;

    events.push({
      id: `ev_${hash}`,
      centroid_lat: Math.round((sumLat / members.length) * 10000) / 10000,
      centroid_lon: Math.round((sumLon / members.length) * 10000) / 10000,
      start_date: members[0].acq_date,
      end_date: members[members.length - 1].acq_date,
      start_time: members[0].acq_time,
      end_time: members[members.length - 1].acq_time,
      duration_hours: durationHours,
      extent_km: extentKm,
      member_count: members.length,
      platforms: Array.from(platsSet).sort((a, b) => a - b),
      families,
      overpasses_count: overpassSet.size,
      active_days_count: daysSet.size,
      night_share: Math.round((nightCount / members.length) * 100) / 100,
      district: modeDistrict,
      frp_modis_sum: Math.round(frpModisSum * 10) / 10,
      frp_viirs_sum: Math.round(frpViirsSum * 10) / 10,
      frp_total_sum: Math.round((frpModisSum + frpViirsSum) * 10) / 10,
      frp_min: frpMin !== null ? Math.round(frpMin * 10) / 10 : null,
      frp_max: frpMax !== null ? Math.round(frpMax * 10) / 10 : null,
      conf_high_count: confHigh,
      conf_nominal_count: confNom,
      conf_low_count: confLow,
      is_persistent: isPersistent,
      label,
      members,
    });
  }

  return events;
}
