/**
 * B5-B8 (organic audit 2026-08) regression locks:
 *
 *  - B5: dead-link-gated jobs (healthConsecutiveMissing >= threshold) were
 *    excluded from sitemaps but still served 200 + index,follow.
 *  - B6: job sitemap lastmod was 100% noise (viewCount increments rode
 *    prisma.job.update, firing @updatedAt on every page view), so the jobs
 *    batches now omit <lastmod> and the view counter is raw SQL.
 *  - B7: /api/sitemaps/index hardcoded the 3/10000/36 gating trio instead of
 *    importing the shared SSOT.
 *  - B8: vercel.json carried dead Cache-Control header blocks.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  MIN_JOBS_FOR_CATEGORY_CITY,
  MIN_SITEMAP_POPULATION,
  PSEO_STALENESS_HOURS,
  pseoFreshnessCutoff,
} from '@/lib/pseo/sitemap-thresholds';
import { MIN_JOBS_FOR_CATEGORY_CITY as RENDER_GATE_MIN } from '@/lib/pseo/render-gate';

const read = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

describe('shared sitemap thresholds (B7)', () => {
  it('re-exports the render-gate MIN_JOBS SSOT, never a fork', () => {
    expect(MIN_JOBS_FOR_CATEGORY_CITY).toBe(RENDER_GATE_MIN);
  });

  it('exposes sane population floor and staleness window', () => {
    expect(MIN_SITEMAP_POPULATION).toBe(10000);
    expect(PSEO_STALENESS_HOURS).toBe(36);
    const now = Date.UTC(2026, 7, 1);
    expect(pseoFreshnessCutoff(now).getTime()).toBe(now - 36 * 60 * 60 * 1000);
  });

  it('the sitemap index route imports the trio instead of hardcoding it', () => {
    const src = read('app/api/sitemaps/index/route.ts');
    expect(src).toContain("from '@/lib/pseo/sitemap-thresholds'");
    expect(src).not.toMatch(/MIN_SITEMAP_JOBS = \d/);
    expect(src).not.toMatch(/MIN_SITEMAP_POPULATION = \d/);
    expect(src).not.toMatch(/PSEO_STALENESS_HOURS = \d/);
  });

  it('the cities batch route imports the same trio', () => {
    const src = read('app/api/sitemaps/cities/[batch]/route.ts');
    expect(src).toContain("from '@/lib/pseo/sitemap-thresholds'");
    expect(src).not.toMatch(/MIN_SITEMAP_POPULATION = \d/);
    expect(src).not.toMatch(/PSEO_STALENESS_HOURS = \d/);
  });

  it('getCityStats falls back to live counts when the row is stale (B2)', () => {
    const src = read('lib/pseo/category-city-template.tsx');
    expect(src).toContain('PSEO_STALENESS_HOURS');
    expect(src).toMatch(/stats\.updatedAt\.getTime\(\) >= freshnessCutoff/);
  });
});

describe('jobs batch sitemap omits lastmod (B6)', () => {
  const src = read('app/api/sitemaps/jobs/[batch]/route.ts');

  it('emits no <lastmod> element at all', () => {
    expect(src).not.toContain('<lastmod>');
  });

  it('no longer selects updatedAt (nothing left to leak it from)', () => {
    expect(src).not.toMatch(/updatedAt: true/);
  });
});

describe('view counting no longer fires @updatedAt (B6)', () => {
  const src = read('app/jobs/[slug]/page.tsx');

  it('increments view_count via raw SQL', () => {
    expect(src).toMatch(/\$executeRaw`UPDATE jobs SET view_count = view_count \+ 1 WHERE id = \$\{id\}`/);
  });

  it('does not increment viewCount through prisma.job.update', () => {
    expect(src).not.toMatch(/viewCount: \{ increment: 1 \}/);
  });
});

describe('dead-link-gated jobs emit noindex,nofollow (B5)', () => {
  const src = read('app/jobs/[slug]/page.tsx');

  it('imports the SAME threshold the sitemap filter uses (no fork)', () => {
    expect(src).toContain("import { DEAD_LINK_MISS_THRESHOLD } from '@/lib/active-job-filter'");
    expect(src).toMatch(/missingStreak >= DEAD_LINK_MISS_THRESHOLD/);
  });

  it('gates a robots noindex,nofollow block on it', () => {
    expect(src).toMatch(/isDeadLinkGated && \{\s*robots: \{ index: false, follow: false \}/);
  });
});

describe('metro honesty (B4)', () => {
  it('the metro page noindexes at 0 jobs and shares the sitemap where-builder', () => {
    const src = read('app/jobs/metro/[slug]/page.tsx');
    expect(src).toContain('buildMetroJobsWhere');
    expect(src).toMatch(/stats\.totalJobs === 0 && \{\s*robots: \{ index: false, follow: true \}/);
  });
});

describe('vercel.json headers (B8)', () => {
  const vercel = JSON.parse(read('vercel.json')) as {
    headers?: Array<{ source: string }>;
  };
  const sources = (vercel.headers ?? []).map((h) => h.source);

  it('the dead Cache-Control blocks are gone (routes set their own headers)', () => {
    expect(sources).not.toContain('/robots.txt');
    expect(sources).not.toContain('/sitemap.xml');
    expect(sources).not.toContain('/api/sitemaps/(.*)');
  });

  it('the live blocks (HSTS, fonts, images) are untouched', () => {
    expect(sources).toContain('/(.*)');
    expect(sources).toContain('/fonts/(.*)');
  });
});
