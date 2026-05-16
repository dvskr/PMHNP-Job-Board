/**
 * Heuristics for inferring structured experience fields from legacy
 * `experienceLevel` enums and free-text JD descriptions.
 *
 * Lives separately from lib/experience-label.ts so it can be unit-tested
 * without pulling in the rest of the backfill script (prisma client, etc).
 * Consumers:
 *   - scripts/backfill-experience.ts (P0.4) — bulk classify existing rows
 *   - lib/llm-enrichment.ts (Phase 2 #4) — classify aggregated JDs
 *     pre-LLM, so the enrichment step can skip jobs we already understand
 *
 * Confidence scale:
 *   - "high"   — legacy enum match. Original UI was a closed enum, so the
 *                value reliably maps to a structured bucket.
 *   - "medium" — regex hit on the description body. Real-world JDs are
 *                noisy ("our team has 50 years of combined experience")
 *                so don't trust these for high-stakes decisions.
 *   - "low"    — reserved for future LLM-assisted classification.
 *
 * The functions never throw — they return `null` so callers can decide
 * whether to skip the row, fall back to a default, or escalate to LLM.
 */

import { snapMinYearsToBucket, type ExperienceInput } from './experience-label';

export type ExperienceConfidence = 'high' | 'medium' | 'low';

export interface InferredExperience extends ExperienceInput {
  confidence: ExperienceConfidence;
  /** Provenance: where the classification came from. Aids debugging. */
  source: string;
}

const LEGACY_LEVEL_MAP: Readonly<Record<string, InferredExperience>> = Object.freeze({
  'new grad': {
    minYearsExperience: 0,
    maxYearsExperience: null,
    newGradFriendly: true,
    confidence: 'high',
    source: 'legacy:new-grad',
  },
  'entry-level': {
    minYearsExperience: 0,
    maxYearsExperience: null,
    newGradFriendly: true,
    confidence: 'high',
    source: 'legacy:entry-level',
  },
  'mid-level': {
    minYearsExperience: 2,
    maxYearsExperience: 5,
    newGradFriendly: false,
    confidence: 'high',
    source: 'legacy:mid-level',
  },
  senior: {
    minYearsExperience: 5,
    maxYearsExperience: null,
    newGradFriendly: false,
    confidence: 'high',
    source: 'legacy:senior',
  },
});

// "new grad", "new graduate(s)", "entry level", "entry-level", "recent grad(uate)s",
// "0 years of experience". Case-insensitive, word-boundary anchored.
const NEW_GRAD_PHRASES: ReadonlyArray<RegExp> = [
  /\bnew\s+grad(?:uate)?s?\b/i,
  /\bentry[\s-]level\b/i,
  /\brecent\s+grad(?:uate)?s?\b/i,
  /\b0\s+years?\s+(?:of\s+)?experience\b/i,
];

// Order matters: the range pattern must run first so "1-2 years" doesn't get
// captured by the plus pattern as just "1 year".
const RANGE_PATTERN = /\b(\d{1,2})\s*(?:-|to|–)\s*(\d{1,2})\s+(?:years?|yrs?)\b/i;
const PLUS_PATTERN =
  /\b(?:minimum\s+(?:of\s+)?|at\s+least\s+)?(\d{1,2})\s*\+?\s*(?:years?|yrs?)(?:\s+(?:of\s+)?experience|\s+exp)?/i;

// Patterns that look like experience requirements but are actually
// program duration / training language. Without these the inference
// extracts "5 years" from "5 years of accredited training" and labels
// a residency program as senior-only.
const TRAINING_CONTEXT_PATTERN =
  /\b\d{1,2}\s*(?:-|to|–)?\s*\d{0,2}\s*(?:years?|yrs?)\s+(?:of\s+)?(?:training|program|accredited|accreditation|curriculum|coursework|study|education|school|schooling|degree|residency|fellowship|nursing\s+program|pmhnp\s+program|nursing\s+school)\b/i;

