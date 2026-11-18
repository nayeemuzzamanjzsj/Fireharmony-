import { query, getPool } from '../db.js';
import { ApiHandler } from '../types.js';

export interface DrySeasonPreset {
  id: string;
  label: string;
  from: string;
  to: string;
  status: 'complete' | 'partial';
  missing_days: string[];
}

export const handleMeta: ApiHandler = async (_ctx) => {
  const pool = getPool();
  if (!pool) {
    return {
      status: 200,
      json: {
        min_day: null,
        max_day: null,
        products: [],
        dry_seasons: [],
        default_window: null,
      },
    };
  }

  try {
    const minMaxRes = await query<{ min_day: string; max_day: string }>(`
      SELECT min(acq_date)::text as min_day, max(acq_date)::text as max_day
      FROM detections
    `);
    const min_day = minMaxRes.rows[0]?.min_day || null;
    const max_day = minMaxRes.rows[0]?.max_day || null;

    const prodsRes = await query<{ product: string }>(`
      SELECT DISTINCT product FROM ingest_coverage ORDER BY product
    `);
    const products = prodsRes.rows.map((r) => r.product);

    if (!min_day || !max_day) {
      return {
        status: 200,
        json: {
          min_day: null,
          max_day: null,
          products,
          dry_seasons: [],
          default_window: null,
        },
      };
    }

    // Generate dry seasons: 1 Nov to 30 Apr for every year with data
    const minYear = parseInt(min_day.slice(0, 4), 10);
    const maxYear = parseInt(max_day.slice(0, 4), 10);

    const drySeasons: DrySeasonPreset[] = [];
    const coreProducts = ['MODIS_SP', 'VIIRS_SNPP_SP', 'VIIRS_NOAA20_SP'];

    // For every year from minYear - 1 to maxYear
    for (let yr = maxYear; yr >= minYear - 1; yr--) {
      const startStr = `${yr}-11-01`;
      const endStr = `${yr + 1}-04-30`;

      // Check if this window overlaps with our min_day .. max_day
      if (endStr < min_day || startStr > max_day) {
        continue;
      }

      // Check coverage days for core products in this window
      const covRes = await query<{ product: string; day: string }>(
        `SELECT product, day::text FROM ingest_coverage
         WHERE day >= $1::date AND day <= $2::date AND product = ANY($3::text[])`,
        [startStr, endStr, coreProducts]
      );

      // Expected total days in dry season (Nov 1 to Apr 30 = 30 + 31 + 31 + 28/29 + 31 + 30 = 181 or 182)
      const daySet = new Map<string, Set<string>>();
      for (const cp of coreProducts) daySet.set(cp, new Set());

      for (const row of covRes.rows) {
        daySet.get(row.product)?.add(row.day);
      }

      // Calculate missing days
      const missingDays: string[] = [];
      const cur = new Date(startStr + 'T00:00:00Z');
      const end = new Date(endStr + 'T00:00:00Z');
      while (cur <= end) {
        const dStr = cur.toISOString().slice(0, 10);
        let hasAll = true;
        for (const cp of coreProducts) {
          if (!daySet.get(cp)?.has(dStr)) {
            hasAll = false;
            break;
          }
        }
        if (!hasAll) missingDays.push(dStr);
        cur.setUTCDate(cur.getUTCDate() + 1);
      }

      const isComplete = missingDays.length === 0;
      const nextYrShort = String(yr + 1).slice(2);

      drySeasons.push({
        id: `dry_${yr}_${nextYrShort}`,
        label: `Dry season ${yr}-${nextYrShort}`,
        from: startStr,
        to: endStr,
        status: isComplete ? 'complete' : 'partial',
        missing_days: missingDays,
      });
    }

    // Default window: most recent complete dry season; if none, latest 90 days present, labelled partial
    let defaultWindow: { from: string; to: string; label: string; status: 'complete' | 'partial' } | null = null;
    const latestComplete = drySeasons.find((d) => d.status === 'complete');
    if (latestComplete) {
      defaultWindow = {
        from: latestComplete.from,
        to: latestComplete.to,
        label: latestComplete.label,
        status: 'complete',
      };
    } else {
      const maxDateObj = new Date(max_day + 'T00:00:00Z');
      const ninetyDaysBefore = new Date(maxDateObj);
      ninetyDaysBefore.setUTCDate(ninetyDaysBefore.getUTCDate() - 89);
      const fromStr = ninetyDaysBefore.toISOString().slice(0, 10);
      defaultWindow = {
        from: fromStr < min_day ? min_day : fromStr,
        to: max_day,
        label: 'Recent 90 days',
        status: 'partial',
      };
    }

    return {
      status: 200,
      json: {
        min_day,
        max_day,
        products,
        dry_seasons: drySeasons,
        default_window: defaultWindow,
      },
    };
  } catch (err: any) {
    return {
      status: 500,
      json: { error: err.message },
    };
  }
};
