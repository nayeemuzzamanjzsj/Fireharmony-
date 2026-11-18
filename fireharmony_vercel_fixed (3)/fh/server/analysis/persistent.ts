import { RawDetectionItem, isViirsPlatform, isModisPlatform } from './fusion.js';

export interface PersistentCell {
  cell_key: string;
  lat_cell: number;
  lon_cell: number;
  center_lat: number;
  center_lon: number;
  active_days: number;
  distinct_months: number;
  viirs_detections: number;
  associated_modis: number;
  total_detections: number;
  night_share: number;
  district: number | null;
  active_dates: string[];
}

export interface PersistentAnalysisResult {
  flagged_cells: PersistentCell[];
  cell_keys_set: Set<string>;
  total_flagged: number;
  total_viirs_detections_in_flagged: number;
  sensitivity_grid: {
    fraction: number;
    min_months: number;
    threshold_days: number;
    cells_count: number;
  }[];
}

export function analyzePersistentHeat(
  detections: RawDetectionItem[],
  daysInWindow: number,
  fraction = 0.25,
  minMonths = 3
): PersistentAnalysisResult {
  const viirsRows = detections.filter((d) => isViirsPlatform(d.platform));
  const modisRows = detections.filter((d) => isModisPlatform(d.platform));

  // Threshold: active days >= max(10, Math.round(fraction * daysInWindow))
  const dayThreshold = Math.max(10, Math.round(fraction * daysInWindow));

  // Group VIIRS by cell: floor(lat_i / 100), floor(lon_i / 100)
  interface CellStats {
    lat_cell: number;
    lon_cell: number;
    active_dates: Set<string>;
    months: Set<string>;
    count: number;
    night_count: number;
    districtVotes: Record<number, number>;
  }

  const cells = new Map<string, CellStats>();

  for (const vr of viirsRows) {
    const lat_cell = Math.floor(vr.lat_i / 100);
    const lon_cell = Math.floor(vr.lon_i / 100);
    const key = `${lat_cell},${lon_cell}`;

    let st = cells.get(key);
    if (!st) {
      st = {
        lat_cell,
        lon_cell,
        active_dates: new Set(),
        months: new Set(),
        count: 0,
        night_count: 0,
        districtVotes: {},
      };
      cells.set(key, st);
    }

    st.active_dates.add(vr.acq_date);
    st.months.add(vr.acq_date.slice(0, 7));
    st.count++;
    if (vr.night) st.night_count++;
    if (vr.district !== null) {
      st.districtVotes[vr.district] = (st.districtVotes[vr.district] || 0) + 1;
    }
  }

  // Index MODIS rows by cell
  const modisCellCounts = new Map<string, number>();
  for (const mr of modisRows) {
    const key = `${Math.floor(mr.lat_i / 100)},${Math.floor(mr.lon_i / 100)}`;
    modisCellCounts.set(key, (modisCellCounts.get(key) || 0) + 1);
  }

  // Flag cells according to parameters
  const flagged_cells: PersistentCell[] = [];
  const cell_keys_set = new Set<string>();
  let total_viirs_in_flagged = 0;

  for (const [key, st] of cells.entries()) {
    if (st.active_dates.size >= dayThreshold && st.months.size >= minMonths) {
      cell_keys_set.add(key);

      // Associated MODIS: cell + 8 neighbours
      let assocModis = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nKey = `${st.lat_cell + dy},${st.lon_cell + dx}`;
          assocModis += modisCellCounts.get(nKey) || 0;
        }
      }

      // Mode district
      let modeDist: number | null = null;
      let maxV = -1;
      for (const [dStr, v] of Object.entries(st.districtVotes)) {
        if (v > maxV) {
          maxV = v;
          modeDist = parseInt(dStr, 10);
        }
      }

      const activeDatesSorted = Array.from(st.active_dates).sort();
      total_viirs_in_flagged += st.count;

      flagged_cells.push({
        cell_key: key,
        lat_cell: st.lat_cell,
        lon_cell: st.lon_cell,
        center_lat: (st.lat_cell * 100 + 50) / 10000,
        center_lon: (st.lon_cell * 100 + 50) / 10000,
        active_days: st.active_dates.size,
        distinct_months: st.months.size,
        viirs_detections: st.count,
        associated_modis: assocModis,
        total_detections: st.count + assocModis,
        night_share: Math.round((st.night_count / st.count) * 100) / 100,
        district: modeDist,
        active_dates: activeDatesSorted,
      });
    }
  }

  // Sort flagged cells by active days descending
  flagged_cells.sort((a, b) => b.active_days - a.active_days);

  // Sensitivity grid for fractions [0.10, 0.25, 0.40] and minMonths [2, 3]
  const sensitivity_grid: PersistentAnalysisResult['sensitivity_grid'] = [];
  const fractions = [0.1, 0.25, 0.4];
  const monthsOpts = [2, 3];

  for (const f of fractions) {
    for (const m of monthsOpts) {
      const tDays = Math.max(10, Math.round(f * daysInWindow));
      let count = 0;
      for (const st of cells.values()) {
        if (st.active_dates.size >= tDays && st.months.size >= m) {
          count++;
        }
      }
      sensitivity_grid.push({
        fraction: f,
        min_months: m,
        threshold_days: tDays,
        cells_count: count,
      });
    }
  }

  return {
    flagged_cells,
    cell_keys_set,
    total_flagged: flagged_cells.length,
    total_viirs_detections_in_flagged: total_viirs_in_flagged,
    sensitivity_grid,
  };
}