// Strong "this is fundamentally a training/new-grad job" signals.
// Tightened to ONLY the structural program-type words, not bare
// phrases like "new grads welcome" which can co-exist with a senior
// experience requirement ("5+ years, but exceptional new grads
// welcome" should stay 5+ yrs · new grads welcome, not collapse to
// New Grad Welcome). The bare "new grad" phrases are still picked up
// by NEW_GRAD_PHRASES below — they flip the flag but don't override
// the min.
// Tightened 2026-05-15: require "program" after residency/fellowship so
// post-grad APP fellowships (which require 3-5 yrs prior NP experience)
// don't get classified as new-grad.
const NEW_GRAD_CONTEXT_PATTERN =
  /\b(residency\s+program|fellowship\s+program|training\s+program|entry[\s-]level\s+position|pmhnp\s+residency)\b/i;

/**
 * Pure text-only inference. Use when the row has no legacy
 * `experienceLevel` to lean on (most aggregated jobs).
 */
export function inferFromText(text: string): InferredExperience | null {
  const newGrad = NEW_GRAD_PHRASES.some((re) => re.test(text));
  const newGradContext = NEW_GRAD_CONTEXT_PATTERN.test(text);

  // Strong new-grad context short-circuits before any year-pattern
  // extraction. Without this the regex grabs "5 years" from phrases
  // like "5 years of accredited training" or "2 years of fellowship"
  // and labels a residency program as 5+ years required. The fellowship
  // / residency / training-program nature of the job is what matters.
  if (newGradContext) {
    return {
      minYearsExperience: 0,
      maxYearsExperience: null,
      newGradFriendly: true,
      confidence: 'medium',
      source: 'regex:new-grad-context',
    };
  }

  // Strip out training-context "N years of X" phrases before the
  // year-extraction patterns run. This way "5 years of training" /
  // "2 year accredited program" / "3 years of curriculum" can't be
  // mistaken for experience requirements.
  const sanitizedText = text.replace(TRAINING_CONTEXT_PATTERN, ' ');

  const rangeMatch = sanitizedText.match(RANGE_PATTERN);
  if (rangeMatch) {
    const min = snapMinYearsToBucket(parseInt(rangeMatch[1], 10));
    const max = parseInt(rangeMatch[2], 10);
    if (min !== null && Number.isFinite(max)) {
      return {
        minYearsExperience: min,
        maxYearsExperience: max,
        newGradFriendly: newGrad,
        confidence: 'medium',
        source: `regex:range:${rangeMatch[0]}`,
      };
    }
  }

  const plusMatch = sanitizedText.match(PLUS_PATTERN);
  if (plusMatch) {
    const min = snapMinYearsToBucket(parseInt(plusMatch[1], 10));
    if (min !== null) {
      return {
        minYearsExperience: min,
        maxYearsExperience: null,
        newGradFriendly: newGrad,
        confidence: 'medium',
        source: `regex:plus:${plusMatch[0]}`,
      };
    }
  }

  if (newGrad) {
    return {
      minYearsExperience: 0,
      maxYearsExperience: null,
      newGradFriendly: true,
      confidence: 'medium',
      source: 'regex:new-grad-phrase',
    };
  }

  return null;
}

/**
 * Combined inference: legacy enum first (always wins because it was a
 * closed UI enum), description body second. Returns `null` when neither
 * source yields a classification — caller can choose to skip or escalate.
 *
 * Disconfirmation guard (2026-05-14): when the legacy enum is "new grad"
 * or "entry-level" but the body contains an explicit minimum like
 * "1+ year(s) experience", trust the text and downgrade. This catches
 * aggregator rows where the normalizer mis-classified a 1-year-floor
 * job as new-grad because "1 year experience" used to live in the
 * new-grad keyword list.
 */
export function inferExperience(input: {
  experienceLevel: string | null;
  description: string;
}): InferredExperience | null {
  if (input.experienceLevel) {
    const key = input.experienceLevel.trim().toLowerCase();
    const fromLegacy = LEGACY_LEVEL_MAP[key];
    if (fromLegacy) {
      if (fromLegacy.newGradFriendly) {
        const fromText = inferFromText(input.description);
        if (
          fromText &&
          fromText.minYearsExperience !== null &&
          fromText.minYearsExperience >= 1 &&
          fromText.source.startsWith('regex:')
        ) {
          return {
            minYearsExperience: fromText.minYearsExperience,
            maxYearsExperience: fromText.maxYearsExperience,
            newGradFriendly: false,
            confidence: 'medium',
            source: `legacy:${key}->text:${fromText.source}`,
          };
        }
      }
      return fromLegacy;
    }
  }
  return inferFromText(input.description);
}
