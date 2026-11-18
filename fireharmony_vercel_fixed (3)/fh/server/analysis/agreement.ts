import {
  wilsonInterval,
  Interval95,
  haversineKm,
  fitDeming,
  fitOLS,
  spearmanCorr,
  bootstrapDemingSlope,
} from './math.js';
import { RawDetectionItem, parseMinutes, isModisPlatform, isViirsPlatform } from './fusion.js';

export interface FamilyAgreementResult {
  family: 'MODIS' | 'VIIRS';
  total: number;
  eligible: number;
  matched: number;
  rate: number;
  interval: Interval95;
}

export interface AgreementSummary {
  modis: FamilyAgreementResult;
  viirs: FamilyAgreementResult;
  cells: {
    both: number;
    modis_only: number;
    viirs_only: number;
    jaccard: number;
  };
  sensitivity: {
    d_km: number;
    t_min: number;
    modis_rate: number;
    viirs_rate: number;
    modis_n: number;
    viirs_n: number;
  }[];
  breakdowns: {
    by_month: Record<string, { modis_matched: number; modis_eligible: number; viirs_matched: number; viirs_eligible: number }>;
    by_division: Record<string, { modis_matched: number; modis_eligible: number; viirs_matched: number; viirs_eligible: number }>;
    by_confidence: Record<string, { modis_matched: number; modis_eligible: number; viirs_matched: number; viirs_eligible: number }>;
    without_persistent: {
      modis: FamilyAgreementResult;
      viirs: FamilyAgreementResult;
    };
  };
}

export interface FrpResult {
  status: 'ok' | 'insufficient_pairs';
  n: number;
  deming?: {
    slope: number;
    intercept: number;
    bootstrap_95: { lower: number; upper: number } | null;
  };
  ols?: {
    slope: number;
    intercept: number;
    r2: number;
  };
  spearman?: number;
  pairs?: { modis_frp: number; viirs_frp: number }[];
}

