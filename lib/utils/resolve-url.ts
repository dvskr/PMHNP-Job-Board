/**
 * Resolve redirect chains to get the final destination URL.
 * Used during ingestion to replace aggregator tracking URLs with clean direct links.
 */

const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 10;

// Known patterns that indicate a dead or filled position
const DEAD_PATTERNS = [
    'position has been filled',
    'no longer accepting',
    'this job is no longer available',
    'this position has been closed',
    'job has expired',
    'page not found',
    'sorry, that page',
    'this posting is no longer active',
    'we couldn\'t find',
    'this job was removed',
    'no results found',
    'application closed',
    'this requisition is no longer',
];

/**
 * Follow redirects and return the final URL.
 * Returns the original URL if resolution fails (network error, timeout, etc.)
 */
export async function resolveUrl(url: string): Promise<{ finalUrl: string; status: number; isDead: boolean }> {
    // Skip resolution for known clean ATS direct links
    if (isDirectAtsLink(url)) {
        return { finalUrl: url, status: 200, isDead: false };
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const response = await fetch(url, {
            method: 'GET',
            redirect: 'follow',
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
            },
        });

        clearTimeout(timeout);

        const finalUrl = response.url || url;
        const status = response.status;

        // Check for dead-end patterns in the response body (only for non-OK or suspicious statuses)
        let isDead = status === 404 || status === 410 || status === 403;

        if (!isDead && status < 400) {
            // Check body for "filled" patterns (read only first 5KB)
            try {
                const bodyText = await response.text();
                const snippet = bodyText.slice(0, 5000).toLowerCase();
                isDead = DEAD_PATTERNS.some(pattern => snippet.includes(pattern));
            } catch {
                // Body read failed, assume alive
            }
        }

        return { finalUrl, status, isDead };
    } catch (error: any) {
        // Network error, timeout, or fetch failure — return original
        return { finalUrl: url, status: 0, isDead: false };
    }
}

/**
 * Lightweight HEAD check — just verify the URL is reachable.
 * Used by the dead-link checker for bulk checks.
 */
export async function checkUrlLiveness(url: string): Promise<{ status: number; isDead: boolean; finalUrl: string }> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

        // First try HEAD (faster)
        let response = await fetch(url, {
            method: 'HEAD',
            redirect: 'follow',
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
        });

        clearTimeout(timeout);

        // Some servers reject HEAD — fall back to GET
        if (response.status === 405 || response.status === 403) {
            return resolveUrl(url);
        }

        const isDead = response.status === 404 || response.status === 410;
        return { status: response.status, isDead, finalUrl: response.url || url };
    } catch {
        // Timeout or network failure — mark as potentially dead (2 strikes rule in checker)
        return { status: 0, isDead: false, finalUrl: url };
    }
}

/**
 * Check if the URL is a direct ATS link (no redirect chains to resolve)
 */
function isDirectAtsLink(url: string): boolean {
    const directPatterns = [
        'boards.greenhouse.io',
        'jobs.lever.co',
        'jobs.ashbyhq.com',
        'www.usajobs.gov',
        'myworkdayjobs.com',
        '.breezy.hr',
        '.workable.com',
        '.bamboohr.com',
        '.jazz.co',
        '.recruitee.com',
        '.icims.com',
    ];

    try {
        const hostname = new URL(url).hostname;
        return directPatterns.some(pattern => hostname.includes(pattern));
    } catch {
        return false;
    }
}

/**
 * Check if the URL is an aggregator tracking/redirect URL that should NOT
 * be stored directly. These almost always go dead within weeks.
 */
export function isAggregatorTrackingUrl(url: string): boolean {
    const trackingDomains = [
        'adzuna.com',       // Adzuna redirect_url — goes dead quickly
        'jooble.org',       // Jooble tracking links
        'link.jooble.org',  // Jooble redirect domain
        'rapidapi.com',     // JSearch proxy links (sometimes)
    ];

    try {
        const hostname = new URL(url).hostname;
        return trackingDomains.some(domain => hostname.endsWith(domain));
    } catch {
        return false;
    }
}

/**
 * Full validation pipeline for an apply link.
 * 
 * Returns either a clean, verified URL or null if the job should be rejected.
 * 
 * Logic:
 *   1. Direct ATS links → pass through (always clean)
 *   2. Aggregator tracking URLs → MUST resolve to a real destination
 *   3. All others → attempt resolution, keep original on failure
 */
export async function validateApplyLink(url: string): Promise<{ cleanUrl: string | null; isDead: boolean; wasTracking: boolean }> {
    if (!url || url.trim() === '') {
        return { cleanUrl: null, isDead: true, wasTracking: false };
    }

    // Direct ATS links are always clean
    if (isDirectAtsLink(url)) {
        return { cleanUrl: url, isDead: false, wasTracking: false };
    }

    const isTracking = isAggregatorTrackingUrl(url);

    // Resolve the URL
    const result = await resolveUrl(url);

    // Dead at source — reject regardless
    if (result.isDead) {
        return { cleanUrl: null, isDead: true, wasTracking: isTracking };
    }

    // If it's a tracking URL, we MUST get a resolved non-tracking destination
    if (isTracking) {
        // If resolution failed (status 0) or resolved back to the same tracking domain
        if (result.status === 0 || isAggregatorTrackingUrl(result.finalUrl)) {
            // Can't resolve → reject the job. Tracking URLs go dead too fast.
            return { cleanUrl: null, isDead: false, wasTracking: true };
        }
        // Successfully resolved to a real destination
        return { cleanUrl: result.finalUrl, isDead: false, wasTracking: true };
    }

    // Non-tracking, non-ATS URL — use resolved if different, otherwise keep original
    return { cleanUrl: result.finalUrl || url, isDead: false, wasTracking: false };
}
