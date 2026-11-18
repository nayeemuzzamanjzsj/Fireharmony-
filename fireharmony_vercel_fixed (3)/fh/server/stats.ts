import crypto from 'node:crypto';
import { query } from './db.js';
import { RawDetectionItem, FusedEvent, fuseEvents, isModisPlatform, isViirsPlatform } from './analysis/fusion.js';
import {
  computeSensorAgreement,
  computeFrpRelationship,
  AgreementSummary,
  FrpResult,
} from './analysis/agreement.js';
import { analyzePersistentHeat, PersistentAnalysisResult } from './analysis/persistent.js';
import { computeCalendarAnalysis, CalendarResult } from './analysis/calendar.js';
import { computeDistrictAggregates, DistrictAggregate } from './analysis/districts.js';
import { createMulberry32 } from './analysis/math.js';

export interface ProvenanceInfo {
  products: string[];
  sp_count: number;
  nrt_count: number;
  window: { from: string; to: string; days: number };
  parameters: {
    event_spatial_km: number;
    event_temporal_h: number;
    max_event_extent_km: number;
    max_event_duration_h: number;
    agreement_distance_km: number;
    agreement_time_min: number;
    grid_cell_deg: number;
    persistent_min_fraction: number;
    persistent_min_months: number;
    min_modis_confidence: string;
    min_viirs_confidence: string;
    frp_min_pairs: number;
  };
  generated_at: string;
  algorithm_version: string;
}

export interface CleaningReport {
  total_in_window: number;
  removed_by_confidence: number;
  kept_after_confidence: number;
  by_family: {
    modis: { raw: number; removed: number; kept: number };
    viirs: { raw: number; removed: number; kept: number };
  };
}

export interface PipelineStages {
  stage_1_raw_rows: number;
  stage_2_confidence_filtered: number;
  stage_3_events_total: number;
  stage_4_events_without_persistent: number;
  raw_count_ratio: {
    label: string; // "raw count ratio, context only"
    viirs_to_modis_raw: number;
    viirs_to_modis_without_persistent: number;
  };
}

export interface WindowResults {
  provenance: ProvenanceInfo;
  cleaning: CleaningReport;
  stages: PipelineStages;
  agreement: AgreementSummary;
  frp: FrpResult;
  persistent: {
    total_flagged_cells: number;
    total_viirs_in_flagged: number;
    sensitivity_grid: PersistentAnalysisResult['sensitivity_grid'];
    flagged_cells_preview: any[];
  };
  overview_cards: {
    cells_seen_by_both: {
      rate: number;
      both_count: number;
      total_cells: number;
    };
    frp_relationship: {
      status: string;
      slope: number | null;
      r2: number | null;
      n: number;
    };
    suspected_persistent_heat: {
      flagged_cells_count: number;
      detections_in_flagged_count: number;
      share_of_all_detections: number;
    };
    fire_events_count: number;
  };
}

export interface AnalysisBundle {
  results: WindowResults;
  events: FusedEvent[];
  calendar: CalendarResult;
  districts: DistrictAggregate[];
  persistentFull: PersistentAnalysisResult;
}

// Global in-memory cache to complement stats_cache
const memCache = new Map<string, { computedAt: number; bundle: AnalysisBundle }>();

