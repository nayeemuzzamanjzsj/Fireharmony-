import React, { useState, useEffect } from 'react';
import { ResultsData, ProvenanceInfo } from '../types';
import { EmptyState } from '../components/EmptyState';
import { ProvenanceFooter } from '../components/ProvenanceFooter';
import { Calendar as CalendarIcon, Flame, AlertCircle, TrendingUp } from 'lucide-react';

interface CalendarViewProps {
  fromDate: string;
  toDate: string;
  nrt: boolean;
  provenance: ProvenanceInfo | null;
  isLoading: boolean;
}

interface CalendarData {
  daily: {
    date: string;
    events_count: number;
    modis_detections: number;
    viirs_detections: number;
    total_detections: number;
    overpasses_count: number;
    is_modis_spike: boolean;
    is_viirs_spike: boolean;
    is_any_spike: boolean;
  }[];
  monthly: {
    month: string;
    events_count: number;
    total_detections: number;
    modis: number;
    viirs: number;
  }[];
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
  provenance?: ProvenanceInfo;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  fromDate,
  toDate,
  nrt,
  provenance,
  isLoading: globalLoading,
}) => {
  const [calData, setCalData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'daily' | 'monthly'>('daily');

  useEffect(() => {
    if (!fromDate || !toDate) return;
    setLoading(true);
    fetch(`/api/calendar?from=${fromDate}&to=${toDate}&nrt=${nrt ? 1 : 0}`)
      .then((res) => res.json())
      .then((data) => {
        setCalData(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch calendar:', err);
        setLoading(false);
      });
  }, [fromDate, toDate, nrt]);

  if ((loading || globalLoading) && !calData) {
    return (
      <EmptyState
        title="Loading Activity Calendar"
        message="Aggregating daily sensor overpasses and detecting statistical spikes..."
        isLoading={true}
      />
    );
  }

  if (!calData || !calData.daily || calData.daily.length === 0) {
    return (
      <EmptyState
        title="No Calendar Data"
        message="No detection records found for the selected time window."
      />
    );
  }

  const { daily, monthly, spikes, quantiles } = calData;
  const modisSpikes = spikes?.modis?.days || [];
  const viirsSpikes = spikes?.viirs?.days || [];
  const allSpikeDays = Array.from(new Set([...modisSpikes, ...viirsSpikes])).sort();

  // Cell color helper based on real quantiles
  const getCellBg = (count: number) => {
    if (count === 0) return 'bg-[#141b27] text-slate-400';
    if (count <= quantiles.p25) return 'bg-amber-950/40 text-amber-300 border border-amber-900/50';
    if (count <= quantiles.p50) return 'bg-amber-900/50 text-amber-200 border border-amber-700/60';
    if (count <= quantiles.p75) return 'bg-amber-700/60 text-white border border-amber-600';
    return 'bg-orange-600 text-white font-bold border border-orange-500';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Activity Calendar & Anomaly Spikes</h1>
          <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
            Daily timeline of active-fire observations with unusually high detection days flagged by MAD anomaly detection.
          </p>
        </div>

        <div className="inline-flex rounded bg-[#101620] border border-[#222b3d] p-0.5">
          <button
            onClick={() => setActiveTab('daily')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              activeTab === 'daily' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Daily Heatmap
          </button>
          <button
            onClick={() => setActiveTab('monthly')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              activeTab === 'monthly' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Monthly Series
          </button>
        </div>
      </div>

      {/* Unusually High Detection Days (Spikes Box) */}
      <div className="rounded-lg bg-[#141b27] border border-[#222b3d] p-5">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-4 h-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-slate-200">Unusually High Detection Days</h2>
        </div>
        <p className="text-xs text-slate-400 mb-4 leading-relaxed">
          Days where daily detection count exceeded the robust baseline: median + 3 × (1.4826 × MAD), requiring at least 30 active days.
        </p>

        {allSpikeDays.length === 0 ? (
          <div className="p-4 rounded bg-[#101620] border border-[#1e2638] text-xs text-slate-400">
            No unusually high detection days detected in this window (counts remained within normal statistical limits).
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {allSpikeDays.map((d) => {
              const item = daily.find((x) => x.date === d);
              const isModis = modisSpikes.includes(d);
              const isViirs = viirsSpikes.includes(d);
              return (
                <div
                  key={d}
                  className="px-3 py-2 rounded bg-amber-950/30 border border-amber-800/60 text-xs flex items-center gap-2"
                >
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  <span className="font-mono text-slate-200">{d}</span>
                  <span className="text-[11px] text-amber-300">
                    ({item?.total_detections.toLocaleString()} detections
                    {isModis && isViirs ? ' • both families' : isModis ? ' • MODIS spike' : ' • VIIRS spike'})
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tab: Daily Grid */}
      {activeTab === 'daily' && (
        <div className="rounded-lg bg-[#141b27] border border-[#222b3d] p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-200">Daily Observations Grid</h2>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span>0</span>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#141b27] border border-[#222b3d]" />
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-950/40 border border-amber-900/50" />
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-900/50 border border-amber-700/60" />
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-700/60 border border-amber-600" />
                <span className="w-2.5 h-2.5 rounded-sm bg-orange-600 border border-orange-500" />
              </div>
              <span>Max</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
            {daily.map((d) => (
              <div
                key={d.date}
                className={`p-2.5 rounded text-xs transition-all flex flex-col justify-between min-h-[72px] ${getCellBg(
                  d.total_detections
                )}`}
              >
                <div className="flex justify-between items-start font-mono text-[10px] text-slate-400">
                  <span>{d.date.slice(5)}</span>
                  {d.is_any_spike && <Flame className="w-3 h-3 text-amber-300" />}
                </div>
                <div className="mt-1">
                  <div className="text-sm font-semibold">{d.total_detections}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {d.events_count} events • {d.overpasses_count} passes
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Monthly Aggregation */}
      {activeTab === 'monthly' && (
        <div className="rounded-lg bg-[#141b27] border border-[#222b3d] p-5">
          <h2 className="text-sm font-semibold text-slate-200 mb-4">Monthly Aggregation Series</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#101620] text-slate-400 border-b border-[#222b3d]">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Month</th>
                  <th className="py-2.5 px-4 font-medium">Total Detections</th>
                  <th className="py-2.5 px-4 font-medium">MODIS Telemetry</th>
                  <th className="py-2.5 px-4 font-medium">VIIRS Telemetry</th>
                  <th className="py-2.5 px-4 font-medium">Fused Fire Events</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2638]">
                {monthly.map((m) => (
                  <tr key={m.month}>
                    <td className="py-3 px-4 font-semibold text-slate-200 font-mono">{m.month}</td>
                    <td className="py-3 px-4 font-bold text-amber-400">{m.total_detections.toLocaleString()}</td>
                    <td className="py-3 px-4 text-slate-300">{m.modis.toLocaleString()}</td>
                    <td className="py-3 px-4 text-slate-300">{m.viirs.toLocaleString()}</td>
                    <td className="py-3 px-4 text-slate-200 font-medium">{m.events_count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ProvenanceFooter provenance={provenance} totalRows={daily.reduce((a, b) => a + b.total_detections, 0)} />
    </div>
  );
};
