import React from 'react';
import { ProvenanceInfo } from '../types';
import { Info } from 'lucide-react';

interface ProvenanceFooterProps {
  provenance?: ProvenanceInfo | null;
  totalRows?: number;
}

export const ProvenanceFooter: React.FC<ProvenanceFooterProps> = ({ provenance, totalRows }) => {
  if (!provenance) return null;

  return (
    <footer className="mt-8 pt-4 border-t border-[#1e2638] text-xs text-slate-400 flex flex-wrap items-center justify-between gap-y-2 gap-x-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-slate-300 font-medium">
          <Info className="w-3.5 h-3.5 text-amber-500" />
          Data Provenance
        </span>
        <span className="text-slate-600">•</span>
        <span>
          Window: <span className="text-slate-200">{provenance.window.from}</span> to{' '}
          <span className="text-slate-200">{provenance.window.to}</span> ({provenance.window.days} days)
        </span>
        <span className="text-slate-600">•</span>
        <span>
          Products: <span className="text-slate-200">{provenance.products.length > 0 ? provenance.products.join(', ') : 'None'}</span>
        </span>
        <span className="text-slate-600">•</span>
        <span>
          Mix: <span className="text-emerald-400">{provenance.sp_count} SP</span>
          {provenance.nrt_count > 0 && (
            <>
              {' / '}
              <span className="text-amber-400">{provenance.nrt_count} NRT</span>
            </>
          )}
        </span>
        {totalRows !== undefined && (
          <>
            <span className="text-slate-600">•</span>
            <span>Total rows: <span className="text-slate-200">{totalRows.toLocaleString()}</span></span>
          </>
        )}
      </div>

      <div className="flex items-center gap-3 text-slate-400 text-[11px]">
        <span>
          Params: d={provenance.parameters.agreement_distance_km}km, T={provenance.parameters.agreement_time_min}m, cell={provenance.parameters.grid_cell_deg}°
        </span>
        <span className="text-slate-600">•</span>
        <span>
          Generated: {new Date(provenance.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      </div>
    </footer>
  );
};
