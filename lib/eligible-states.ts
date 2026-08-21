/**
 * Conservative extraction of candidate-facing state-eligibility
 * restrictions from remote job descriptions, feeding the JobPosting
 * applicantLocationRequirements in components/JobStructuredData.tsx.
 *
 * Precision over recall: only phrases that constrain the CANDIDATE
 * ("must be licensed in ...", "open only to residents of ...",
 * "eligible states: ...") count. Employer-side reach claims like
 * "we are licensed in 42 states" must never match, which is why every
 * pattern requires the must/only/eligible framing. Returns [] unless at
 * least one real state parses, and [] again above MAX_ELIGIBLE_STATES
 * parsed states (a list that long is effectively nationwide).
 */
import { US_STATES, STATE_CODE_TO_NAME } from './us-states';

// A parsed list longer than this is effectively nationwide: emit no restriction.
const MAX_ELIGIBLE_STATES = 40;

// The text after a restriction phrase, up to a sentence/tag boundary.
const SEGMENT = String.raw`([^.;\n<]{1,400})`;
const SEGMENT_LAZY = String.raw`([^.;\n<]{1,400}?)`;

const RESTRICTION_PATTERNS: readonly RegExp[] = [
  // "must be licensed in Texas and Florida", "must be independently licensed to practice in ..."
  new RegExp(String.raw`must\s+be\s+(?:\w+\s+){0,3}?licen[sc]ed\s+(?:to\s+practice\s+)?in\s+${SEGMENT}`, 'i'),
  // "must hold a license in ...", "must have an active license in ..."
  new RegExp(String.raw`must\s+(?:hold|have|possess)\s+(?:\w+\s+){0,3}?licen[sc]es?\s+in\s+${SEGMENT}`, 'i'),
  // "must reside in ...", "must live in ...", "must be located in ..."
  new RegExp(String.raw`must\s+(?:reside|live|be\s+located)\s+in\s+${SEGMENT}`, 'i'),
  // "candidates in Texas only", "applicants located in TX, FL only"
  new RegExp(String.raw`(?:candidates?|applicants?)\s+(?:in|from|located\s+in)\s+${SEGMENT_LAZY}\s+only\b`, 'i'),
  // "open (only) to candidates/applicants/residents in/of/from ..."
  new RegExp(String.raw`open\s+(?:only\s+)?to\s+(?:candidates?|applicants?|residents?)\s+(?:in|of|from)\s+${SEGMENT}`, 'i'),
  // "eligible states: ..." / "eligible states include ..."
  new RegExp(String.raw`eligible\s+states?\s*(?::|includes?)\s*${SEGMENT}`, 'i'),
  // "licensed in the following states: ..."
  new RegExp(String.raw`licen[sc]ed\s+in\s+the\s+following\s+states?\s*:?\s*${SEGMENT}`, 'i'),
];

// Longest alias first so "west virginia" wins over "virginia" and
// "washington dc" over "washington"; matched spans are blanked out below
// so a shorter alias can never re-match inside a longer one.
const ALIASES_LONGEST_FIRST: ReadonlyArray<{ alias: string; code: string }> = US_STATES
  .flatMap((s) => s.aliases.map((alias) => ({ alias, code: s.code })))
  .sort((a, b) => b.alias.length - a.alias.length);

// State codes that double as English words: in an ALL-CAPS segment
// ("...LICENSED IN CALIFORNIA OR NEW YORK") they are ordinary words, not
// codes, so they only count when the segment has normal casing.
const AMBIGUOUS_WORD_CODES = new Set(['IN', 'OR', 'ME', 'OK', 'HI']);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Join soft line breaks and normalize D.C. spellings before matching.
 * <br> tags and single newlines are line FORMATTING inside a sentence
 * ("licensed in Texas,<br>Florida") — without joining them the segment
 * regex stops at the break and emits a partial, wrongly-narrow state list.
 * Blank-line paragraph breaks remain boundaries. "D.C." must lose its
 * periods (and "Washington, DC" its comma) because '.' terminates a
 * segment and the comma blocks the "washington dc" alias.
 */