export async function runFullAnalysis(
  fromDate: string,
  toDate: string,
  includeNrt = false
): Promise<{ bundle?: AnalysisBundle; error?: string; monthlyCountsOnly?: any }> {
  // Check date limit (max 366 days)
  const dStart = new Date(fromDate + 'T00:00:00Z');
  const dEnd = new Date(toDate + 'T00:00:00Z');
  const daysInWindow = Math.max(1, Math.round((dEnd.getTime() - dStart.getTime()) / (86400 * 1000)) + 1);

  if (daysInWindow > 366) {
    // Return monthly counts and error message
    const monthlyRes = await query<{ month: string; count: string }>(
      `SELECT to_char(acq_date, 'YYYY-MM') as month, count(*)::text as count
       FROM detections
       WHERE acq_date >= $1::date AND acq_date <= $2::date
       GROUP BY 1 ORDER BY 1`,
      [fromDate, toDate]
    );
    return {
      error: 'Statistics windows are limited to 366 days. Please select a shorter window.',
      monthlyCountsOnly: monthlyRes.rows.map((r) => ({ month: r.month, count: parseInt(r.count, 10) })),
    };
  }

  // Get coverage version: max(fetched_at) of ingest_coverage in window
  const covVerRes = await query<{ max_fetched: string }>(
    `SELECT max(fetched_at)::text as max_fetched FROM ingest_coverage WHERE day >= $1::date AND day <= $2::date`,
    [fromDate, toDate]
  );
  const coverageVersion = covVerRes.rows[0]?.max_fetched || 'none';

  const cacheKey = `analysis_${fromDate}_${toDate}_nrt${includeNrt ? 1 : 0}_cv${coverageVersion}`;

  // Check memCache
  const cachedMem = memCache.get(cacheKey);
  if (cachedMem && Date.now() - cachedMem.computedAt < 60000) {
    return { bundle: cachedMem.bundle };
  }

  // Check stats_cache table
  try {
    const dbCacheRes = await query<{ json: any }>(
      `SELECT json FROM stats_cache WHERE key = $1`,
      [cacheKey]
    );
    if (dbCacheRes.rows.length > 0) {
      const stored = dbCacheRes.rows[0].json as AnalysisBundle;
      memCache.set(cacheKey, { computedAt: Date.now(), bundle: stored });
      return { bundle: stored };
    }
  } catch {
    // DB query error, proceed to compute
  }

  // Fetch raw detections for window
  const spClause = includeNrt ? '' : 'AND sp = true';
  const detectionsRes = await query<{
    acq_date: string;
    acq_time: number;
    platform: number;
    lat_i: number;
    lon_i: number;
    frp: number | null;
    conf_class: number;
    conf_raw: number | null;
    night: boolean;
    sp: boolean;
    district: number | null;
  }>(
    `SELECT acq_date::text, acq_time, platform, lat_i, lon_i, frp, conf_class, conf_raw, night, sp, district
     FROM detections
     WHERE acq_date >= $1::date AND acq_date <= $2::date ${spClause}
     ORDER BY acq_date ASC, acq_time ASC`,
    [fromDate, toDate]
  );

  const rawRows: RawDetectionItem[] = detectionsRes.rows.map((r) => ({
    acq_date: r.acq_date,
    acq_time: r.acq_time,
    platform: r.platform,
    lat_i: r.lat_i,
    lon_i: r.lon_i,
    frp: r.frp,
    conf_class: r.conf_class,
    conf_raw: r.conf_raw,
    night: r.night,
    sp: r.sp,
    district: r.district,
  }));

  // Fetch district metadata
  const distMetaRes = await query<{ id: number; name: string; division: string | null; area_km2: number }>(
    `SELECT id, name, division, area_km2 FROM districts ORDER BY id`
  );
  const districtsMeta = distMetaRes.rows;
  const distDivMap: Record<number, string> = {};
  for (const d of districtsMeta) {
    if (d.division) distDivMap[d.id] = d.division;
  }

  // 1. Cleaning report: confidence filter
  // Minimum confidence: MODIS conf_raw >= 30, VIIRS conf_class >= 1 (nominal)
  let modisRaw = 0;
  let modisRemoved = 0;
  let viirsRaw = 0;
  let viirsRemoved = 0;

  const keptRows: RawDetectionItem[] = [];

  for (const r of rawRows) {
    if (isModisPlatform(r.platform)) {
      modisRaw++;
      if (r.conf_raw !== null && r.conf_raw < 30) {
        modisRemoved++;
      } else {
        keptRows.push(r);
      }
    } else if (isViirsPlatform(r.platform)) {
      viirsRaw++;
      if (r.conf_class < 1) {
        viirsRemoved++;
      } else {
        keptRows.push(r);
      }
    } else {
      keptRows.push(r);
    }
  }

  const cleaning: CleaningReport = {
    total_in_window: rawRows.length,
    removed_by_confidence: modisRemoved + viirsRemoved,
    kept_after_confidence: keptRows.length,
    by_family: {
      modis: { raw: modisRaw, removed: modisRemoved, kept: modisRaw - modisRemoved },
      viirs: { raw: viirsRaw, removed: viirsRemoved, kept: viirsRaw - viirsRemoved },
    },
  };

  // 2. Persistent heat analysis on kept rows
  const persistentFull = analyzePersistentHeat(keptRows, daysInWindow, 0.25, 3);
  const persistentCellKeys = persistentFull.cell_keys_set;

  // 3. Event fusion
  const events = fuseEvents(keptRows, persistentCellKeys);

  // 4. Sensor agreement
  const agreement = computeSensorAgreement(keptRows, distDivMap, persistentCellKeys, 1.5, 30);

  // 5. FRP relationship
  const frp = computeFrpRelationship(events);

  // 6. Calendar
  const calendar = computeCalendarAnalysis(keptRows, events, fromDate, toDate);

  // 7. District aggregates
  const districts = computeDistrictAggregates(districtsMeta, keptRows, events, persistentCellKeys);

  // 8. Pipeline stages & before/after
  const eventsWithoutPersistent = events.filter((e) => !e.is_persistent);
  const modisKept = cleaning.by_family.modis.kept;
  const viirsKept = cleaning.by_family.viirs.kept;

  const viirsInPers = persistentFull.total_viirs_detections_in_flagged;
  const viirsWithoutPers = Math.max(0, viirsKept - viirsInPers);

  const rawCountRatioBefore = modisKept > 0 ? Math.round((viirsKept / modisKept) * 100) / 100 : 0;
  const rawCountRatioAfter = modisKept > 0 ? Math.round((viirsWithoutPers / modisKept) * 100) / 100 : 0;

  const stages: PipelineStages = {
    stage_1_raw_rows: rawRows.length,
    stage_2_confidence_filtered: keptRows.length,
    stage_3_events_total: events.length,
    stage_4_events_without_persistent: eventsWithoutPersistent.length,
    raw_count_ratio: {
      label: 'raw count ratio, context only',
      viirs_to_modis_raw: rawCountRatioBefore,
      viirs_to_modis_without_persistent: rawCountRatioAfter,
    },
  };

  // Count SP vs NRT
  let spCount = 0;
  let nrtCount = 0;
  for (const r of rawRows) {
    if (r.sp) spCount++;
    else nrtCount++;
  }

  // Provenance
  const prodsRes = await query<{ product: string }>(
    `SELECT DISTINCT product FROM ingest_coverage WHERE day >= $1::date AND day <= $2::date`,
    [fromDate, toDate]
  );
  const prodsList = prodsRes.rows.map((p) => p.product);

  const provenance: ProvenanceInfo = {
    products: prodsList,
    sp_count: spCount,
    nrt_count: nrtCount,
    window: { from: fromDate, to: toDate, days: daysInWindow },
    parameters: {
      event_spatial_km: 1.5,
      event_temporal_h: 6,
      max_event_extent_km: 5.0,
      max_event_duration_h: 48,
      agreement_distance_km: 1.5,
      agreement_time_min: 30,
      grid_cell_deg: 0.01,
      persistent_min_fraction: 0.25,
      persistent_min_months: 3,
      min_modis_confidence: 'conf_raw >= 30',
      min_viirs_confidence: 'conf_class >= 1 (nominal)',
      frp_min_pairs: 30,
    },
    generated_at: new Date().toISOString(),
    algorithm_version: '1.0.0',
  };

  // Overview cards
  const totalCells = agreement.cells.both + agreement.cells.modis_only + agreement.cells.viirs_only;
  const cellsSeenByBothRate = totalCells > 0 ? Math.round((agreement.cells.both / totalCells) * 1000) / 1000 : 0;

  const totalDetectionsKept = keptRows.length;
  const sharePers = totalDetectionsKept > 0
    ? Math.round((persistentFull.total_viirs_detections_in_flagged / totalDetectionsKept) * 1000) / 1000
    : 0;

  const results: WindowResults = {
    provenance,
    cleaning,
    stages,
    agreement,
    frp,
    persistent: {
      total_flagged_cells: persistentFull.total_flagged,
      total_viirs_in_flagged: persistentFull.total_viirs_detections_in_flagged,
      sensitivity_grid: persistentFull.sensitivity_grid,
      flagged_cells_preview: persistentFull.flagged_cells.slice(0, 10),
    },
    overview_cards: {
      cells_seen_by_both: {
        rate: cellsSeenByBothRate,
        both_count: agreement.cells.both,
        total_cells: totalCells,
      },
      frp_relationship: {
        status: frp.status,
        slope: frp.deming?.slope || null,
        r2: frp.ols?.r2 || null,
        n: frp.n,
      },
      suspected_persistent_heat: {
        flagged_cells_count: persistentFull.total_flagged,
        detections_in_flagged_count: persistentFull.total_viirs_detections_in_flagged,
        share_of_all_detections: sharePers,
      },
      fire_events_count: events.length,
    },
  };

  const bundle: AnalysisBundle = {
    results,
    events,
    calendar,
    districts,
    persistentFull,
  };

  // Cache in stats_cache table asynchronously
  query(
    `INSERT INTO stats_cache (key, computed_at, json)
     VALUES ($1, now(), $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET computed_at = now(), json = EXCLUDED.json`,
    [cacheKey, JSON.stringify(bundle)]
  ).catch((e) => console.warn('Cache write warning:', e.message));

  memCache.set(cacheKey, { computedAt: Date.now(), bundle });
  return { bundle };
}

