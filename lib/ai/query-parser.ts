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

const US_STATES: ReadonlyArray<{ code: string; names: ReadonlyArray<string> }> = [
    { code: 'AL', names: ['alabama'] },
    { code: 'AK', names: ['alaska'] },
    { code: 'AZ', names: ['arizona'] },
    { code: 'AR', names: ['arkansas'] },
    { code: 'CA', names: ['california', 'calif'] },
    { code: 'CO', names: ['colorado'] },
    { code: 'CT', names: ['connecticut'] },
    { code: 'DE', names: ['delaware'] },
    { code: 'DC', names: ['district of columbia', 'washington dc', 'washington d.c.'] },
    { code: 'FL', names: ['florida'] },
    { code: 'GA', names: ['georgia'] },
    { code: 'HI', names: ['hawaii'] },
    { code: 'ID', names: ['idaho'] },
    { code: 'IL', names: ['illinois'] },
    { code: 'IN', names: ['indiana'] },
    { code: 'IA', names: ['iowa'] },
    { code: 'KS', names: ['kansas'] },
    { code: 'KY', names: ['kentucky'] },
    { code: 'LA', names: ['louisiana'] },
    { code: 'ME', names: ['maine'] },
    { code: 'MD', names: ['maryland'] },
    { code: 'MA', names: ['massachusetts', 'mass'] },
    { code: 'MI', names: ['michigan'] },
    { code: 'MN', names: ['minnesota'] },
    { code: 'MS', names: ['mississippi'] },
    { code: 'MO', names: ['missouri'] },
    { code: 'MT', names: ['montana'] },
    { code: 'NE', names: ['nebraska'] },
    { code: 'NV', names: ['nevada'] },
    { code: 'NH', names: ['new hampshire'] },
    { code: 'NJ', names: ['new jersey'] },
    { code: 'NM', names: ['new mexico'] },
    { code: 'NY', names: ['new york'] },
    { code: 'NC', names: ['north carolina'] },
    { code: 'ND', names: ['north dakota'] },
    { code: 'OH', names: ['ohio'] },
    { code: 'OK', names: ['oklahoma'] },
    { code: 'OR', names: ['oregon'] },
    { code: 'PA', names: ['pennsylvania', 'penn'] },
    { code: 'RI', names: ['rhode island'] },
    { code: 'SC', names: ['south carolina'] },
    { code: 'SD', names: ['south dakota'] },
    { code: 'TN', names: ['tennessee'] },
    { code: 'TX', names: ['texas'] },
    { code: 'UT', names: ['utah'] },
    { code: 'VT', names: ['vermont'] },
    { code: 'VA', names: ['virginia'] },
    { code: 'WA', names: ['washington state', 'washington'] }, // disambiguates from DC above
    { code: 'WV', names: ['west virginia'] },
    { code: 'WI', names: ['wisconsin'] },
    { code: 'WY', names: ['wyoming'] },
];

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
        const upperMatch = original.match(/(?:^|\s)([A-Z]{2})(?=\s|$|,|\.)/);
        if (upperMatch) {
            const code = upperMatch[1];
            if (VALID_STATE_CODES.has(code)) {
                state = code;
                working = working.replace(new RegExp(`(?:^|\\s)${code.toLowerCase()}(?=\\s|$|,|\\.)`, 'i'), ' ');
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
