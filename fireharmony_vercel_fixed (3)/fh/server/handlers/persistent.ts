import { runFullAnalysis } from '../stats.js';
import { ApiHandler } from '../types.js';
import { query, getPool } from '../db.js';

export const handlePersistent: ApiHandler = async (ctx) => {
  const pool = getPool();
  if (!pool) {
    return {
      status: 200,
      json: { empty: true, flagged_cells: [], sensitivity_grid: [] },
    };
  }

  let from = ctx.query.from;
  let to = ctx.query.to;
  const nrt = ctx.query.nrt === '1';
  const format = ctx.query.format;

  if (!from || !to) {
    const rangeRes = await query<{ min_d: string; max_d: string }>(
      'SELECT min(acq_date)::text as min_d, max(acq_date)::text as max_d FROM detections'
    );
    if (!rangeRes.rows[0]?.max_d) {
      return {
        status: 200,
        json: { empty: true, flagged_cells: [], sensitivity_grid: [] },
      };
    }
    to = rangeRes.rows[0].max_d;
    const maxObj = new Date(to + 'T00:00:00Z');
    maxObj.setUTCDate(maxObj.getUTCDate() - 89);
    from = maxObj.toISOString().slice(0, 10);
    if (from < rangeRes.rows[0].min_d) from = rangeRes.rows[0].min_d;
  }

  const res = await runFullAnalysis(from, to, nrt);
  if (!res.bundle) {
    return {
      status: 200,
      json: { empty: true, flagged_cells: [], sensitivity_grid: [] },
    };
  }

  const cells = res.bundle.persistentFull.flagged_cells;

  if (format === 'csv') {
    const headers = [
      'cell_key',
      'center_lat',
      'center_lon',
      'active_days',
      'distinct_months',
      'viirs_detections',
      'associated_modis',
      'total_detections',
      'night_share',
      'district',
    ];
    const lines = [headers.join(',')];
    for (const c of cells) {
      lines.push(
        [
          c.cell_key,
          c.center_lat,
          c.center_lon,
          c.active_days,
          c.distinct_months,
          c.viirs_detections,
          c.associated_modis,
          c.total_detections,
          c.night_share,
          c.district !== null ? c.district : '',
        ].join(',')
      );
    }
    return {
      status: 200,
      json: lines.join('\n'),
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="suspected_persistent_heat_cells_${from}_${to}.csv"`,
      },
    };
  }

  return {
    status: 200,
    json: {
      provenance: res.bundle.results.provenance,
      total_flagged: res.bundle.persistentFull.total_flagged,
      total_viirs_in_flagged: res.bundle.persistentFull.total_viirs_detections_in_flagged,
      flagged_cells: cells,
      sensitivity_grid: res.bundle.persistentFull.sensitivity_grid,
    },
  };
};
