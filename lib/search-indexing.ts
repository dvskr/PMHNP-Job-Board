/**
 * Search Engine Indexing Utility
 * 
 * Supports:
 *  - Google Indexing API (for JobPosting / general pages)
 *  - Bing URL Submission API
 *  - IndexNow (Bing, Yandex, Seznam, Naver — all at once)
 */

import * as crypto from 'crypto';
import { logger } from './logger';

const BASE_URL = 'https://pmhnphiring.com';

// ─── Types ───────────────────────────────────────────────────────────────────

interface IndexResult {
    engine: string;
    url: string;
    success: boolean;
    /**
     * True when the URL was deliberately NOT sent (Bing daily quota exhausted,
     * or an earlier batch was rejected and we stopped instead of hammering).
     * A skipped URL is not a failure: nothing was attempted and nothing was
     * rejected. Callers must report skipped and failed as separate counts so
     * cron metrics stay honest about what actually reached the engine.
     */
    skipped?: boolean;
    error?: string;
}

// ─── Google Indexing API ─────────────────────────────────────────────────────

async function getGoogleAccessToken(): Promise<string | null> {
    const credentialsRaw = process.env.GOOGLE_INDEXING_CREDENTIALS;
    if (!credentialsRaw) return null;

    let credentials;
    try {
        credentials = JSON.parse(credentialsRaw);
    } catch {
        credentials = JSON.parse(Buffer.from(credentialsRaw, 'base64').toString('utf-8'));
    }

    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const claimSet = {
        iss: credentials.client_email,
        scope: 'https://www.googleapis.com/auth/indexing',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now,
    };

    const b64url = (obj: object) =>
        Buffer.from(JSON.stringify(obj))
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

    const signatureInput = `${b64url(header)}.${b64url(claimSet)}`;
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signatureInput);
    const signature = sign
        .sign(credentials.private_key, 'base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    const jwt = `${signatureInput}.${signature}`;

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });

    if (!tokenResponse.ok) {
        logger.error('[Google Indexing] Failed to get access token', await tokenResponse.text());
        return null;
    }

    const { access_token } = await tokenResponse.json();
    return access_token;
}

export async function pingGoogle(
    url: string,
    type: 'URL_UPDATED' | 'URL_DELETED' = 'URL_UPDATED'
): Promise<IndexResult> {
    try {
        const accessToken = await getGoogleAccessToken();
        if (!accessToken) {
            return { engine: 'Google', url, success: false, error: 'No credentials configured' };
        }

        const response = await fetch(
            'https://indexing.googleapis.com/v3/urlNotifications:publish',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ url, type }),
            }
        );

        if (response.ok) {
            return { engine: 'Google', url, success: true };
        }
        return { engine: 'Google', url, success: false, error: await response.text() };
    } catch (error) {
        return { engine: 'Google', url, success: false, error: String(error) };
    }
}

// ─── Bing URL Submission API ─────────────────────────────────────────────────

const BING_API_BASE = 'https://ssl.bing.com/webmaster/api.svc/json';

/**
 * Hard per-request cap documented by Bing for SubmitUrlBatch.
 *
 * The full documented rule is stricter than "500 per call": the maximum batch
 * size is 500 URLs *unless that exceeds the site's remaining daily quota*, in
 * which case Bing rejects the ENTIRE call. The daily quota is allocated per
 * domain, resets daily, and Bing sizes it per site: the headline 10,000/day is
 * a ceiling for long-verified domains, not the number every site gets.
 *
 * Submitting a hardcoded 500 without checking the quota is what produced the
 * "exactly 500 Bing failures per run" signature in cron metrics. Once the day's
 * remaining quota fell below 500, every full-size batch was rejected wholesale
 * while a smaller trailing batch that still fit was accepted, so the failure
 * count landed on a clean multiple of the batch size instead of tapering.
 */
export const BING_MAX_URLS_PER_BATCH = 500;

/** Collapse a provider response body so a wall of HTML never lands in cron metrics. */
function oneLine(text: string, max = 180): string {
    const flat = text.replace(/\s+/g, ' ').trim();
    return flat.length > max ? `${flat.slice(0, max)}...` : flat;
}

