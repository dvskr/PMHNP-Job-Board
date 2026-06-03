/**
 * Perf1 regression — pSEO listing fetches must exclude the heavy `description`
 * HTML column (cards use descriptionSummary). This locks the shared omit so a
 * refactor can't silently start shipping multi-KB descriptions on every pSEO page.
 */
import { describe, it, expect } from 'vitest';
import { JOB_LISTING_OMIT } from '@/lib/pseo/job-listing-omit';

describe('JOB_LISTING_OMIT', () => {
  it('omits the description column from listing queries', () => {
    expect(JOB_LISTING_OMIT.description).toBe(true);
  });

  it('does not omit fields the card actually renders', () => {
    const omitted = JOB_LISTING_OMIT as Record<string, unknown>;
    // descriptionSummary, title, employer, etc. must NOT be omitted.
    expect(omitted.descriptionSummary).toBeUndefined();
    expect(omitted.title).toBeUndefined();
    expect(omitted.qualityScore).toBeUndefined();
  });
});
