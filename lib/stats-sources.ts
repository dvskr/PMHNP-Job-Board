/**
 * Single source of truth for cited statistics rendered across the site.
 *
 * Why this exists (SEO Fix C5/C6):
 * Healthcare YMYL content is held to a higher trust bar by Google. Quoting
 * salary, growth, and shortage numbers without citing a verifiable source —
 * or worse, citing different numbers on different pages — is a direct
 * E-E-A-T (Trustworthiness) hit and a manual-action risk. This file
 * centralizes every stat used in homepage FAQ, blog posts, About copy,
 * and JSON-LD so the same value lands everywhere with the same source link.
 *
 * Update protocol:
 *   1. Pull the latest figure from the cited source.
 *   2. Update `value` + `formatted` + `asOf` here.
 *   3. Bump the file's `STATS_LAST_REVIEWED` date below.
 *   4. The next deploy automatically propagates to homepage/FAQ/blog.
 *
 * Never hardcode a salary / growth / shortage number anywhere else.
 */

import {
    FULL_PRACTICE_STATE_COUNT,
    FULL_PRACTICE_SUMMARY,
    PRACTICE_AUTHORITY_SOURCE,
    PRACTICE_AUTHORITY_SOURCE_URL,
} from './state-practice-authority';

export interface StatSource {
    /** Raw numeric value used in JSON-LD or computations. */
    value: string;
    /** Human-formatted display value (e.g. "$155,000", "45%"). */
    formatted: string;
    /** Wider range for ranges shown on listing pages, e.g. "$155K–$165K". */
    range?: string;
    /** Short citation phrase rendered next to the stat. */
    source: string;
    /** Resolvable source URL (verify periodically). */
    sourceUrl: string;
    /** Date the source data was published or last refreshed. */
    asOf: string;
    /** Projection window for forward-looking stats, e.g. "2024 to 2034". */
    projectionWindow?: string;
}

/** When the stats in this file were last verified against their sources. */
export const STATS_LAST_REVIEWED = '2026-08-19';

export const STAT_SOURCES = {
    /**
     * Nurse Practitioner pay from BLS OEWS 29-1171.
     *
     * NOT a PMHNP figure, and the label must not imply one. BLS OEWS does not
     * break out psychiatric mental health NPs; 29-1171 is Nurse Practitioners
     * as a whole. This was previously described as "Average annual PMHNP
     * salary", which attributed a specialty-specific claim to a source that
     * does not report the specialty.
     *
     * For PMHNP pay, the live engine is the answer: lib/salary-report computes
     * medians of advertised ranges from real postings and publishes the sample
     * size. That is the number every salary surface should quote. This entry
     * exists only for labor-market CONTEXT, cited as what it actually is.
     *
     * OPERATOR: `value` and `asOf` need re-verification against the current
     * OEWS release before this is quoted anywhere new.
     */
    npAverageSalaryBls: {
        value: '155000',
        formatted: '$155,000',
        range: '$155,000 to $165,000',
        source: 'BLS OEWS 29-1171, Nurse Practitioners (all specialties)',
        sourceUrl: 'https://www.bls.gov/oes/current/oes291171.htm',
        asOf: '2024-05',
    },

    /** BLS-projected employment growth for nurse practitioners specifically
     *  (the combined nurse anesthetist / midwife / NP group figure is lower). */
    blsGrowthProjection: {
        value: '40',
        formatted: '40%',
        // No em/en dashes: this string interpolates into user-facing FAQ
        // answers (homepage + blog), which follow the "X to Y" range style.
        source: 'BLS Occupational Outlook Handbook, Nurse Practitioners (2024 to 2034 projection)',
        sourceUrl: 'https://www.bls.gov/ooh/healthcare/nurse-anesthetists-nurse-midwives-and-nurse-practitioners.htm',
        asOf: '2026',
        projectionWindow: '2024 to 2034',
    },

    /** Population of Americans living in mental-health Health Professional Shortage Areas. */
    hrsaShortagePopulation: {
        value: '123000000',
        formatted: '123 million',
        source: 'HRSA Bureau of Health Workforce, Designated HPSA Quarterly Summary',
        sourceUrl: 'https://data.hrsa.gov/topics/health-workforce/shortage-areas',
        asOf: '2024',
    },

    /**
     * States granting Full Practice Authority to NPs, DC included.
     *
     * DERIVED from lib/state-practice-authority.ts, never typed here. This
     * entry used to carry a hand-written "27 states + DC" while that table
     * listed a different number and the blog published a third, so the
     * practice-authority map and the sentence beside it disagreed in front of
     * readers and answer engines. The count now cannot drift from the data
     * every map and state page renders from.
     *
     * OPERATOR: the classifications themselves still need a pass against the
     * AANP State Practice Environment. Massachusetts in particular is listed
     * as 'reduced' in our table and AANP may classify it as full.
     */
    fullPracticeStates: {
        value: String(FULL_PRACTICE_STATE_COUNT),
        formatted: FULL_PRACTICE_SUMMARY,
        // Citation travels with the table, not retyped beside it.
        source: PRACTICE_AUTHORITY_SOURCE,
        sourceUrl: PRACTICE_AUTHORITY_SOURCE_URL,
        asOf: '2024',
    },
} satisfies Record<string, StatSource>;

/**
 * Render a stat with an inline citation suitable for visible HTML or JSON-LD
 * answer text. Example output for `npAverageSalaryBls`:
 *   "$155,000 to $165,000 (BLS OEWS 29-1171, Nurse Practitioners (all specialties), 2024-05)"
 */
export function citedValue(s: StatSource): string {
    return `${s.range ?? s.formatted} (${s.source}, ${s.asOf})`;
}
