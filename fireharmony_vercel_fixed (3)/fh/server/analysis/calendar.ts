import { computeSpikesMAD } from './math.js';
import { RawDetectionItem, isModisPlatform, isViirsPlatform, FusedEvent } from './fusion.js';

export interface DailySummary {
  date: string;
  events_count: number;
  modis_detections: number;
  viirs_detections: number;
  total_detections: number;
  overpasses_count: number;
  is_modis_spike: boolean;
  is_viirs_spike: boolean;
  is_any_spike: boolean;
}

export interface CalendarResult {
  daily: DailySummary[];
  weekly: { week: string; events_count: number; total_detections: number }[];
  monthly: { month: string; events_count: number; total_detections: number; modis: number; viirs: number }[];
  spikes: {
    modis: { days: string[]; threshold: number; median: number; mad: number };
    viirs: { days: string[]; threshold: number; median: number; mad: number };
  };
  quantiles: {
    p25: number;
    p50: number;
    p75: number;
    p90: number;
  };
}

export function computeCalendarAnalysis(
  detections: RawDetectionItem[],
  events: FusedEvent[],
  fromDate: string,
  toDate: string
): CalendarResult {
  // Build map of all dates from fromDate to toDate
  const dailyMap = new Map<
    string,
    {
      modis: number;
      viirs: number;
      overpassSet: Set<string>;
      eventsCount: number;
    }
  >();

  const cur = new Date(fromDate + 'T00:00:00Z');
  const end = new Date(toDate + 'T00:00:00Z');
  while (cur <= end) {
    const dStr = cur.toISOString().slice(0, 10);
    dailyMap.set(dStr, {
      modis: 0,
      viirs: 0,
      overpassSet: new Set(),
      eventsCount: 0,
    });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  for (const d of detections) {
    const entry = dailyMap.get(d.acq_date);
    if (entry) {
      if (isModisPlatform(d.platform)) entry.modis++;
      else if (isViirsPlatform(d.platform)) entry.viirs++;
      entry.overpassSet.add(`${d.platform}_${d.acq_date}_${d.acq_time}`);
    }
  }

  for (const ev of events) {
    const entry = dailyMap.get(ev.start_date);
    if (entry) {
      entry.eventsCount++;
    }
  }

  const modisSeries: { date: string; count: number }[] = [];
  const viirsSeries: { date: string; count: number }[] = [];

  for (const [date, val] of dailyMap.entries()) {
    modisSeries.push({ date, count: val.modis });
    viirsSeries.push({ date, count: val.viirs });
  }

  const modisSpikes = computeSpikesMAD(modisSeries);
  const viirsSpikes = computeSpikesMAD(viirsSeries);
  const modisSpikeSet = new Set(modisSpikes.spikeDays);
  const viirsSpikeSet = new Set(viirsSpikes.spikeDays);

  const daily: DailySummary[] = [];
  const allCounts: number[] = [];

  for (const [date, val] of dailyMap.entries()) {
    const isMSpike = modisSpikeSet.has(date);
    const isVSpike = viirsSpikeSet.has(date);
    const tot = val.modis + val.viirs;
    allCounts.push(tot);

    daily.push({
      date,
      events_count: val.eventsCount,
      modis_detections: val.modis,
      viirs_detections: val.viirs,
      total_detections: tot,
      overpasses_count: val.overpassSet.size,
      is_modis_spike: isMSpike,
      is_viirs_spike: isVSpike,
      is_any_spike: isMSpike || isVSpike,
    });
  }

  // Monthly aggregation
  const monthMap = new Map<string, { events: number; total: number; modis: number; viirs: number }>();
  for (const d of daily) {
    const m = d.date.slice(0, 7);
    let st = monthMap.get(m);
    if (!st) {
      st = { events: 0, total: 0, modis: 0, viirs: 0 };
      monthMap.set(m, st);
    }
    st.events += d.events_count;
    st.total += d.total_detections;
    st.modis += d.modis_detections;
    st.viirs += d.viirs_detections;
  }

  const monthly = Array.from(monthMap.entries()).map(([month, st]) => ({
    month,
    events_count: st.events,
    total_detections: st.total,
    modis: st.modis,
    viirs: st.viirs,
  }));

  // Weekly aggregation
  const weekMap = new Map<string, { events: number; total: number }>();
  for (const d of daily) {
    const dt = new Date(d.date + 'T00:00:00Z');
    const dayOfWeek = dt.getUTCDay();
    const weekStart = new Date(dt);
    weekStart.setUTCDate(dt.getUTCDate() - dayOfWeek);
    const wKey = weekStart.toISOString().slice(0, 10);
    let st = weekMap.get(wKey);
    if (!st) {
      st = { events: 0, total: 0 };
      weekMap.set(wKey, st);
    }
    st.events += d.events_count;
    st.total += d.total_detections;
  }

  const weekly = Array.from(weekMap.entries()).map(([week, st]) => ({
    week,
    events_count: st.events,
    total_detections: st.total,
  }));

  // Quantiles from real non-zero data
  const nonZeros = allCounts.filter((c) => c > 0).sort((a, b) => a - b);
  const getQ = (q: number) => {
    if (nonZeros.length === 0) return 0;
    const idx = Math.min(nonZeros.length - 1, Math.floor(q * nonZeros.length));
    return nonZeros[idx];
  };

  return {
    daily,
    weekly,
    monthly,
    spikes: {
      modis: {
        days: modisSpikes.spikeDays,
        threshold: modisSpikes.threshold,
        median: modisSpikes.median,
        mad: modisSpikes.mad,
      },
      viirs: {
        days: viirsSpikes.spikeDays,
        threshold: viirsSpikes.threshold,
        median: viirsSpikes.median,
        mad: viirsSpikes.mad,
      },
    },
    quantiles: {
      p25: getQ(0.25),
      p50: getQ(0.5),
      p75: getQ(0.75),
      p90: getQ(0.9),
    },
  };
}
