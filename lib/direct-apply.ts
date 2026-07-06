/**
 * "Direct Apply" detection — shared by JobCard, ApplyButton, and
 * anywhere else the CTA label needs to differentiate between an
 * aggregator-style redirect and a direct-to-employer ATS link.
 *
 * Extracted from JobCard 2026-05-14 so the card chip and the detail
 * page's Apply button can never disagree. Before this extraction,
 * a Greenhouse-hosted job aggregated from a third-party source got
 * "Direct Apply" on the card but "Apply Now" on the detail page —
 * users noticed and asked why.
 *
 * The patterns are intentionally narrow: known major ATS hosts plus
 * the two near-universal employer subdomain patterns (`careers.` and
 * `jobs.`). False positives are cheap (worst case: a generic apply
 * page gets the "Direct Apply" label, which is still accurate-ish),
 * false negatives are more annoying because they undermine trust.
 */

import { ATS_HOST_SUBSTRINGS } from '@/lib/ai/job-classifier';

/**
 * Regex form of the shared ATS host list — derived from ATS_HOST_SUBSTRINGS
 * in lib/ai/job-classifier.ts (the single source of truth) so the badge and
 * the server-side classifier can never disagree. Dots are escaped; `careers.`
 * and `jobs.` stay plain substring matches, same as before the extraction.
 */
export const ATS_PATTERNS: ReadonlyArray<RegExp> = ATS_HOST_SUBSTRINGS.map(
  (s) => new RegExp(s.replace(/\./g, '\\.'), 'i'),
);

/** True when the apply URL points to a recognized ATS / employer career page. */
export function isDirectApplyUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return ATS_PATTERNS.some((p) => p.test(url));
}

/**
 * Higher-level "should we label this as Direct Apply?" — accounts for
 * the source type (employer vs. aggregated) AND the apply URL shape.
 *
 * `easyApply` (in-platform Easy Apply jobs) wins over both, since those
 * use their own gradient CTA — caller should branch on easyApply first.
 */
export function shouldLabelDirectApply(args: {
  applyLink: string | null | undefined;
  sourceType: string | null | undefined;
  applyOnPlatform: boolean;
}): boolean {
  if (args.applyOnPlatform) return false;
  if (!args.applyLink) return false;
  if (args.sourceType === 'employer') return true;
  return isDirectApplyUrl(args.applyLink);
}
