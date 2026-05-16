/**
 * Derives the human-readable `experienceLabel` from the structured
 * experience fields on a Job. Single source of truth — used at:
 *
 *   1. post-job write (employer picks the radio bucket + new-grad toggle)
 *   2. aggregated-ingest enrichment (lib/llm-enrichment + lib/aggregators)
 *   3. P0.4 backfill (scripts/backfill-experience.ts)
 *   4. UI rendering fallback when the DB value is unexpectedly null
 *
 * Design (runbook docs/runbooks/ui-refresh-2026-05.md §1):
 *   - Six minimum-experience buckets: 0, 1, 2, 5, 7, 10
 *   - max is optional; `null` means open-ended ("5+")
 *   - newGradFriendly is independent of min — both signals can coexist
 *     (e.g. "5+ yrs · new grads welcome")
 *
 * The function never throws — invalid combinations collapse to `null`
 * so the call site can choose to hide the chip rather than show garbage.
 */

export const MIN_YEARS_BUCKETS: ReadonlyArray<number> = [0, 1, 2, 5, 7, 10] as const;

/**
 * Canonical (min, max) pairings exposed to employers in the post-job
 * picker. Six buckets covering the realistic PMHNP experience spread.
 * Source of truth for:
 *   - Post-job form radio options
 *   - Candidate-side filter dropdown (Phase 3 #12)
 *   - Backfill / enrichment scripts when normalizing a bare "min" value
 *
 * `max: null` means open-ended ("new grad" floor is 0 with no upper
 * bound, "10+ yrs" has no upper bound).
 */
export interface ExperienceBucket {
  min: number;
  max: number | null;
  label: string;
}

export const EXPERIENCE_BUCKETS: ReadonlyArray<ExperienceBucket> = Object.freeze([
  { min: 0, max: null, label: 'New grad accepted' },
  { min: 1, max: 2, label: '1-2 years' },
  { min: 2, max: 4, label: '2-4 years' },
  { min: 5, max: 7, label: '5-7 years' },
  { min: 7, max: 10, label: '7-10 years' },
  { min: 10, max: null, label: '10+ years' },
]);

export interface ExperienceInput {
  minYearsExperience: number | null;
  maxYearsExperience: number | null;
  newGradFriendly: boolean;
}

export function deriveExperienceLabel(input: ExperienceInput): string | null {
  const { minYearsExperience: min, maxYearsExperience: max, newGradFriendly } = input;

  // All three signals absent — caller has no information to display.
  if (min === null && !newGradFriendly) return null;

  // Pure new-grad role: the 0-bucket IS the new-grad signal by itself.
  // We don't require newGradFriendly to also be set — picking "New grad
  // accepted" in the form is a complete statement.
  // Likewise, newGradFriendly=true with no min specified collapses to
  // the same label.
  if (min === 0 || (min === null && newGradFriendly)) {
    return 'New grad welcome';
  }

  // min is set above zero — straight range or open-ended. The
  // newGradFriendly flag here is the cross-cutting case
  // ("5+ yrs · new grads welcome") which is independent of the bucket.
  if (min !== null) {
    const baseLabel = formatRange(min, max);
    return newGradFriendly ? `${baseLabel} · new grads welcome` : baseLabel;
  }

  // min === null && newGradFriendly === false handled by the first guard;
  // anything reaching here is an unreachable combination.
  return null;
}

function formatRange(min: number, max: number | null): string {
  if (max === null || max <= min) {
    return `${min}+ yrs`;
  }
  return `${min}-${max} yrs`;
}

/**
 * Server-side normalization for the four experience fields submitted by
 * the post-job form. Pure — accepts the already-sanitized qualifier text
 * and returns the structured row data including a freshly-derived
 * `experienceLabel`. Authoritative: never trust a client-provided label.
 *
 * Used by:
 *   - app/api/jobs/post-free/route.ts (free post path)
 *   - app/api/create-checkout/route.ts (paid post path)
 *
 * Validation rules:
 *   - minYearsExperience must match one of EXPERIENCE_BUCKETS or → null
 *   - maxYearsExperience is always derived from the bucket pairing
 *     (clients cannot declare inconsistent ranges)
 *   - newGradFriendly is normalized to a strict boolean
 *   - experienceQualifier is passed through as-is (caller pre-sanitizes)
 */
