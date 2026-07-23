/**
 * Salary stats engine invariants (lib/salary-report/stats.ts).
 *
 * These pins guard the honesty rules every published dollar figure relies
 * on: medians-only math, quarantine gates, and tier degradation by n.
 */
import { describe, it, expect } from 'vitest';
import {
  cleanSalaryRows,
  percentile,
  percentileRank,
  summarizeMidpoints,
  roundDisplayDollars,
  SALARY_SANITY_MIN,
  SALARY_SANITY_MAX,
} from '@/lib/salary-report/stats';

const row = (min: number | null, max: number | null, estimated = false) => ({
  normalizedMinSalary: min,
  normalizedMaxSalary: max,
  salaryIsEstimated: estimated,
});

describe('cleanSalaryRows — quarantine gates', () => {
  it('keeps clean rows and returns ascending midpoints', () => {
    const { midpoints, quarantined } = cleanSalaryRows([
      row(180000, 200000),
      row(120000, 140000),
    ]);
    expect(midpoints).toEqual([130000, 190000]);
    expect(quarantined).toBe(0);
  });

  it('missing bounds are skipped WITHOUT counting as quarantine', () => {
    const { midpoints, quarantined } = cleanSalaryRows([
      row(null, 200000),
      row(120000, null),
      row(null, null),
    ]);
    expect(midpoints).toEqual([]);
    expect(quarantined).toBe(0);
  });

  it('quarantines estimated rows, inverted ranges, ratio>3, and out-of-bounds midpoints', () => {
    const { midpoints, quarantined } = cleanSalaryRows([
      row(120000, 140000, true),          // estimated
      row(200000, 150000),                // max < min
      row(60000, 300000),                 // ratio 5x — annualization defect
      row(20000, 30000),                  // midpoint 25k < SALARY_SANITY_MIN
      row(500000, 600000),                // midpoint 550k > SALARY_SANITY_MAX
      row(150000, 170000),                // clean
    ]);
    expect(midpoints).toEqual([160000]);
    expect(quarantined).toBe(5);
  });

  it('sanity bounds are the documented $50k–$500k', () => {
    expect(SALARY_SANITY_MIN).toBe(50000);
    expect(SALARY_SANITY_MAX).toBe(500000);
  });
});

describe('percentile — linear interpolation', () => {
  const data = [100, 200, 300, 400, 500];

  it('median of odd-length array is the middle value', () => {
    expect(percentile(data, 50)).toBe(300);
  });

  it('interpolates between ranks', () => {
    expect(percentile([100, 200], 50)).toBe(150);
    expect(percentile(data, 25)).toBe(200);
    expect(percentile(data, 75)).toBe(400);
    expect(percentile(data, 10)).toBe(140);
  });

  it('clamps out-of-range p and handles singletons', () => {
    expect(percentile(data, -5)).toBe(100);
    expect(percentile(data, 400)).toBe(500);
    expect(percentile([42], 75)).toBe(42);
  });

  it('returns NaN on empty input', () => {
    expect(Number.isNaN(percentile([], 50))).toBe(true);
  });
});

describe('percentileRank — tie-aware rank', () => {
  it('value below all → 0, above all → 100', () => {
    expect(percentileRank([100, 200, 300], 50)).toBe(0);
    expect(percentileRank([100, 200, 300], 999)).toBe(100);
  });

  it('exact middle of symmetric set reads as 50th percentile', () => {
    expect(percentileRank([100, 200, 300], 200)).toBe(50);
  });

  it('half-credit for ties', () => {
    expect(percentileRank([100, 100, 100, 100], 100)).toBe(50);
  });

  it('returns NaN on empty input', () => {
    expect(Number.isNaN(percentileRank([], 100))).toBe(true);
  });
});

describe('summarizeMidpoints — tier degradation by n', () => {
  const asc = (n: number) => Array.from({ length: n }, (_, i) => 100000 + i * 1000);

  it('n>=10 → full stats with p25/median/p75', () => {
    const s = summarizeMidpoints(asc(10));
    expect(s.tier).toBe('full');
    if (s.tier === 'full') {
      expect(s.n).toBe(10);
      expect(s.p25).toBeLessThan(s.median);
      expect(s.median).toBeLessThan(s.p75);
    }
  });

  it('n=5..9 → median only, no p25/p75 leak', () => {
    const s = summarizeMidpoints(asc(5));
    expect(s.tier).toBe('median');
    expect((s as Record<string, unknown>).p25).toBeUndefined();
    const s9 = summarizeMidpoints(asc(9));
    expect(s9.tier).toBe('median');
  });

  it('n=3..4 → count only, NO dollar figures at all', () => {
    const s = summarizeMidpoints(asc(3));
    expect(s.tier).toBe('countOnly');
    expect((s as Record<string, unknown>).median).toBeUndefined();
    expect(summarizeMidpoints(asc(4)).tier).toBe('countOnly');
  });

  it('n<3 → none', () => {
    expect(summarizeMidpoints(asc(2)).tier).toBe('none');
    expect(summarizeMidpoints([]).tier).toBe('none');
  });
});

describe('roundDisplayDollars', () => {
  it('rounds to nearest $500', () => {
    expect(roundDisplayDollars(151_249)).toBe(151_000);
    expect(roundDisplayDollars(151_250)).toBe(151_500);
  });
});
