/**
 * HCC bot-wall detection (2026-08-19).
 *
 * Naylor now serves a human-verification interstitial ("One moment...",
 * HTTP 200, ~6 KB, hcheck-* markup) on every path. The adapter must
 * recognize it and abort the whole run after ONE request instead of
 * re-requesting every keyword variant for the time budget.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

import {
    fetchHealthCareerCenterJobs,
    isVerificationInterstitial,
} from '@/lib/aggregators/healthcareercenter';

const INTERSTITIAL_HTML = `
    <!DOCTYPE html>
    <html>
    <head><title>One moment...</title></head>
    <body>
        <div class="hcheck-box">
            <input type="checkbox" />
            <label>Verify you are human</label>
        </div>
    </body>
    </html>`;

describe('isVerificationInterstitial', () => {
    it('recognizes the One moment... interstitial', () => {
        expect(isVerificationInterstitial(INTERSTITIAL_HTML)).toBe(true);
    });

    it('recognizes hcheck markup even with a different title', () => {
        expect(isVerificationInterstitial('<html><div class="hcheck-box"></div></html>')).toBe(true);
    });

    it('does not flag a real search-results page', () => {
        const realPage =
            '<html><head><title>PMHNP Jobs | Health eCareers Center</title></head><body>' +
            '<a href="/jobs/21657607/pmhnp-hybrid">PMHNP</a>'.repeat(400) +
            '</body></html>';
        expect(isVerificationInterstitial(realPage)).toBe(false);
    });

    it('does not flag a huge page that merely mentions the phrase', () => {
        const huge = '<html><title>One moment...</title>' + 'x'.repeat(30_000) + '</html>';
        expect(isVerificationInterstitial(huge)).toBe(false);
    });
});

describe('fetchHealthCareerCenterJobs under the bot wall', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('aborts the entire run after the first interstitial response', async () => {
        const fetchMock = vi.fn(async () => new Response(INTERSTITIAL_HTML, { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const jobs = await fetchHealthCareerCenterJobs();

        expect(jobs).toEqual([]);
        // One request total — not one per keyword variant.
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
