import React, { useState, useEffect } from 'react';
import { ResultsData, ProvenanceInfo } from '../types';
import { EmptyState } from '../components/EmptyState';
import { ProvenanceFooter } from '../components/ProvenanceFooter';
import { ShieldCheck, Download, AlertTriangle, Key, Send, CheckCircle2 } from 'lucide-react';

interface ValidationViewProps {
  fromDate: string;
  toDate: string;
  nrt: boolean;
  results: ResultsData | null;
  provenance: ProvenanceInfo | null;
  isLoading: boolean;
}

export const ValidationView: React.FC<ValidationViewProps> = ({
  fromDate,
  toDate,
  nrt,
  results,
  provenance,
  isLoading,
}) => {
  const [validationData, setValidationData] = useState<any | null>(null);
  const [blindSample, setBlindSample] = useState<any[]>([]);
  const [adminPin, setAdminPin] = useState('');
  const [selectedSample, setSelectedSample] = useState<any | null>(null);
  const [outcome, setOutcome] = useState('burn_scar_or_fire');
  const [imagerySource, setImagerySource] = useState('Sentinel-2 / Landsat');
  const [imageryDate, setImageryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Load validation summary
  const loadValidationSummary = () => {
    fetch('/api/validation')
      .then((res) => res.json())
      .then((data) => setValidationData(data))
      .catch((err) => console.error('Failed to load validation:', err));
  };

  // Load blind sample
  useEffect(() => {
    loadValidationSummary();
    if (!fromDate || !toDate) return;
    fetch(`/api/validation/sample?from=${fromDate}&to=${toDate}&nrt=${nrt ? 1 : 0}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.sample) {
          setBlindSample(data.sample);
          if (data.sample.length > 0) setSelectedSample(data.sample[0]);
        }
      })
      .catch((err) => console.error('Failed to load blind sample:', err));
  }, [fromDate, toDate, nrt]);

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSample || !adminPin) return;

    setSubmitting(true);
    setSubmitStatus(null);

    try {
      const res = await fetch('/api/validation/review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': adminPin,
        },
        body: JSON.stringify({
          sample_id: selectedSample.sample_id,
          outcome,
          imagery_source: imagerySource,
          imagery_date: imageryDate || undefined,
          notes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Submission failed');
      }

      setSubmitStatus('Review saved successfully.');
      loadValidationSummary();
      setNotes('');
    } catch (err: any) {
      setSubmitStatus(`Error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const downloadPersistentCsv = () => {
    window.location.href = `/api/persistent?from=${fromDate}&to=${toDate}&nrt=${nrt ? 1 : 0}&format=csv`;
  };

  if (isLoading && !results) {
    return (
      <EmptyState
        title="Loading Validation & Insights"
        message="Loading suspected persistent heat sources and validation benchmarks..."
        isLoading={true}
      />
    );
  }

  const persistentSummary = results?.persistent;
  const flaggedCells = persistentSummary?.flagged_cells_preview || [];
  const sensitivityGrid = persistentSummary?.sensitivity_grid || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-100">Validation & Persistent Heat Insights</h1>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
          Ground validation review records, stratified blind samples, and parameter sensitivity for suspected persistent heat sources.
        </p>
      </div>

      {/* Mandatory Limits Box (Exact Required Text) */}
      <div className="rounded-lg bg-[#182030] border border-[#263248] p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-1.5">
              Methodological Limits & Interpretation
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed font-medium">
              Small or short fires may leave no visible scar. Cloud blocks imagery. Persistent heat sources produce no burn scar and are not expected to. A small sample cannot establish detection rates. Confirming a site type needs ground truth or a site inventory.
            </p>
          </div>
        </div>
      </div>

      {/* Validation Reviews Summary */}
      <div className="rounded-lg bg-[#141b27] border border-[#222b3d] p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-slate-200">Validation Reviews</h2>
          </div>
          {validationData?.indicative_note && (
            <span className="text-xs px-2.5 py-0.5 rounded bg-amber-950/40 border border-amber-800 text-amber-300 font-mono">
              {validationData.indicative_note}
            </span>
          )}
        </div>

        {validationData?.status === 'no_reviews' || !validationData?.total_reviews ? (
          <div className="p-6 text-center rounded bg-[#101620] border border-[#1e2638] text-xs text-slate-400">
            No validation reviews submitted yet. Use the blind sample form below with your authorization PIN to record imagery checks.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-xs text-slate-300">
              Total reviewed events: <span className="font-bold text-slate-100">{validationData.total_reviews}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(validationData.outcome_breakdown || {}).map(([key, val]: [string, any]) => (
                <div key={key} className="p-3 rounded bg-[#101620] border border-[#1e2638] text-xs">
                  <div className="text-slate-400 capitalize">{key.replaceAll('_', ' ')}</div>
                  <div className="text-lg font-bold text-slate-200 mt-1">{val.count}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                    Wilson: [{Math.round(val.interval.lower * 100)}%, {Math.round(val.interval.upper * 100)}%]
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Blind Sample Review Form */}
      <div className="rounded-lg bg-[#141b27] border border-[#222b3d] p-5">
        <div className="flex items-center gap-2 mb-2">
          <Key className="w-4 h-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-slate-200">Blind Sample Review Submission</h2>
        </div>
        <p className="text-xs text-slate-400 mb-4 leading-relaxed">
          The reviewer is shown candidate coordinates, observation timestamps, and FRP without revealing whether the event belongs to multi-sensor agreement, single-sensor, or suspected persistent heat.
        </p>

        {blindSample.length === 0 ? (
          <div className="p-4 rounded bg-[#101620] border border-[#1e2638] text-xs text-slate-400">
            No events available for sampling in the current window.
          </div>
        ) : (
          <form onSubmit={handleSubmitReview} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Select Blind Sample</label>
                <select
                  value={selectedSample?.sample_id || ''}
                  onChange={(e) => {
                    const found = blindSample.find((s) => s.sample_id === e.target.value);
                    if (found) setSelectedSample(found);
                  }}
                  className="w-full bg-[#101620] border border-[#222b3d] rounded p-2 text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  {blindSample.map((s, idx) => (
                    <option key={s.sample_id} value={s.sample_id}>
                      Sample #{idx + 1} ({s.start_date} {String(s.start_time).padStart(4, '0')} UTC • {s.centroid_lat.toFixed(3)}°N, {s.centroid_lon.toFixed(3)}°E)
                    </option>
                  ))}
                </select>

                {selectedSample && (
                  <div className="mt-2 p-2.5 rounded bg-[#101620] border border-[#1e2638] text-[11px] text-slate-400 space-y-1">
                    <div>Coordinates: <span className="text-slate-200 font-mono">{selectedSample.centroid_lat.toFixed(4)}°N, {selectedSample.centroid_lon.toFixed(4)}°E</span></div>
                    <div>Observation Date: <span className="text-slate-200">{selectedSample.start_date}</span></div>
                    <div>Total Event FRP: <span className="text-slate-200">{selectedSample.frp_total_sum} MW</span> ({selectedSample.member_count} detections)</div>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Observed Outcome</label>
                  <select
                    value={outcome}
                    onChange={(e) => setOutcome(e.target.value)}
                    className="w-full bg-[#101620] border border-[#222b3d] rounded p-2 text-slate-200 focus:outline-none focus:border-amber-500"
                  >
                    <option value="burn_scar_or_fire">Burn scar or active flame visible</option>
                    <option value="smoke_only">Smoke plume only</option>
                    <option value="industrial_like">Industrial-like persistent thermal source</option>
                    <option value="not_determinable">Not determinable (cloud / resolution limit)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Imagery Source</label>
                    <input
                      type="text"
                      value={imagerySource}
                      onChange={(e) => setImagerySource(e.target.value)}
                      placeholder="e.g. Sentinel-2 / Planet"
                      className="w-full bg-[#101620] border border-[#222b3d] rounded p-2 text-slate-200 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Imagery Date</label>
                    <input
                      type="date"
                      value={imageryDate}
                      onChange={(e) => setImageryDate(e.target.value)}
                      className="w-full bg-[#101620] border border-[#222b3d] rounded p-2 text-slate-200 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Review Notes</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Context, cloud cover, or reference links..."
                    className="w-full bg-[#101620] border border-[#222b3d] rounded p-2 text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Authorization PIN (Required)</label>
                  <input
                    type="password"
                    value={adminPin}
                    onChange={(e) => setAdminPin(e.target.value)}
                    placeholder="Enter authorization PIN"
                    className="w-full bg-[#101620] border border-[#222b3d] rounded p-2 text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="submit"
                disabled={submitting || !adminPin}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium rounded transition-colors flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                {submitting ? 'Submitting...' : 'Submit Ground Review'}
              </button>

              {submitStatus && (
                <span
                  className={`text-xs ${
                    submitStatus.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'
                  }`}
                >
                  {submitStatus}
                </span>
              )}
            </div>
          </form>
        )}
      </div>

      {/* Suspected Persistent Heat Sources & Sensitivity */}
      <div className="rounded-lg bg-[#141b27] border border-[#222b3d] p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">
              Suspected Persistent Heat Sources (0.01° Grid)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Flagged cells active on ≥ 25% of window days and in ≥ 3 distinct calendar months.
            </p>
          </div>
          <button
            onClick={downloadPersistentCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1e2638] hover:bg-[#253046] text-slate-200 text-xs font-medium rounded border border-[#2a364d] transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Download Flagged Cells CSV
          </button>
        </div>

        {/* Sensitivity Grid Table */}
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-slate-300 mb-2">Sensitivity Grid (Threshold Variations)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#101620] text-slate-400 border-b border-[#222b3d]">
                <tr>
                  <th className="py-2 px-3 font-medium">Fraction of Window Days</th>
                  <th className="py-2 px-3 font-medium">Threshold Days</th>
                  <th className="py-2 px-3 font-medium">Minimum Distinct Months</th>
                  <th className="py-2 px-3 font-medium">Flagged Persistent Cells</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2638]">
                {sensitivityGrid.map((row, idx) => (
                  <tr
                    key={idx}
                    className={row.fraction === 0.25 && row.min_months === 3 ? 'bg-amber-950/20 font-medium' : ''}
                  >
                    <td className="py-2 px-3 text-slate-200">
                      {Math.round(row.fraction * 100)}% {row.fraction === 0.25 && row.min_months === 3 ? '(Default)' : ''}
                    </td>
                    <td className="py-2 px-3 text-slate-300">≥ {row.threshold_days} days</td>
                    <td className="py-2 px-3 text-slate-300">≥ {row.min_months} months</td>
                    <td className="py-2 px-3 font-bold text-amber-400">{row.cells_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Flagged Cells Preview Table */}
        <h3 className="text-xs font-semibold text-slate-300 mb-2">Flagged Cells Preview</h3>
        {flaggedCells.length === 0 ? (
          <div className="p-4 rounded bg-[#101620] border border-[#1e2638] text-xs text-slate-400">
            No 0.01° cells met the persistent heat thresholds in this window.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#101620] text-slate-400 border-b border-[#222b3d]">
                <tr>
                  <th className="py-2 px-3 font-medium">Cell Location</th>
                  <th className="py-2 px-3 font-medium">Active Days</th>
                  <th className="py-2 px-3 font-medium">Distinct Months</th>
                  <th className="py-2 px-3 font-medium">VIIRS Hotspots</th>
                  <th className="py-2 px-3 font-medium">Associated MODIS</th>
                  <th className="py-2 px-3 font-medium">Night Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2638]">
                {flaggedCells.map((c: any) => (
                  <tr key={c.cell_key}>
                    <td className="py-2 px-3 font-mono text-slate-200">
                      {c.center_lat.toFixed(3)}°N, {c.center_lon.toFixed(3)}°E
                    </td>
                    <td className="py-2 px-3 text-amber-400 font-semibold">{c.active_days} days</td>
                    <td className="py-2 px-3 text-slate-300">{c.distinct_months} months</td>
                    <td className="py-2 px-3 text-slate-200">{c.viirs_detections}</td>
                    <td className="py-2 px-3 text-slate-400">{c.associated_modis}</td>
                    <td className="py-2 px-3 text-slate-300">{Math.round(c.night_share * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ProvenanceFooter provenance={provenance} />
    </div>
  );
};
