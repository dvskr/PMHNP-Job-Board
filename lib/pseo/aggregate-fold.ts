/**
 * lib/pseo/aggregate-fold.ts — pure fold logic for the aggregate-pseo cron
 * (B1, organic audit 2026-08).
 *
 * The cron used to run one count + one aggregate per (category, city) combo,
 * batched 200 cities at a time behind an ?offset param that nothing ever
 * advanced — so 3,935 of 4,135 cities were frozen since April. It now runs
 * ONE groupBy(city, state) per category and folds the groups onto the CITIES
 * registry here. This module is pure so the fold is unit-testable without a
 * database.
 *
 * Semantics replicate the old per-combo queries exactly:
 *   - totalJobs   = count of ALL matching jobs in the (city, state)
 *   - rawAvgSalary = Math.round((avgMin + avgMax) / 2 / 1000) over the subset
 *     with BOTH normalized bounds present; 0 when no such rows
 *   - colAdjustedSalary = rawAvg > 0 ? Math.round(rawAvg * 100 / COL) : 0
 *
 * The old queries matched city/state with `equals, mode: 'insensitive'`, so
 * groups that differ only by casing are merged case-insensitively; salary
 * averages are recombined as count-weighted means (mathematically identical
 * to averaging the union).
 */

export interface CityCountGroup {
  city: string | null;
  state: string | null;
  _count: { _all: number };
}

export interface CitySalaryGroup extends CityCountGroup {
  _avg: {
    normalizedMinSalary: number | null;
    normalizedMaxSalary: number | null;
  };
}

/** The subset of CityData the fold needs (keeps tests dependency-free). */
export interface FoldCity {
  slug: string;
  name: string;
  state: string;
  costOfLivingIndex: number;
}

export interface AggregatedCityStats {
  totalJobs: number;
  rawAvgSalary: number;
  colAdjustedSalary: number;
}

const groupKey = (city: string, state: string): string =>
  `${city.toLowerCase()}|${state.toLowerCase()}`;

/**
 * Strip the location constraints from a category config's buildWhere output.
 *
 * Every ALL_CATEGORY_CONFIGS buildWhere returns a flat object with top-level
 * `state` / `city` equality keys plus the category conditions (top-level OR /
 * isPublished) — see lib/pseo/category-city-template.tsx. Removing the two
 * location keys yields the category-wide where-clause the per-category
 * groupBy needs. tests/seo/pseo-aggregation.test.ts locks this contract.
 */
export function stripLocationFromWhere(
  where: Record<string, unknown>,
): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { state: _state, city: _city, ...rest } = where;
  return rest;
}

/**
 * Fold per-(city,state) groupBy results onto the CITIES registry.
 *
 * Returns ONLY cities with at least one matching job — the cron upserts
 * those, and zeroes previously-positive rows that fell out of the map.
 * Cities absent from the registry are ignored (same as the old loop, which
 * only ever iterated registry entries).
 */
export function foldCategoryCityAggregates(
  countGroups: ReadonlyArray<CityCountGroup>,
  salaryGroups: ReadonlyArray<CitySalaryGroup>,
  cities: ReadonlyArray<FoldCity | undefined>,
): Map<string, AggregatedCityStats> {
  // Merge count groups case-insensitively.
  const totals = new Map<string, number>();
  for (const g of countGroups) {
    if (!g.city || !g.state) continue;
    const key = groupKey(g.city, g.state);
    totals.set(key, (totals.get(key) ?? 0) + g._count._all);
  }

  // Merge salary groups as count-weighted sums.
  const salary = new Map<string, { n: number; minSum: number; maxSum: number }>();
  for (const g of salaryGroups) {
    if (!g.city || !g.state) continue;
    const n = g._count._all;
    if (n <= 0) continue;
    const key = groupKey(g.city, g.state);
    const prev = salary.get(key) ?? { n: 0, minSum: 0, maxSum: 0 };
    salary.set(key, {
      n: prev.n + n,
      minSum: prev.minSum + (g._avg.normalizedMinSalary ?? 0) * n,
      maxSum: prev.maxSum + (g._avg.normalizedMaxSalary ?? 0) * n,
    });
  }

  const result = new Map<string, AggregatedCityStats>();
  for (const city of cities) {
    if (!city) continue;
    const key = groupKey(city.name, city.state);
    const totalJobs = totals.get(key) ?? 0;
    if (totalJobs <= 0) continue;

    const sal = salary.get(key);
    const rawAvgSalary = sal && sal.n > 0
      ? Math.round((sal.minSum / sal.n + sal.maxSum / sal.n) / 2 / 1000)
      : 0;
    const colAdjustedSalary = rawAvgSalary > 0
      ? Math.round(rawAvgSalary * (100 / city.costOfLivingIndex))
      : 0;

    result.set(city.slug, { totalJobs, rawAvgSalary, colAdjustedSalary });
  }

  return result;
}
