/**
 * lib/pseo/category-landing-gate.ts — shared indexability gate for the 28
 * /jobs/<category> landing pages (B3, organic audit 2026-08).
 *
 * Problem it fixes: 9 of 28 sitemapped category landings had <= 1 matching
 * job, four rendered literal "0 ... Jobs" SERP titles, and app/sitemap.ts
 * advertised all 28 daily at priority 0.9 regardless of count.
 *
 * Policy (threshold = MIN_JOBS_FOR_CATEGORY_CITY, the render-gate SSOT):
 *   - Below the floor a landing page stays 200 with its full editorial
 *     content (these are hub pages with real internal-link value — never
 *     404 them) but emits robots noindex,follow.
 *   - A count below the floor is NEVER interpolated into title/description/
 *     OG copy: drop the number, not the page.
 *   - app/sitemap.ts gates the landing entries on the same live counts via
 *     categoryLandingWhere, so the sitemap and the page gate cannot
 *     disagree.
 */
import type { Prisma } from '@prisma/client';
import {
  buildCategoryWhereClause,
  easyApplyClause,
  GLOBAL_EXCLUSIONS,
} from '@/lib/filters';
import { MIN_JOBS_FOR_CATEGORY_CITY } from './render-gate';

/** A landing page is indexable once its live count clears the SSOT floor. */
export function isCategoryLandingIndexable(totalJobs: number): boolean {
  return totalJobs >= MIN_JOBS_FOR_CATEGORY_CITY;
}

/**
 * Count prefix for titles/descriptions: "12 " when indexable, "" below the
 * floor so sub-threshold counts never reach a SERP title.
 * Usage: `${categoryTitleCount(stats.totalJobs)}Remote PMHNP Jobs`.
 */
export function categoryTitleCount(totalJobs: number): string {
  return isCategoryLandingIndexable(totalJobs) ? `${totalJobs} ` : '';
}

/**
 * Spreadable robots block for a landing page's generateMetadata. Noindexes
 * paginated variants (the pre-existing behavior) AND sub-threshold landings
 * (noindex,follow — the page keeps its 200 and its links keep passing
 * equity).
 */
export function categoryLandingRobotsMeta(
  totalJobs: number,
  page: number = 1,
): { robots: { index: boolean; follow: boolean } } | Record<string, never> {
  if (page > 1 || !isCategoryLandingIndexable(totalJobs)) {
    return { robots: { index: false, follow: true } };
  }
  return {};
}

/**
 * The live-count where-clause for one category landing page — the SAME
 * clause the page itself counts with, so the sitemap gate and the page's
 * robots gate agree by construction. Special cases mirror the page sources
 * exactly (locked by tests/seo/category-landing-gate.test.ts):
 *   - remote:     app/jobs/remote/page.tsx REMOTE_FILTER (isRemote boolean)
 *   - easy-apply: app/jobs/easy-apply/page.tsx easyApplyFilter (employer
 *                 posts carry hard expiresAt terms, hence the expiry guard)
 *   - inpatient:  buildCategoryWhereClause with the isRemote exclusion
 *   - default:    buildCategoryWhereClause(slug)
 */
export function categoryLandingWhere(
  slug: string,
  now: Date = new Date(),
): Prisma.JobWhereInput {
  if (slug === 'remote') {
    return {
      isPublished: true,
      isRemote: true,
      AND: GLOBAL_EXCLUSIONS.map((e) => ({ NOT: e })),
    };
  }
  if (slug === 'easy-apply') {
    return {
      isPublished: true,
      AND: [
        easyApplyClause(),
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        ...GLOBAL_EXCLUSIONS.map((e) => ({ NOT: e })),
      ],
    };
  }
  if (slug === 'inpatient') {
    return buildCategoryWhereClause('inpatient', { isRemote: { not: true } });
  }
  return buildCategoryWhereClause(slug);
}
