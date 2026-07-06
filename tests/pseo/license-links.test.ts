/**
 * Item 29 regression — state licensure link gating.
 *
 * Before the fix, the category×city template rendered a
 * `/blog/pmhnp-license-{state}` link gated only on practiceAuthority — which
 * covers 50 states + DC — while content/blog ships exactly 50
 * pmhnp-license-*.mdx files and none for district-of-columbia. Every DC
 * category-city page (and /salary-guide/district-of-columbia) shipped a
 * guaranteed-404 link. hasLicensePost() reads the blog directory once and
 * lets both link sites render nothing when the post is missing.
 *
 * The 51-state sweep below also documents the inverse invariant: DC is the
 * ONLY practice-authority state without a licensure post. If a post is ever
 * removed (or a DC post added), this test flags the drift.
 */
import { describe, it, expect } from 'vitest';
import { hasLicensePost } from '@/lib/pseo/license-posts';
import { STATE_PRACTICE_AUTHORITY } from '@/lib/state-practice-authority';
import { stateToSlug } from '@/lib/pseo/setting-state-config';

describe('hasLicensePost — license-post existence gate', () => {
  it('returns true for california (post exists)', () => {
    expect(hasLicensePost('california')).toBe(true);
  });

  it('returns false for district-of-columbia (documents today\'s content gap)', () => {
    expect(hasLicensePost('district-of-columbia')).toBe(false);
  });

  it('returns false for slugs that never had posts', () => {
    expect(hasLicensePost('puerto-rico')).toBe(false);
    expect(hasLicensePost('')).toBe(false);
  });

  it('every practice-authority state EXCEPT District of Columbia has a post', () => {
    const missing = Object.keys(STATE_PRACTICE_AUTHORITY)
      .filter((state) => state !== 'District of Columbia')
      .map((state) => stateToSlug(state))
      .filter((slug) => !hasLicensePost(slug));
    expect(missing).toEqual([]);
  });
});