export function computeSensorAgreement(
  detections: RawDetectionItem[],
  districtsDivisionMap: Record<number, string> = {},
  persistentCellsSet: Set<string> = new Set(),
  d_default = 1.5,
  t_default = 30
): AgreementSummary {
  const modisRows = detections.filter((d) => isModisPlatform(d.platform));
  const viirsRows = detections.filter((d) => isViirsPlatform(d.platform));

  // Pre-calculate timestamps for fast comparison
  const modisTimes = modisRows.map((r) => parseMinutes(r.acq_date, r.acq_time));
  const viirsTimes = viirsRows.map((r) => parseMinutes(r.acq_date, r.acq_time));

  // Index VIIRS by (date, gridCell) for spatial lookup
  // Grid cell = floor(lat_i / 100), floor(lon_i / 100) -> 0.01 deg
  // Spatial hash: cellKey -> array of indices
  const viirsSpatialHash = new Map<string, number[]>();
  const modisSpatialHash = new Map<string, number[]>();

  for (let i = 0; i < viirsRows.length; i++) {
    const vr = viirsRows[i];
    const key = `${Math.floor(vr.lat_i / 100)},${Math.floor(vr.lon_i / 100)}`;
    let list = viirsSpatialHash.get(key);
    if (!list) {
      list = [];
      viirsSpatialHash.set(key, list);
    }
    list.push(i);
  }

  for (let i = 0; i < modisRows.length; i++) {
    const mr = modisRows[i];
    const key = `${Math.floor(mr.lat_i / 100)},${Math.floor(mr.lon_i / 100)}`;
    let list = modisSpatialHash.get(key);
    if (!list) {
      list = [];
      modisSpatialHash.set(key, list);
    }
    list.push(i);
  }

  // Pre-group timestamps by date for eligibility test:
  // "A MODIS detection is ELIGIBLE if at least one VIIRS detection exists anywhere in Bangladesh within T minutes on the same UTC date"
  const viirsTimesByDate = new Map<string, number[]>();
  for (let i = 0; i < viirsRows.length; i++) {
    const d = viirsRows[i].acq_date;
    let arr = viirsTimesByDate.get(d);
    if (!arr) {
      arr = [];
      viirsTimesByDate.set(d, arr);
    }
    arr.push(viirsTimes[i]);
  }

  const modisTimesByDate = new Map<string, number[]>();
  for (let i = 0; i < modisRows.length; i++) {
    const d = modisRows[i].acq_date;
    let arr = modisTimesByDate.get(d);
    if (!arr) {
      arr = [];
      modisTimesByDate.set(d, arr);
    }
    arr.push(modisTimes[i]);
  }

  function evaluateAgreement(
    d_km: number,
    t_min: number,
    filterPersistent = false
  ): { modisEligible: number; modisMatched: number; viirsEligible: number; viirsMatched: number } {
    let modisEligible = 0;
    let modisMatched = 0;
    let viirsEligible = 0;
    let viirsMatched = 0;

    // Radius in grid cells: 1.5 km ~ 0.015 deg -> deltaCells = ceil(d_km / 1.1)
    const cellRadius = Math.ceil(d_km / 1.0);

    // MODIS -> VIIRS
    for (let i = 0; i < modisRows.length; i++) {
      const mr = modisRows[i];
      if (filterPersistent) {
        const cell = `${Math.floor(mr.lat_i / 100)},${Math.floor(mr.lon_i / 100)}`;
        if (persistentCellsSet.has(cell)) continue;
      }

      const mTime = modisTimes[i];
      const vDateTimes = viirsTimesByDate.get(mr.acq_date);
      let eligible = false;
      if (vDateTimes) {
        for (const vt of vDateTimes) {
          if (Math.abs(mTime - vt) <= t_min) {
            eligible = true;
            break;
          }
        }
      }

      if (!eligible) continue;
      modisEligible++;

      // Search spatial hash for matching VIIRS
      const cLat = Math.floor(mr.lat_i / 100);
      const cLon = Math.floor(mr.lon_i / 100);
      let matched = false;

      for (let dy = -cellRadius; dy <= cellRadius && !matched; dy++) {
        for (let dx = -cellRadius; dx <= cellRadius && !matched; dx++) {
          const neighborKey = `${cLat + dy},${cLon + dx}`;
          const candidates = viirsSpatialHash.get(neighborKey);
          if (!candidates) continue;

          for (const vi of candidates) {
            if (Math.abs(mTime - viirsTimes[vi]) <= t_min) {
              const vr = viirsRows[vi];
              const dist = haversineKm(mr.lat_i / 10000, mr.lon_i / 10000, vr.lat_i / 10000, vr.lon_i / 10000);
              if (dist <= d_km) {
                matched = true;
                break;
              }
            }
          }
        }
      }

      if (matched) modisMatched++;
    }

    // VIIRS -> MODIS
    for (let j = 0; j < viirsRows.length; j++) {
      const vr = viirsRows[j];
      if (filterPersistent) {
        const cell = `${Math.floor(vr.lat_i / 100)},${Math.floor(vr.lon_i / 100)}`;
        if (persistentCellsSet.has(cell)) continue;
      }

      const vTime = viirsTimes[j];
      const mDateTimes = modisTimesByDate.get(vr.acq_date);
      let eligible = false;
      if (mDateTimes) {
        for (const mt of mDateTimes) {
          if (Math.abs(vTime - mt) <= t_min) {
            eligible = true;
            break;
          }
        }
      }

      if (!eligible) continue;
      viirsEligible++;

      const cLat = Math.floor(vr.lat_i / 100);
      const cLon = Math.floor(vr.lon_i / 100);
      let matched = false;

      for (let dy = -cellRadius; dy <= cellRadius && !matched; dy++) {
        for (let dx = -cellRadius; dx <= cellRadius && !matched; dx++) {
          const neighborKey = `${cLat + dy},${cLon + dx}`;
          const candidates = modisSpatialHash.get(neighborKey);
          if (!candidates) continue;

          for (const mi of candidates) {
            if (Math.abs(vTime - modisTimes[mi]) <= t_min) {
              const mr = modisRows[mi];
              const dist = haversineKm(vr.lat_i / 10000, vr.lon_i / 10000, mr.lat_i / 10000, mr.lon_i / 10000);
              if (dist <= d_km) {
                matched = true;
                break;
              }
            }
          }
        }
      }

      if (matched) viirsMatched++;
    }

    return { modisEligible, modisMatched, viirsEligible, viirsMatched };
  }

  // Base agreement
  const base = evaluateAgreement(d_default, t_default, false);
  const withoutPers = evaluateAgreement(d_default, t_default, true);

  const modisRate = base.modisEligible > 0 ? base.modisMatched / base.modisEligible : 0;
  const viirsRate = base.viirsEligible > 0 ? base.viirsMatched / base.viirsEligible : 0;

  // Cell-level presence on 0.01 deg grid
  const allCellKeys = new Set<string>([...modisSpatialHash.keys(), ...viirsSpatialHash.keys()]);
  let bothCells = 0;
  let modisOnlyCells = 0;
  let viirsOnlyCells = 0;

  for (const k of allCellKeys) {
    const hasM = modisSpatialHash.has(k);
    const hasV = viirsSpatialHash.has(k);
    if (hasM && hasV) bothCells++;
    else if (hasM) modisOnlyCells++;
    else viirsOnlyCells++;
  }
  const jaccard = allCellKeys.size > 0 ? bothCells / allCellKeys.size : 0;

  // Sensitivity table over d in [1.0, 1.5, 2.0] and T in [30, 60]
  const dList = [1.0, 1.5, 2.0];
  const tList = [30, 60];
  const sensitivity: AgreementSummary['sensitivity'] = [];

  for (const d of dList) {
    for (const t of tList) {
      const res = evaluateAgreement(d, t, false);
      sensitivity.push({
        d_km: d,
        t_min: t,
        modis_rate: res.modisEligible > 0 ? Math.round((res.modisMatched / res.modisEligible) * 1000) / 1000 : 0,
        viirs_rate: res.viirsEligible > 0 ? Math.round((res.viirsMatched / res.viirsEligible) * 1000) / 1000 : 0,
        modis_n: res.modisEligible,
        viirs_n: res.viirsEligible,
      });
    }
  }

  // Breakdowns
  const byMonth: Record<string, { modis_matched: number; modis_eligible: number; viirs_matched: number; viirs_eligible: number }> = {};
  const byDivision: Record<string, { modis_matched: number; modis_eligible: number; viirs_matched: number; viirs_eligible: number }> = {};
  const byConfidence: Record<string, { modis_matched: number; modis_eligible: number; viirs_matched: number; viirs_eligible: number }> = {
    nominal: { modis_matched: 0, modis_eligible: 0, viirs_matched: 0, viirs_eligible: 0 },
    high: { modis_matched: 0, modis_eligible: 0, viirs_matched: 0, viirs_eligible: 0 },
  };

  for (const d of detections) {
    const m = d.acq_date.slice(0, 7);
    if (!byMonth[m]) byMonth[m] = { modis_matched: 0, modis_eligible: 0, viirs_matched: 0, viirs_eligible: 0 };
    const div = (d.district !== null ? districtsDivisionMap[d.district] : null) || 'Other';
    if (!byDivision[div]) byDivision[div] = { modis_matched: 0, modis_eligible: 0, viirs_matched: 0, viirs_eligible: 0 };
  }

  return {
    modis: {
      family: 'MODIS',
      total: modisRows.length,
      eligible: base.modisEligible,
      matched: base.modisMatched,
      rate: Math.round(modisRate * 1000) / 1000,
      interval: wilsonInterval(base.modisMatched, base.modisEligible),
    },
    viirs: {
      family: 'VIIRS',
      total: viirsRows.length,
      eligible: base.viirsEligible,
      matched: base.viirsMatched,
      rate: Math.round(viirsRate * 1000) / 1000,
      interval: wilsonInterval(base.viirsMatched, base.viirsEligible),
    },
    cells: {
      both: bothCells,
      modis_only: modisOnlyCells,
      viirs_only: viirsOnlyCells,
      jaccard: Math.round(jaccard * 1000) / 1000,
    },
    sensitivity,
    breakdowns: {
      by_month: byMonth,
      by_division: byDivision,
      by_confidence: byConfidence,
      without_persistent: {
        modis: {
          family: 'MODIS',
          total: modisRows.length,
          eligible: withoutPers.modisEligible,
          matched: withoutPers.modisMatched,
          rate: withoutPers.modisEligible > 0 ? Math.round((withoutPers.modisMatched / withoutPers.modisEligible) * 1000) / 1000 : 0,
          interval: wilsonInterval(withoutPers.modisMatched, withoutPers.modisEligible),
        },
        viirs: {
          family: 'VIIRS',
          total: viirsRows.length,
          eligible: withoutPers.viirsEligible,
          matched: withoutPers.viirsMatched,
          rate: withoutPers.viirsEligible > 0 ? Math.round((withoutPers.viirsMatched / withoutPers.viirsEligible) * 1000) / 1000 : 0,
          interval: wilsonInterval(withoutPers.viirsMatched, withoutPers.viirsEligible),
        },
      },
    },
  };
}

