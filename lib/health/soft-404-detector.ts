/**
 * Soft-404 detection.
 *
 * Many ATS platforms return HTTP 200 with "this job is no longer available"
 * landing pages instead of an honest 404. The legacy dead-link checker reads
 * any 2xx as alive and is therefore blind to ~90% of closed Greenhouse jobs.
 *
 * This module scans the final URL and (optionally) the response body for a
 * curated pattern library. Patterns are scoped:
 *   - source=null → universal (apply to any source's HTML)
 *   - source='greenhouse' → only run when the job came from greenhouse
 *
 * False-positive guard: we deliberately keep the universal patterns specific
 * (no bare /404/ or /expired/ — those word-boundary matches false-positive
 * routinely on legitimate job descriptions).
 */

export interface SoftMatch {
    /** Short stable identifier for the pattern (used in logs and audit rows). */
    patternId: string;
    /** First ~80 chars of the matched substring. */
    matchText: string;
    /** Where the match was found. */
    location: 'body' | 'final_url';
}

interface PatternRule {
    id: string;
    /** Source provider this rule applies to, or null for universal. */
    source: string | null;
    location: 'body' | 'final_url';
    pattern: RegExp;
}

/**
 * Pattern library. Order does not matter — first match wins.
 *
 * IMPORTANT: review false-positive rate periodically (target < 2% per pattern).
 * Bump CHECKER_VERSION when adding/changing patterns so audit rows stay comparable.
 */
const PATTERNS: ReadonlyArray<PatternRule> = [
    // ---- Universal body patterns ----
    { id: 'position_filled', source: null, location: 'body', pattern: /this position has been filled/i },
    { id: 'no_longer_accepting', source: null, location: 'body', pattern: /no longer accepting (applications|candidates|applicants)/i },
    { id: 'job_no_longer_available', source: null, location: 'body', pattern: /this (job|posting|position|requisition|role|opportunity)\s+(is\s+)?(no longer|has been)\s+(available|active|posted|accepting|open|filled|closed|removed)/i },
    { id: 'sorry_position', source: null, location: 'body', pattern: /sorry,?\s+(this|the)\s+(job|position|listing|opportunity|opening)\s+(is|has)\b/i },
    { id: 'requisition_closed', source: null, location: 'body', pattern: /requisition (is\s+)?(closed|cancell?ed)/i },
    { id: 'role_filled', source: null, location: 'body', pattern: /(this )?role (has been|is now) filled/i },
    { id: 'job_posting_removed', source: null, location: 'body', pattern: /job (posting|listing) (has been|was) (removed|taken down)/i },
    { id: 'page_not_found_jobs', source: null, location: 'body', pattern: /careers?\s*[\|\-–:]\s*page not found/i },

    // ---- Greenhouse: returns 200 with a generic "this position has been removed" page ----
    { id: 'greenhouse_no_longer', source: 'greenhouse', location: 'body', pattern: /this (role|position|job|opening) (is no longer|has been) (open|available|active|posted)/i },
    { id: 'greenhouse_removed', source: 'greenhouse', location: 'body', pattern: /this (job posting )?has been (closed|filled|removed)/i },

    // ---- Adzuna: tracked link sometimes redirects to a closed-job landing page ----
    { id: 'adzuna_sorry', source: 'adzuna', location: 'body', pattern: /sorry,?\s+(this|the)\s+(job|advert|listing)/i },

    // ---- Lever, Workday, JSearch, Fantastic / generic ATS ----
    { id: 'lever_not_found', source: 'lever', location: 'body', pattern: /job\s+not\s+found|posting\s+not\s+found/i },
    { id: 'workday_unavailable', source: 'workday', location: 'body', pattern: /this job (posting|requisition) is no longer (available|accepting)/i },

    // ---- Final-URL patterns ----
    // After a redirect, many platforms land on "/closed", "/expired", etc.
    { id: 'url_closed', source: null, location: 'final_url', pattern: /\/(jobs?|positions?|careers?|listings?)\/(closed|expired|filled|removed|deleted)\b/i },
    { id: 'url_no_longer_available', source: null, location: 'final_url', pattern: /\/no[-_]longer[-_]available\b/i },
    { id: 'url_job_not_found', source: null, location: 'final_url', pattern: /\/(job|jobs|career|careers)[-_]not[-_]found\b/i },
];

/**
 * Bumped whenever PATTERNS changes. Stored on every audit row so old data
 * stays comparable when rules evolve.
 *
 * v1.1.0 (2026-05-06): Gap G5. Body scan now bounded to first
 * BODY_HEAD_SCAN_CHARS chars. Real "this position is no longer available"
 * banners always render above the fold; matching deeper in the page
 * surfaces false positives from employer testimonials / blog posts that
 * happen to use the same phrasing.
 */
export const SOFT_404_CHECKER_VERSION = 'v1.1.0';

/**
 * Body-scan ceiling. Most HR ATS pages put the dead-job banner in the
 * first 1-2k chars of HTML (header + hero). 4000 leaves headroom for
 * server-rendered nav/menu code without admitting body-deep matches.
 */
const BODY_HEAD_SCAN_CHARS = 4000;

/**
 * Detect soft-404 markers in a probe result.
 *
 * Returns the first match found, or null. Scans the final URL first
 * (cheap, length-bounded), then the head of the body if provided.
 */
export function detectSoft404(
    sourceProvider: string | null,
    finalUrl: string,
    bodyHtml: string | null,
): SoftMatch | null {
    const sourceKey = sourceProvider?.toLowerCase() ?? null;

    // 1. URL-fragment patterns
    for (const rule of PATTERNS) {
        if (rule.location !== 'final_url') continue;
        if (rule.source !== null && rule.source !== sourceKey) continue;
        const m = rule.pattern.exec(finalUrl);
        if (m) {
            return {
                patternId: rule.id,
                matchText: m[0].slice(0, 80),
                location: 'final_url',
            };
        }
    }

    // 2. Body patterns — bounded to head of HTML to keep false positives low.
    if (bodyHtml && bodyHtml.length > 0) {
        const bodyHead = bodyHtml.length > BODY_HEAD_SCAN_CHARS
            ? bodyHtml.slice(0, BODY_HEAD_SCAN_CHARS)
            : bodyHtml;
        for (const rule of PATTERNS) {
            if (rule.location !== 'body') continue;
            if (rule.source !== null && rule.source !== sourceKey) continue;
            const m = rule.pattern.exec(bodyHead);
            if (m) {
                return {
                    patternId: rule.id,
                    matchText: m[0].slice(0, 80),
                    location: 'body',
                };
            }
        }
    }

    return null;
}

/** Exposed for tests / admin tooling. */
export function listPatterns(): ReadonlyArray<{ id: string; source: string | null; location: 'body' | 'final_url' }> {
    return PATTERNS.map(({ id, source, location }) => ({ id, source, location }));
}