// Generate seeded validation sample (seed 42) stratified into 3 groups
export function generateValidationSample(events: FusedEvent[]): {
  sample: {
    sample_id: string;
    event_id: string;
    centroid_lat: number;
    centroid_lon: number;
    start_date: string;
    start_time: number;
    platforms: number[];
    member_count: number;
    frp_total_sum: number;
  }[];
  strata_counts: Record<string, number>;
} {
  const strata: Record<string, FusedEvent[]> = {
    'Multi-sensor agreement': [],
    'Single sensor': [],
    'Suspected persistent heat': [],
  };

  for (const ev of events) {
    if (ev.label === 'Suspected persistent heat') {
      strata['Suspected persistent heat'].push(ev);
    } else if (ev.label === 'Multi-sensor agreement') {
      strata['Multi-sensor agreement'].push(ev);
    } else {
      strata['Single sensor'].push(ev);
    }
  }

  const rng = createMulberry32(42);
  const sample: any[] = [];
  const targetPerStratum = 20;

  for (const [stratumKey, list] of Object.entries(strata)) {
    // Shuffle with seeded RNG
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }

    const picked = copy.slice(0, targetPerStratum);
    for (const ev of picked) {
      // Review sample is blind: DO NOT include stratum label
      sample.push({
        sample_id: `val_${ev.id}`,
        event_id: ev.id,
        centroid_lat: ev.centroid_lat,
        centroid_lon: ev.centroid_lon,
        start_date: ev.start_date,
        start_time: ev.start_time,
        platforms: ev.platforms,
        member_count: ev.member_count,
        frp_total_sum: ev.frp_total_sum,
      });
    }
  }

  // Shuffle combined sample
  for (let i = sample.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [sample[i], sample[j]] = [sample[j], sample[i]];
  }

  return {
    sample,
    strata_counts: {
      'Multi-sensor agreement': strata['Multi-sensor agreement'].length,
      'Single sensor': strata['Single sensor'].length,
      'Suspected persistent heat': strata['Suspected persistent heat'].length,
    },
  };
}