/**
 * Ask Bing how much of today's URL submission quota is left.
 * Returns `remaining: null` when the quota cannot be determined, which callers
 * must treat as "unknown" rather than "zero" so a flaky probe never blocks
 * submission outright.
 */
export async function getBingRemainingQuota(
    apiKey: string
): Promise<{ remaining: number | null; error?: string }> {
    try {
        const response = await fetch(
            `${BING_API_BASE}/GetUrlSubmissionQuota?siteUrl=${encodeURIComponent(BASE_URL)}&apikey=${apiKey}`,
            { method: 'GET', headers: { 'Content-Type': 'application/json' } }
        );

        if (!response.ok) {
            return {
                remaining: null,
                error: `quota lookup failed (HTTP ${response.status}): ${oneLine(await response.text())}`,
            };
        }

        const body = await response.json();
        const daily = body?.d?.DailyQuota;
        if (typeof daily !== 'number' || !Number.isFinite(daily)) {
            return { remaining: null, error: 'quota lookup returned no numeric DailyQuota field' };
        }
        return { remaining: Math.max(0, Math.floor(daily)) };
    } catch (error) {
        return { remaining: null, error: `quota lookup threw: ${oneLine(String(error))}` };
    }
}

export async function pingBing(url: string): Promise<IndexResult> {
    const apiKey = process.env.BING_WEBMASTER_API_KEY;
    if (!apiKey) {
        return { engine: 'Bing', url, success: false, error: 'BING_WEBMASTER_API_KEY not set' };
    }

    try {
        const response = await fetch(
            `${BING_API_BASE}/SubmitUrl?apikey=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ siteUrl: BASE_URL, url }),
            }
        );

        if (response.ok) {
            return { engine: 'Bing', url, success: true };
        }
        return { engine: 'Bing', url, success: false, error: await response.text() };
    } catch (error) {
        return { engine: 'Bing', url, success: false, error: String(error) };
    }
}

type BingBatchOutcome =
    | { accepted: true }
    | { accepted: false; thrown: boolean; errorText: string };

/** One SubmitUrlBatch call. Never throws: transport errors come back as outcomes. */
async function submitBingBatch(apiKey: string, batch: string[]): Promise<BingBatchOutcome> {
    try {
        const response = await fetch(`${BING_API_BASE}/SubmitUrlBatch?apikey=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ siteUrl: BASE_URL, urlList: batch }),
        });

        if (response.ok) return { accepted: true };
        return {
            accepted: false,
            thrown: false,
            errorText: `HTTP ${response.status}: ${oneLine(await response.text())}`,
        };
    } catch (error) {
        return { accepted: false, thrown: true, errorText: oneLine(String(error)) };
    }
}

/**
 * Batch-submit URLs to Bing, bounded by BOTH documented limits: the 500/request
 * cap and the site's remaining daily quota.
 *
 * Behaviour on limits:
 *  - Each request carries min(500, remaining quota) URLs, so a batch is never
 *    larger than what Bing will accept.
 *  - When the quota runs out we STOP and mark the rest `skipped`, rather than
 *    firing doomed full-size batches at the API for the remainder of the list.
 *  - A genuinely rejected batch also stops the loop: the rejected URLs stay
 *    `failed` (honest), the untried remainder is `skipped` (also honest).
 * Nothing is swallowed: every URL comes back as submitted, failed, or skipped.
 */
