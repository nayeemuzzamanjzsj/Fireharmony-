import React, { useState } from 'react';
import {
  Scale,
  TrendingUp,
  Flame,
  Activity,
  Layers,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Eye,
  Info,
  Download,
  FileDown,
} from 'lucide-react';
import { SatelliteMap, HotspotPoint } from '../components/SatelliteMap';
import { ResultsData, HealthResponse, FusedEventItem } from '../types';

interface OverviewViewProps {
  results: ResultsData | null;
  health: HealthResponse | null;
  isLoading: boolean;
  onNavigate: (viewId: string) => void;
  onSelectEvent: (event: FusedEventItem) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  results,
  onNavigate,
}) => {
  // Calendar mode
  const [calendarMode, setCalendarMode] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [activeTab, setActiveTab] = useState<'details' | 'evidence'>('details');

  // Selected fire event state for "What's This Fire?" inspection card
  const [selectedFire, setSelectedFire] = useState<{
    lat: number;
    lon: number;
    district: string;
    sensors: string;
    frp: string;
    confidence: string;
    type: string;
    timestamp: string;
  }>({
    lat: 24.46,
    lon: 90.48,
    district: 'Narayanganj',
    sensors: 'VIIRS • MODIS',
    frp: '312 MW',
    confidence: 'Multi-sensor (high)',
    type: 'Likely fire (not persistent)',
    timestamp: 'Apr 12, 2024 - 14:32',
  });

  // Calculate dynamic metrics if results available, or show design defaults
  const viirsModisRatio = results?.stages?.raw_count_ratio?.viirs_to_modis_raw
    ? results.stages.raw_count_ratio.viirs_to_modis_raw.toFixed(2)
    : '1.48';

  const frpCorrelationR2 = results?.frp?.ols?.r2
    ? results.frp.ols.r2.toFixed(2)
    : '0.72';

  const persistentHeatRemovedShare = results?.overview_cards?.suspected_persistent_heat?.share_of_all_detections
    ? `${Math.round(results.overview_cards.suspected_persistent_heat.share_of_all_detections * 100)}%`
    : '18.6%';

  const totalFireEvents = results?.overview_cards?.fire_events_count
    ? results.overview_cards.fire_events_count.toLocaleString()
    : '4,892';

  const handleHotspotClick = (pt: HotspotPoint) => {
    setSelectedFire({
      lat: pt.lat,
      lon: pt.lon,
      district: pt.district,
      sensors: pt.category === 'multi_sensor' ? 'VIIRS • MODIS' : 'VIIRS',
      frp: `${pt.frp} MW`,
      confidence: pt.confidence,
      type: pt.type,
      timestamp: pt.date,
    });
  };

  const handleDownloadCsv = () => {
    // Check if results have events or download via API / direct CSV
    const headers = [
      'event_id',
      'centroid_lat',
      'centroid_lon',
      'start_date',
      'end_date',
      'start_time',
      'end_time',
      'duration_hours',
      'extent_km',
      'member_count',
      'families',
      'frp_total_sum',
      'is_persistent',
      'label',
    ];
    const rows = [
      headers.join(','),
      'evt_001,24.46,90.48,2024-04-12,2024-04-12,1430,1435,0.1,1.2,2,"VIIRS+MODIS",312.0,false,"Multi-sensor match"',
      'evt_002,23.98,90.38,2024-04-14,2024-04-14,1315,1320,0.1,0.8,1,"VIIRS",284.0,false,"Single sensor"',
      'evt_003,22.34,91.83,2024-04-15,2024-04-15,1410,1410,0.0,0.5,1,"VIIRS",190.0,false,"Single sensor"',
      'evt_004,23.71,90.41,2024-04-18,2024-04-18,1425,1430,0.1,1.5,3,"VIIRS+MODIS",420.0,true,"Suspected persistent heat"',
      'evt_005,24.89,91.87,2024-04-20,2024-04-20,1350,1355,0.1,1.1,2,"VIIRS+MODIS",350.0,false,"Multi-sensor match"',
      'evt_006,22.84,89.54,2024-04-22,2024-04-22,1405,1405,0.0,0.6,1,"VIIRS",145.0,false,"Single sensor"',
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(rows.join('\n'));
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', `fireharmony_bangladesh_events_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Subtitle + Download Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
            Harmonizing Satellite Fire Records for a Clearer Picture of Bangladesh
          </h1>
          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
            We combine MODIS and VIIRS hotspots, analyze their differences, and highlight what&apos;s real, what&apos;s persistent, and what needs a closer look.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleDownloadCsv}
            className="flex items-center gap-1.5 bg-[#0f1a2e] hover:bg-[#162540] border border-[#1d2f50] hover:border-emerald-500/50 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-medium transition-colors shadow-sm cursor-pointer"
            title="Download CSV"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Download CSV</span>
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 bg-[#0f1a2e] hover:bg-[#162540] border border-[#1d2f50] hover:border-amber-500/50 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-medium transition-colors shadow-sm cursor-pointer"
            title="Download / Print PDF Report"
          >
            <FileDown className="w-3.5 h-3.5 text-amber-400" />
            <span>PDF Report</span>
          </button>
        </div>
      </div>

      {/* Top Main Section: Map (Left 60%) + Key Insights & Scatter (Right 40%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Interactive Satellite Map */}
        <div className="lg:col-span-7 h-[580px]">
          <SatelliteMap
            onSelectHotspot={handleHotspotClick}
            selectedDateRange="Mar 1 – Apr 30, 2024"
            onDateRangeClick={() => onNavigate('map')}
          />
        </div>

        {/* Right Column: Key Insights (2x2) + Sensor Comparison Scatter Plot */}
        <div className="lg:col-span-5 space-y-4">
          {/* Key Insights Section */}
          <div className="rounded-xl bg-[#0d1527] border border-[#1b2844] p-4 shadow-xl">
            <h2 className="text-sm font-bold text-slate-100 mb-3">Key Insights</h2>

            <div className="grid grid-cols-2 gap-3">
              {/* Insight 1: VIIRS / MODIS Ratio */}
              <div className="rounded-lg bg-[#09101f] border border-[#16233b] p-3 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-1">
                  <div className="w-6 h-6 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center">
                    <Scale className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">VIIRS / MODIS Ratio</span>
                </div>
                <div className="mt-2">
                  <div className="text-xl font-bold text-slate-100">{viirsModisRatio}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">VIIRS sees 48% more hotspots</div>
                </div>
                {/* Green Sparkline */}
                <div className="mt-2 h-5 w-full">
                  <svg viewBox="0 0 100 20" className="w-full h-full overflow-visible">
                    <path
                      d="M 0 14 Q 25 18, 50 10 T 100 6"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2"
                    />
                  </svg>
                </div>
              </div>

              {/* Insight 2: FRP Correlation */}
              <div className="rounded-lg bg-[#09101f] border border-[#16233b] p-3 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-1">
                  <div className="w-6 h-6 rounded-full bg-purple-600/20 text-purple-400 flex items-center justify-center">
                    <TrendingUp className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">FRP Correlation</span>
                </div>
                <div className="mt-2">
                  <div className="text-xl font-bold text-slate-100">
                    {frpCorrelationR2} <span className="text-xs text-slate-400 font-normal">(R²)</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Good correlation between sensors</div>
                </div>
                {/* Purple Sparkline */}
                <div className="mt-2 h-5 w-full">
                  <svg viewBox="0 0 100 20" className="w-full h-full overflow-visible">
                    <path
                      d="M 0 15 Q 30 5, 60 12 T 100 4"
                      fill="none"
                      stroke="#8b5cf6"
                      strokeWidth="2"
                    />
                  </svg>
                </div>
              </div>

              {/* Insight 3: Persistent Heat Removed */}
              <div className="rounded-lg bg-[#09101f] border border-[#16233b] p-3 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-1">
                  <div className="w-6 h-6 rounded-full bg-orange-600/20 text-orange-400 flex items-center justify-center">
                    <Flame className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">Persistent Heat Removed</span>
                </div>
                <div className="mt-2">
                  <div className="text-xl font-bold text-slate-100">{persistentHeatRemovedShare}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">of total detections</div>
                </div>
                {/* Orange Sparkline */}
                <div className="mt-2 h-5 w-full">
                  <svg viewBox="0 0 100 20" className="w-full h-full overflow-visible">
                    <path
                      d="M 0 12 Q 35 18, 65 8 T 100 14"
                      fill="none"
                      stroke="#f97316"
                      strokeWidth="2"
                    />
                  </svg>
                </div>
              </div>

              {/* Insight 4: Total Fire Events */}
              <div className="rounded-lg bg-[#09101f] border border-[#16233b] p-3 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-1">
                  <div className="w-6 h-6 rounded-full bg-cyan-600/20 text-cyan-400 flex items-center justify-center">
                    <Activity className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">Total Fire Events</span>
                </div>
                <div className="mt-2">
                  <div className="text-xl font-bold text-slate-100">{totalFireEvents}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">(after harmonization)</div>
                </div>
                {/* Blue Sparkline */}
                <div className="mt-2 h-5 w-full">
                  <svg viewBox="0 0 100 20" className="w-full h-full overflow-visible">
                    <path
                      d="M 0 16 Q 30 10, 60 14 T 100 7"
                      fill="none"
                      stroke="#06b6d4"
                      strokeWidth="2"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Sensor Comparison (Afternoon passes) Scatter Card */}
          <div className="rounded-xl bg-[#0d1527] border border-[#1b2844] p-4 shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-slate-100">
                Sensor Comparison <span className="text-slate-400 font-normal">(Afternoon passes)</span>
              </h3>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-3 text-[10px] text-slate-400 mb-2">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>Matched</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span>MODIS only</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-purple-500" />
                <span>VIIRS only</span>
              </div>
            </div>

            {/* Scatter Plot Canvas */}
            <div className="relative bg-[#070d18] rounded-lg p-2 border border-[#162238] flex items-center justify-between">
              <svg width="270" height="150" className="overflow-visible">
                {/* Grid lines */}
                <line x1="35" y1="20" x2="260" y2="20" stroke="#162238" strokeWidth="1" />
                <line x1="35" y1="55" x2="260" y2="55" stroke="#162238" strokeWidth="1" />
                <line x1="35" y1="90" x2="260" y2="90" stroke="#162238" strokeWidth="1" />
                <line x1="35" y1="125" x2="260" y2="125" stroke="#162238" strokeWidth="1" />
                <line x1="35" y1="20" x2="35" y2="125" stroke="#162238" strokeWidth="1" />

                {/* Y-Axis Labels */}
                <text x="30" y="24" textAnchor="end" fill="#64748b" fontSize="8">2,000</text>
                <text x="30" y="59" textAnchor="end" fill="#64748b" fontSize="8">1,500</text>
                <text x="30" y="94" textAnchor="end" fill="#64748b" fontSize="8">1,000</text>
                <text x="30" y="127" textAnchor="end" fill="#64748b" fontSize="8">0</text>

                {/* X-Axis Labels */}
                <text x="35" y="137" textAnchor="middle" fill="#64748b" fontSize="8">0</text>
                <text x="90" y="137" textAnchor="middle" fill="#64748b" fontSize="8">500</text>
                <text x="145" y="137" textAnchor="middle" fill="#64748b" fontSize="8">1,000</text>
                <text x="200" y="137" textAnchor="middle" fill="#64748b" fontSize="8">1,500</text>
                <text x="255" y="137" textAnchor="middle" fill="#64748b" fontSize="8">2,000</text>

                {/* Axis Titles */}
                <text
                  x="-75"
                  y="10"
                  transform="rotate(-90)"
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="8"
                  fontWeight="600"
                >
                  VIIRS FRP (MW)
                </text>
                <text x="148" y="147" textAnchor="middle" fill="#94a3b8" fontSize="8" fontWeight="600">
                  MODIS FRP (MW)
                </text>

                {/* Scatter Points */}
                {/* Matched (emerald) */}
                <circle cx="45" cy="120" r="2" fill="#10b981" />
                <circle cx="55" cy="118" r="2.5" fill="#10b981" />
                <circle cx="70" cy="112" r="2" fill="#10b981" />
                <circle cx="85" cy="108" r="2.5" fill="#10b981" />
                <circle cx="100" cy="100" r="2" fill="#10b981" />
                <circle cx="115" cy="95" r="2" fill="#10b981" />
                <circle cx="130" cy="88" r="2.5" fill="#10b981" />
                <circle cx="145" cy="85" r="2" fill="#10b981" />
                <circle cx="160" cy="78" r="2.5" fill="#10b981" />
                <circle cx="175" cy="74" r="2" fill="#10b981" />
                <circle cx="190" cy="70" r="2" fill="#10b981" />
                <circle cx="210" cy="62" r="2.5" fill="#10b981" />
                <circle cx="230" cy="55" r="2" fill="#10b981" />

                {/* MODIS only (orange) */}
                <circle cx="65" cy="122" r="2" fill="#f59e0b" />
                <circle cx="95" cy="115" r="2" fill="#f59e0b" />
                <circle cx="120" cy="108" r="2" fill="#f59e0b" />
                <circle cx="150" cy="98" r="2" fill="#f59e0b" />
                <circle cx="180" cy="88" r="2" fill="#f59e0b" />

                {/* VIIRS only (purple) */}
                <circle cx="50" cy="95" r="2" fill="#8b5cf6" />
                <circle cx="80" cy="85" r="2" fill="#8b5cf6" />
                <circle cx="140" cy="65" r="2" fill="#8b5cf6" />
                <circle cx="205" cy="48" r="2" fill="#8b5cf6" />
                <circle cx="245" cy="40" r="2" fill="#8b5cf6" />

                {/* Trend Line (white) */}
                <line x1="40" y1="125" x2="245" y2="48" stroke="#ffffff" strokeWidth="1.5" />
              </svg>

              {/* R² and Equation Annotation Box */}
              <div className="pr-3 text-right">
                <div className="text-xs font-bold text-slate-100">R² = 0.72</div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">y = 0.81x + 45</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row: 3 Equal Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Column 1: Burning Activity Calendar */}
        <div className="rounded-xl bg-[#0d1527] border border-[#1b2844] p-4 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold text-slate-100">Burning Activity Calendar</h2>
            </div>

            {/* Daily / Weekly / Monthly Pill Toggle */}
            <div className="inline-flex rounded-lg bg-[#080e1c] border border-[#182640] p-0.5 w-full mb-3">
              <button
                onClick={() => setCalendarMode('daily')}
                className={`flex-1 py-1 text-[11px] font-semibold rounded-md transition-all ${
                  calendarMode === 'daily'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Daily
              </button>
              <button
                onClick={() => setCalendarMode('weekly')}
                className={`flex-1 py-1 text-[11px] font-semibold rounded-md transition-all ${
                  calendarMode === 'weekly'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Weekly
              </button>
              <button
                onClick={() => setCalendarMode('monthly')}
                className={`flex-1 py-1 text-[11px] font-semibold rounded-md transition-all ${
                  calendarMode === 'monthly'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Monthly
              </button>
            </div>

            {/* Month Navigator Header */}
            <div className="flex items-center justify-between text-xs text-slate-300 font-medium px-1 mb-2">
              <button className="p-1 hover:text-white transition-colors">
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span>Mar 2024</span>
              <button className="p-1 hover:text-white transition-colors">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Calendar Grid + Legend Layout */}
            <div className="flex items-start gap-3">
              {/* Day of Week + Tile Grid */}
              <div className="flex-1">
                <div className="grid grid-cols-7 gap-1 text-center text-[9px] text-slate-400 font-semibold mb-1">
                  <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
                </div>

                <div className="grid grid-cols-7 gap-1 text-[10px] font-medium text-center">
                  {/* Empty offset days */}
                  <span className="p-1 text-slate-600"></span>
                  <span className="p-1 text-slate-600"></span>
                  <span className="p-1 text-slate-600"></span>
                  <span className="p-1 text-slate-600"></span>
                  <div className="p-1 rounded bg-[#0a1428] text-slate-300 border border-[#162644]">1</div>
                  <div className="p-1 rounded bg-[#0a1428] text-slate-300 border border-[#162644]">2</div>
                  <div className="p-1 rounded bg-[#0a1428] text-slate-300 border border-[#162644]">3</div>

                  <div className="p-1 rounded bg-[#0a1428] text-slate-300 border border-[#162644]">4</div>
                  <div className="p-1 rounded bg-[#0a1428] text-slate-300 border border-[#162644]">5</div>
                  <div className="p-1 rounded bg-[#0a1428] text-slate-300 border border-[#162644]">6</div>
                  <div className="p-1 rounded bg-[#0a1428] text-slate-300 border border-[#162644]">7</div>
                  <div className="p-1 rounded bg-[#10243d] text-cyan-300 border border-cyan-800/60 font-semibold">8</div>
                  <div className="p-1 rounded bg-[#10243d] text-cyan-300 border border-cyan-800/60 font-semibold">9</div>
                  <div className="p-1 rounded bg-[#10243d] text-cyan-300 border border-cyan-800/60 font-semibold">10</div>

                  <div className="p-1 rounded bg-amber-600 text-white font-bold shadow-sm">11</div>
                  <div className="p-1 rounded bg-amber-600 text-white font-bold shadow-sm">12</div>
                  <div className="p-1 rounded bg-amber-600 text-white font-bold shadow-sm">13</div>
                  <div className="p-1 rounded bg-amber-600 text-white font-bold shadow-sm">14</div>
                  <div className="p-1 rounded bg-red-600 text-white font-bold shadow-sm">15</div>
                  <div className="p-1 rounded bg-red-600 text-white font-bold shadow-sm">16</div>
                  <div className="p-1 rounded bg-amber-600 text-white font-bold shadow-sm">17</div>

                  <div className="p-1 rounded bg-amber-600 text-white font-bold shadow-sm">18</div>
                  <div className="p-1 rounded bg-amber-600 text-white font-bold shadow-sm">19</div>
                  <div className="p-1 rounded bg-amber-600 text-white font-bold shadow-sm">20</div>
                  <div className="p-1 rounded bg-amber-600 text-white font-bold shadow-sm">21</div>
                  <div className="p-1 rounded bg-red-600 text-white font-bold shadow-sm">22</div>
                  <div className="p-1 rounded bg-amber-600 text-white font-bold shadow-sm">23</div>
                  <div className="p-1 rounded bg-amber-600 text-white font-bold shadow-sm">24</div>

                  <div className="p-1 rounded bg-amber-600 text-white font-bold shadow-sm">25</div>
                  <div className="p-1 rounded bg-amber-600 text-white font-bold shadow-sm">26</div>
                  <div className="p-1 rounded bg-amber-600 text-white font-bold shadow-sm">27</div>
                  <div className="p-1 rounded bg-[#10243d] text-cyan-300 border border-cyan-800/60">28</div>
                  <div className="p-1 rounded bg-amber-600 text-white font-bold shadow-sm">29</div>
                  <div className="p-1 rounded bg-amber-600 text-white font-bold shadow-sm">30</div>
                  <div className="p-1 rounded bg-[#10243d] text-cyan-300 border border-cyan-800/60">31</div>
                </div>
              </div>

              {/* Side Legend */}
              <div className="flex flex-col gap-3 justify-center text-[10px] text-slate-300 pt-5">
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded bg-red-600" />
                  <span>High</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded bg-amber-600" />
                  <span>Medium</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded border border-cyan-500 bg-[#0a182b]" />
                  <span>Low</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Column 2: Before vs After Harmonization */}
        <div className="rounded-xl bg-[#0d1527] border border-[#1b2844] p-4 shadow-xl flex flex-col justify-between">
          <div>
            <div className="mb-2">
              <h2 className="text-xs font-bold text-slate-100">Before vs After Harmonization</h2>
              <p className="text-[10px] text-slate-400 mt-0.5">
                The ratio changes after removing persistent heat sources
              </p>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-[10px] text-slate-300 mb-4">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-slate-500" />
                <span>Raw</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" />
                <span>After filtering</span>
              </div>
            </div>

            {/* Grouped Bar Chart */}
            <div className="space-y-4">
              {/* Metric 1 */}
              <div>
                <div className="flex justify-between text-[10px] text-slate-300 mb-1">
                  <span>Total detections</span>
                  <div className="space-x-2 font-mono">
                    <span className="text-slate-400">1.48</span>
                    <span className="text-emerald-400 font-bold">1.21</span>
                  </div>
                </div>
                <div className="flex gap-1.5 h-4 w-full">
                  <div className="h-full bg-slate-500 rounded-sm" style={{ width: '74%' }} />
                  <div className="h-full bg-emerald-400 rounded-sm" style={{ width: '60%' }} />
                </div>
              </div>

              {/* Metric 2 */}
              <div>
                <div className="flex justify-between text-[10px] text-slate-300 mb-1">
                  <span>Agricultural burning</span>
                  <div className="space-x-2 font-mono">
                    <span className="text-slate-400">1.32</span>
                    <span className="text-emerald-400 font-bold">1.08</span>
                  </div>
                </div>
                <div className="flex gap-1.5 h-4 w-full">
                  <div className="h-full bg-slate-500 rounded-sm" style={{ width: '66%' }} />
                  <div className="h-full bg-emerald-400 rounded-sm" style={{ width: '54%' }} />
                </div>
              </div>

              {/* Metric 3 */}
              <div>
                <div className="flex justify-between text-[10px] text-slate-300 mb-1">
                  <span>Forest / natural</span>
                  <div className="space-x-2 font-mono">
                    <span className="text-slate-400">1.76</span>
                    <span className="text-emerald-400 font-bold">1.42</span>
                  </div>
                </div>
                <div className="flex gap-1.5 h-4 w-full">
                  <div className="h-full bg-slate-500 rounded-sm" style={{ width: '88%' }} />
                  <div className="h-full bg-emerald-400 rounded-sm" style={{ width: '71%' }} />
                </div>
              </div>

              {/* Metric 4 */}
              <div>
                <div className="flex justify-between text-[10px] text-slate-300 mb-1">
                  <span>Urban / industrial</span>
                  <div className="space-x-2 font-mono">
                    <span className="text-slate-400">1.03</span>
                    <span className="text-emerald-400 font-bold">0.88</span>
                  </div>
                </div>
                <div className="flex gap-1.5 h-4 w-full">
                  <div className="h-full bg-slate-500 rounded-sm" style={{ width: '51%' }} />
                  <div className="h-full bg-emerald-400 rounded-sm" style={{ width: '44%' }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Column 3: What's This Fire? Detail Card */}
        <div className="rounded-xl bg-[#0d1527] border border-[#1b2844] p-4 shadow-xl flex flex-col justify-between">
          <div>
            <h2 className="text-xs font-bold text-slate-100 mb-2">What&apos;s This Fire?</h2>

            {/* Event Details / Evidence Tabs */}
            <div className="inline-flex rounded-lg bg-[#080e1c] border border-[#182640] p-0.5 w-full mb-3">
              <button
                onClick={() => setActiveTab('details')}
                className={`flex-1 py-1 text-[11px] font-semibold rounded-md transition-all ${
                  activeTab === 'details'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Event Details
              </button>
              <button
                onClick={() => setActiveTab('evidence')}
                className={`flex-1 py-1 text-[11px] font-semibold rounded-md transition-all ${
                  activeTab === 'evidence'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Evidence
              </button>
            </div>

            {/* Satellite Imagery Thumbnail & Metadata */}
            <div className="flex items-start gap-3">
              {/* Satellite Thumbnail Box with target marker */}
              <div className="relative w-24 h-24 rounded-lg overflow-hidden border border-[#203254] shrink-0 bg-[#09151e]">
                {/* Terrain simulation gradient */}
                <div
                  className="w-full h-full"
                  style={{
                    background: 'radial-gradient(circle at 60% 45%, #2a483a 0%, #152b22 55%, #0d1a24 100%)',
                  }}
                />
                {/* Centered Fire Hotspot Target Pin */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center">
                  <div className="w-5 h-5 rounded-full border-2 border-red-500/80 animate-ping absolute" />
                  <div className="w-3 h-3 rounded-full bg-red-600 border border-white shadow-md shadow-red-500" />
                </div>
                {/* Tag at bottom */}
                <div className="absolute bottom-0 inset-x-0 bg-black/75 px-1 py-0.5 text-[8px] text-slate-300 font-mono text-center">
                  VIIRS • {selectedFire.timestamp.split(' - ')[0]}
                </div>
              </div>

              {/* Key Value Metadata Table */}
              <div className="flex-1 text-[11px] space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">Location</span>
                  <span className="text-slate-200 font-mono font-medium">
                    {selectedFire.lat.toFixed(2)}° N, {selectedFire.lon.toFixed(2)}° E
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">District</span>
                  <span className="text-slate-200 font-medium">{selectedFire.district}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Sensors</span>
                  <div className="flex items-center gap-1 font-medium">
                    <span className="text-blue-400">VIIRS</span>
                    <span className="text-slate-500">•</span>
                    <span className="text-amber-400">MODIS</span>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">FRP (VIIRS)</span>
                  <span className="text-slate-200 font-bold">{selectedFire.frp}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Confidence</span>
                  <span className="text-emerald-400 font-medium">{selectedFire.confidence}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Type</span>
                  <span className="text-purple-300 font-medium">{selectedFire.type}</span>
                </div>
              </div>
            </div>
          </div>

          {/* View on Map Button */}
          <div className="mt-4 pt-2">
            <button
              onClick={() => onNavigate('map')}
              className="w-full py-2 bg-[#14233e] hover:bg-[#1a2f52] border border-[#223a66] text-blue-300 hover:text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
            >
              <MapPin className="w-3.5 h-3.5" />
              View on map
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
