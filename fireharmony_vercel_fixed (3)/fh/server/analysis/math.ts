// Mathematical and Statistical utilities for FireHarmony

export interface Interval95 {
  centre: number;
  lower: number;
  upper: number;
  half_width: number;
}

export function wilsonInterval(k: number, n: number, z = 1.96): Interval95 {
  if (n <= 0) {
    return { centre: 0, lower: 0, upper: 0, half_width: 0 };
  }
  const p = Math.max(0, Math.min(1, k / n));
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half_width = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  const lower = Math.max(0, centre - half_width);
  const upper = Math.min(1, centre + half_width);
  return { centre, lower, upper, half_width };
}

// Seeded pseudorandom generator (mulberry32)
export function createMulberry32(seed: number) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function fitDeming(x: number[], y: number[], delta = 1.0): { slope: number; intercept: number } | null {
  const n = x.length;
  if (n < 2) return null;

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
  }
  const mx = sumX / n;
  const my = sumY / n;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  sxx /= n - 1;
  syy /= n - 1;
  sxy /= n - 1;

  if (Math.abs(sxy) < 1e-12) {
    return { slope: 1, intercept: my - mx };
  }

  // slope = (syy - delta*sxx + sqrt((syy - delta*sxx)^2 + 4*delta*sxy^2)) / (2*sxy)
  const term = syy - delta * sxx;
  const slope = (term + Math.sqrt(term * term + 4 * delta * sxy * sxy)) / (2 * sxy);
  const intercept = my - slope * mx;

  return { slope, intercept };
}

export function fitOLS(x: number[], y: number[]): { slope: number; intercept: number; r2: number } | null {
  const n = x.length;
  if (n < 2) return null;

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
  }
  const mx = sumX / n;
  const my = sumY / n;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }

  if (sxx === 0 || syy === 0) {
    return { slope: 0, intercept: my, r2: 0 };
  }

  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r2 = (sxy * sxy) / (sxx * syy);

  return { slope, intercept, r2 };
}

export function spearmanCorr(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return 0;

  const rank = (arr: number[]) => {
    const indexed = arr.map((val, idx) => ({ val, idx }));
    indexed.sort((a, b) => a.val - b.val);
    const ranks = new Array(n);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j < n - 1 && indexed[j + 1].val === indexed[j].val) {
        j++;
      }
      const avgRank = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) {
        ranks[indexed[k].idx] = avgRank;
      }
      i = j + 1;
    }
    return ranks;
  };

  const rx = rank(x);
  const ry = rank(y);

  let d2 = 0;
  for (let i = 0; i < n; i++) {
    const diff = rx[i] - ry[i];
    d2 += diff * diff;
  }

  return 1 - (6 * d2) / (n * (n * n - 1));
}

export function bootstrapDemingSlope(
  x: number[],
  y: number[],
  resamples = 1000,
  seed = 42
): { lower: number; upper: number } | null {
  const n = x.length;
  if (n < 30) return null;

  const rng = createMulberry32(seed);
  const slopes: number[] = [];

  for (let b = 0; b < resamples; b++) {
    const bx: number[] = new Array(n);
    const by: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(rng() * n);
      bx[i] = x[idx];
      by[i] = y[idx];
    }
    const fit = fitDeming(bx, by);
    if (fit && Number.isFinite(fit.slope)) {
      slopes.push(fit.slope);
    }
  }

  if (slopes.length < resamples * 0.8) return null;
  slopes.sort((a, b) => a - b);

  const lowIdx = Math.floor(0.025 * slopes.length);
  const highIdx = Math.floor(0.975 * slopes.length);

  return {
    lower: slopes[lowIdx],
    upper: slopes[highIdx],
  };
}

export function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export function computeMAD(values: number[], median: number): number {
  if (values.length === 0) return 0;
  const diffs = values.map((v) => Math.abs(v - median));
  return computeMedian(diffs);
}

export function computeSpikesMAD(dailySeries: { date: string; count: number }[]): {
  spikeDays: string[];
  threshold: number;
  median: number;
  mad: number;
} {
  if (dailySeries.length < 30) {
    return { spikeDays: [], threshold: 0, median: 0, mad: 0 };
  }

  const counts = dailySeries.map((s) => s.count);
  const median = computeMedian(counts);
  const mad = computeMAD(counts, median);
  // spike rule: daily count > median + 3 * (1.4826 * MAD)
  const threshold = median + 3 * (1.4826 * mad);

  const spikeDays = dailySeries
    .filter((s) => s.count > threshold)
    .map((s) => s.date);

  return { spikeDays, threshold, median, mad };
}
