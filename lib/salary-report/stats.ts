/**
 * Salary statistics engine — the single source of truth for every
 * dollar figure the site publishes about advertised pay (salary guide,
 * offer analyzer, future salary reports).
 *
 * House rules, enforced here so no surface can drift:
 *   - Medians and percentiles only, never means (means are dragged by the
 *     annualization defects and single-employer flooding found in the
 *     2026-07 audit).
 *   - Only rows with BOTH normalized bounds and salaryIsEstimated=false.
 *   - Fixed sanity bounds: midpoints outside $50k–$500k/yr are quarantined.
 *   - Ratio quarantine: max/min > 3 means a parsing/annualization defect.
 *   - Tiered gating by sample size — small n must degrade honestly:
 *       n >= 10  → full stats (p25 / median / p75)
 *       5 – 9    → median only
 *       3 – 4    → count only, NO dollar figures
 *       < 3      → nothing
 *   - Every figure travels with its n. Framing is always "advertised pay",
 *     never "what PMHNPs earn".
 */

export const SALARY_SANITY_MIN = 50_000;
export const SALARY_SANITY_MAX = 500_000;
export const MAX_RANGE_RATIO = 3;

export const TIER_FULL_MIN_N = 10;
export const TIER_MEDIAN_MIN_N = 5;
export const TIER_COUNT_MIN_N = 3;

export interface SalaryRow {
  normalizedMinSalary: number | null;
  normalizedMaxSalary: number | null;
  salaryIsEstimated?: boolean | null;
}

export interface CleanResult {
  /** Ascending advertised-midpoint values ($/yr) that survived every gate. */
  midpoints: number[];
  /** Rows dropped by the sanity/ratio/estimated gates (not missing-data rows). */
  quarantined: number;
}

export type SalaryTierSummary =
  | { tier: 'full'; n: number; p25: number; median: number; p75: number }
  | { tier: 'median'; n: number; median: number }
  | { tier: 'countOnly'; n: number }
  | { tier: 'none'; n: number };

/**
 * Filter raw rows down to trustworthy advertised midpoints, ascending.
 */
export function cleanSalaryRows(rows: SalaryRow[]): CleanResult {
  const midpoints: number[] = [];
  let quarantined = 0;

  for (const row of rows) {
    const min = row.normalizedMinSalary;
    const max = row.normalizedMaxSalary;
    if (min == null || max == null) continue; // missing data — not quarantine
    if (row.salaryIsEstimated) { quarantined++; continue; }
    if (min <= 0 || max < min) { quarantined++; continue; }
    if (max / min > MAX_RANGE_RATIO) { quarantined++; continue; }
    const mid = (min + max) / 2;
    if (mid < SALARY_SANITY_MIN || mid > SALARY_SANITY_MAX) { quarantined++; continue; }
    midpoints.push(mid);
  }

  return { midpoints: [...midpoints].sort((a, b) => a - b), quarantined };
}

/**
 * Linear-interpolated percentile of an ASCENDING-sorted array.
 * p in [0, 100]. Returns NaN on empty input (callers gate on n first).
 */
export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return NaN;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const clamped = Math.min(100, Math.max(0, p));
  const rank = (clamped / 100) * (sortedAsc.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (rank - lo);
}

/**
 * Percent of values strictly below `value`, with half-credit for ties —
 * the standard percentile-rank definition, so a value equal to the median
 * of a symmetric set reads as the 50th percentile. Returns NaN on empty.
 */
export function percentileRank(sortedAsc: number[], value: number): number {
  const n = sortedAsc.length;
  if (n === 0) return NaN;
  let below = 0;
  let equal = 0;
  for (const v of sortedAsc) {
    if (v < value) below++;
    else if (v === value) equal++;
    else break; // sorted — nothing further can be < or ==
  }
  return ((below + equal / 2) / n) * 100;
}

/**
 * Collapse a cleaned midpoint set into the largest tier its n supports.
 */
export function summarizeMidpoints(sortedAsc: number[]): SalaryTierSummary {
  const n = sortedAsc.length;
  if (n >= TIER_FULL_MIN_N) {
    return {
      tier: 'full',
      n,
      p25: percentile(sortedAsc, 25),
      median: percentile(sortedAsc, 50),
      p75: percentile(sortedAsc, 75),
    };
  }
  if (n >= TIER_MEDIAN_MIN_N) {
    return { tier: 'median', n, median: percentile(sortedAsc, 50) };
  }
  if (n >= TIER_COUNT_MIN_N) {
    return { tier: 'countOnly', n };
  }
  return { tier: 'none', n };
}

/** Round a dollar figure for display — nearest $500 keeps small-n medians honest. */
export function roundDisplayDollars(v: number): number {
  return Math.round(v / 500) * 500;
}
