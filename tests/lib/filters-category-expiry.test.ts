/**
 * buildCategoryWhereClause is the predicate behind all 27 /jobs/<category>
 * landing pages, /jobs/telehealth included, and (via categoryLandingWhere) the
 * sitemap gate that decides whether those URLs get advertised at all.
 *
 * It applied CATEGORY_FILTERS, CATEGORY_EXCLUSIONS and GLOBAL_EXCLUSIONS but
 * NOT the expiry guard that publicJobsWhere/buildWhereClause have carried since
 * 50c38fa. The middleware 410-gates a posting the moment it is past expiresAt
 * while cleanup-expired only flips isPublished twice a day, so in between every
 * landing page listed cards that answered 410 on click and interpolated the
 * inflated count into its own SERP title and noindex gate.
 */
import { describe, it, expect } from 'vitest';
import type { Prisma } from '@prisma/client';
import {
  buildCategoryWhereClause,
  listingExpiryHorizon,
  notExpiredClause,
  publicJobsWhere,
  GLOBAL_EXCLUSIONS,
} from '@/lib/filters';
import { categoryLandingWhere } from '@/lib/pseo/category-landing-gate';

const NOW = new Date('2026-09-13T12:00:00.000Z');
const CATEGORY_SLUGS = ['telehealth', 'va', 'geriatric', 'new-grad', 'inpatient', '1099'];

describe('buildCategoryWhereClause expiry guard', () => {
  it.each(CATEGORY_SLUGS)('gates /jobs/%s on expiresAt', (slug) => {
    const and = buildCategoryWhereClause(slug, {}, NOW).AND as Prisma.JobWhereInput[];
    expect(and).toContainEqual(notExpiredClause(NOW));
  });

  it('agrees with publicJobsWhere on what "not expired" means', () => {
    // Same clause object, so the landing page and /jobs can never diverge on
    // the boundary case (expiresAt exactly now, or null).
    const categoryAnd = buildCategoryWhereClause('telehealth', {}, NOW).AND as Prisma.JobWhereInput[];
    const publicAnd = publicJobsWhere(NOW).AND as Prisma.JobWhereInput[];
    expect(categoryAnd[0]).toEqual(publicAnd[0]);
  });

  it('keeps the global exclusions alongside the new expiry clause', () => {
    const and = buildCategoryWhereClause('va', {}, NOW).AND as Prisma.JobWhereInput[];
    const negations = and.filter((c) => 'NOT' in c);
    expect(negations.length).toBeGreaterThanOrEqual(GLOBAL_EXCLUSIONS.length);
  });

  it('still merges top-level extras such as the inpatient isRemote exclusion', () => {
    const where = buildCategoryWhereClause('inpatient', { isRemote: { not: true } }, NOW);
    expect(where.isPublished).toBe(true);
    expect(where.isRemote).toEqual({ not: true });
  });
});

describe('listingExpiryHorizon', () => {
  it('truncates to the start of the minute so two callers build the same clause', () => {
    // The page and app/sitemap.ts build their clause in separate calls; a raw
    // `new Date()` made the two differ by milliseconds, so "the sitemap
    // advertises what the page counts" stopped being checkable.
    const horizon = listingExpiryHorizon();
    expect(horizon.getSeconds()).toBe(0);
    expect(horizon.getMilliseconds()).toBe(0);
    expect(listingExpiryHorizon().getTime()).toBe(horizon.getTime());
  });

  it('never sits in the future, so an unexpired job is never hidden', () => {
    expect(listingExpiryHorizon().getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe('categoryLandingWhere carries the guard on every branch', () => {
  it.each(['remote', 'easy-apply', 'inpatient', 'va'])('gates %s on expiresAt', (slug) => {
    // The remote branch used to omit it on the theory that only employer posts
    // carry hard expiresAt terms; the normalizer stamps it on aggregated rows
    // too, so /jobs/remote listed 410-ing cards.
    expect(JSON.stringify(categoryLandingWhere(slug, NOW))).toContain('"expiresAt":null');
  });

  it('remote is publicJobsWhere restricted to the isRemote flag', () => {
    expect(categoryLandingWhere('remote', NOW)).toEqual({
      ...publicJobsWhere(NOW),
      isRemote: true,
    });
  });

  it('passes its instant through to the shared builder so page and sitemap agree', () => {
    expect(categoryLandingWhere('va', NOW)).toEqual(buildCategoryWhereClause('va', {}, NOW));
  });
});
