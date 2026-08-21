/**
 * Natural-language query parser for the semantic job search.
 *
 * Pulls hard constraints out of the user's free-text query so we can apply
 * them as SQL filters, leaving only the semantic intent for the embedding.
 *
 * Why this matters: cosine similarity treats "California" as one feature
 * among many. A query like "telehealth child psych in CA" returns Oregon
 * and Massachusetts roles because the model sees "telehealth + psych" as
 * the dominant signal. Extracting CA → state filter forces the SQL layer
 * to honor it as a hard constraint.
 *
 * Currently extracts:
 *   - US state (2-letter code or full name)
 *   - remote intent (the word "remote" in the query)
 *   - annual salary floor ("over $140k", "$140k+", "at least $140,000")
 *   - new-grad intent ("new grad", "entry level")
 *
 * Returns the cleaned query (with extracted tokens removed) so the embedding
 * sees a tighter signal.
 */

import { US_STATES as CANONICAL_US_STATES } from '@/lib/us-states';

// Canonical registry adapted to this parser's { code, names } shape.
// lib/us-states.ts preserves the DC-before-WA ordering this matcher's
// longest-name-first pass depends on.
const US_STATES: ReadonlyArray<{ code: string; names: ReadonlyArray<string> }> =
    CANONICAL_US_STATES.map((s) => ({ code: s.code, names: s.aliases }));

// Pre-built lookup tables for fast matching.
const STATE_BY_NAME = new Map<string, string>();
for (const { code, names } of US_STATES) {
    for (const name of names) STATE_BY_NAME.set(name, code);
}
const VALID_STATE_CODES = new Set(US_STATES.map((s) => s.code));

// ── Salary-floor patterns ────────────────────────────────────────────
// Amount forms accepted as ANNUAL dollars (hourly rates like "$95/hr" never
// fit these shapes): "$140k"/"140k" → thousands (40..999 only), and
// "$140,000"/"140000" → comma or plain 6-digit annual dollars.
const AMOUNT = String.raw`(?<![\d,.])(?:\$?(\d{2,3})k\b|\$?(\d{2,3},\d{3}|\d{6})\b)`;
// An amount followed by a bonus or per-hour marker is not a salary floor.
// "sign(?:[- ]?on|ing)" covers "sign-on", "sign on", and "signing" bonuses.
const NOT_BONUS_OR_HOURLY = String.raw`(?!\s*(?:\/\s*(?:hr|hour)\b|per\s+(?:hr|hour)\b|an\s+hour\b|hourly\b|sign(?:[- ]?on|ing)\b|bonus\b))`;
// Optional range tail so "salary $120k-$140k" strips wholesale instead of
// leaving a "-$140k" residue in the cleaned query. Non-capturing: the floor
// stays the FIRST amount, and groups 1/2 keep their positions.
const RANGE_TAIL = String.raw`(?:\s*(?:-|–|—|to|through)\s*\$?(?:\d{2,3}k|\d{2,3},\d{3}|\d{6})\b)?`;
const SALARY_WORD = String.raw`(?:salary|salaries|pay(?:s|ing)?|compensation|comp|base)`;
const FLOOR_CUE = String.raw`(?:over|above|at\s+least|more\s+than|making|earning|starting\s+at|minimum(?:\s+of)?|min(?:\s+of)?)`;

// Ordered most-explicit-first. Each pattern embeds AMOUNT exactly once and
// keeps everything else non-capturing, so group 1 (thousands) and group 2
// (plain dollars) line up across all of them.
const SALARY_FLOOR_PATTERNS: ReadonlyArray<RegExp> = [
    // Floor cue before the amount: "over $140k", "salary over 140k",
    // "at least $140,000", "making $200k".
    new RegExp(String.raw`(?:${SALARY_WORD}\s+(?:of\s+|is\s+)?)?${FLOOR_CUE}\s+${AMOUNT}${RANGE_TAIL}${NOT_BONUS_OR_HOURLY}`, 'i'),
    // Floor marker after the amount: "$140k+", "140k minimum", "140k or more".
    new RegExp(String.raw`(?:${SALARY_WORD}\s+(?:of\s+)?)?${AMOUNT}\s*(?:\+|(?:minimum|min|or\s+more|and\s+up)\b)`, 'i'),
    // Bare amount anchored by an adjacent salary word: "salary $140k", "pay: 140k".
    new RegExp(String.raw`${SALARY_WORD}\s*(?:of|:|is|at)?\s*${AMOUNT}${RANGE_TAIL}${NOT_BONUS_OR_HOURLY}`, 'i'),
];

const NEW_GRAD_RE = /\b(?:new[- ]grad(?:uate)?s?|newly graduated|entry[- ]level)\b/i;

/**
 * Find an annual salary floor in the lowercased query. Conservative by
 * design: a missed floor degrades to unfiltered behavior, a WRONG floor
 * hides valid jobs — so anything ambiguous returns undefined.
 */
