import { describe, it, expect, vi } from 'vitest';
import { decide, checkJobHealth } from '../../lib/health/check-job-health';
import type { ProbeResult } from '../../lib/health/probe';

function probe(partial: Partial<ProbeResult> = {}): ProbeResult {
    return {
        finalUrl: 'https://example.com/x',
        finalStatus: 200,
        redirectChain: [{ url: 'https://example.com/x', status: 200 }],
        redirectHops: 0,
        bodyHtml: null,
        elapsedMs: 100,
        errorKind: null,
        errorMessage: null,
        ...partial,
    };
}

describe('decide', () => {
    it('marks 200 OK with clean body as alive_2xx', () => {
        const d = decide(probe({ bodyHtml: '<p>Apply now</p>' }), 'greenhouse');
        expect(d.alive).toBe(true);
        expect(d.reason).toBe('alive_2xx');
    });

    it('marks 404 as http_404 dead', () => {
        const d = decide(probe({ finalStatus: 404 }), 'adzuna');
        expect(d.alive).toBe(false);
        expect(d.reason).toBe('http_404');
    });

    it('marks 410 as http_410 dead', () => {
        const d = decide(probe({ finalStatus: 410 }), 'adzuna');
        expect(d.alive).toBe(false);
        expect(d.reason).toBe('http_410');
    });

    it('marks 403 as inconclusive (alive)', () => {
        const d = decide(probe({ finalStatus: 403 }), 'jooble');
        expect(d.alive).toBe(true);
        expect(d.reason).toBe('inconclusive_403');
    });

    it('marks 429 as inconclusive (alive)', () => {
        const d = decide(probe({ finalStatus: 429 }), 'adzuna');
        expect(d.alive).toBe(true);
        expect(d.reason).toBe('inconclusive_429');
    });

    it('marks 5xx as inconclusive (alive)', () => {
        expect(decide(probe({ finalStatus: 502 }), null).reason).toBe('inconclusive_5xx');
        expect(decide(probe({ finalStatus: 503 }), null).reason).toBe('inconclusive_5xx');
    });

    it('marks too_many_redirects as inconclusive_3xx_loop (alive)', () => {
        const d = decide(probe({ errorKind: 'too_many_redirects', finalStatus: null }), null);
        expect(d.alive).toBe(true);
        expect(d.reason).toBe('inconclusive_3xx_loop');
    });

    it('marks timeout as inconclusive_network (alive)', () => {
        const d = decide(probe({ errorKind: 'timeout', finalStatus: null }), null);
        expect(d.alive).toBe(true);
        expect(d.reason).toBe('inconclusive_network');
    });

    it('marks 200 + soft-404 body as dead with reason soft_404', () => {
        const html = '<p>This position has been filled.</p>';
        const d = decide(probe({ bodyHtml: html }), 'greenhouse');
        expect(d.alive).toBe(false);
        expect(d.reason).toBe('soft_404');
        expect(d.evidence.softMatch?.patternId).toBe('position_filled');
    });

    it('marks 200 + soft-404 in URL as dead', () => {
        const d = decide(probe({ finalUrl: 'https://employer.com/jobs/closed/1' }), null);
        expect(d.alive).toBe(false);
        expect(d.reason).toBe('soft_404');
        expect(d.evidence.softMatch?.location).toBe('final_url');
    });

    it('does NOT mark dead when body fetch failed (null body) on a 2xx', () => {
        // FP guard: never declare dead based on absent body
        const d = decide(probe({ bodyHtml: null, finalStatus: 200 }), 'greenhouse');
        expect(d.alive).toBe(true);
        expect(d.reason).toBe('alive_2xx');
    });

    it('records checkerVersion on every decision', () => {
        const d = decide(probe(), null);
        expect(d.evidence.checkerVersion).toMatch(/^v\d/);
    });
});

describe('checkJobHealth', () => {
    it('passes through to the probe and decides', async () => {
        const probeImpl = vi.fn().mockResolvedValue(probe({ finalStatus: 404 }));
        const d = await checkJobHealth('https://example.com/x', 'adzuna', { probeImpl });
        expect(d.reason).toBe('http_404');
        expect(probeImpl).toHaveBeenCalledWith('https://example.com/x', expect.objectContaining({ fetchBody: true }));
    });
});
