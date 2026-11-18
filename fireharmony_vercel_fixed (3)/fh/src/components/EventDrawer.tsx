import React from 'react';
import { X, Flame, ShieldAlert, Clock, MapPin, Eye } from 'lucide-react';
import { FusedEventItem } from '../types';

interface EventDrawerProps {
  event: FusedEventItem | null;
  onClose: () => void;
  districtName?: string;
}

function formatDhakaTime(dateStr: string, timeNum: number): string {
  // Asia/Dhaka is UTC+6
  const hh = Math.floor(timeNum / 100);
  const mm = timeNum % 100;
  const utcDate = new Date(`${dateStr}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(utcDate);
}

function platformName(p: number): string {
  switch (p) {
    case 1:
      return 'MODIS (Terra)';
    case 2:
      return 'MODIS (Aqua)';
    case 3:
      return 'VIIRS (Suomi NPP)';
    case 4:
      return 'VIIRS (NOAA-20)';
    case 5:
      return 'VIIRS (NOAA-21)';
    default:
      return 'Unknown MODIS';
  }
}

export const EventDrawer: React.FC<EventDrawerProps> = ({ event, onClose, districtName }) => {
  if (!event) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md bg-[#131924] border-l border-[#222b3d] shadow-2xl z-50 flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
      {/* Drawer Header */}
      <div className="p-5 border-b border-[#222b3d] flex items-center justify-between bg-[#171f2e]">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs px-2 py-0.5 rounded font-medium ${
                event.label === 'Suspected persistent heat'
                  ? 'bg-amber-950/70 text-amber-300 border border-amber-800'
                  : event.label === 'Multi-sensor agreement'
                  ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-800'
                  : 'bg-slate-800 text-slate-300 border border-slate-700'
              }`}
            >
              {event.label}
            </span>
            <span className="text-xs text-slate-400 font-mono">{event.id}</span>
          </div>
          <h2 className="text-sm font-semibold text-slate-100 mt-1">Event Observation Details</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-[#222b3d] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Drawer Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {/* Supporting evidence disclaimer */}
        <div className="p-3.5 rounded-lg bg-[#182030] border border-[#263248] flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-300 leading-relaxed font-medium">
            Agreement between sensors is supporting evidence, not proof of a fire.
          </p>
        </div>

        {/* Timestamps */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" /> Observation Times
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-3 rounded bg-[#161d2a] border border-[#222b3d]">
              <div className="text-slate-400">UTC Start</div>
              <div className="font-mono text-slate-200 mt-0.5">
                {event.start_date} {String(event.start_time).padStart(4, '0')}
              </div>
            </div>
            <div className="p-3 rounded bg-[#161d2a] border border-[#222b3d]">
              <div className="text-slate-400">UTC End</div>
              <div className="font-mono text-slate-200 mt-0.5">
                {event.end_date} {String(event.end_time).padStart(4, '0')}
              </div>
            </div>
            <div className="p-3 rounded bg-[#161d2a] border border-[#222b3d] col-span-2">
              <div className="text-slate-400">Asia/Dhaka Local Time (UTC+6)</div>
              <div className="font-medium text-slate-200 mt-0.5">
                {formatDhakaTime(event.start_date, event.start_time)}
              </div>
            </div>
          </div>
        </div>

        {/* Platforms and Sensors */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-slate-400" /> Sensors & Platforms
          </h3>
          <div className="p-3 rounded bg-[#161d2a] border border-[#222b3d] space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-[#222b3d]/60">
              <span className="text-slate-400">Families</span>
              <span className="text-slate-200 font-medium">{event.families.join(', ')}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#222b3d]/60">
              <span className="text-slate-400">Platforms</span>
              <span className="text-slate-200 font-medium">
                {event.platforms.map(platformName).join('; ')}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#222b3d]/60">
              <span className="text-slate-400">Distinct Overpasses</span>
              <span className="text-slate-200 font-medium">{event.overpasses_count}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#222b3d]/60">
              <span className="text-slate-400">Active Days</span>
              <span className="text-slate-200 font-medium">{event.active_days_count}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-400">Night Observation Share</span>
              <span className="text-slate-200 font-medium">{Math.round(event.night_share * 100)}%</span>
            </div>
          </div>
        </div>

        {/* Spatial and District */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-slate-400" /> Spatial Coordinates & District
          </h3>
          <div className="p-3 rounded bg-[#161d2a] border border-[#222b3d] space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-[#222b3d]/60">
              <span className="text-slate-400">Centroid Coordinates</span>
              <span className="text-slate-200 font-mono font-medium">
                {event.centroid_lat.toFixed(4)}°N, {event.centroid_lon.toFixed(4)}°E
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#222b3d]/60">
              <span className="text-slate-400">Assigned District</span>
              <span className="text-slate-200 font-medium">{districtName || `District ID #${event.district}`}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#222b3d]/60">
              <span className="text-slate-400">Cluster Extent</span>
              <span className="text-slate-200 font-medium">{event.extent_km} km</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-400">Suspected Persistent Heat Cell</span>
              <span className={`font-medium ${event.is_persistent ? 'text-amber-400' : 'text-slate-400'}`}>
                {event.is_persistent ? 'Yes (Majority in Flagged Cell)' : 'No'}
              </span>
            </div>
          </div>
        </div>

        {/* Fire Radiative Power (FRP) */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-amber-500" /> Fire Radiative Power (FRP)
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-3 rounded bg-[#161d2a] border border-[#222b3d]">
              <div className="text-slate-400">MODIS FRP Sum</div>
              <div className="text-sm font-semibold text-slate-200 mt-0.5">
                {event.frp_modis_sum > 0 ? `${event.frp_modis_sum} MW` : 'N/A'}
              </div>
            </div>
            <div className="p-3 rounded bg-[#161d2a] border border-[#222b3d]">
              <div className="text-slate-400">VIIRS FRP Sum</div>
              <div className="text-sm font-semibold text-slate-200 mt-0.5">
                {event.frp_viirs_sum > 0 ? `${event.frp_viirs_sum} MW` : 'N/A'}
              </div>
            </div>
            <div className="p-3 rounded bg-[#161d2a] border border-[#222b3d]">
              <div className="text-slate-400">Min FRP</div>
              <div className="text-xs text-slate-300 mt-0.5">
                {event.frp_min !== null ? `${event.frp_min} MW` : 'N/A'}
              </div>
            </div>
            <div className="p-3 rounded bg-[#161d2a] border border-[#222b3d]">
              <div className="text-slate-400">Max FRP</div>
              <div className="text-xs text-slate-300 mt-0.5">
                {event.frp_max !== null ? `${event.frp_max} MW` : 'N/A'}
              </div>
            </div>
          </div>
        </div>

        {/* Member Detections List */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Raw Member Detections ({event.members.length})
          </h3>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {event.members.map((m, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded bg-[#161d2a]/80 border border-[#222b3d] text-[11px] flex items-center justify-between"
              >
                <div>
                  <span className="font-medium text-slate-200">{platformName(m.platform)}</span>
                  <div className="text-slate-400 font-mono">
                    {m.acq_date} {String(m.acq_time).padStart(4, '0')} UTC
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-slate-300">{m.frp !== null ? `${m.frp} MW` : 'No FRP'}</div>
                  <div className="text-slate-400">
                    Conf: {m.conf_class === 2 ? 'High' : m.conf_class === 1 ? 'Nominal' : 'Low'}
                    {m.conf_raw !== null ? ` (${m.conf_raw}%)` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