function matchSalaryFloor(text: string): { token: string; value: number } | undefined {
    for (const re of SALARY_FLOOR_PATTERNS) {
        for (const m of text.matchAll(new RegExp(re.source, 'gi'))) {
            // "401k" is the retirement plan, never a $401,000 floor — skip it
            // and keep scanning ("401k + PTO, $150k+" still yields 150000).
            if (m[1] === '401') continue;
            const value = m[1]
                ? Number(m[1]) * 1000
                : Number((m[2] ?? '').replace(/,/g, ''));
            // Sanity band for an annual floor — outside it the number is more
            // likely a bonus figure or a typo than a real salary requirement.
            if (value >= 40_000 && value <= 999_999) return { token: m[0], value };
            return undefined;
        }
    }
    return undefined;
}

export interface ParsedSemanticQuery {
    /** Original user input. */
    raw: string;
    /** Query with extracted hard-constraint tokens removed; safe to embed. */
    cleaned: string;
    /** 2-letter US state code, if mentioned (e.g. "in CA" or "California"). */
    state?: string;
    /** True when the query suggests remote-only intent. */
    remoteOnly?: boolean;
    /** Annual USD salary floor, if stated (e.g. "over $140k" → 140000). */
    minSalary?: number;
    /** True when the query asks for new-grad / entry-level roles. */
    newGrad?: boolean;
}

/**
 * Parse a natural-language query. Hard-constraint tokens (state, "remote")
 * are extracted and stripped from the cleaned query so the embedding sees
 * just the semantic intent.
 */
export function parseSemanticQuery(raw: string): ParsedSemanticQuery {
    const original = raw.trim();
    if (!original) return { raw, cleaned: '' };

    let working = ` ${original.toLowerCase()} `; // pad so word-boundary regex catches edges
    let state: string | undefined;
    let remoteOnly = false;

    // ── State by full name (longest first to avoid "washington" eating "washington dc") ──
    const sortedNames = [...STATE_BY_NAME.keys()].sort((a, b) => b.length - a.length);
    for (const name of sortedNames) {
        const re = new RegExp(`(^|\\s|in\\s|from\\s|near\\s)${name.replace(/\./g, '\\.')}(\\s|$|,|\\.)`, 'i');
        if (re.test(working)) {
            state = STATE_BY_NAME.get(name)!;
            working = working.replace(re, ' ');
            break;
        }
    }

    // ── State by 2-letter code ──
    // Two ambiguities to dodge:
    //   1. Common English 2-letter words ARE state codes (IN, OR, OK, ME, HI).
    //      "telehealth psych in CA" must NOT pull "IN" as Indiana.
    //   2. The user's casing is a strong signal — state codes are
    //      conventionally written in uppercase ("CA"), prepositions are not.
    //
    // Strategy:
    //   - Prefer code AFTER a directional preposition: "in CA", "from TX"
    //   - Otherwise accept an uppercase code at a word boundary in the
    //     ORIGINAL (case-preserved) query. Lowercased "in"/"or" etc. won't qualify.
    if (!state) {
        // Pass 1 — preposition + code (case-insensitive — prep word resolves it).
        const prepMatch = working.match(/(?:\bin|\bfrom|\bnear|\bat)\s+([a-z]{2})(?=\s|$|,|\.)/i);
        if (prepMatch) {
            const code = prepMatch[1].toUpperCase();
            if (VALID_STATE_CODES.has(code)) {
                state = code;
                working = working.replace(prepMatch[0], ' ');
            }
        }
    }
    if (!state) {
        // Pass 2 — uppercase-only code at a word boundary in the ORIGINAL query.
        // " CA" / "CA " / "CA," all qualify; "in", "or", "ca" do not.
        // Scan ALL uppercase pairs and take the first that is a real state code —
        // a non-global single match stopped at "NP" (e.g. "telepsych NP CA") and
        // never reached the actual state code that followed.
        for (const m of original.matchAll(/(?:^|\s)([A-Z]{2})(?=\s|$|,|\.)/g)) {
            const code = m[1];
            if (VALID_STATE_CODES.has(code)) {
                state = code;
                working = working.replace(new RegExp(`(?:^|\\s)${code.toLowerCase()}(?=\\s|$|,|\\.)`, 'i'), ' ');
                break;
            }
        }
    }

    // ── Remote intent ──
    if (/\b(remote|telework|work[- ]from[- ]home|wfh|virtual)\b/i.test(working)) {
        remoteOnly = true;
        working = working.replace(/\b(remote|telework|work[- ]from[- ]home|wfh|virtual)\b/gi, ' ');
    }

    // ── Salary floor ──
    let minSalary: number | undefined;
    const salaryFloor = matchSalaryFloor(working);
    if (salaryFloor) {
        minSalary = salaryFloor.value;
        working = working.replace(salaryFloor.token, ' ');
    }

    // ── New-grad intent ──
    let newGrad = false;
    if (NEW_GRAD_RE.test(working)) {
        newGrad = true;
        working = working.replace(new RegExp(NEW_GRAD_RE.source, 'gi'), ' ');
    }

    // ── Strip lone connector words left behind ("in", "from", "near") ──
    working = working.replace(/\b(in|from|near|at)\s*/gi, ' ');

    // Collapse whitespace + punctuation noise.
    const cleaned = working.replace(/[\s,]+/g, ' ').trim();

    return {
        raw,
        cleaned: cleaned || original, // fall back to original if cleaning emptied the query
        state,
        remoteOnly: remoteOnly || undefined,
        minSalary,
        newGrad: newGrad || undefined,
    };
}
