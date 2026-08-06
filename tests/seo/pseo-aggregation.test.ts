/**
 * B1 (organic audit 2026-08): the aggregate-pseo cron was stuck at offset=0
 * since April — only 200 of 4,135 cities ever refreshed, and 647 gate-passing
 * category-city rows served frozen counts ("16 Open" vs 1 live job).
 *
 * The cron now completes the whole estate in one run via one
 * groupBy(city, state) pair per category, folded onto the CITIES registry by
 * the pure lib/pseo/aggregate-fold.ts. These tests cover the fold math and
 * source-lock the cron's new shape so offset batching can't quietly return.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  foldCategoryCityAggregates,
  stripLocationFromWhere,
  type CityCountGroup,
  type CitySalaryGroup,
} from '@/lib/pseo/aggregate-fold';

const read = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

const city = (slug: string, name: string, state: string, col = 100) => ({
  slug, name, state, costOfLivingIndex: col,
});

const count = (c: string, s: string, n: number): CityCountGroup => ({
  city: c, state: s, _count: { _all: n },
});

const sal = (c: string, s: string, n: number, min: number, max: number): CitySalaryGroup => ({
  city: c, state: s, _count: { _all: n },
  _avg: { normalizedMinSalary: min, normalizedMaxSalary: max },
});

describe('foldCategoryCityAggregates', () => {
  it('replicates the legacy per-combo salary math exactly', () => {
    const out = foldCategoryCityAggregates(
      [count('Bangor', 'Maine', 3)],
      [sal('Bangor', 'Maine', 2, 120000, 160000)],
      [city('bangor-me', 'Bangor', 'Maine', 95)],
    );
    // (120000 + 160000) / 2 / 1000 = 140; COL 95 -> round(140 * 100/95) = 147
    expect(out.get('bangor-me')).toEqual({
      totalJobs: 3,
      rawAvgSalary: 140,
      colAdjustedSalary: 147,
    });
  });

  it('merges case-variant city/state groups like equals-insensitive did', () => {
    const out = foldCategoryCityAggregates(
      [count('Bangor', 'Maine', 2), count('BANGOR', 'maine', 1)],
      [
        sal('Bangor', 'Maine', 1, 100000, 140000),
        sal('BANGOR', 'maine', 3, 120000, 160000),
      ],
      [city('bangor-me', 'Bangor', 'Maine')],
    );
    // counts: 2 + 1 = 3
    // weighted avgs: min (100000 + 3*120000)/4 = 115000, max (140000 + 3*160000)/4 = 155000
    // -> (115000 + 155000)/2/1000 = 135
    expect(out.get('bangor-me')).toEqual({
      totalJobs: 3,
      rawAvgSalary: 135,
      colAdjustedSalary: 135,
    });
  });

  it('omits cities with zero matching jobs (they get zeroed, not upserted)', () => {
    const out = foldCategoryCityAggregates(
      [count('Bangor', 'Maine', 1)],
      [],
      [city('bangor-me', 'Bangor', 'Maine'), city('la-grande-or', 'La Grande', 'Oregon')],
    );
    expect(out.has('la-grande-or')).toBe(false);
    expect(out.get('bangor-me')).toEqual({ totalJobs: 1, rawAvgSalary: 0, colAdjustedSalary: 0 });
  });

  it('ignores groups for cities outside the registry', () => {
    const out = foldCategoryCityAggregates(
      [count('Nowhere', 'Kansas', 9)],
      [],
      [city('bangor-me', 'Bangor', 'Maine')],
    );
    expect(out.size).toBe(0);
  });

  it('jobs without salary bounds produce rawAvg 0 and colAdjusted 0', () => {
    const out = foldCategoryCityAggregates(
      [count('Bangor', 'Maine', 4)],
      [], // no rows with both bounds
      [city('bangor-me', 'Bangor', 'Maine', 80)],
    );
    expect(out.get('bangor-me')).toEqual({ totalJobs: 4, rawAvgSalary: 0, colAdjustedSalary: 0 });
  });
});

describe('stripLocationFromWhere', () => {
  it('removes the top-level state/city keys and keeps category conditions', () => {
    const stripped = stripLocationFromWhere({
      isPublished: true,
      state: { equals: 'Maine', mode: 'insensitive' },
      city: { equals: 'Bangor', mode: 'insensitive' },
      OR: [{ categoryTags: { has: 'inpatient' } }],
    });
    expect(stripped).toEqual({
      isPublished: true,
      OR: [{ categoryTags: { has: 'inpatient' } }],
    });
  });

  it('handles configs without a city constraint (state-only buildWhere)', () => {
    const stripped = stripLocationFromWhere({
      isPublished: true,
      state: { equals: 'Maine', mode: 'insensitive' },
      OR: [{ categoryTags: { has: 'travel' } }, { categoryTags: { has: 'locum-tenens' } }],
    });
    expect(stripped).toEqual({
      isPublished: true,
      OR: [{ categoryTags: { has: 'travel' } }, { categoryTags: { has: 'locum-tenens' } }],
    });
  });
});

describe('aggregate-pseo cron shape (source lock)', () => {
  const src = read('app/api/cron/aggregate-pseo/route.ts');

  it('no longer slices CITIES by offset — the whole estate runs in one pass', () => {
    expect(src).not.toMatch(/CITIES\.slice\(/);
    expect(src).not.toMatch(/offset \+ BATCH_SIZE/);
  });

  it('uses one groupBy(city, state) per category via the pure fold', () => {
    expect(src).toMatch(/groupBy\(\{\s*by: \['city', 'state'\]/);
    expect(src).toMatch(/foldCategoryCityAggregates\(/);
    expect(src).toMatch(/stripLocationFromWhere\(/);
  });

  it('keeps contentChangedAt semantics: stamped only when values change', () => {
    expect(src).toMatch(/\.\.\.\(changed && \{ contentChangedAt: new Date\(\) \}\)/);
  });

  it('zeroes previously-positive rows whose city lost all jobs', () => {
    expect(src).toMatch(/totalJobs: 0, rawAvgSalary: 0, colAdjustedSalary: 0, contentChangedAt: new Date\(\)/);
  });

  it('logs per-category timing so runtime creep is visible', () => {
    expect(src).toMatch(/perCategoryMs/);
  });
});

describe('vercel.json cron registration', () => {
  it('registers the bare path (correct now that offset is a no-op)', () => {
    const vercel = JSON.parse(read('vercel.json')) as {
      crons: Array<{ path: string }>;
    };
    const entries = vercel.crons.filter((c) => c.path.includes('aggregate-pseo'));
    expect(entries.length).toBe(1);
    expect(entries[0].path).toBe('/api/cron/aggregate-pseo');
  });
});
