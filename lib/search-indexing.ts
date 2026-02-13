/**
 * Search Engine Indexing Utility
 * 
 * Supports:
 *  - Google Indexing API (for JobPosting / general pages)
 *  - Bing URL Submission API
 *  - IndexNow (Bing, Yandex, Seznam, Naver — all at once)
 */

import * as crypto from 'crypto';

const BASE_URL = 'https://pmhnphiring.com';

// ─── Types ───────────────────────────────────────────────────────────────────

interface IndexResult {
    engine: string;
    url: string;
    success: boolean;
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
        console.error('[Google] Failed to get access token:', await tokenResponse.text());
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

export async function pingBing(url: string): Promise<IndexResult> {
    const apiKey = process.env.BING_WEBMASTER_API_KEY;
    if (!apiKey) {
        return { engine: 'Bing', url, success: false, error: 'BING_WEBMASTER_API_KEY not set' };
    }

    try {
        const response = await fetch(
            `https://ssl.bing.com/webmaster/api.svc/json/SubmitUrl?apikey=${apiKey}`,
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

// Bing batch submission (up to 500 at once)
export async function pingBingBatch(urls: string[]): Promise<IndexResult[]> {
    const apiKey = process.env.BING_WEBMASTER_API_KEY;
    if (!apiKey) {
        return urls.map(url => ({ engine: 'Bing', url, success: false, error: 'BING_WEBMASTER_API_KEY not set' }));
    }

    const results: IndexResult[] = [];
    // Bing allows up to 500 URLs per batch
    const batchSize = 500;

    for (let i = 0; i < urls.length; i += batchSize) {
        const batch = urls.slice(i, i + batchSize);
        try {
            const response = await fetch(
                `https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlBatch?apikey=${apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ siteUrl: BASE_URL, urlList: batch }),
                }
            );

            if (response.ok) {
                results.push(...batch.map(url => ({ engine: 'Bing', url, success: true })));
            } else {
                const errorText = await response.text();
                results.push(...batch.map(url => ({ engine: 'Bing', url, success: false, error: errorText })));
            }
        } catch (error) {
            results.push(...batch.map(url => ({ engine: 'Bing', url, success: false, error: String(error) })));
        }
    }

    return results;
}

// ─── IndexNow (Bing, Yandex, Seznam, Naver) ─────────────────────────────────

export async function pingIndexNow(urls: string | string[]): Promise<IndexResult[]> {
    const apiKey = process.env.INDEXNOW_API_KEY;
    if (!apiKey) {
        const urlList = Array.isArray(urls) ? urls : [urls];
        return urlList.map(url => ({ engine: 'IndexNow', url, success: false, error: 'INDEXNOW_API_KEY not set' }));
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
        return urlList.map(url => ({ engine: 'IndexNow', url, success: false, error: `${response.status}: ${errorText}` }));
    } catch (error) {
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

    // Log results
    for (const r of flat) {
        if (r.success) {
            console.log(`[Indexing] ✅ ${r.engine}: ${r.url}`);
        } else {
            console.log(`[Indexing] ❌ ${r.engine}: ${r.url} — ${r.error}`);
        }
    }

    return flat;
}

/**
 * Ping all configured search engines for multiple URLs in batch.
 */
export async function pingAllSearchEnginesBatch(urls: string[]): Promise<{
    google: IndexResult[];
    bing: IndexResult[];
    indexNow: IndexResult[];
}> {
    // Google: must be individual (no batch API)
    const googleResults: IndexResult[] = [];
    for (const url of urls) {
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
