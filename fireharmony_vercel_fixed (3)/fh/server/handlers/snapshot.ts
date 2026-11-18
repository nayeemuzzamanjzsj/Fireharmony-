import { getCachedSnapshot, rebuildSnapshot } from '../snapshot.js';
import { ApiHandler } from '../types.js';

export const handleSnapshot: ApiHandler = async (_ctx) => {
  let snap = await getCachedSnapshot();
  if (!snap) {
    snap = await rebuildSnapshot();
  }

  if (!snap) {
    return {
      status: 200,
      json: {
        generated_at: new Date().toISOString(),
        first_day: null,
        last_day: null,
        rows: 0,
        products: [],
        field_order: [],
        data: [],
      },
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
      },
    };
  }

  return {
    status: 200,
    json: snap,
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
    },
  };
};
