import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  wilsonInterval,
  fitDeming,
  fitOLS,
  spearmanCorr,
  bootstrapDemingSlope,
  computeSpikesMAD,
  createMulberry32,
} from '../server/analysis/math.js';
import {
  fuseEvents,
  RawDetectionItem,
} from '../server/analysis/fusion.js';
import {
  computeSensorAgreement,
} from '../server/analysis/agreement.js';
import {
  analyzePersistentHeat,
} from '../server/analysis/persistent.js';

describe('Harmonization Math & Statistical Algorithms Unit Tests', () => {
  it('computes Wilson 95% score confidence interval with hand-computed values', () => {
    // k = 50, n = 100, z = 1.96
    // p = 0.5, z^2 = 3.8416
    // denom = 1 + 3.8416 / 100 = 1.038416
    // centre = (0.5 + 3.8416 / 200) / 1.038416 = 0.519208 / 1.038416 = 0.50000
    // half_width = 1.96 * sqrt(0.25/100 + 3.8416/40000) / 1.038416 = 0.09797
    const w = wilsonInterval(50, 100);
    assert.ok(Math.abs(w.centre - 0.50) < 0.01);
    assert.ok(Math.abs(w.lower - 0.402) < 0.01);
    assert.ok(Math.abs(w.upper - 0.598) < 0.01);

    // Extreme case k = 0, n = 20
    const w0 = wilsonInterval(0, 20);
    assert.strictEqual(w0.lower, 0);
    assert.ok(w0.upper > 0 && w0.upper < 0.2);

    // Empty case
    const wEmpty = wilsonInterval(0, 0);
    assert.strictEqual(wEmpty.centre, 0);
  });

  it('fits Deming regression (delta = 1) with known linear coordinates', () => {
    // Exact y = 2x + 1
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const y = [3, 5, 7, 9, 11, 13, 15, 17, 19, 21];
    const dem = fitDeming(x, y, 1.0);
    assert.ok(dem !== null);
    assert.ok(Math.abs(dem.slope - 2.0) < 0.001);
    assert.ok(Math.abs(dem.intercept - 1.0) < 0.001);
  });

  it('fits OLS regression and calculates R-squared correctly', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [2, 4, 6, 8, 10];
    const ols = fitOLS(x, y);
    assert.ok(ols !== null);
    assert.ok(Math.abs(ols.slope - 2.0) < 0.001);
    assert.ok(Math.abs(ols.r2 - 1.0) < 0.001);
  });

  it('computes Spearman rank correlation accurately', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [10, 20, 30, 40, 50];
    const rho = spearmanCorr(x, y);
    assert.ok(Math.abs(rho - 1.0) < 0.001);

    // Inverted ranks: -1.0
    const yInv = [50, 40, 30, 20, 10];
    const rhoInv = spearmanCorr(x, yInv);
    assert.ok(Math.abs(rhoInv - (-1.0)) < 0.001);
  });

  it('computes MAD spike rule for daily series', () => {
    // 30 normal days of count 10, plus one spike of count 100
    const series = Array.from({ length: 30 }, (_, i) => ({
      date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      count: 10,
    }));
    series.push({ date: '2024-01-31', count: 100 });

    const spikes = computeSpikesMAD(series);
    assert.strictEqual(spikes.spikeDays.length, 1);
    assert.strictEqual(spikes.spikeDays[0], '2024-01-31');
    assert.strictEqual(spikes.median, 10);
  });

  it('guarantees seeded bootstrap reproducibility (mulberry32 seed 42)', () => {
    // Generate 35 pseudo-random points
    const rng = createMulberry32(1234);
    const x = Array.from({ length: 35 }, () => rng() * 50 + 5);
    const y = x.map((v) => v * 1.5 + (rng() - 0.5) * 5);

    const run1 = bootstrapDemingSlope(x, y, 500, 42);
    const run2 = bootstrapDemingSlope(x, y, 500, 42);

    assert.ok(run1 !== null && run2 !== null);
    assert.strictEqual(run1.lower, run2.lower);
    assert.strictEqual(run1.upper, run2.upper);
  });

  it('enforces event fusion invariants: never exceeds 5.0 km extent or 48 h duration', () => {
    // Point 1: Dhaka, 00:00
    // Point 2: 1 km away, 02:00
    // Point 3: 10 km away (should not fuse)
    // Point 4: 1 km away, but 60 hours later (should not fuse)
    const detections: RawDetectionItem[] = [
      {
        acq_date: '2024-01-01',
        acq_time: 100, // 01:00 UTC
        platform: 1,
        lat_i: 238100,
        lon_i: 904100,
        frp: 15,
        conf_class: 2,
        conf_raw: 85,
        night: false,
        sp: true,
        district: 1,
      },
      {
        acq_date: '2024-01-01',
        acq_time: 200, // 02:00 UTC (~1 hr later)
        platform: 3,
        lat_i: 238150,
        lon_i: 904120, // ~0.5 km away
        frp: 20,
        conf_class: 2,
        conf_raw: null,
        night: false,
        sp: true,
        district: 1,
      },
      {
        acq_date: '2024-01-01',
        acq_time: 200,
        platform: 4,
        lat_i: 245000, // ~70 km away
        lon_i: 904120,
        frp: 30,
        conf_class: 2,
        conf_raw: null,
        night: false,
        sp: true,
        district: 2,
      },
      {
        acq_date: '2024-01-10', // 9 days later
        acq_time: 200,
        platform: 2,
        lat_i: 238100,
        lon_i: 904100,
        frp: 12,
        conf_class: 2,
        conf_raw: 80,
        night: false,
        sp: true,
        district: 1,
      },
    ];

    const events = fuseEvents(detections);
    assert.strictEqual(events.length, 3);

    for (const ev of events) {
      assert.ok(ev.extent_km <= 5.0, `Event extent ${ev.extent_km} exceeded 5.0 km cap`);
      assert.ok(ev.duration_hours <= 48, `Event duration ${ev.duration_hours} exceeded 48h cap`);
    }

    // First event should have 2 members (point 1 and point 2)
    const multiEv = events.find((e) => e.member_count === 2);
    assert.ok(multiEv !== undefined);
    assert.strictEqual(multiEv.label, 'Multi-sensor agreement');
  });

  it('computes agreement matching and eligibility accurately', () => {
    // Point 1: MODIS at (23.81, 90.41), time 04:30
    // Point 2: VIIRS at (23.815, 90.412), time 04:45 (diff: 15 min, dist < 1 km) -> matched!
    // Point 3: MODIS at (22.50, 91.50), time 14:00 (no VIIRS at that time) -> not eligible
    const detections: RawDetectionItem[] = [
      {
        acq_date: '2024-01-15',
        acq_time: 430,
        platform: 1, // MODIS
        lat_i: 238100,
        lon_i: 904100,
        frp: 15,
        conf_class: 2,
        conf_raw: 80,
        night: false,
        sp: true,
        district: 1,
      },
      {
        acq_date: '2024-01-15',
        acq_time: 445,
        platform: 3, // VIIRS
        lat_i: 238150,
        lon_i: 904120,
        frp: 25,
        conf_class: 2,
        conf_raw: null,
        night: false,
        sp: true,
        district: 1,
      },
      {
        acq_date: '2024-01-15',
        acq_time: 1400,
        platform: 2, // MODIS
        lat_i: 225000,
        lon_i: 915000,
        frp: 10,
        conf_class: 2,
        conf_raw: 75,
        night: true,
        sp: true,
        district: 2,
      },
    ];

    const agreement = computeSensorAgreement(detections);
    assert.strictEqual(agreement.modis.eligible, 1);
    assert.strictEqual(agreement.modis.matched, 1);
    assert.strictEqual(agreement.modis.rate, 1);

    assert.strictEqual(agreement.viirs.eligible, 1);
    assert.strictEqual(agreement.viirs.matched, 1);
    assert.strictEqual(agreement.viirs.rate, 1);
  });

  it('flags suspected persistent heat cells when active days and months thresholds are met', () => {
    // 120-day window
    // Cell A: active on 35 distinct days across 4 distinct months (should be flagged)
    // Cell B: active on only 3 days in 1 month (should NOT be flagged)
    const detections: RawDetectionItem[] = [];

    // Cell A (lat_i: 238500, lon_i: 904500) -> cell key: 2385, 9045
    const months = ['01', '02', '03', '04'];
    let dayCount = 0;
    for (const m of months) {
      for (let d = 1; d <= 9; d++) {
        dayCount++;
        detections.push({
          acq_date: `2024-${m}-${String(d).padStart(2, '0')}`,
          acq_time: 1300,
          platform: 3, // VIIRS
          lat_i: 238520,
          lon_i: 904510,
          frp: 18,
          conf_class: 2,
          conf_raw: null,
          night: false,
          sp: true,
          district: 1,
        });
      }
    }

    // Cell B (lat_i: 221000, lon_i: 912000)
    for (let d = 1; d <= 3; d++) {
      detections.push({
        acq_date: `2024-01-${String(d).padStart(2, '0')}`,
        acq_time: 1300,
        platform: 3,
        lat_i: 221050,
        lon_i: 912050,
        frp: 8,
        conf_class: 2,
        conf_raw: null,
        night: false,
        sp: true,
        district: 2,
      });
    }

    const res = analyzePersistentHeat(detections, 120, 0.25, 3);
    assert.strictEqual(res.total_flagged, 1);
    assert.strictEqual(res.flagged_cells[0].cell_key, '2385,9045');
    assert.strictEqual(res.flagged_cells[0].distinct_months, 4);
    assert.strictEqual(res.flagged_cells[0].active_days, 36);
  });
});
