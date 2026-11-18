import React, { useState } from 'react';
import { ResultsData } from '../types';
import { EmptyState } from '../components/EmptyState';
import { ProvenanceFooter } from '../components/ProvenanceFooter';
import { Scale, Table, Sliders, Info, LineChart } from 'lucide-react';

interface ComparisonViewProps {
  results: ResultsData | null;
  isLoading: boolean;
}

export const ComparisonView: React.FC<ComparisonViewProps> = ({ results, isLoading }) => {
  const [useLogScale, setUseLogScale] = useState(false);

  if (isLoading && !results) {
    return (
      <EmptyState
        title="Loading Sensor Comparison"
        message="Computing multi-sensor agreement rates and FRP relationships..."
        isLoading={true}
      />
    );
  }

  if (!results || results.empty) {
    return (
      <EmptyState
        title="No Comparison Data"
        message="No detection records found for the selected time window."
      />
    );
  }

  const { agreement, frp, stages, cleaning, provenance } = results;

  // Scatter plot SVG rendering for FRP matched pairs
  const pairs = frp.pairs || [];
  const svgWidth = 520;
  const svgHeight = 320;
  const padding = 50;

  const maxVal = Math.max(
    10,
    ...pairs.map((p) => Math.max(p.modis_frp, p.viirs_frp))
  );

  const scaleX = (val: number) => {
    if (useLogScale) {
      const minLog = Math.log10(1);
      const maxLog = Math.log10(Math.max(10, maxVal));
      const curLog = Math.log10(Math.max(1, val));
      return padding + ((curLog - minLog) / (maxLog - minLog)) * (svgWidth - 2 * padding);
    }
    return padding + (val / maxVal) * (svgWidth - 2 * padding);
  };

  const scaleY = (val: number) => {
    if (useLogScale) {
      const minLog = Math.log10(1);
      const maxLog = Math.log10(Math.max(10, maxVal));
      const curLog = Math.log10(Math.max(1, val));
      return svgHeight - padding - ((curLog - minLog) / (maxLog - minLog)) * (svgHeight - 2 * padding);
    }
    return svgHeight - padding - (val / maxVal) * (svgHeight - 2 * padding);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-100">Sensor Agreement & FRP Comparison</h1>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
          Comparing MODIS and VIIRS active-fire detections with Wilson 95% confidence intervals, spatial grid overlap, and Deming regression.
        </p>
      </div>

      {/* Sensor Agreement Rates Table */}
      <div className="rounded-lg bg-[#141b27] border border-[#222b3d] p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-slate-200">Sensor Agreement Rates (d = 1.5 km, T = 30 min)</h2>
          </div>
          <span className="text-xs text-slate-400">Wilson 95% intervals</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#101620] text-slate-400 border-b border-[#222b3d]">
              <tr>
                <th className="py-2.5 px-4 font-medium">Sensor Family</th>
                <th className="py-2.5 px-4 font-medium">Total Detections</th>
                <th className="py-2.5 px-4 font-medium">Eligible Observations (±30m pass)</th>
                <th className="py-2.5 px-4 font-medium">Matched (within 1.5km)</th>
                <th className="py-2.5 px-4 font-medium">Agreement Rate</th>
                <th className="py-2.5 px-4 font-medium">Wilson 95% Confidence Interval</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2638]">
              <tr>
                <td className="py-3 px-4 font-semibold text-slate-200">MODIS (Terra/Aqua)</td>
                <td className="py-3 px-4 text-slate-300">{agreement.modis.total.toLocaleString()}</td>
                <td className="py-3 px-4 text-slate-300">{agreement.modis.eligible.toLocaleString()}</td>
                <td className="py-3 px-4 text-slate-300">{agreement.modis.matched.toLocaleString()}</td>
                <td className="py-3 px-4 font-bold text-emerald-400">
                  {Math.round(agreement.modis.rate * 1000) / 10}%
                </td>
                <td className="py-3 px-4 font-mono text-slate-400">
                  [{Math.round(agreement.modis.interval.lower * 1000) / 10}%, {Math.round(agreement.modis.interval.upper * 1000) / 10}%]
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold text-slate-200">VIIRS (SNPP/NOAA-20/21)</td>
                <td className="py-3 px-4 text-slate-300">{agreement.viirs.total.toLocaleString()}</td>
                <td className="py-3 px-4 text-slate-300">{agreement.viirs.eligible.toLocaleString()}</td>
                <td className="py-3 px-4 text-slate-300">{agreement.viirs.matched.toLocaleString()}</td>
                <td className="py-3 px-4 font-bold text-emerald-400">
                  {Math.round(agreement.viirs.rate * 1000) / 10}%
                </td>
                <td className="py-3 px-4 font-mono text-slate-400">
                  [{Math.round(agreement.viirs.interval.lower * 1000) / 10}%, {Math.round(agreement.viirs.interval.upper * 1000) / 10}%]
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Without Suspected Persistent Heat Note */}
        <div className="mt-4 p-3 rounded bg-[#101620] border border-[#1e2638] flex items-start gap-2 text-xs text-slate-400">
          <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-medium text-slate-300">Excluding Suspected Persistent Heat Cells:</span>{' '}
            MODIS agreement rate is{' '}
            <span className="text-slate-200 font-semibold">
              {Math.round(agreement.breakdowns.without_persistent.modis.rate * 1000) / 10}%
            </span>{' '}
            (eligible n = {agreement.breakdowns.without_persistent.modis.eligible}); VIIRS agreement rate is{' '}
            <span className="text-slate-200 font-semibold">
              {Math.round(agreement.breakdowns.without_persistent.viirs.rate * 1000) / 10}%
            </span>{' '}
            (eligible n = {agreement.breakdowns.without_persistent.viirs.eligible}).
          </div>
        </div>
      </div>

      {/* Grid Cell Level Presence & Raw Count Ratio */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Cell Level Overlap (0.01 deg) */}
        <div className="rounded-lg bg-[#141b27] border border-[#222b3d] p-5">
          <div className="flex items-center gap-2 mb-3">
            <Table className="w-4 h-4 text-sky-400" />
            <h2 className="text-sm font-semibold text-slate-200">0.01° Grid Cell Overlap</h2>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Spatial agreement on a ~1.1 km regular grid cell across Bangladesh.
          </p>

          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between p-2.5 rounded bg-[#101620] border border-[#1e2638]">
              <span className="text-slate-300">Cells seen by both sensors</span>
              <span className="font-semibold text-emerald-400">{agreement.cells.both.toLocaleString()}</span>
            </div>
            <div className="flex justify-between p-2.5 rounded bg-[#101620] border border-[#1e2638]">
              <span className="text-slate-300">Cells with MODIS only</span>
              <span className="font-semibold text-slate-300">{agreement.cells.modis_only.toLocaleString()}</span>
            </div>
            <div className="flex justify-between p-2.5 rounded bg-[#101620] border border-[#1e2638]">
              <span className="text-slate-300">Cells with VIIRS only</span>
              <span className="font-semibold text-slate-300">{agreement.cells.viirs_only.toLocaleString()}</span>
            </div>
            <div className="flex justify-between p-2.5 rounded bg-[#101620] border border-[#1e2638]">
              <span className="text-slate-300 font-medium">Jaccard Similarity Index</span>
              <span className="font-bold text-sky-400">{agreement.cells.jaccard.toFixed(3)}</span>
            </div>
          </div>
        </div>

        {/* Raw Count Ratio (Context Only) */}
        <div className="rounded-lg bg-[#141b27] border border-[#222b3d] p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sliders className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-slate-200">Raw Detection Counts</h2>
          </div>
          <div className="inline-block px-2 py-0.5 rounded bg-amber-950/40 border border-amber-800/60 text-amber-400 text-[11px] font-medium mb-3">
            {stages.raw_count_ratio.label}
          </div>

          <p className="text-xs text-slate-400 mb-4 leading-relaxed">
            Raw counts reflect differences in sensor pixel footprint (375m VIIRS vs 1km MODIS) and overpass frequency. Not a measure of fire occurrence.
          </p>

          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between p-2.5 rounded bg-[#101620] border border-[#1e2638]">
              <span className="text-slate-300">Kept MODIS detections</span>
              <span className="font-semibold text-slate-200">{cleaning.by_family.modis.kept.toLocaleString()}</span>
            </div>
            <div className="flex justify-between p-2.5 rounded bg-[#101620] border border-[#1e2638]">
              <span className="text-slate-300">Kept VIIRS detections</span>
              <span className="font-semibold text-slate-200">{cleaning.by_family.viirs.kept.toLocaleString()}</span>
            </div>
            <div className="flex justify-between p-2.5 rounded bg-[#101620] border border-[#1e2638]">
              <span className="text-slate-300">Raw VIIRS / MODIS count ratio</span>
              <span className="font-bold text-amber-400">{stages.raw_count_ratio.viirs_to_modis_raw.toFixed(2)}x</span>
            </div>
            <div className="flex justify-between p-2.5 rounded bg-[#101620] border border-[#1e2638]">
              <span className="text-slate-300">Ratio after removing persistent heat</span>
              <span className="font-bold text-amber-400">
                {stages.raw_count_ratio.viirs_to_modis_without_persistent.toFixed(2)}x
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* FRP Regression & Scatter Plot */}
      <div className="rounded-lg bg-[#141b27] border border-[#222b3d] p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <LineChart className="w-4 h-4 text-amber-500" />
            <div>
              <h2 className="text-sm font-semibold text-slate-200">
                Fire Radiative Power (FRP) Relationship (MW)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Matched pairs from multi-sensor events within 30 minutes. Deming regression (δ = 1).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setUseLogScale(!useLogScale)}
              className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                useLogScale
                  ? 'bg-amber-500/20 text-amber-300 border-amber-600'
                  : 'bg-[#1a2232] text-slate-300 border-[#2a364d] hover:bg-[#202b3f]'
              }`}
            >
              {useLogScale ? 'Log Scale: ON' : 'Linear Scale'}
            </button>
          </div>
        </div>

        {frp.status === 'insufficient_pairs' || frp.n < 30 ? (
          <div className="p-8 text-center rounded bg-[#101620] border border-[#1e2638]">
            <div className="text-sm font-semibold text-slate-300">insufficient matched pairs</div>
            <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 leading-relaxed">
              Found {frp.n} matched event pairs within the window. A minimum of 30 coincident event pairs is required to reliably fit Deming regression and bootstrap confidence intervals.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
            {/* SVG Scatter */}
            <div className="lg:col-span-2 overflow-x-auto flex justify-center bg-[#0d121a] p-3 rounded border border-[#1e2638]">
              <svg width={svgWidth} height={svgHeight} className="overflow-visible">
                {/* Axes */}
                <line
                  x1={padding}
                  y1={svgHeight - padding}
                  x2={svgWidth - padding}
                  y2={svgHeight - padding}
                  stroke="#334155"
                  strokeWidth="1"
                />
                <line
                  x1={padding}
                  y1={padding}
                  x2={padding}
                  y2={svgHeight - padding}
                  stroke="#334155"
                  strokeWidth="1"
                />

                {/* 1:1 Identity reference line */}
                <line
                  x1={scaleX(0)}
                  y1={scaleY(0)}
                  x2={scaleX(maxVal)}
                  y2={scaleY(maxVal)}
                  stroke="#475569"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />

                {/* Deming Fit line */}
                {frp.deming && (
                  <line
                    x1={scaleX(0)}
                    y1={scaleY(frp.deming.intercept)}
                    x2={scaleX(maxVal)}
                    y2={scaleY(frp.deming.intercept + frp.deming.slope * maxVal)}
                    stroke="#f59e0b"
                    strokeWidth="2"
                  />
                )}

                {/* Data Points */}
                {pairs.map((p, idx) => (
                  <circle
                    key={idx}
                    cx={scaleX(p.modis_frp)}
                    cy={scaleY(p.viirs_frp)}
                    r="4"
                    fill="#38bdf8"
                    fillOpacity="0.75"
                    stroke="#0284c7"
                    strokeWidth="1"
                  />
                ))}

                {/* Axis Titles with units */}
                <text
                  x={svgWidth / 2}
                  y={svgHeight - 12}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="11"
                  fontWeight="500"
                >
                  MODIS FRP (MW)
                </text>
                <text
                  x={-svgHeight / 2}
                  y={16}
                  transform="rotate(-90)"
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="11"
                  fontWeight="500"
                >
                  VIIRS FRP (MW)
                </text>
              </svg>
            </div>

            {/* Regression Metrics Panel */}
            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded bg-[#101620] border border-[#1e2638]">
                <div className="text-slate-400 font-medium">Deming Regression Slope</div>
                <div className="text-xl font-bold text-amber-400 mt-1">
                  {frp.deming?.slope?.toFixed(3)}
                </div>
                {frp.deming?.bootstrap_95 && (
                  <div className="text-[11px] text-slate-400 mt-1 font-mono">
                    95% Boot CI: [{frp.deming.bootstrap_95.lower.toFixed(3)}, {frp.deming.bootstrap_95.upper.toFixed(3)}]
                  </div>
                )}
              </div>

              <div className="p-3.5 rounded bg-[#101620] border border-[#1e2638]">
                <div className="text-slate-400 font-medium">Deming Intercept</div>
                <div className="text-base font-semibold text-slate-200 mt-1">
                  {frp.deming?.intercept?.toFixed(2)} MW
                </div>
              </div>

              <div className="p-3.5 rounded bg-[#101620] border border-[#1e2638]">
                <div className="text-slate-400 font-medium">Correlation & OLS R²</div>
                <div className="text-slate-200 mt-1 font-semibold">
                  R² = {frp.ols?.r2?.toFixed(3)} • Spearman ρ = {frp.spearman?.toFixed(3)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Matched pairs n = {frp.n}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sensitivity Table over d and T */}
      <div className="rounded-lg bg-[#141b27] border border-[#222b3d] p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sliders className="w-4 h-4 text-purple-400" />
          <h2 className="text-sm font-semibold text-slate-200">
            Agreement Sensitivity Analysis (Distance d & Time T)
          </h2>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Variation of agreement rates across threshold distances (1.0 to 2.0 km) and temporal coincidence windows (30 and 60 minutes).
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#101620] text-slate-400 border-b border-[#222b3d]">
              <tr>
                <th className="py-2.5 px-4 font-medium">Distance d (km)</th>
                <th className="py-2.5 px-4 font-medium">Time Window T (min)</th>
                <th className="py-2.5 px-4 font-medium">MODIS Eligible (n)</th>
                <th className="py-2.5 px-4 font-medium">MODIS Agreement Rate</th>
                <th className="py-2.5 px-4 font-medium">VIIRS Eligible (n)</th>
                <th className="py-2.5 px-4 font-medium">VIIRS Agreement Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2638]">
              {agreement.sensitivity.map((row, idx) => (
                <tr
                  key={idx}
                  className={row.d_km === 1.5 && row.t_min === 30 ? 'bg-amber-950/20 font-medium' : ''}
                >
                  <td className="py-2.5 px-4 text-slate-200">
                    {row.d_km.toFixed(1)} km {row.d_km === 1.5 && row.t_min === 30 ? '(Baseline)' : ''}
                  </td>
                  <td className="py-2.5 px-4 text-slate-300">{row.t_min} min</td>
                  <td className="py-2.5 px-4 text-slate-400">{row.modis_n.toLocaleString()}</td>
                  <td className="py-2.5 px-4 font-semibold text-emerald-400">
                    {Math.round(row.modis_rate * 1000) / 10}%
                  </td>
                  <td className="py-2.5 px-4 text-slate-400">{row.viirs_n.toLocaleString()}</td>
                  <td className="py-2.5 px-4 font-semibold text-emerald-400">
                    {Math.round(row.viirs_rate * 1000) / 10}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ProvenanceFooter provenance={provenance} totalRows={stages.stage_1_raw_rows} />
    </div>
  );
};
