import React from 'react';
import { ResultsData, ProvenanceInfo } from '../types';
import { ProvenanceFooter } from '../components/ProvenanceFooter';
import { BookOpen, Printer, CheckCircle, AlertTriangle, Layers, Database } from 'lucide-react';

interface MethodologyViewProps {
  results: ResultsData | null;
  provenance: ProvenanceInfo | null;
}

export const MethodologyView: React.FC<MethodologyViewProps> = ({ results, provenance }) => {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 report-page">
      {/* Header with Print Report Button */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Harmonization Methodology & Specifications</h1>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Mathematical foundations, clustering parameters, and boundary data lineage for FireHarmony.
          </p>
        </div>

        <button
          onClick={handlePrint}
          className="no-print inline-flex items-center gap-2 px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded transition-colors shadow-sm"
        >
          <Printer className="w-4 h-4" />
          Download / Print Report
        </button>
      </div>

      {/* Print Cover Header */}
      <div className="hidden print-only mb-6 pb-4 border-b border-slate-300">
        <h1 className="text-2xl font-bold text-black">FireHarmony Technical & Validation Report</h1>
        <p className="text-sm text-slate-600 mt-1">
          NASA Space Apps 2026 • MODIS & VIIRS Telemetry Harmonization for Bangladesh
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Generated: {provenance?.generated_at ? new Date(provenance.generated_at).toLocaleString() : new Date().toLocaleString()}
        </p>
      </div>

      {/* Harmonization Parameters Table */}
      <div className="rounded-lg bg-[#141b27] border border-[#222b3d] p-5">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="w-4 h-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-slate-200">Algorithmic Parameters & Thresholds</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#101620] text-slate-400 border-b border-[#222b3d]">
              <tr>
                <th className="py-2.5 px-4 font-medium">Domain</th>
                <th className="py-2.5 px-4 font-medium">Parameter</th>
                <th className="py-2.5 px-4 font-medium">Operational Value</th>
                <th className="py-2.5 px-4 font-medium">Methodological Justification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2638] text-slate-300">
              <tr>
                <td className="py-2.5 px-4 font-semibold text-slate-200">Event Fusion</td>
                <td className="py-2.5 px-4">Spatial threshold (single-linkage)</td>
                <td className="py-2.5 px-4 font-mono text-amber-400">1.5 km</td>
                <td className="py-2.5 px-4 text-slate-400">Accommodates MODIS 1 km pixel footprint and geolocation uncertainty.</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-semibold text-slate-200">Event Fusion</td>
                <td className="py-2.5 px-4">Temporal threshold</td>
                <td className="py-2.5 px-4 font-mono text-amber-400">6 hours</td>
                <td className="py-2.5 px-4 text-slate-400">Groups consecutive overpasses belonging to the same diurnal burning event.</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-semibold text-slate-200">Event Fusion</td>
                <td className="py-2.5 px-4">Max extent & duration caps</td>
                <td className="py-2.5 px-4 font-mono text-amber-400">5.0 km / 48 hours</td>
                <td className="py-2.5 px-4 text-slate-400">Prevents chaining unrelated fires into arbitrary megaclusters.</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-semibold text-slate-200">Sensor Agreement</td>
                <td className="py-2.5 px-4">Coincident overpass distance d</td>
                <td className="py-2.5 px-4 font-mono text-amber-400">1.5 km (tests: 1.0, 1.5, 2.0)</td>
                <td className="py-2.5 px-4 text-slate-400">Radius for spatial matching between contemporaneous sensors.</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-semibold text-slate-200">Sensor Agreement</td>
                <td className="py-2.5 px-4">Coincident overpass time T</td>
                <td className="py-2.5 px-4 font-mono text-amber-400">30 min (tests: 30, 60)</td>
                <td className="py-2.5 px-4 text-slate-400">Accounts for orbital overpass offsets without assuming fixed times.</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-semibold text-slate-200">Confidence Filter</td>
                <td className="py-2.5 px-4">Minimum confidence</td>
                <td className="py-2.5 px-4 font-mono text-amber-400">MODIS ≥ 30%, VIIRS ≥ nominal</td>
                <td className="py-2.5 px-4 text-slate-400">Excludes low-confidence sunglint and sensor noise artifacts.</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-semibold text-slate-200">Persistent Heat</td>
                <td className="py-2.5 px-4">Activity frequency & duration</td>
                <td className="py-2.5 px-4 font-mono text-amber-400">≥ 25% days & ≥ 3 months</td>
                <td className="py-2.5 px-4 text-slate-400">Isolates recurring industrial/stationary sources from transient agricultural fires.</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-semibold text-slate-200">Regression & FRP</td>
                <td className="py-2.5 px-4">Deming regression (δ = 1)</td>
                <td className="py-2.5 px-4 font-mono text-amber-400">Min 30 pairs, 1000 boot resamples</td>
                <td className="py-2.5 px-4 text-slate-400">Errors-in-variables regression assuming equal variance in both sensors.</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-semibold text-slate-200">Anomaly Spikes</td>
                <td className="py-2.5 px-4">MAD spike rule</td>
                <td className="py-2.5 px-4 font-mono text-amber-400">median + 3 × (1.4826 × MAD)</td>
                <td className="py-2.5 px-4 text-slate-400">Robust non-parametric outlier threshold for daily activity series.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Definitions in Plain Language */}
      <div className="rounded-lg bg-[#141b27] border border-[#222b3d] p-5">
        <h2 className="text-sm font-semibold text-slate-200 mb-3">Definitions in Plain Language</h2>
        <div className="space-y-3 text-xs leading-relaxed text-slate-300">
          <div className="p-3 rounded bg-[#101620] border border-[#1e2638]">
            <span className="font-semibold text-slate-100">Multi-Sensor Agreement:</span> An active-fire detection observed independently by both MODIS and VIIRS within 1.5 km and within 30 minutes. Agreement between sensors is supporting evidence, not proof of a fire.
          </div>
          <div className="p-3 rounded bg-[#101620] border border-[#1e2638]">
            <span className="font-semibold text-slate-100">Suspected Persistent Heat Source:</span> A 0.01° (~1.1 km) grid cell where VIIRS detections occur repeatedly across multiple distinct calendar months and on at least 25% of all days in the observation window. Such locations typically reflect stationary industrial heat emissions rather than transient open vegetation fires.
          </div>
          <div className="p-3 rounded bg-[#101620] border border-[#1e2638]">
            <span className="font-semibold text-slate-100">Eligible Detection:</span> A detection by one sensor family on a date when an overpass of the alternative sensor family occurred anywhere over Bangladesh within 30 minutes.
          </div>
          <div className="p-3 rounded bg-[#101620] border border-[#1e2638]">
            <span className="font-semibold text-slate-100">Wilson Score Interval:</span> An asymmetric binomial confidence interval that accurately estimates agreement rates even with small sample sizes or extreme rates without exceeding [0, 1].
          </div>
        </div>
      </div>

      {/* Data Lineage & Boundary Lineage */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-lg bg-[#141b27] border border-[#222b3d] p-5 text-xs text-slate-300 space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-4 h-4 text-sky-400" />
            <h3 className="font-semibold text-slate-200">Satellite Sensor Telemetry</h3>
          </div>
          <p className="text-slate-400 leading-relaxed">
            Directly ingested from NASA FIRMS (Fire Information for Resource Management System) area API using official products:
          </p>
          <ul className="list-disc list-inside space-y-1 text-slate-300 mt-2">
            <li><span className="font-medium text-slate-200">MODIS Standard Processing (MODIS_SP):</span> Collection 6.1 (Terra & Aqua).</li>
            <li><span className="font-medium text-slate-200">VIIRS Standard Processing (VIIRS_SNPP_SP / NOAA20_SP):</span> 375m active fire data.</li>
            <li><span className="font-medium text-slate-200">Near-Real-Time (NRT):</span> Rapid forward ingestion with automatic SP upgrading.</li>
          </ul>
        </div>

        <div className="rounded-lg bg-[#141b27] border border-[#222b3d] p-5 text-xs text-slate-300 space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            <h3 className="font-semibold text-slate-200">Boundary & Cartographic Lineage</h3>
          </div>
          <p className="text-slate-400 leading-relaxed">
            Official Bangladesh administrative boundary data:
          </p>
          <ul className="list-disc list-inside space-y-1 text-slate-300 mt-2">
            <li><span className="font-medium text-slate-200">Source:</span> geoBoundaries Open Database (William & Mary GeoLab) / Survey of Bangladesh.</li>
            <li><span className="font-medium text-slate-200">ADM0 (Country):</span> Used for server-side point-in-polygon filtering.</li>
            <li><span className="font-medium text-slate-200">ADM2 (64 Districts):</span> Indexed with R-tree spatial hierarchy for district assignment and area calculation.</li>
          </ul>
        </div>
      </div>

      {/* Limitations Box */}
      <div className="rounded-lg bg-[#141b27] border border-[#222b3d] p-5 text-xs text-slate-300">
        <h3 className="font-semibold text-slate-200 mb-2">Technical Limitations</h3>
        <p className="text-slate-400 leading-relaxed">
          Cloud cover and heavy monsoon precipitation obscure optical and thermal infrared sensors. Satellite overpasses provide instantaneous snapshots (2–4 times daily per satellite) and do not monitor fires continuously. Fire Radiative Power (FRP) measurements depend on atmospheric transmittance, smoke attenuation, and sensor scan angle. Ground validation requires field inventories or high-resolution optical verification.
        </p>
      </div>

      <ProvenanceFooter provenance={provenance} />
    </div>
  );
};