export function computeFrpRelationship(events: { families: string[]; frp_modis_sum: number; frp_viirs_sum: number }[]): FrpResult {
  // Pair events containing both MODIS and VIIRS members within T minutes; use summed FRP per family
  const pairs: { modis_frp: number; viirs_frp: number }[] = [];

  for (const ev of events) {
    if (ev.families.includes('MODIS') && ev.families.includes('VIIRS')) {
      if (ev.frp_modis_sum > 0 && ev.frp_viirs_sum > 0) {
        pairs.push({
          modis_frp: ev.frp_modis_sum,
          viirs_frp: ev.frp_viirs_sum,
        });
      }
    }
  }

  const n = pairs.length;
  if (n < 30) {
    return {
      status: 'insufficient_pairs',
      n,
      pairs,
    };
  }

  const x = pairs.map((p) => p.modis_frp);
  const y = pairs.map((p) => p.viirs_frp);

  const deming = fitDeming(x, y, 1.0);
  const ols = fitOLS(x, y);
  const spearman = spearmanCorr(x, y);
  const boot = bootstrapDemingSlope(x, y, 1000, 42);

  return {
    status: 'ok',
    n,
    deming: deming
      ? {
          slope: Math.round(deming.slope * 1000) / 1000,
          intercept: Math.round(deming.intercept * 1000) / 1000,
          bootstrap_95: boot
            ? {
                lower: Math.round(boot.lower * 1000) / 1000,
                upper: Math.round(boot.upper * 1000) / 1000,
              }
            : null,
        }
      : undefined,
    ols: ols
      ? {
          slope: Math.round(ols.slope * 1000) / 1000,
          intercept: Math.round(ols.intercept * 1000) / 1000,
          r2: Math.round(ols.r2 * 1000) / 1000,
        }
      : undefined,
    spearman: Math.round(spearman * 1000) / 1000,
    pairs,
  };
}
