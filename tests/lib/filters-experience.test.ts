/**
 * Phase 1 filter wiring tests.
 *
 * Covers the four entry points where the new experience filters could
 * silently drift:
 *
 *   1. buildWhereClause — translates FilterState into Prisma WHERE.
 *      A regression here would let an "Open to new grads" filter return
 *      jobs that aren't actually flagged newGradFriendly.
 *   2. parseFiltersFromParams — reads URL search params into FilterState.
 *   3. filtersToParams — serializes FilterState back into URL params.
 *      Together (2) and (3) must round-trip so deep-linked filter URLs
 *      survive a refresh.
 *
 * No DB calls — we assert on the Prisma `where` shape directly.
 */
import { describe, it, expect } from 'vitest';
import {
  buildWhereClause,
  parseFiltersFromParams,
  filtersToParams,
} from '@/lib/filters';
import { DEFAULT_FILTERS } from '@/types/filters';

describe('buildWhereClause — experience filters', () => {
  it('omits experience clauses when both filters are null (default)', () => {
    const where = buildWhereClause(DEFAULT_FILTERS);
    const json = JSON.stringify(where);
    expect(json).not.toContain('newGradFriendly');
    expect(json).not.toContain('minYearsExperience');
  });

  it('emits newGradFriendly: true when the toggle is active', () => {
    const where = buildWhereClause({ ...DEFAULT_FILTERS, newGradFriendly: true });
    expect(JSON.stringify(where)).toContain('"newGradFriendly":true');
  });

  it('unifies the newGrad toggle with the /jobs/new-grad category logic', () => {
    // Bug fix (2026-05-14): the `?newGrad=1` checkbox previously only
    // matched rows where the boolean column was true, while the
    // /jobs/new-grad category page also accepted title/level patterns
    // via CATEGORY_FILTERS. The two surfaces disagreed (167 vs 29).
    // The unified WHERE must wrap both signals in an OR and apply the
    // category's exclusion rules.
    const where = buildWhereClause({ ...DEFAULT_FILTERS, newGradFriendly: true });
    const json = JSON.stringify(where);
    // Title patterns from CATEGORY_FILTERS['new-grad'] must be present.
    // Note: bare 'fellowship' / 'residency' were tightened to require
    // the 'program' suffix on 2026-05-15 so post-grad APP fellowships
    // (requiring 3-5 yrs prior experience) don't get classified here.
    expect(json).toContain('"contains":"residency program"');
    expect(json).toContain('"contains":"fellowship program"');
    expect(json).toContain('"contains":"new grad"');
    // Exclusion clauses from CATEGORY_EXCLUSIONS['new-grad'] must appear
    // as NOT branches alongside the OR (e.g. "no new grad" titles).
    expect(json).toContain('"contains":"no new grad"');
    expect(json).toContain('"NOT"');
  });

  it('does NOT filter when newGradFriendly is null (no preference)', () => {
    const where = buildWhereClause({ ...DEFAULT_FILTERS, newGradFriendly: null });
    expect(JSON.stringify(where)).not.toContain('newGradFriendly');
  });

  it('emits minYearsExperience as lte OR null (candidate-qualifies semantics)', () => {
    // Candidate has 5 years → match jobs where the employer requires
    // ≤ 5 years OR didn't specify a requirement. Without the null
    // branch, ~all aggregated jobs without explicit min fall out of
    // the filter and the count looks suspiciously low.
    const where = buildWhereClause({ ...DEFAULT_FILTERS, minYearsExperience: 5 });
    const json = JSON.stringify(where);
    expect(json).toContain('"minYearsExperience":{"lte":5}');
    expect(json).toContain('"minYearsExperience":null');
  });

  it('accepts 0 as a valid minYearsExperience (candidate has no experience)', () => {
    const where = buildWhereClause({ ...DEFAULT_FILTERS, minYearsExperience: 0 });
    const json = JSON.stringify(where);
    expect(json).toContain('"minYearsExperience":{"lte":0}');
    expect(json).toContain('"minYearsExperience":null');
  });

  it('emits both clauses when both filters are active', () => {
    const where = buildWhereClause({
      ...DEFAULT_FILTERS,
      newGradFriendly: true,
      minYearsExperience: 5,
    });
    const json = JSON.stringify(where);
    expect(json).toContain('"newGradFriendly":true');
    expect(json).toContain('"minYearsExperience":{"lte":5}');
    expect(json).toContain('"minYearsExperience":null');
  });
});

describe('parseFiltersFromParams — experience filters', () => {
  it('parses newGrad=1 as newGradFriendly: true', () => {
    const filters = parseFiltersFromParams(new URLSearchParams('newGrad=1'));
    expect(filters.newGradFriendly).toBe(true);
  });

  it('treats missing newGrad as null (no preference)', () => {
    expect(parseFiltersFromParams(new URLSearchParams('')).newGradFriendly).toBeNull();
  });

  it('treats newGrad=0 / other values as null (only "1" turns it on)', () => {
    expect(parseFiltersFromParams(new URLSearchParams('newGrad=0')).newGradFriendly).toBeNull();
    expect(parseFiltersFromParams(new URLSearchParams('newGrad=yes')).newGradFriendly).toBeNull();
  });

  it('parses minYears=5 as number', () => {
    expect(parseFiltersFromParams(new URLSearchParams('minYears=5')).minYearsExperience).toBe(5);
  });

  it('rejects non-numeric minYears as null', () => {
    expect(
      parseFiltersFromParams(new URLSearchParams('minYears=abc')).minYearsExperience,
    ).toBeNull();
    expect(
      parseFiltersFromParams(new URLSearchParams('minYears=-1')).minYearsExperience,
    ).toBeNull();
  });
});

describe('filtersToParams — experience filters', () => {
  it('emits newGrad=1 when the toggle is true', () => {
    const params = filtersToParams({ ...DEFAULT_FILTERS, newGradFriendly: true });
    expect(params.get('newGrad')).toBe('1');
  });

  it('omits newGrad when the toggle is null', () => {
    const params = filtersToParams(DEFAULT_FILTERS);
    expect(params.has('newGrad')).toBe(false);
  });

  it('emits minYears when set', () => {
    const params = filtersToParams({ ...DEFAULT_FILTERS, minYearsExperience: 5 });
    expect(params.get('minYears')).toBe('5');
  });

  it('emits minYears=0 (zero is a valid candidate signal — they have no exp yet)', () => {
    const params = filtersToParams({ ...DEFAULT_FILTERS, minYearsExperience: 0 });
    expect(params.get('minYears')).toBe('0');
  });

  it('round-trips: filtersToParams → parseFiltersFromParams preserves both fields', () => {
    const original = {
      ...DEFAULT_FILTERS,
      newGradFriendly: true,
      minYearsExperience: 7,
    };
    const round = parseFiltersFromParams(new URLSearchParams(filtersToParams(original).toString()));
    expect(round.newGradFriendly).toBe(true);
    expect(round.minYearsExperience).toBe(7);
  });
});
