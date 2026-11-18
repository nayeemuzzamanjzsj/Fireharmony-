import { FusedEvent, RawDetectionItem, isModisPlatform, isViirsPlatform } from './fusion.js';

export interface DistrictAggregate {
  id: number;
  name: string;
  division: string | null;
  area_km2: number;
  events_count: number;
  modis_detections: number;
  viirs_detections: number;
  total_detections: number;
  persistent_share: number;
  events_per_100km2: number;
  first_day: string | null;
  last_day: string | null;
}

export function computeDistrictAggregates(
  districtsMeta: { id: number; name: string; division: string | null; area_km2: number }[],
  detections: RawDetectionItem[],
  events: FusedEvent[],
  persistentCellsSet: Set<string> = new Set()
): DistrictAggregate[] {
  // Map of district id -> stats
  const statsMap = new Map<
    number,
    {
      events: number;
      modis: number;
      viirs: number;
      persistentDet: number;
      minDate: string | null;
      maxDate: string | null;
    }
  >();

  for (const d of districtsMeta) {
    statsMap.set(d.id, {
      events: 0,
      modis: 0,
      viirs: 0,
      persistentDet: 0,
      minDate: null,
      maxDate: null,
    });
  }

  for (const det of detections) {
    if (det.district === null) continue;
    let st = statsMap.get(det.district);
    if (!st) continue;

    if (isModisPlatform(det.platform)) st.modis++;
    else if (isViirsPlatform(det.platform)) st.viirs++;

    const cell = `${Math.floor(det.lat_i / 100)},${Math.floor(det.lon_i / 100)}`;
    if (persistentCellsSet.has(cell)) {
      st.persistentDet++;
    }

    if (!st.minDate || det.acq_date < st.minDate) st.minDate = det.acq_date;
    if (!st.maxDate || det.acq_date > st.maxDate) st.maxDate = det.acq_date;
  }

  for (const ev of events) {
    if (ev.district === null) continue;
    const st = statsMap.get(ev.district);
    if (st) {
      st.events++;
    }
  }

  return districtsMeta.map((dm) => {
    const st = statsMap.get(dm.id) || {
      events: 0,
      modis: 0,
      viirs: 0,
      persistentDet: 0,
      minDate: null,
      maxDate: null,
    };
    const total = st.modis + st.viirs;
    const persShare = total > 0 ? Math.round((st.persistentDet / total) * 1000) / 1000 : 0;
    const per100Km2 = dm.area_km2 > 0 ? Math.round(((st.events / dm.area_km2) * 100) * 100) / 100 : 0;

    return {
      id: dm.id,
      name: dm.name,
      division: dm.division,
      area_km2: Math.round(dm.area_km2),
      events_count: st.events,
      modis_detections: st.modis,
      viirs_detections: st.viirs,
      total_detections: total,
      persistent_share: persShare,
      events_per_100km2: per100Km2,
      first_day: st.minDate,
      last_day: st.maxDate,
    };
  });
}
