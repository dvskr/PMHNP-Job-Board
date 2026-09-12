/**
 * Source lock: every listing surface that shows or counts jobs must go through
 * a shared visibility predicate, never a bare `isPublished: true`.
 *
 * The bare flag is systematically wrong in two ways at once. It counts postings
 * past their expiresAt — the middleware answers 410 on those detail URLs the
 * moment they expire, while cleanup-expired only flips isPublished twice a day
 * — and it counts the off-specialty / MD-only rows that GLOBAL_EXCLUSIONS hide
 * permanently on /jobs. City and metro pSEO pages fed both into their SERP
 * titles, their hero copy, their FAQ answers and their MIN_JOBS render gate.
 *
 * The two helpers, and which surface gets which:
 *   publicJobsWhere        — what a visitor can see on /jobs (pages, counts).
 *   activeIndexableJobWhere — the above plus the repeated-dead-link gate, for
 *                             indexable surfaces (sitemaps, company pages).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const read = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

/** Strip comments so prose about the old predicate isn't read as code. */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

/** Count `isPublished: true` written as a literal predicate key in real code. */
const bareIsPublished = (src: string): number =>
  (stripComments(src).match(/isPublished:\s*true/g) ?? []).length;

describe('city pSEO page', () => {
  const src = read('app/jobs/city/[slug]/page.tsx');

  it('routes every query through publicJobsWhere', () => {
    expect(src).toContain("from '@/lib/filters'");
    // Cards, count, salary aggregate, top employers, unique employers,
    // related cities, and the ambiguous-slug resolver: seven queries.
    expect((src.match(/\.\.\.publicJobsWhere\(\)/g) ?? []).length).toBeGreaterThanOrEqual(7);
  });

  it('has no bare isPublished predicate left', () => {
    expect(bareIsPublished(src)).toBe(0);
  });
});

describe('metro pSEO page', () => {
  const src = read('app/jobs/metro/[slug]/page.tsx');

  it('merges publicJobsWhere into the shared metro geography clause', () => {
    // Merged at the call site on purpose: lib/metro-data.ts stays edge-safe
    // plain data with a type-only Prisma import.
    expect(src).toContain('...buildMetroJobsWhere(metro), ...publicJobsWhere()');
  });

  it('counts the statewide comparison the same way as the metro figures', () => {
    expect(bareIsPublished(src)).toBe(0);
  });
});

describe('app/sitemap.ts gates match the page gates', () => {
  const src = read('app/sitemap.ts');

  it('applies the global exclusions to the city and state gates', () => {
    // Both pages notFound() on an empty count taken with publicJobsWhere, so a
    // place pushed over the floor by MD-only Psychiatrist rows was advertised
    // here and then 404'd on crawl.
    expect(src).toContain('const NOT_EXCLUDED = GLOBAL_EXCLUSIONS.map(e => ({ NOT: e }))');
    expect((src.match(/AND: NOT_EXCLUDED/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('gates metro entries with the same merge the metro page uses', () => {
    expect(src).toContain('...buildMetroJobsWhere(metro), ...publicJobsWhere()');
  });
});

describe('category landing pages build their filter per request', () => {
  it('/jobs/remote does not freeze the expiry instant in a module constant', () => {
    const src = read('app/jobs/remote/page.tsx');
    expect(src).toContain('function remoteFilter()');
    expect(src).toContain('...publicJobsWhere(), isRemote: true');
    // A module-level `const X = {...}` would pin `now` at cold start.
    expect(src).not.toMatch(/^const REMOTE_FILTER\b/m);
  });

  it('/jobs/telehealth does not freeze the expiry instant either', () => {
    const src = read('app/jobs/telehealth/page.tsx');
    expect(src).toContain('function thFilter()');
    expect(src).not.toMatch(/^const TH_FILTER\b/m);
  });
});

describe('AI search answers the same inventory as /jobs', () => {
  it('the keyword leg and the hydration backstop both use publicJobsWhere', () => {
    const src = read('app/api/jobs/search/semantic/route.ts');
    expect(src).toContain('const publicWhere = publicJobsWhere();');
    // Spliced, not spread: a second `AND:` key would silently drop one set.
    expect(src).toContain('AND: [...publicAnd, ...hardConstraints]');
    expect(src).toContain('AND: [...publicAnd, ...(newGrad ? [newGradWhereClause()] : [])]');
    // The only surviving `isPublished: true` is the hydration SELECT's column
    // list, which is a projection, not a predicate.
    expect(bareIsPublished(src)).toBe(1);
    expect(stripComments(src)).not.toMatch(/where:\s*\{\s*\n\s*isPublished:\s*true/);
  });

  it('both vector SQL legs carry the expiry guard', () => {
    const src = read('lib/ai/vector-search.ts');
    const guards = src.match(/j\.expires_at IS NULL OR j\.expires_at > now\(\)/g) ?? [];
    expect(guards).toHaveLength(2);
  });
});

describe('/companies index and detail agree on "has jobs"', () => {
  it('the index lists and counts with activeIndexableJobWhere', () => {
    // The detail page loads its jobs with that predicate and notFound()s at
    // zero, so any looser predicate here produces a card that 404s on click.
    const src = read('app/companies/page.tsx');
    expect(src).toContain("from '@/lib/active-job-filter'");
    expect(bareIsPublished(src)).toBe(0);
  });

  it('the detail page still uses the predicate the index now mirrors', () => {
    const src = read('app/companies/[slug]/page.tsx');
    expect(src).toContain('activeIndexableJobWhere()');
  });
});
