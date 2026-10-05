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
export const STATS_LAST_REVIEWED = '2026-10-05';

export const STAT_SOURCES = {
    /**
     * Nurse Practitioner MEDIAN annual wage from BLS OEWS 29-1171.
     *
     * NOT a PMHNP figure, and the label must not imply one. BLS OEWS does not
     * break out psychiatric mental health NPs; 29-1171 is Nurse Practitioners
     * as a whole. This was previously described as "Average annual PMHNP
     * salary", which attributed a specialty-specific claim to a source that
     * does not report the specialty.
     *
     * It is also a median, and the key says so. Until 2026-10 this entry was
     * `npAverageSalaryBls` and held $155,000 dated 2024-05, a number BLS has
     * never published for this occupation: the homepage FAQ was telling
     * readers and answer engines that a federal source said something it did
     * not. The value below was read off the Occupational Outlook Handbook pay
     * table on 2026-10-05 (page last modified 2026-08-27), which reports the
     * May 2025 OEWS median for nurse practitioners.
     *
     * For PMHNP pay, the live engine is the answer: lib/salary-report computes
     * medians of advertised ranges from real postings and publishes the sample
     * size. That is the number every salary surface should quote. This entry
     * exists only for labor-market CONTEXT, cited as what it actually is.
     */
    npMedianWageBls: {
        value: '132300',
        formatted: '$132,300',
        source: 'BLS OEWS 29-1171, Nurse Practitioners (all specialties)',
        sourceUrl: 'https://www.bls.gov/ooh/healthcare/nurse-anesthetists-nurse-midwives-and-nurse-practitioners.htm',
        asOf: '2025-05',
    },

    /** BLS-projected employment growth for nurse practitioners specifically
     *  (the combined nurse anesthetist / midwife / NP group figure is lower).
     *  Verified 2026-10-05: 336,300 employed in 2025, 474,100 projected 2035. */
    blsGrowthProjection: {
        value: '41',
        formatted: '41%',
        // No em/en dashes: this string interpolates into user-facing FAQ
        // answers (homepage + blog), which follow the "X to Y" range style.
        source: 'BLS Occupational Outlook Handbook, Nurse Practitioners (2025 to 2035 projection)',
        sourceUrl: 'https://www.bls.gov/ooh/healthcare/nurse-anesthetists-nurse-midwives-and-nurse-practitioners.htm',
        asOf: '2026',
        projectionWindow: '2025 to 2035',
    },

    /**
     * Population of Americans living in mental-health Health Professional
     * Shortage Areas. Read off the quarterly summary dated 2026-09-30:
     * 154,557,656 people across 7,127 designations. The figure moves with each
     * redesignation cycle, so re-read it rather than assuming a trend.
     */
    hrsaShortagePopulation: {
        value: '154557656',
        formatted: '155 million',
        source: 'HRSA Bureau of Health Workforce, Designated HPSA Quarterly Summary',
        sourceUrl: 'https://data.hrsa.gov/topics/health-workforce/shortage-areas',
        asOf: '2026-09',
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
     * The classifications had their verification pass on 2026-10-05; the
     * header of lib/state-practice-authority.ts records what was checked,
     * against what, and what is still open.
     */
    fullPracticeStates: {
        value: String(FULL_PRACTICE_STATE_COUNT),
        formatted: FULL_PRACTICE_SUMMARY,
        // Citation travels with the table, not retyped beside it.
        source: PRACTICE_AUTHORITY_SOURCE,
        sourceUrl: PRACTICE_AUTHORITY_SOURCE_URL,
        asOf: '2026-10',
    },
} satisfies Record<string, StatSource>;

/**
 * Render a stat with an inline citation suitable for visible HTML or JSON-LD
 * answer text. Example output for `npMedianWageBls`:
 *   "$132,300 (BLS OEWS 29-1171, Nurse Practitioners (all specialties), 2025-05)"
 */
export function citedValue(s: StatSource): string {
    return `${s.range ?? s.formatted} (${s.source}, ${s.asOf})`;
}