function normalizeForMatching(description: string): string {
  return description
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/([^\n])\n(?!\n)/g, '$1 ')
    .replace(/\bD\.\s?C\.(?!\w)/g, 'DC')
    .replace(/\bwashington,\s+(?:dc|d\.\s?c\.)(?!\w)/gi, 'washington dc');
}

/** State codes found in one captured segment, ordered by first appearance. */
function parseStatesFromSegment(segment: string): string[] {
  const found = new Map<string, number>();
  let haystack = segment.toLowerCase();
  for (const { alias, code } of ALIASES_LONGEST_FIRST) {
    const re = new RegExp(String.raw`(?<![a-z])${escapeRegExp(alias)}(?![a-z])`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(haystack)) !== null) {
      if (!found.has(code)) found.set(code, m.index);
      haystack =
        haystack.slice(0, m.index) +
        '#'.repeat(alias.length) +
        haystack.slice(m.index + alias.length);
    }
  }
  const isAllCaps = !/[a-z]/.test(segment);
  const codeToken = /\b[A-Z]{2}\b/g;
  let m: RegExpExecArray | null;
  while ((m = codeToken.exec(segment)) !== null) {
    const code = m[0];
    if (!STATE_CODE_TO_NAME[code]) continue;
    if (AMBIGUOUS_WORD_CODES.has(code)) {
      if (isAllCaps) continue;
      // Mixed-case text: an uppercase IN/OR/ME/OK/HI flanked by state
      // tokens on BOTH sides is a conjunction ("CA OR NY"), not a state.
      // Neighbors are either a claimed full-name span ('#' in haystack)
      // or another 2-letter state code, joined by pure whitespace.
      const leftText = segment.slice(0, m.index);
      const rightText = segment.slice(m.index + code.length);
      const leftIsState =
        /#\s+$/.test(haystack.slice(0, m.index)) ||
        (/\b[A-Z]{2}\s+$/.test(leftText) &&
          STATE_CODE_TO_NAME[leftText.trimEnd().slice(-2)] !== undefined);
      const rightIsState =
        /^\s+#/.test(haystack.slice(m.index + code.length)) ||
        (/^\s+[A-Z]{2}\b/.test(rightText) &&
          STATE_CODE_TO_NAME[rightText.trimStart().slice(0, 2)] !== undefined);
      if (leftIsState && rightIsState) continue;
    }
    // '#' means a full state name already claimed this span.
    if (haystack[m.index] === '#') continue;
    if (!found.has(code)) found.set(code, m.index);
  }
  return [...found.entries()].sort((a, b) => a[1] - b[1]).map(([code]) => code);
}

/**
 * Full state names a remote job's description restricts eligibility to,
 * or [] when the description reads as nationwide (no restriction phrase,
 * no parseable state, or more than MAX_ELIGIBLE_STATES states).
 */
export function extractEligibleStates(description: string): string[] {
  if (!description) return [];
  const text = normalizeForMatching(description);
  const orderedCodes: string[] = [];
  const seen = new Set<string>();
  for (const pattern of RESTRICTION_PATTERNS) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    // A segment cut off by markup or a paragraph break may be a PARTIAL
    // list (e.g. "...in Texas,</li><li>Florida"). Emitting it would
    // wrongly narrow the restriction, so bail to nationwide instead.
    const end = (match.index ?? 0) + match[0].length;
    if (text[end] === '<' || text[end] === '\n') return [];
    for (const code of parseStatesFromSegment(match[1])) {
      if (!seen.has(code)) {
        seen.add(code);
        orderedCodes.push(code);
      }
    }
  }
  if (orderedCodes.length === 0 || orderedCodes.length > MAX_ELIGIBLE_STATES) return [];
  return orderedCodes.map((code) => STATE_CODE_TO_NAME[code]);
}
