import { runFullAnalysis } from '../stats.js';
import { ApiHandler } from '../types.js';
import { query, getPool } from '../db.js';

export const handleEvents: ApiHandler = async (ctx) => {
  const isCsv = ctx.query.format === 'csv';
  const csvHeaders = [
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

  const pool = getPool();
  if (!pool) {
    if (isCsv) {
      const fallbackRows = [
        csvHeaders.join(','),
        'evt_001,24.46,90.48,2024-04-12,2024-04-12,1430,1435,0.1,1.2,2,"VIIRS+MODIS",312.0,false,"Multi-sensor match"',
        'evt_002,23.98,90.38,2024-04-14,2024-04-14,1315,1320,0.1,0.8,1,"VIIRS",284.0,false,"Single sensor"',
        'evt_003,22.34,91.83,2024-04-15,2024-04-15,1410,1410,0.0,0.5,1,"VIIRS",190.0,false,"Single sensor"',
        'evt_004,23.71,90.41,2024-04-18,2024-04-18,1425,1430,0.1,1.5,3,"VIIRS+MODIS",420.0,true,"Suspected persistent heat"',
      ];
      return {
        status: 200,
        json: fallbackRows.join('\n'),
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="fireharmony_events_sample.csv"',
        },
      };
    }
    return {
      status: 200,
      json: { empty: true, events: [], total_count: 0, page: 1, total_pages: 0 },
    };
  }

  let from = ctx.query.from;
  let to = ctx.query.to;
  const nrt = ctx.query.nrt === '1';
  const labelFilter = ctx.query.label;
  const divisionFilter = ctx.query.division;
  const page = Math.max(1, parseInt(ctx.query.page || '1', 10));
  const pageSize = 20;

  if (!from || !to) {
    const rangeRes = await query<{ min_d: string; max_d: string }>(
      'SELECT min(acq_date)::text as min_d, max(acq_date)::text as max_d FROM detections'
    );
    if (!rangeRes.rows[0]?.max_d) {
      if (isCsv) {
        return {
          status: 200,
          json: csvHeaders.join('\n'),
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="fireharmony_events.csv"',
          },
        };
      }
      return {
        status: 200,
        json: { empty: true, events: [], total_count: 0, page: 1, total_pages: 0 },
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
    if (isCsv) {
      return {
        status: 200,
        json: csvHeaders.join('\n'),
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="fireharmony_events.csv"',
        },
      };
    }
    return {
      status: 200,
      json: { empty: true, events: [], total_count: 0, page: 1, total_pages: 0 },
    };
  }

  // Get district -> division map
  const distMetaRes = await query<{ id: number; division: string | null }>(
    `SELECT id, division FROM districts`
  );
  const divMap: Record<number, string> = {};
  for (const d of distMetaRes.rows) {
    if (d.division) divMap[d.id] = d.division;
  }

  let filtered = res.bundle.events;

  if (labelFilter && labelFilter.trim() !== '') {
    filtered = filtered.filter((e) => e.label === labelFilter);
  }

  if (divisionFilter && divisionFilter.trim() !== '') {
    filtered = filtered.filter((e) => {
      const div = e.district !== null ? divMap[e.district] : null;
      return div === divisionFilter;
    });
  }

  if (ctx.query.format === 'csv') {
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
    const lines = [headers.join(',')];
    for (const ev of filtered) {
      lines.push(
        [
          ev.id,
          ev.centroid_lat,
          ev.centroid_lon,
          ev.start_date,
          ev.end_date,
          ev.start_time,
          ev.end_time,
          ev.duration_hours,
          ev.extent_km,
          ev.member_count,
          `"${ev.families.join('+')}"`,
          ev.frp_total_sum,
          ev.is_persistent,
          `"${ev.label}"`,
        ].join(',')
      );
    }
    return {
      status: 200,
      json: lines.join('\n'),
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="fireharmony_events_${from}_${to}.csv"`,
      },
    };
  }

  const totalCount = filtered.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  const startIdx = (page - 1) * pageSize;
  const pageEvents = filtered.slice(startIdx, startIdx + pageSize);

  return {
    status: 200,
    json: {
      provenance: res.bundle.results.provenance,
      events: pageEvents,
      total_count: totalCount,
      page,
      total_pages: totalPages,
    },
  };
};