export function normalizeExperienceFromInput(input: {
  minYearsExperience?: unknown;
  newGradFriendly?: unknown;
  experienceQualifier?: string | null;
}): {
  minYearsExperience: number | null;
  maxYearsExperience: number | null;
  newGradFriendly: boolean;
  experienceQualifier: string | null;
  experienceLabel: string | null;
} {
  const rawMin = input.minYearsExperience;
  const minMatch =
    typeof rawMin === 'number' && EXPERIENCE_BUCKETS.some((b) => b.min === rawMin)
      ? rawMin
      : null;

  const bucket = minMatch !== null ? EXPERIENCE_BUCKETS.find((b) => b.min === minMatch) : undefined;
  const max = bucket?.max ?? null;

  const newGradFriendly = input.newGradFriendly === true;
  const experienceQualifier = input.experienceQualifier?.trim() || null;

  const experienceLabel = deriveExperienceLabel({
    minYearsExperience: minMatch,
    maxYearsExperience: max,
    newGradFriendly,
  });

  return {
    minYearsExperience: minMatch,
    maxYearsExperience: max,
    newGradFriendly,
    experienceQualifier,
    experienceLabel,
  };
}

// Title patterns that signal a job is fundamentally a new-grad /
// training position regardless of what the DB row's
// experienceLabel / minYearsExperience say. This handles residency /
// fellowship / training-program jobs that the inference regex
// previously mis-extracted as "5+ yrs" because of phrases like
// "5 years of accredited training" in the body. Keeping the override
// at render time means we don't have to re-run the backfill on
// already-incorrect rows.
// Require "program" after residency/fellowship — bare `fellowship` and
// `residency` matched post-grad APP/NP fellowships that REQUIRE 3-5
// years prior NP experience (audit flagged ~18 such FPs).
const NEW_GRAD_TITLE_PATTERNS: ReadonlyArray<RegExp> = [
  /\bresidency\s+program\b/i,
  /\bfellowship\s+program\b/i,
  /\btraining\s+program\b/i,
  /\bnew\s+grad(?:uate)?s?\b/i,
  /\brecent\s+grad(?:uate)?s?\b/i,
  /\bentry[\s-]level\b/i,
];

/**
 * Pure check — does the title indicate this is a new-grad / training
 * context? Exported so render-time code (JobCard, JD detail page) can
 * override the stored experience label when the title signal is clear.
 */
export function titleIndicatesNewGrad(title: string | null | undefined): boolean {
  if (!title) return false;
  return NEW_GRAD_TITLE_PATTERNS.some((re) => re.test(title));
}

/**
 * Render-time helper. Returns the label that should appear on the
 * JobCard chip / JD detail badge, applying overrides that the DB row
 * can't express:
 *   - Title signals new-grad → "New grad welcome" (regardless of stored min)
 *   - Otherwise → stored `experienceLabel` (already derived by writer code)
 *
 * Returning the same string both callers can render means the card and
 * detail page can never disagree on the chip text.
 */
export function effectiveExperienceLabel(job: {
  title?: string | null;
  experienceLabel?: string | null;
  newGradFriendly?: boolean | null;
}): string | null {
  if (titleIndicatesNewGrad(job.title)) return 'New grad welcome';
  return job.experienceLabel ?? null;
}

/**
 * Companion to `effectiveExperienceLabel` — true when the chip should
 * use the success (mint) variant. Mirrors the override so the card and
 * detail page agree on color too.
 */
export function effectiveNewGradFriendly(job: {
  title?: string | null;
  newGradFriendly?: boolean | null;
}): boolean {
  if (titleIndicatesNewGrad(job.title)) return true;
  return job.newGradFriendly === true;
}

/**
 * Normalizes a raw minimum-years value to the nearest allowed bucket.
 * Used by the backfill script when regex-extracted numbers don't fall
 * exactly on a bucket boundary (e.g. ingested JD says "3 years" → 2).
 *
 * Returns `null` if the input itself is null/NaN/negative.
 */
export function snapMinYearsToBucket(years: number | null): number | null {
  if (years === null || !Number.isFinite(years) || years < 0) return null;
  // Find the largest bucket ≤ years. "3 years" → 2; "4 years" → 2; "5 years" → 5.
  let chosen = 0;
  for (const b of MIN_YEARS_BUCKETS) {
    if (years >= b) chosen = b;
    else break;
  }
  return chosen;
}
