export interface HealthResponse {
  db_ok: boolean;
  schema_ok: boolean;
  boundaries_loaded: boolean;
  districts_count: number;
  db_size_bytes: number;
  db_limit_bytes: number;
  detections_count: number;
  last_tick: {
    started_at: string;
    finished_at: string | null;
    status: string;
    requests: number;
    rows_upserted: number;
    error: string | null;
  } | null;
  products: {
    product: string;
    first_day: string | null;
    last_day: string | null;
    coverage_days: number;
    missing_days_since_start: number;
    sp_days: number;
    nrt_days: number;
    backfill: {
      cursor_date: string;
      start_date: string;
      start_is_assumed: boolean;
      done: boolean;
    } | null;
  }[];
  key_present: boolean;
  notes: string[];
}

export interface DrySeasonPreset {
  id: string;
  label: string;
  from: string;
  to: string;
  status: 'complete' | 'partial';
  missing_days: string[];
}

export interface MetaResponse {
  min_day: string | null;
  max_day: string | null;
  products: string[];
  dry_seasons: DrySeasonPreset[];
  default_window: {
    from: string;
    to: string;
    label: string;
    status: 'complete' | 'partial';
  } | null;
}

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

export interface Interval95 {
  centre: number;
  lower: number;
  upper: number;
  half_width: number;
}

export interface FamilyAgreementResult {
  family: 'MODIS' | 'VIIRS';
  total: number;
  eligible: number;
  matched: number;
  rate: number;
  interval: Interval95;
}

export interface ResultsData {
  empty?: boolean;
  message?: string;
  provenance: ProvenanceInfo;
  cleaning: {
    total_in_window: number;
    removed_by_confidence: number;
    kept_after_confidence: number;
    by_family: {
      modis: { raw: number; removed: number; kept: number };
      viirs: { raw: number; removed: number; kept: number };
    };
  };
  stages: {
    stage_1_raw_rows: number;
    stage_2_confidence_filtered: number;
    stage_3_events_total: number;
    stage_4_events_without_persistent: number;
    raw_count_ratio: {
      label: string;
      viirs_to_modis_raw: number;
      viirs_to_modis_without_persistent: number;
    };
  };
  agreement: {
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
  };
  frp: {
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
  };
  persistent: {
    total_flagged_cells: number;
    total_viirs_in_flagged: number;
    sensitivity_grid: {
      fraction: number;
      min_months: number;
      threshold_days: number;
      cells_count: number;
    }[];
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

export interface FusedEventItem {
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
  members: {
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
  }[];
}

export interface DistrictSummary {
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
