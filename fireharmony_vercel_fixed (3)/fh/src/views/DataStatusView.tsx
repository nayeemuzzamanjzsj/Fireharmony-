import React, { useState } from 'react';
import { HealthResponse } from '../types';
import { Database, CheckCircle2, AlertTriangle, RefreshCw, HardDrive, Server, ShieldAlert } from 'lucide-react';

interface DataStatusViewProps {
  health: HealthResponse | null;
  onRefresh: () => void;
  isLoading: boolean;
}

export const DataStatusView: React.FC<DataStatusViewProps> = ({ health, onRefresh, isLoading }) => {
  const [poking, setPoking] = useState(false);
  const [pokeResult, setPokeResult] = useState<string | null>(null);

  const handlePoke = async () => {
    setPoking(true);
    setPokeResult(null);
    try {
      const res = await fetch('/api/ingest/poke');
      const data = await res.json();
      if (data.started) {
        setPokeResult('Background ingest run started.');
      } else if (data.reason === 'cooldown_active') {
        setPokeResult(`Ingestion on cooldown (${data.minutes_remaining} minutes remaining).`);
      } else if (data.reason === 'already_running') {
        setPokeResult('An ingestion job is currently executing.');
      } else {
        setPokeResult(data.reason || 'Poke completed.');
      }
      onRefresh();
    } catch (err: any) {
      setPokeResult(`Poke error: ${err.message}`);
    } finally {
      setPoking(false);
    }
  };

  const dbSizeMb = health ? (health.db_size_bytes / (1024 * 1024)).toFixed(1) : '0';
  const dbLimitMb = health ? (health.db_limit_bytes / (1024 * 1024)).toFixed(0) : '500';
  const dbPercent = health && health.db_limit_bytes > 0
    ? Math.min(100, Math.round((health.db_size_bytes / health.db_limit_bytes) * 100))
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Telemetry Ingestion & System Health</h1>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Real-time status of PostgreSQL storage, NASA FIRMS synchronization, and historical backfill cursors.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1a2232] hover:bg-[#202b3d] text-slate-200 text-xs font-medium rounded border border-[#2a364d] transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handlePoke}
            disabled={poking}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded transition-colors"
          >
            {poking ? 'Poking...' : 'Trigger Ingest Check'}
          </button>
        </div>
      </div>

      {pokeResult && (
        <div className="p-3 rounded-lg bg-[#182030] border border-[#263248] text-xs text-amber-300 flex items-center gap-2">
          <Server className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{pokeResult}</span>
        </div>
      )}

      {/* Warnings & Notes Panel */}
      {health && health.notes && health.notes.length > 0 && (
        <div className="p-4 rounded-lg bg-amber-950/30 border border-amber-800/60 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span>Environment & Operational Notices</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-xs text-amber-200/90 pl-1">
            {health.notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Core Health Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Database Connection */}
        <div className="rounded-lg bg-[#141b27] border border-[#222b3d] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>PostgreSQL Database</span>
            <Database className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`w-2.5 h-2.5 rounded-full ${health?.db_ok ? 'bg-emerald-400' : 'bg-red-400'}`}
            />
            <span className="text-base font-bold text-slate-100">
              {health?.db_ok ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-2">
            Schema: {health?.schema_ok ? 'Ensured' : 'Missing'}
          </div>
        </div>

        {/* Card 2: Detections Count */}
        <div className="rounded-lg bg-[#141b27] border border-[#222b3d] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>Stored Hotspots</span>
            <Server className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100">
            {health ? health.detections_count.toLocaleString() : '0'}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Districts: {health?.districts_count || 0} / 64
          </div>
        </div>

        {/* Card 3: Storage Guard */}
        <div className="rounded-lg bg-[#141b27] border border-[#222b3d] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>Storage Usage</span>
            <HardDrive className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-base font-bold text-slate-100">
            {dbSizeMb} MB / {dbLimitMb} MB
          </div>
          <div className="w-full bg-[#1e2638] h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className={`h-full rounded-full ${
                dbPercent > 80 ? 'bg-red-500' : dbPercent > 60 ? 'bg-amber-500' : 'bg-emerald-400'
              }`}
              style={{ width: `${dbPercent}%` }}
            />
          </div>
        </div>

        {/* Card 4: FIRMS Key */}
        <div className="rounded-lg bg-[#141b27] border border-[#222b3d] p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>NASA FIRMS API Key</span>
            <ShieldAlert className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`w-2.5 h-2.5 rounded-full ${health?.key_present ? 'bg-emerald-400' : 'bg-amber-400'}`}
            />
            <span className="text-base font-bold text-slate-100">
              {health?.key_present ? 'Configured' : 'Missing Key'}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-2">
            Boundaries: {health?.boundaries_loaded ? 'Loaded' : 'Pending'}
          </div>
        </div>
      </div>

      {/* Last Ingest Run Details */}
      <div className="rounded-lg bg-[#141b27] border border-[#222b3d] p-5">
        <h2 className="text-sm font-semibold text-slate-200 mb-3">Last Ingestion Run</h2>
        {health?.last_tick ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 text-xs">
            <div className="p-3 rounded bg-[#101620] border border-[#1e2638]">
              <div className="text-slate-400">Status</div>
              <div
                className={`font-semibold capitalize mt-1 ${
                  health.last_tick.status === 'ok'
                    ? 'text-emerald-400'
                    : health.last_tick.status === 'partial'
                    ? 'text-amber-400'
                    : 'text-red-400'
                }`}
              >
                {health.last_tick.status}
              </div>
            </div>
            <div className="p-3 rounded bg-[#101620] border border-[#1e2638]">
              <div className="text-slate-400">Started At</div>
              <div className="text-slate-200 font-mono mt-1">
                {new Date(health.last_tick.started_at).toLocaleTimeString()}
              </div>
            </div>
            <div className="p-3 rounded bg-[#101620] border border-[#1e2638]">
              <div className="text-slate-400">Finished At</div>
              <div className="text-slate-200 font-mono mt-1">
                {health.last_tick.finished_at
                  ? new Date(health.last_tick.finished_at).toLocaleTimeString()
                  : 'In progress'}
              </div>
            </div>
            <div className="p-3 rounded bg-[#101620] border border-[#1e2638]">
              <div className="text-slate-400">HTTP Requests</div>
              <div className="text-slate-200 font-semibold mt-1">{health.last_tick.requests}</div>
            </div>
            <div className="p-3 rounded bg-[#101620] border border-[#1e2638]">
              <div className="text-slate-400">Rows Upserted</div>
              <div className="text-emerald-400 font-semibold mt-1">
                {health.last_tick.rows_upserted.toLocaleString()}
              </div>
            </div>

            {health.last_tick.error && (
              <div className="col-span-full p-3 rounded bg-red-950/30 border border-red-800 text-xs text-red-300">
                Error reported: {health.last_tick.error}
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 rounded bg-[#101620] border border-[#1e2638] text-xs text-slate-400">
            No ingestion run records found in database.
          </div>
        )}
      </div>

      {/* Product Coverage & Historical Backfill Progress */}
      <div className="rounded-lg bg-[#141b27] border border-[#222b3d] p-5">
        <h2 className="text-sm font-semibold text-slate-200 mb-3">
          Product Telemetry Coverage & Backfill Progress
        </h2>

        {!health?.products || health.products.length === 0 ? (
          <div className="p-6 text-center rounded bg-[#101620] border border-[#1e2638] text-xs text-slate-400">
            No product telemetry ingested yet. When the server runs, forward ingestion pulls recent data first, followed by historical backfill moving backward season by season.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#101620] text-slate-400 border-b border-[#222b3d]">
                <tr>
                  <th className="py-2.5 px-3 font-medium">Product ID</th>
                  <th className="py-2.5 px-3 font-medium">First Day</th>
                  <th className="py-2.5 px-3 font-medium">Last Day</th>
                  <th className="py-2.5 px-3 font-medium">Coverage Days</th>
                  <th className="py-2.5 px-3 font-medium">SP Days</th>
                  <th className="py-2.5 px-3 font-medium">NRT Days</th>
                  <th className="py-2.5 px-3 font-medium">Backfill Cursor</th>
                  <th className="py-2.5 px-3 font-medium">Backfill Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e2638] text-slate-300">
                {health.products.map((p) => (
                  <tr key={p.product}>
                    <td className="py-2.5 px-3 font-semibold text-slate-200 font-mono">{p.product}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-400">{p.first_day || '—'}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-400">{p.last_day || '—'}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-100">{p.coverage_days}</td>
                    <td className="py-2.5 px-3 text-emerald-400">{p.sp_days}</td>
                    <td className="py-2.5 px-3 text-amber-400">{p.nrt_days}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-300">
                      {p.backfill ? p.backfill.cursor_date : '—'}
                    </td>
                    <td className="py-2.5 px-3">
                      {p.backfill ? (
                        p.backfill.done ? (
                          <span className="text-emerald-400 font-medium">Done (to start)</span>
                        ) : (
                          <span className="text-amber-400 font-medium">
                            Backfilling backward
                          </span>
                        )
                      ) : (
                        <span className="text-slate-400">N/A</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