export async function pingBingBatch(urls: string[]): Promise<IndexResult[]> {
    if (urls.length === 0) return [];

    const apiKey = process.env.BING_WEBMASTER_API_KEY;
    if (!apiKey) {
        // A missing key is a misconfiguration, not a quota skip: keep it loud.
        logger.warn('[Bing] Skipping submission: BING_WEBMASTER_API_KEY not set', {
            urlCount: urls.length,
        });
        return urls.map(url => ({ engine: 'Bing', url, success: false, error: 'BING_WEBMASTER_API_KEY not set' }));
    }

    const quota = await getBingRemainingQuota(apiKey);
    if (quota.error) {
        // Never block submission on a failed probe. Fall back to the hard
        // per-request cap; a rejected batch still stops the loop below.
        logger.warn('[Bing] Daily quota lookup unavailable, falling back to the per-request cap', {
            reason: quota.error,
            cap: BING_MAX_URLS_PER_BATCH,
        });
    }

    const results: IndexResult[] = [];
    let remaining = quota.remaining; // null = unknown
    let cursor = 0;

    const deferRest = (reason: string): void => {
        for (const url of urls.slice(cursor)) {
            results.push({ engine: 'Bing', url, success: false, skipped: true, error: reason });
        }
        cursor = urls.length;
    };

    while (cursor < urls.length) {
        const cap = remaining === null
            ? BING_MAX_URLS_PER_BATCH
            : Math.min(BING_MAX_URLS_PER_BATCH, remaining);

        if (cap <= 0) {
            const deferred = urls.length - cursor;
            const reason = `Bing daily quota exhausted: ${cursor} of ${urls.length} URLs submitted, ${deferred} deferred to the next run`;
            logger.warn('[Bing] Daily quota exhausted, deferring the remainder', {
                submitted: cursor,
                deferred,
                total: urls.length,
            });
            deferRest(reason);
            break;
        }

        const batch = urls.slice(cursor, cursor + cap);
        const outcome = await submitBingBatch(apiKey, batch);

        if (outcome.accepted) {
            results.push(...batch.map(url => ({ engine: 'Bing', url, success: true })));
            cursor += batch.length;
            if (remaining !== null) remaining -= batch.length;
            continue;
        }

        // A rejected batch is a real failure for those URLs. Everything after it
        // stops: repeating the same doomed call for the rest of the list is the
        // hammering this fix exists to remove.
        results.push(...batch.map(url => ({ engine: 'Bing', url, success: false, error: outcome.errorText })));
        cursor += batch.length;
        logger.error('[Bing] Batch not accepted, stopping early', outcome.errorText, {
            batchSize: batch.length,
            remainingQuota: remaining,
            untried: urls.length - cursor,
        });
        const what = outcome.thrown
            ? `Bing batch request failed (${outcome.errorText})`
            : `Bing rejected a ${batch.length} URL batch (${outcome.errorText})`;
        deferRest(`${what}, stopped early: ${urls.length - cursor} URLs deferred to the next run`);
        break;
    }

    return results;
}

export interface BingSubmissionSummary {
    submitted: number;
    /** URLs Bing actually rejected. */
    failed: number;
    /** URLs never sent, because the quota ran out or an earlier batch failed. */
    skipped: number;
    /** One-line explanation for cron metrics. Absent when everything went through. */
    reason?: string;
}

/**
 * Collapse Bing results into the shape cron metrics report. Kept here so
 * index-urls and index-pseo cannot drift into counting skipped URLs as
 * failures (or, worse, as successes).
 */
export function summarizeBingResults(results: IndexResult[]): BingSubmissionSummary {
    const submitted = results.filter(r => r.success).length;
    const skipped = results.filter(r => !r.success && r.skipped).length;
    const failed = results.filter(r => !r.success && !r.skipped).length;
    // The skip reason is the composed one: when a rejection stopped the run it
    // already embeds the provider error AND how many URLs were deferred, so it
    // is strictly more informative than the bare per-URL error. Fall back to
    // that bare error when nothing was deferred (for example a missing key, or
    // a rejection on the very last batch).
    const reason =
        results.find(r => r.skipped)?.error ??
        results.find(r => !r.success)?.error;

    return { submitted, failed, skipped, ...(reason ? { reason } : {}) };
}

// ─── IndexNow (Bing, Yandex, Seznam, Naver) ─────────────────────────────────

