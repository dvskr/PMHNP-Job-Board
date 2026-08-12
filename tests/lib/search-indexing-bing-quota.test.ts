/**
 * Bing URL Submission: batch bounding + honest accounting.
 *
 * Root cause these tests lock down:
 * Bing's SubmitUrlBatch accepts at most 500 URLs per call AND rejects the WHOLE
 * call when the batch is larger than the site's REMAINING daily quota. The
 * client hardcoded 500-URL batches and never checked the quota, so once the
 * day's remaining quota fell below 500 every full-size batch was rejected
 * wholesale while a smaller trailing batch that still fit was accepted. That is
 * what produced the "exactly 500 failures per run" signature in prod metrics:
 * the count landed on a clean multiple of the batch size, and a later, smaller
 * batch still succeeded (impossible under an auth error or a flat outage).
 *
 * The fake Bing below enforces the real documented rule, so a regression to
 * unbounded 500-URL batches reproduces the prod signature and fails the suite.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pingBingBatch, summarizeBingResults, BING_MAX_URLS_PER_BATCH } from '@/lib/search-indexing';

interface FakeBingConfig {
    /** What GetUrlSubmissionQuota reports. 'error' makes the probe fail. */
    probeQuota?: number | 'error';
    /** What the server actually enforces. Defaults to unlimited. */
    serverRemaining?: number;
    /** Force every SubmitUrlBatch call to fail with this HTTP status. */
    failEveryBatchWith?: number;
}

