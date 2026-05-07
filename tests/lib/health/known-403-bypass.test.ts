/**
 * Tests for the known-403 host bypass added 2026-05-06 after a prod
 * audit found ~7k weekly inconclusive_403 outcomes were dominated by
 * jooble.org + www.adzuna.com (anti-scraper wrappers that always 403
 * anonymous probes regardless of job liveness).
 */
import { describe, it, expect, vi } from 'vitest';
import { checkJobHealth } from '@/lib/health/check-job-health';

const aliveProbe = async () =>
    ({
        finalStatus: 200,
        finalUrl: 'https://example.com/job',
        redirectHops: 0,
        elapsedMs: 5,
        errorKind: null,
        errorMessage: null,
        bodyHtml: null,
    }) as any;

describe('checkJobHealth — known-403 host bypass', () => {
    it('returns inconclusive_403 without probing for jooble.org', async () => {
        const probe = vi.fn(aliveProbe);
        const result = await checkJobHealth('https://jooble.org/desc/abc123', null, {
            probeImpl: probe as any,
        });
        expect(result.reason).toBe('inconclusive_403');
        expect(result.alive).toBe(true);
        expect(probe).not.toHaveBeenCalled();
    });

    it('returns inconclusive_403 without probing for www.adzuna.com', async () => {
        const probe = vi.fn(aliveProbe);
        const result = await checkJobHealth('https://www.adzuna.com/jobs/redirect/123', null, {
            probeImpl: probe as any,
        });
        expect(result.reason).toBe('inconclusive_403');
        expect(probe).not.toHaveBeenCalled();
    });

    it('still probes hosts NOT in the bypass list', async () => {
        const probe = vi.fn(aliveProbe);
        const result = await checkJobHealth('https://example.com/job/123', null, {
            probeImpl: probe as any,
        });
        expect(probe).toHaveBeenCalledOnce();
        expect(result.alive).toBe(true);
    });

    it('still routes to source-specific probes BEFORE the bypass check (greenhouse beats bypass)', async () => {
        const greenhouse = vi.fn(async () => ({
            status: 'alive',
            httpStatus: 200,
            apiUrl: 'https://api.greenhouse',
            elapsedMs: 5,
            errorMessage: null,
            reason: 'http_2xx_open',
        })) as any;
        const probe = vi.fn(aliveProbe);
        const result = await checkJobHealth(
            'https://boards.greenhouse.io/talkiatry/jobs/abc',
            'greenhouse',
            { greenhouseProbeImpl: greenhouse, probeImpl: probe as any, externalId: 'greenhouse-talkiatry-12345' },
        );
        // Source probe ran first; bypass never reached.
        expect(greenhouse).toHaveBeenCalledOnce();
        expect(result.reason).toBe('alive_greenhouse_api');
    });

    it('handles malformed URLs gracefully (no bypass, falls through to probe)', async () => {
        const probe = vi.fn(aliveProbe);
        await checkJobHealth('not a url at all', null, { probeImpl: probe as any });
        expect(probe).toHaveBeenCalled();
    });
});
