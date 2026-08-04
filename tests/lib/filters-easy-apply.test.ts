/**
 * "Direct employers / Easy Apply" filter — clause shape, URL round-trip, and
 * cross-surface parity locks.
 *
 * 2026-08 audit: no candidate-facing way existed to browse only
 * employer-posted (revenue) jobs. The filter is one shared clause
 * (lib/filters.ts easyApplyClause) consumed by buildWhereClause, the
 * filter-counts route, and the /jobs/easy-apply landing page, so the checkbox
 * predicate, its badge count, and the pSEO page can never diverge.
 *
 * Follows tests/lib/filter-clauses-parity.test.ts (pure clause shape) plus
 * the source-reading regression-lock style of tests/api/renewal-cta.test.ts
 * for the surfaces that must keep consuming the shared clause.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Prisma } from '@prisma/client';
import {
  buildWhereClause,
  easyApplyClause,
  filtersToParams,
  parseFiltersFromParams,
} from '@/lib/filters';
import { DEFAULT_FILTERS } from '@/types/filters';

const read = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

/** buildWhereClause always emits AND as an array (GLOBAL_EXCLUSIONS ≥ 1). */
function andConditions(where: Prisma.JobWhereInput): Prisma.JobWhereInput[] {
  expect(Array.isArray(where.AND)).toBe(true);
  return where.AND as Prisma.JobWhereInput[];
}

describe('easyApplyClause', () => {
  it('matches employer-posted OR apply-on-platform jobs', () => {
    expect(easyApplyClause()).toEqual({
      OR: [
        { sourceType: 'employer' },
        { applyOnPlatform: true },
      ],
    });
  });

  it('buildWhereClause embeds the identical clause when easyApply is true', () => {
    const where = buildWhereClause({ ...DEFAULT_FILTERS, easyApply: true });
    expect(andConditions(where)).toContainEqual(easyApplyClause());
  });

  it('buildWhereClause does NOT constrain source when easyApply is null (default)', () => {
    const where = buildWhereClause({ ...DEFAULT_FILTERS });
    expect(andConditions(where)).not.toContainEqual(easyApplyClause());
  });
});

describe('easyApply URL round-trip', () => {
  it('serializes true as easyApply=1', () => {
    const params = filtersToParams({ ...DEFAULT_FILTERS, easyApply: true });
    expect(params.get('easyApply')).toBe('1');
  });

  it('omits the param when null (default state keeps clean URLs)', () => {
    const params = filtersToParams({ ...DEFAULT_FILTERS });
    expect(params.get('easyApply')).toBeNull();
  });

  it('parses easyApply=1 back to true', () => {
    const parsed = parseFiltersFromParams(new URLSearchParams('easyApply=1'));
    expect(parsed.easyApply).toBe(true);
  });

  it('parses an absent or junk value to null (never false-y string truthiness)', () => {
    expect(parseFiltersFromParams(new URLSearchParams('')).easyApply).toBeNull();
    expect(parseFiltersFromParams(new URLSearchParams('easyApply=0')).easyApply).toBeNull();
    expect(parseFiltersFromParams(new URLSearchParams('easyApply=true')).easyApply).toBeNull();
  });

  it('round-trips: parse(serialize(state)) preserves easyApply', () => {
    const state = { ...DEFAULT_FILTERS, easyApply: true as const };
    const roundTripped = parseFiltersFromParams(filtersToParams(state));
    expect(roundTripped.easyApply).toBe(true);
  });
});

describe('surfaces consuming the shared clause (source locks)', () => {
  it('the filter-counts route counts easyApply through easyApplyClause with a self-excluded base', () => {
    const src = read('app/api/jobs/filter-counts/route.ts');
    expect(src).toMatch(/easyApplyClause\(\)/);
    expect(src).toMatch(/easyApply:\s*null/);
    expect(src).toMatch(/easyApply:\s*easyApplyCount/);
  });

  it('the sidebar renders the one checkbox with the agreed label', () => {
    const src = read('components/jobs/LinkedInFilters.tsx');
    expect(src).toMatch(/Direct employers \/ Easy Apply/);
    expect(src).toMatch(/counts\?\.easyApply/);
  });

  it('the /jobs/easy-apply landing page filters through the same clause and best sort', () => {
    const src = read('app/jobs/easy-apply/page.tsx');
    expect(src).toMatch(/easyApplyClause\(\)/);
    expect(src).toMatch(/BEST_SORT_ORDER_BY/);
    expect(src).toMatch(/GLOBAL_EXCLUSIONS/);
    // Breadcrumbs + canonical are part of the C2 spec.
    expect(src).toMatch(/BreadcrumbSchema/);
    expect(src).toMatch(/\/jobs\/easy-apply/);
  });

  it('the /jobs client serializes API fetches through filtersToParams (no hand-built param list)', () => {
    // The old hand-built list in fetchJobs silently dropped filters it did
    // not know about (newGrad, minYears, employer — and easyApply), so a
    // checked sidebar box changed the URL but not the results.
    const src = read('app/jobs/JobsPageClient.tsx');
    expect(src).toMatch(/filtersToParams\(filters\)/);
  });

  it('the easy-apply page is registered in the jobs taxonomy (middleware 410 gate + sitemap)', () => {
    const src = read('lib/pseo/jobs-segments-edge.ts');
    expect(src).toMatch(/slug:\s*'easy-apply'/);
    // Must be in the primary sitemap per the C2 spec.
    expect(src).toMatch(/slug:\s*'easy-apply'[^}]*inPrimarySitemap:\s*true/);
  });
});