export async function pingIndexNow(urls: string | string[]): Promise<IndexResult[]> {
    const apiKey = process.env.INDEXNOW_API_KEY || process.env.INDEXNOW_KEY;
    if (!apiKey) {
        const urlList = Array.isArray(urls) ? urls : [urls];
        // Audit fact 9: this used to fail silently while the cron reported
        // success — an unset key meant zero IndexNow coverage with no signal.
        logger.warn('[IndexNow] Skipping submission: INDEXNOW_API_KEY / INDEXNOW_KEY not set', {
            urlCount: urlList.length,
        });
        return urlList.map(url => ({ engine: 'IndexNow', url, success: false, error: 'INDEXNOW_API_KEY / INDEXNOW_KEY not set' }));
    }

    const urlList = Array.isArray(urls) ? urls : [urls];

    // IndexNow supports batch submission to multiple engines
    // Submitting to one engine shares with all IndexNow participants
    const indexNowEndpoint = 'https://api.indexnow.org/indexnow';

    try {
        const response = await fetch(indexNowEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                host: 'pmhnphiring.com',
                key: apiKey,
                keyLocation: `${BASE_URL}/${apiKey}.txt`,
                urlList,
            }),
        });

        // IndexNow returns 200 or 202 for success
        if (response.ok || response.status === 202) {
            return urlList.map(url => ({ engine: 'IndexNow', url, success: true }));
        }
        const errorText = await response.text();
        logger.error('[IndexNow] Endpoint rejected submission', errorText, {
            status: response.status,
            urlCount: urlList.length,
        });
        return urlList.map(url => ({ engine: 'IndexNow', url, success: false, error: `${response.status}: ${errorText}` }));
    } catch (error) {
        logger.error('[IndexNow] Submission failed', error, { urlCount: urlList.length });
        return urlList.map(url => ({ engine: 'IndexNow', url, success: false, error: String(error) }));
    }
}

// ─── Unified Ping ────────────────────────────────────────────────────────────

/**
 * Ping all configured search engines for a single URL.
 * Fire-and-forget safe — never throws.
 */
export async function pingAllSearchEngines(url: string): Promise<IndexResult[]> {
    const results = await Promise.allSettled([
        pingGoogle(url),
        pingBing(url),
        pingIndexNow(url),
    ]);

    const flat: IndexResult[] = [];
    for (const result of results) {
        if (result.status === 'fulfilled') {
            if (Array.isArray(result.value)) {
                flat.push(...result.value);
            } else {
                flat.push(result.value);
            }
        }
    }

    // Log results. Failures log at warn so they are visible in production
    // (info-level console output was how IndexNow died silently — audit fact 9).
    for (const r of flat) {
        if (r.success) {
            logger.info(`[Indexing] ${r.engine} accepted URL`, { url: r.url });
        } else {
            logger.warn(`[Indexing] ${r.engine} submission failed`, { url: r.url, error: r.error });
        }
    }

    return flat;
}

/**
 * Ping all configured search engines for multiple URLs in batch.
 * Uses the CREATION quota (100/day) — for new/updated jobs only.
 */
export async function pingAllSearchEnginesBatch(urls: string[]): Promise<{
    google: IndexResult[];
    bing: IndexResult[];
    indexNow: IndexResult[];
}> {
    // Google: must be individual (no batch API)
    // GSC Fix: Split 200/day quota — 100 for new jobs, 100 for expired.
    // This ensures expired jobs are ALWAYS de-indexed, not starved by new submissions.
    const GOOGLE_CREATION_CAP = 100;
    const googleUrls = urls.slice(0, GOOGLE_CREATION_CAP);
    const googleResults: IndexResult[] = [];
    for (const url of googleUrls) {
        const result = await pingGoogle(url);
        googleResults.push(result);
        // Small delay between Google requests
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Bing: batch submit
    const bingResults = await pingBingBatch(urls);

    // IndexNow: batch submit (up to 10,000 at once)
    const indexNowResults = await pingIndexNow(urls);

    return {
        google: googleResults,
        bing: bingResults,
        indexNow: indexNowResults,
    };
}

/**
 * Ping all search engines to DE-INDEX expired URLs.
 * Uses the DELETION quota (100/day) — kept separate from creation quota
 * so expired jobs are always reliably removed from Google.
 */
export async function pingAllSearchEnginesBatchDeleted(urls: string[]): Promise<{
    google: IndexResult[];
    indexNow: IndexResult[];
}> {
    const GOOGLE_DELETION_CAP = 100;
    const googleUrls = urls.slice(0, GOOGLE_DELETION_CAP);
    const googleResults: IndexResult[] = [];
    for (const url of googleUrls) {
        const result = await pingGoogle(url, 'URL_DELETED');
        googleResults.push(result);
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    // IndexNow for batch de-indexing (Bing, Yandex, etc.)
    const indexNowResults = await pingIndexNow(urls);

    return {
        google: googleResults,
        indexNow: indexNowResults,
    };
}
