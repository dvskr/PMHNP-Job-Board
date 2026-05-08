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
}

/** When the stats in this file were last verified against their sources. */
export const STATS_LAST_REVIEWED = '2026-05-08';

export const STAT_SOURCES = {
    /** Average annual PMHNP salary, US-wide. */
    averageSalary: {
        value: '155000',
        formatted: '$155,000',
        range: '$155,000–$165,000',
        source: 'BLS OEWS, Nurse Anesthetists / Nurse Practitioners (May 2024 release)',
        sourceUrl: 'https://www.bls.gov/oes/current/oes291171.htm',
        asOf: '2024-05',
    },

    /** BLS-projected employment growth for nurse practitioners through 2032. */
    blsGrowth2032: {
        value: '45',
        formatted: '45%',
        source: 'BLS Occupational Outlook Handbook — Nurse Practitioners (2022–2032 projection)',
        sourceUrl: 'https://www.bls.gov/ooh/healthcare/nurse-anesthetists-nurse-midwives-and-nurse-practitioners.htm',
        asOf: '2024',
    },

    /** Population of Americans living in mental-health Health Professional Shortage Areas. */
    hrsaShortagePopulation: {
        value: '123000000',
        formatted: '123 million',
        source: 'HRSA Bureau of Health Workforce, Designated HPSA Quarterly Summary',
        sourceUrl: 'https://data.hrsa.gov/topics/health-workforce/shortage-areas',
        asOf: '2024',
    },

    /** States granting Full Practice Authority to NPs (incl. DC). */
    fullPracticeStates: {
        value: '27',
        formatted: '27 states + DC',
        source: 'AANP State Practice Environment',
        sourceUrl: 'https://www.aanp.org/advocacy/state/state-practice-environment',
        asOf: '2024',
    },
} as const satisfies Record<string, StatSource>;

/**
 * Render a stat with an inline citation suitable for visible HTML or JSON-LD
 * answer text. Example output for `averageSalary`:
 *   "$155,000 (BLS OEWS, May 2024)"
 */
export function citedValue(s: StatSource): string {
    return `${s.range ?? s.formatted} (${s.source}, ${s.asOf})`;
}
