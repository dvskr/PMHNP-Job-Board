/**
 * S4 regression — category×city thin-content render gate.
 *
 * Before the fix, only a 0-job combo redirected; pages with 1-2 jobs rendered a
 * full HTTP 200 (noindex meta only), i.e. crawlable doorway/thin content across
 * thousands of near-identical URLs. The fix gates rendering on a MIN_JOBS
 * threshold (3 — aligned with the city page, the sitemap gate, and the
 * seo_threshold_decision.md project memory): below it the page calls notFound().
 *
 * The decision is extracted into a pure, dependency-free helper so it can be
 * tested without invoking Next.js navigation internals or importing the heavy
 * server-component template tree.
 */
import { describe, it, expect } from 'vitest';
import { shouldRenderCategoryCity, MIN_JOBS_FOR_CATEGORY_CITY } from '@/lib/pseo/render-gate';

describe('shouldRenderCategoryCity — MIN_JOBS threshold = 3', () => {
  it('keeps the threshold pinned at 3 (do not raise — seo_threshold_decision.md)', () => {
    expect(MIN_JOBS_FOR_CATEGORY_CITY).toBe(3);
  });

  it('returns false for 0 jobs', () => {
    expect(shouldRenderCategoryCity(0)).toBe(false);
  });

  it('returns false for 1 job (thin doorway page)', () => {
    expect(shouldRenderCategoryCity(1)).toBe(false);
  });

  it('returns false for 2 jobs (thin doorway page)', () => {
    expect(shouldRenderCategoryCity(2)).toBe(false);
  });

  it('returns true for exactly 3 jobs (meets minimum)', () => {
    expect(shouldRenderCategoryCity(3)).toBe(true);
  });

  it('returns true for 4 / 10 / 100 jobs', () => {
    expect(shouldRenderCategoryCity(4)).toBe(true);
    expect(shouldRenderCategoryCity(10)).toBe(true);
    expect(shouldRenderCategoryCity(100)).toBe(true);
  });

  it('boundary: 2 → false, 3 → true (no off-by-one)', () => {
    expect(shouldRenderCategoryCity(2)).toBe(false);
    expect(shouldRenderCategoryCity(3)).toBe(true);
  });

  it('respects a custom threshold override', () => {
    expect(shouldRenderCategoryCity(4, 5)).toBe(false);
    expect(shouldRenderCategoryCity(5, 5)).toBe(true);
  });
});
