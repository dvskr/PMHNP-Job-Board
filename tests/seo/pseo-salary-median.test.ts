/**
 * The pSEO pages and /salary-guide/{state} now answer the same question the
 * same way.
 *
 * Until 2026-09 the aggregate-pseo cron computed a SQL mean of two column
 * means with no estimate filter, no quarantine and no sample-size gate, and
 * every pSEO city and setting page published it as "avg salary". The salary
 * guide, over the very same postings, published a tier-gated median of clean
 * midpoints from lib/salary-report/stats.ts, whose stated house rule is
 * "medians only, never means". So the two surfaces disagreed about pay in the
 * same state, and a confident dollar figure could rest on two listings.
 *
 * The fold is pure, which is the whole reason it was extracted, so these run
 * without a database.
 *
 * All fixtures are fictional.
 */
import { describe, it, expect } from 'vitest';
import {
  foldCategoryCityMedians,
  salaryFor,
  type CityCountGroup,
  type CitySalaryRow,
  type FoldCity,
} from '@/lib/pseo/aggregate-fold';
import { TIER_MEDIAN_MIN_N } from '@/lib/salary-report/stats';

const CITY: FoldCity = {
  slug: 'testville-oh',
  name: 'Testville',
  state: 'Ohio',
  costOfLivingIndex: 100,
};

const row = (min: number, max: number, estimated = false): CitySalaryRow => ({
  city: 'Testville',
  state: 'Ohio',
  normalizedMinSalary: min,
  normalizedMaxSalary: max,
  salaryIsEstimated: estimated,
});

const counts = (n: number): CityCountGroup[] => [
  { city: 'Testville', state: 'Ohio', _count: { _all: n } },
];

/** Five clean rows whose midpoints are 120k, 130k, 140k, 150k, 160k. */
const FIVE_CLEAN = [
  row(110_000, 130_000),
  row(120_000, 140_000),
  row(130_000, 150_000),
  row(140_000, 160_000),
  row(150_000, 170_000),
];

describe('salaryFor reports a median, not a mean', () => {
  it('takes the middle midpoint, so one outlier cannot drag the figure', () => {
    const withOutlier = [...FIVE_CLEAN, row(400_000, 420_000)];
    // Mean of the six midpoints is about 180k; the median is 145k.
    const { rawAvgSalary } = salaryFor(withOutlier, 100);
    expect(rawAvgSalary).toBeLessThan(160);
    expect(rawAvgSalary).toBeGreaterThan(130);
  });

  it('drops employer-estimated rows, which are not advertised pay', () => {
    const clean = salaryFor(FIVE_CLEAN, 100).rawAvgSalary;
    const polluted = salaryFor(
      [...FIVE_CLEAN, row(300_000, 320_000, true), row(310_000, 330_000, true)],
      100,
    ).rawAvgSalary;
    expect(polluted).toBe(clean);
  });

  it('quarantines an impossible range instead of publishing it', () => {
    // max/min far beyond the ratio gate: an annualisation defect, not a job.
    const clean = salaryFor(FIVE_CLEAN, 100).rawAvgSalary;
    expect(salaryFor([...FIVE_CLEAN, row(20_000, 900_000)], 100).rawAvgSalary).toBe(clean);
  });
});

describe('a thin sample publishes no dollar figure at all', () => {
  it.each([0, 1, 2, 3, 4])('says nothing on %i clean rows', (n) => {
    const { rawAvgSalary, colAdjustedSalary } = salaryFor(FIVE_CLEAN.slice(0, n), 100);
    expect(rawAvgSalary).toBe(0);
    expect(colAdjustedSalary).toBe(0);
  });

  it(`starts publishing at the engine's own threshold of ${TIER_MEDIAN_MIN_N}`, () => {
    expect(salaryFor(FIVE_CLEAN.slice(0, TIER_MEDIAN_MIN_N), 100).rawAvgSalary).toBeGreaterThan(0);
  });

  it('a page with jobs but no usable pay data still reports its jobs', () => {
    const folded = foldCategoryCityMedians(counts(9), [row(110_000, 130_000)], [CITY]);
    const stats = folded.get(CITY.slug);
    expect(stats?.totalJobs).toBe(9);
    expect(stats?.rawAvgSalary).toBe(0);
  });
});

describe('the fold keeps its existing contract', () => {
  it('reports jobs for a city that has them, in thousands', () => {
    const stats = foldCategoryCityMedians(counts(12), FIVE_CLEAN, [CITY]).get(CITY.slug);
    expect(stats?.totalJobs).toBe(12);
    // Median midpoint is 140k.
    expect(stats?.rawAvgSalary).toBe(140);
  });

  it('omits a city with no matching jobs rather than writing a zero row', () => {
    expect(foldCategoryCityMedians([], FIVE_CLEAN, [CITY]).has(CITY.slug)).toBe(false);
  });

  it('merges rows whose city or state differ only by casing', () => {
    const shouty = FIVE_CLEAN.map((r) => ({ ...r, city: 'TESTVILLE', state: 'OHIO' }));
    const stats = foldCategoryCityMedians(counts(12), shouty, [CITY])?.get(CITY.slug);
    expect(stats?.rawAvgSalary).toBe(140);
  });

  it('adjusts for cost of living against the city index', () => {
    const pricey = { ...CITY, costOfLivingIndex: 200 };
    const stats = foldCategoryCityMedians(counts(12), FIVE_CLEAN, [pricey]).get(pricey.slug);
    expect(stats?.rawAvgSalary).toBe(140);
    expect(stats?.colAdjustedSalary).toBe(70);
  });

  it('ignores rows with no city or state rather than crashing', () => {
    const orphans: CitySalaryRow[] = [
      { city: null, state: 'Ohio', normalizedMinSalary: 1, normalizedMaxSalary: 2 },
      { city: 'Testville', state: null, normalizedMinSalary: 1, normalizedMaxSalary: 2 },
    ];
    expect(() => foldCategoryCityMedians(counts(3), orphans, [CITY])).not.toThrow();
  });
});

describe('the cron and the live fallback use the one engine', () => {
  it('neither computes its own mean any more', async () => {
    const { readCode } = await import('../helpers/source');
    for (const file of [
      'app/api/cron/aggregate-pseo/route.ts',
      'lib/pseo/category-city-template.tsx',
    ]) {
      const src = readCode(file);
      // A _avg over the salary columns is the shape of the old defect.
      expect(src, file).not.toMatch(/_avg:\s*\{[^}]*normalized(Min|Max)Salary/);
      expect(src, file).toContain('salaryFor');
    }
  });
});
