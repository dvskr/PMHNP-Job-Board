/**
 * B3 (organic audit 2026-08): 9 of 28 sitemapped category landings had <= 1
 * matching job; four rendered literal "0 ... Jobs" SERP titles at 200 +
 * index,follow while the sitemap advertised them daily at priority 0.9.
 *
 * The gate (lib/pseo/category-landing-gate.ts) noindexes sub-threshold
 * landings, drops the count from titles below the floor, and hands the
 * sitemap the SAME where-clauses the pages count with. These tests cover
 * the helpers and source-lock every landing page + the sitemap onto them.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  isCategoryLandingIndexable,
  categoryTitleCount,
  categoryLandingRobotsMeta,
  categoryLandingWhere,
} from '@/lib/pseo/category-landing-gate';
import { MIN_JOBS_FOR_CATEGORY_CITY } from '@/lib/pseo/render-gate';
import { buildCategoryWhereClause } from '@/lib/filters';
import { PRIMARY_SITEMAP_CATEGORY_SLUGS } from '@/lib/pseo/jobs-segments-edge';

const read = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

describe('gate helpers', () => {
  it('indexability flips exactly at the MIN_JOBS SSOT', () => {
    expect(isCategoryLandingIndexable(MIN_JOBS_FOR_CATEGORY_CITY - 1)).toBe(false);
    expect(isCategoryLandingIndexable(MIN_JOBS_FOR_CATEGORY_CITY)).toBe(true);
  });

  it('never interpolates a sub-threshold count into a title', () => {
    expect(categoryTitleCount(0)).toBe('');
    expect(categoryTitleCount(MIN_JOBS_FOR_CATEGORY_CITY - 1)).toBe('');
    expect(categoryTitleCount(MIN_JOBS_FOR_CATEGORY_CITY)).toBe(`${MIN_JOBS_FOR_CATEGORY_CITY} `);
    expect(categoryTitleCount(42)).toBe('42 ');
  });

  it('noindex,follow below the floor — 200 + content stays, indexing stops', () => {
    expect(categoryLandingRobotsMeta(0)).toEqual({ robots: { index: false, follow: true } });
    expect(categoryLandingRobotsMeta(MIN_JOBS_FOR_CATEGORY_CITY - 1))
      .toEqual({ robots: { index: false, follow: true } });
    expect(categoryLandingRobotsMeta(MIN_JOBS_FOR_CATEGORY_CITY)).toEqual({});
  });

  it('paginated variants stay noindexed regardless of count', () => {
    expect(categoryLandingRobotsMeta(100, 2)).toEqual({ robots: { index: false, follow: true } });
    expect(categoryLandingRobotsMeta(100, 1)).toEqual({});
  });
});

describe('categoryLandingWhere agrees with what the pages count', () => {
  it('default categories use buildCategoryWhereClause verbatim', () => {
    expect(categoryLandingWhere('va')).toEqual(buildCategoryWhereClause('va'));
    expect(categoryLandingWhere('geriatric')).toEqual(buildCategoryWhereClause('geriatric'));
  });

  it('inpatient keeps its isRemote exclusion (page parity)', () => {
    expect(categoryLandingWhere('inpatient'))
      .toEqual(buildCategoryWhereClause('inpatient', { isRemote: { not: true } }));
  });

  it('remote uses the isRemote boolean, not keyword matching', () => {
    const where = categoryLandingWhere('remote');
    expect(where.isRemote).toBe(true);
    expect(where.isPublished).toBe(true);
  });

  it('easy-apply keeps the expiry guard employer posts need', () => {
    const now = new Date('2026-08-01T00:00:00Z');
    const where = categoryLandingWhere('easy-apply', now);
    expect(JSON.stringify(where)).toContain('"sourceType":"employer"');
    expect(JSON.stringify(where)).toContain('"expiresAt":null');
  });
});

describe('every sitemapped landing page uses the gate (source lock)', () => {
  for (const slug of PRIMARY_SITEMAP_CATEGORY_SLUGS) {
    it(`/jobs/${slug} noindexes below the floor and drops sub-threshold counts`, () => {
      const src = read(`app/jobs/${slug}/page.tsx`);
      expect(src).toContain('categoryLandingRobotsMeta(');
      // A raw count interpolated into a <title> is the "0 VA PMHNP Jobs" bug.
      expect(src).not.toMatch(/title: `\$\{stats\.totalJobs\}/);
      // The old pagination-only robots spread must not survive alongside.
      expect(src).not.toMatch(/\.\.\.\(page > 1 && \{\s*robots/);
    });
  }

  it('special pages still count with the exact builders the gate mirrors', () => {
    expect(read('app/jobs/remote/page.tsx')).toMatch(/isRemote: true/);
    expect(read('app/jobs/inpatient/page.tsx'))
      .toContain("buildCategoryWhereClause('inpatient', { isRemote: { not: true } })");
    expect(read('app/jobs/easy-apply/page.tsx')).toContain('easyApplyClause()');
  });
});

describe('app/sitemap.ts gates the landing + metro entries (source lock)', () => {
  const src = read('app/sitemap.ts');

  it('category landings are gated on the shared live counts', () => {
    expect(src).toContain('categoryLandingWhere');
    expect(src).toMatch(/categoryLandingCounts\[i\] >= MIN_JOBS_FOR_CATEGORY_CITY/);
  });

  it('metro entries are gated on live counts via the shared metro builder', () => {
    expect(src).toContain('buildMetroJobsWhere');
    expect(src).toMatch(/\.filter\(m => m\.count > 0\)/);
  });

  it('metro entries no longer stamp the sitewide latestJobDate in the gated path', () => {
    // Gated path spreads the metro's own latest date (or omits lastmod).
    expect(src).toMatch(/\.\.\.\(m\.latest && \{ lastModified: m\.latest \}\)/);
  });
});
