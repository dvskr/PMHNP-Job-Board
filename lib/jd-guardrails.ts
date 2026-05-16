/**
 * Quality guardrails for AI-generated and employer-submitted JDs.
 *
 * Why these exist:
 *   - AI-generated JDs at scale can torch SEO if Google flags them
 *     as thin / keyword-stuffed / templated spam.
 *   - Employer-pasted JDs can leak profanity or PII (especially if
 *     they paste from a Word doc with comments).
 *   - Keeping the guardrail definitions in one place means the
 *     ingest-time enrichment cron and the live AI generator both
 *     enforce the same bar.
 *
 * Output shape: { ok: true } or { ok: false, errors: string[] }.
 * Callers use the errors[] array verbatim to show the employer what
 * to fix. Keep messages user-friendly — these are read by recruiters,
 * not engineers.
 */

const MIN_VISIBLE_CHARS = 1500;
// 25,000 chars matches the industry field norm for LinkedIn, Indeed,
// Greenhouse, Lever, and Workable. It's a SAFETY NET, not a target —
// the AI prompt ceilings keep machine-generated drafts well under
// 12k, and the cap mostly exists to accept the rare employer who
// pastes a long internal HR document. Form Zod validator and editor
// counter both match this number.
const MAX_VISIBLE_CHARS = 25000;
/** Max share any single 4+ char term can occupy of total terms. */
const MAX_KEYWORD_DENSITY = 0.04;

// Domain terms that ARE the role and naturally appear many times in a
// PMHNP JD. The keyword-density check skips these — flagging them as
// "stuffing" produces false positives on legitimate output. Stuffing
// detection still catches every other word at the 4% threshold.
const DOMAIN_TERM_WHITELIST = new Set<string>([
  'pmhnp', 'psychiatric', 'psychiatry', 'mental', 'health',
  'nurse', 'practitioner', 'practitioners', 'psych',
  'behavioral', 'clinical', 'patient', 'patients',
  'medication', 'medications', 'treatment', 'care',
  'experience', 'years', 'role', 'team', 'position',
]);

// Profanity / spam phrase list. Intentionally narrow — false positives
// on a healthcare JD are worse than the rare miss. We only catch the
// blatant stuff that should never appear in a recruiting document.
const PROFANITY = [
  'fuck', 'shit', 'bitch', 'cunt', 'cocksucker', 'motherfucker',
  // Spam patterns common in scraped descriptions
  'click here', 'limited time offer', '$$$', 'work from home make money',
];

// Required-information signals. JDs without ANY of these markers are
// almost always too thin to be useful (a placeholder, not a description).
const REQUIRED_SIGNALS = [
  // Role signal
  /\b(PMHNP|psychiatric|psychiatry|mental health|behavioral health)\b/i,
  // Care signal
  /\b(medication|therapy|treatment|diagnos|assessment|evaluation)\b/i,
];

function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export interface GuardrailResult {
  ok: boolean;
  errors: string[];
  /** Statistics surfaced for debugging / logging. */
  stats: {
    visibleChars: number;
    termCount: number;
    topTerm: { word: string; share: number } | null;
  };
}

/**
 * Compute the highest single-term density across all 4+ character
 * lowercase words. Returns the top offender so the error message can
 * cite it specifically.
 */
function topKeywordDensity(text: string): { word: string; share: number } | null {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4);

  if (words.length < 50) return null; // Too short for density to be meaningful.

  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);

  // Total stays as the full denominator so the percentage matches what
  // an SEO auditor would see — but we only consider non-whitelisted
  // terms when picking the offender. Otherwise "pmhnp" appearing 35
  // times in a thorough JD looks like keyword stuffing when it's just
  // the job's actual title.
  let top: { word: string; count: number } = { word: '', count: 0 };
  for (const [word, count] of counts) {
    if (DOMAIN_TERM_WHITELIST.has(word)) continue;
    if (count > top.count) top = { word, count };
  }
  if (top.count === 0) return null;
  return { word: top.word, share: top.count / words.length };
}

/**
 * Run every guardrail and return the combined result. Pure — no I/O,
 * no async. Cheap enough to call in a hot path (cron loop, AI endpoint).
 */
export function checkJdGuardrails(jdHtml: string): GuardrailResult {
  const errors: string[] = [];
  const text = stripHtml(jdHtml);
  const visibleChars = text.length;

  // Length bounds
  if (visibleChars < MIN_VISIBLE_CHARS) {
    errors.push(
      `Job description must be at least ${MIN_VISIBLE_CHARS} characters (currently ${visibleChars}).`,
    );
  }
  if (visibleChars > MAX_VISIBLE_CHARS) {
    errors.push(
      `Job description exceeds the ${MAX_VISIBLE_CHARS}-character limit (currently ${visibleChars}). Trim filler text.`,
    );
  }

  // Required role/care signals
  const missingSignals = REQUIRED_SIGNALS.filter((re) => !re.test(text));
  if (missingSignals.length > 0) {
    errors.push(
      'Job description must mention the PMHNP role and the type of clinical care (medication management, therapy, diagnosis, etc.).',
    );
  }

  // Profanity / spam markers
  const lower = text.toLowerCase();
  const profanityHits = PROFANITY.filter((p) => lower.includes(p));
  if (profanityHits.length > 0) {
    errors.push(
      `Job description contains language that doesn't belong in a recruiting post (${profanityHits.join(', ')}). Please revise.`,
    );
  }

  // Keyword density (spam / keyword-stuffing detection)
  const top = topKeywordDensity(text);
  if (top && top.share > MAX_KEYWORD_DENSITY) {
    errors.push(
      `The word "${top.word}" makes up ${(top.share * 100).toFixed(1)}% of the description — Google may flag this as keyword stuffing. Rewrite for variety.`,
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    stats: {
      visibleChars,
      termCount: text.split(/\s+/).filter(Boolean).length,
      topTerm: top,
    },
  };
}

export const JD_GUARDRAIL_LIMITS = Object.freeze({
  MIN_VISIBLE_CHARS,
  MAX_VISIBLE_CHARS,
  MAX_KEYWORD_DENSITY,
});
