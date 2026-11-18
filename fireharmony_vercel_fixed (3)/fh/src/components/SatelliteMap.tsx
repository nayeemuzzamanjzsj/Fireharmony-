import React from 'react';
import { Download, FileDown, MapPin, Eye } from 'lucide-react';

export interface HotspotPoint {
  id: string;
  lat: number;
  lon: number;
  category: 'multi_sensor' | 'single_sensor' | 'persistent' | 'low_conf';
  frp: number;
  date: string;
  time: string;
  district: string;
  confidence: string;
  type: string;
}

interface SatelliteMapProps {
  onSelectHotspot?: (hotspot: HotspotPoint) => void;
  selectedHotspotId?: string;
  selectedDateRange?: string;
  onDateRangeClick?: () => void;
}

export const SatelliteMap: React.FC<SatelliteMapProps> = ({
  selectedDateRange = 'Mar 1 – Apr 30, 2024',
}) => {
  const handleDownloadCsv = () => {
    // Generate CSV data from events
    const headers = ['date', 'district', 'sensors', 'frp_mw', 'confidence', 'type'];
    const rows = [
      headers.join(','),
      '2024-04-12,Narayanganj,"VIIRS + MODIS",312,High,"Likely vegetation fire"',
      '2024-04-14,Gazipur,"VIIRS + MODIS",284,High,"Active fire cluster"',
      '2024-04-15,Chittagong,VIIRS,190,Medium,"Biomass clearing"',
      '2024-04-18,Dhaka,VIIRS,420,Persistent,"Brick kiln cluster"',
      '2024-04-20,Sylhet,"VIIRS + MODIS",350,High,"Field burning"',
      '2024-04-22,Khulna,VIIRS,145,Medium,"Crop residue"',
      '2024-04-25,Rajshahi,"VIIRS + MODIS",265,High,"Harvest burn"',
      '2024-04-28,Rangpur,VIIRS,178,Medium,"Agricultural residue"',
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(rows.join('\n'));
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', `bangladesh_satellite_hotspots_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadPdf = () => {
    window.print();
  };

  return (
    <div className="relative w-full h-full min-h-[540px] rounded-2xl overflow-hidden border border-[#1a2742] bg-[#030712] flex flex-col items-center justify-center p-3 shadow-2xl group">
      {/* Bangladesh Network Glowing Map Picture */}
      <img
        src="/images/bangladesh_network_map.jpg"
        alt="Bangladesh Satellite Telemetry Network Map"
        className="w-full h-full object-contain max-h-[580px] rounded-xl transition-transform duration-300 group-hover:scale-[1.01]"
      />

      {/* Floating Top-Left Telemetry Badge */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-[#091122]/90 backdrop-blur-md border border-[#223352] rounded-lg px-3 py-1.5 text-xs text-slate-200 shadow-xl">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="font-semibold tracking-wide">Bangladesh Satellite Telemetry</span>
        <span className="text-[10px] text-slate-400 font-mono">({selectedDateRange})</span>
      </div>

      {/* Floating Bottom-Right Download Buttons */}
      <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2 bg-[#091122]/95 backdrop-blur-md border border-[#223352] rounded-xl p-1.5 shadow-2xl">
        <button
          onClick={handleDownloadCsv}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0f281e] hover:bg-[#153a2b] border border-emerald-500/40 rounded-lg text-xs font-semibold text-emerald-300 transition-colors shadow-sm cursor-pointer"
          title="Download Fire Hotspots CSV"
        >
          <Download className="w-3.5 h-3.5 text-emerald-400" />
          <span>Download CSV</span>
        </button>
        <button
          onClick={handleDownloadPdf}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2a1b0a] hover:bg-[#3d270e] border border-amber-500/40 rounded-lg text-xs font-semibold text-amber-300 transition-colors shadow-sm cursor-pointer"
          title="Download PDF Report"
        >
          <FileDown className="w-3.5 h-3.5 text-amber-400" />
          <span>PDF Report</span>
        </button>
      </div>

      {/* Floating Bottom-Left Simple Legend */}
      <div className="absolute bottom-4 left-4 z-20 hidden sm:flex items-center gap-3 bg-[#091122]/90 backdrop-blur-md border border-[#223352] rounded-lg px-3 py-1.5 text-[11px] text-slate-300 shadow-xl">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#ef4444]" />
          <span>Multi-sensor</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#f59e0b]" />
          <span>Single sensor</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#8b5cf6]" />
          <span>Persistent heat</span>
        </div>
      </div>
    </div>
  );
};
