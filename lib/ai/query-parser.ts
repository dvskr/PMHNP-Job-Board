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

export interface ParsedSemanticQuery {
    /** Original user input. */
    raw: string;
    /** Query with extracted hard-constraint tokens removed; safe to embed. */
    cleaned: string;
    /** 2-letter US state code, if mentioned (e.g. "in CA" or "California"). */
    state?: string;
    /** True when the query suggests remote-only intent. */
    remoteOnly?: boolean;
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

    // ── Strip lone connector words left behind ("in", "from", "near") ──
    working = working.replace(/\b(in|from|near|at)\s*/gi, ' ');

    // Collapse whitespace + punctuation noise.
    const cleaned = working.replace(/[\s,]+/g, ' ').trim();

    return {
        raw,
        cleaned: cleaned || original, // fall back to original if cleaning emptied the query
        state,
        remoteOnly: remoteOnly || undefined,
    };
}