function fakeBing(config: FakeBingConfig) {
    let remaining = config.serverRemaining ?? Number.POSITIVE_INFINITY;
    const submitBatchSizes: number[] = [];
    const rejectedBatchSizes: number[] = [];
    let quotaProbes = 0;

    const fetchMock = vi.fn(async (input: unknown, init?: { body?: unknown }) => {
        const url = String(input);

        if (url.includes('GetUrlSubmissionQuota')) {
            quotaProbes++;
            if (config.probeQuota === 'error' || config.probeQuota === undefined) {
                return new Response('Service Unavailable', { status: 503 });
            }
            return new Response(
                JSON.stringify({
                    d: {
                        __type: 'UrlSubmissionQuota:#Microsoft.Bing.Webmaster.Api',
                        DailyQuota: config.probeQuota,
                        MonthlyQuota: config.probeQuota * 10,
                    },
                }),
                { status: 200 }
            );
        }

        if (url.includes('SubmitUrlBatch')) {
            const body = JSON.parse(String(init?.body)) as { urlList: string[] };
            const size = body.urlList.length;
            submitBatchSizes.push(size);

            if (config.failEveryBatchWith) {
                rejectedBatchSizes.push(size);
                return new Response('{"Message":"upstream boom"}', { status: config.failEveryBatchWith });
            }
            // Documented Bing rule: the ENTIRE call is rejected when the batch
            // exceeds the remaining daily quota. Remaining is left untouched,
            // which is why a smaller later batch can still succeed.
            if (size > remaining) {
                rejectedBatchSizes.push(size);
                return new Response('{"Message":"Insufficient daily quota"}', { status: 400 });
            }
            remaining -= size;
            return new Response(JSON.stringify({ d: null }), { status: 200 });
        }

        throw new Error(`unexpected fetch in test: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);
    return {
        submitBatchSizes,
        rejectedBatchSizes,
        get quotaProbes() {
            return quotaProbes;
        },
    };
}

const makeUrls = (n: number): string[] =>
    Array.from({ length: n }, (_, i) => `https://pmhnphiring.com/jobs/pmhnp-role-${i}`);

beforeEach(() => {
    process.env.BING_WEBMASTER_API_KEY = 'test-bing-key';
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.BING_WEBMASTER_API_KEY;
});

describe('pingBingBatch: batch bounding', () => {
    it('never exceeds the documented 500 URLs per request', async () => {
        const bing = fakeBing({ probeQuota: 10000, serverRemaining: 10000 });

        const results = await pingBingBatch(makeUrls(1200));

        expect(BING_MAX_URLS_PER_BATCH).toBe(500);
        expect(bing.submitBatchSizes).toEqual([500, 500, 200]);
        expect(bing.submitBatchSizes.every(size => size <= 500)).toBe(true);
        expect(results.filter(r => r.success)).toHaveLength(1200);
    });

    it('bounds the batch to the remaining daily quota so Bing never rejects a whole call', async () => {
        // The exact prod shape: ~933 URLs of quota left, 1373 URLs to submit.
        // Old behaviour: batches [500, 500, 373] -> 873 submitted, 500 "failed".
        const bing = fakeBing({ probeQuota: 933, serverRemaining: 933 });

        const results = await pingBingBatch(makeUrls(1373));
        const summary = summarizeBingResults(results);

        // Batches now fit the quota: 500, then only the 433 that are left.
        expect(bing.submitBatchSizes).toEqual([500, 433]);
        expect(bing.rejectedBatchSizes).toEqual([]);

        // More URLs actually land than the old code managed (933 > 873)...
        expect(summary.submitted).toBe(933);
        // ...and nothing is miscounted as a failure.
        expect(summary.failed).toBe(0);
        expect(summary.skipped).toBe(1373 - 933);
        expect(summary.reason).toMatch(/quota exhausted/i);
        expect(summary.reason).toContain('440 deferred');
    });

    it('regression: the old 500-failure signature no longer appears', async () => {
        const bing = fakeBing({ probeQuota: 933, serverRemaining: 933 });

        const summary = summarizeBingResults(await pingBingBatch(makeUrls(1373)));

        // The signature was: failed landing on an exact multiple of the batch size.
        expect(summary.failed).not.toBe(500);
        expect(summary.failed % BING_MAX_URLS_PER_BATCH).toBe(0); // trivially true at 0
        expect(summary.failed).toBe(0);
        expect(bing.rejectedBatchSizes).toHaveLength(0);
    });

    it('sends nothing and defers everything when the quota is already spent', async () => {
        const bing = fakeBing({ probeQuota: 0, serverRemaining: 0 });

        const results = await pingBingBatch(makeUrls(50));
        const summary = summarizeBingResults(results);

        // No doomed calls at all.
        expect(bing.submitBatchSizes).toEqual([]);
        expect(summary).toMatchObject({ submitted: 0, failed: 0, skipped: 50 });
        expect(results.every(r => r.skipped === true)).toBe(true);
    });

    it('stops after a rejected batch instead of hammering the API', async () => {
        const bing = fakeBing({ probeQuota: 10000, failEveryBatchWith: 400 });

        const results = await pingBingBatch(makeUrls(1200));
        const summary = summarizeBingResults(results);

        // One rejected call, then we stop. Old code fired all three.
        expect(bing.submitBatchSizes).toEqual([500]);
        expect(summary.submitted).toBe(0);
        expect(summary.failed).toBe(500); // genuinely rejected: reported as failed
        expect(summary.skipped).toBe(700); // never tried: reported as skipped
        expect(summary.reason).toContain('HTTP 400');
        expect(summary.reason).toContain('700 URLs deferred');
    });

    it('falls back to the per-request cap when the quota probe fails, rather than blocking', async () => {
        const bing = fakeBing({ probeQuota: 'error' });

        const summary = summarizeBingResults(await pingBingBatch(makeUrls(1200)));

        expect(bing.quotaProbes).toBe(1);
        expect(bing.submitBatchSizes).toEqual([500, 500, 200]);
        expect(summary).toMatchObject({ submitted: 1200, failed: 0, skipped: 0 });
    });

    it('stops early when a network error is thrown mid run', async () => {
        let calls = 0;
        vi.stubGlobal(
            'fetch',
            vi.fn(async (input: unknown) => {
                const url = String(input);
                if (url.includes('GetUrlSubmissionQuota')) {
                    return new Response(JSON.stringify({ d: { DailyQuota: 10000 } }), { status: 200 });
                }
                calls++;
                if (calls === 2) throw new Error('socket hang up');
                return new Response(JSON.stringify({ d: null }), { status: 200 });
            })
        );

        const summary = summarizeBingResults(await pingBingBatch(makeUrls(1600)));

        expect(calls).toBe(2); // stopped, did not fire batches 3 and 4
        expect(summary.submitted).toBe(500);
        expect(summary.failed).toBe(500);
        expect(summary.skipped).toBe(600);
        expect(summary.reason).toContain('socket hang up');
    });

    it('makes no calls at all for an empty URL list', async () => {
        const bing = fakeBing({ probeQuota: 10000 });
        expect(await pingBingBatch([])).toEqual([]);
        expect(bing.quotaProbes).toBe(0);
        expect(bing.submitBatchSizes).toEqual([]);
    });
});

describe('honest metric shape', () => {
    it('accounts for every URL exactly once as submitted, failed, or skipped', async () => {
        fakeBing({ probeQuota: 700, serverRemaining: 700 });

        const urls = makeUrls(1600);
        const results = await pingBingBatch(urls);
        const summary = summarizeBingResults(results);

        expect(summary.submitted + summary.failed + summary.skipped).toBe(urls.length);
        expect(results).toHaveLength(urls.length);
        expect(new Set(results.map(r => r.url)).size).toBe(urls.length);
    });

    it('never counts a skipped URL as submitted or as a failure', async () => {
        fakeBing({ probeQuota: 100, serverRemaining: 100 });

        const results = await pingBingBatch(makeUrls(300));
        const skipped = results.filter(r => r.skipped);

        expect(skipped).toHaveLength(200);
        expect(skipped.every(r => r.success === false)).toBe(true);
        // Skipped rows carry the one-line reason so no caller has to guess.
        expect(skipped.every(r => typeof r.error === 'string' && r.error.length > 0)).toBe(true);
        expect(summarizeBingResults(results).failed).toBe(0);
    });

    it('surfaces a single-line reason safe to store in cron metrics', async () => {
        fakeBing({ probeQuota: 100, serverRemaining: 100 });

        const reason = summarizeBingResults(await pingBingBatch(makeUrls(300))).reason ?? '';

        expect(reason).not.toContain('\n');
        expect(reason.length).toBeLessThanOrEqual(300);
        expect(reason).toContain('100 of 300 URLs submitted');
        // Copy rule: no em/en dashes in surfaced strings.
        expect(reason).not.toMatch(/[–—]/);
    });

    it('reports a rejection and its deferred remainder in the same line', async () => {
        fakeBing({ probeQuota: 10000, failEveryBatchWith: 401 });

        const summary = summarizeBingResults(await pingBingBatch(makeUrls(1200)));

        expect(summary).toMatchObject({ submitted: 0, failed: 500, skipped: 700 });
        // One line answers both questions an operator has: why, and how many are left.
        expect(summary.reason).toContain('HTTP 401');
        expect(summary.reason).toContain('700 URLs deferred');
    });

    it('falls back to the bare provider error when nothing was deferred', async () => {
        // 400 URLs = a single batch. It is rejected, so there is no remainder
        // to defer and no composed stop reason to borrow.
        fakeBing({ probeQuota: 10000, failEveryBatchWith: 503 });

        const summary = summarizeBingResults(await pingBingBatch(makeUrls(400)));

        expect(summary).toMatchObject({ submitted: 0, failed: 400, skipped: 0 });
        expect(summary.reason).toContain('HTTP 503');
    });

    it('omits the reason entirely on a clean run', async () => {
        fakeBing({ probeQuota: 10000, serverRemaining: 10000 });

        const summary = summarizeBingResults(await pingBingBatch(makeUrls(10)));

        expect(summary).toMatchObject({ submitted: 10, failed: 0, skipped: 0 });
        expect(summary.reason).toBeUndefined();
    });

    it('treats a missing API key as a loud failure, not a quiet skip', async () => {
        delete process.env.BING_WEBMASTER_API_KEY;
        const bing = fakeBing({ probeQuota: 10000 });

        const summary = summarizeBingResults(await pingBingBatch(makeUrls(5)));

        expect(bing.quotaProbes).toBe(0);
        expect(summary).toMatchObject({ submitted: 0, failed: 5, skipped: 0 });
        expect(summary.reason).toContain('BING_WEBMASTER_API_KEY not set');
    });
});
