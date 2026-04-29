import { describe, it, expect, vi } from 'vitest';
import { probeUrl } from '../../lib/health/probe';

function mockResponse(status: number, init: { headers?: Record<string, string>; body?: string } = {}): Response {
    const headers = new Headers(init.headers ?? {});
    return new Response(init.body ?? null, { status, headers });
}

describe('probeUrl', () => {
    it('returns finalStatus 200 with no redirects on a direct HEAD success', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(mockResponse(200));
        const r = await probeUrl('https://example.com/job/1', { fetchImpl });
        expect(r.finalStatus).toBe(200);
        expect(r.redirectHops).toBe(0);
        expect(r.errorKind).toBeNull();
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(fetchImpl.mock.calls[0][1]).toMatchObject({ method: 'HEAD' });
    });

    it('falls back to GET when HEAD returns 405', async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(mockResponse(405))
            .mockResolvedValueOnce(mockResponse(200));
        const r = await probeUrl('https://example.com/job/1', { fetchImpl });
        expect(r.finalStatus).toBe(200);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(fetchImpl.mock.calls[1][1]).toMatchObject({ method: 'GET' });
    });

    it('records a manual redirect chain', async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(mockResponse(302, { headers: { location: 'https://example.com/new' } }))
            .mockResolvedValueOnce(mockResponse(200));
        const r = await probeUrl('https://example.com/old', { fetchImpl });
        expect(r.finalStatus).toBe(200);
        expect(r.redirectHops).toBe(1);
        expect(r.redirectChain).toHaveLength(2);
        expect(r.redirectChain[0]).toEqual({ url: 'https://example.com/old', status: 302 });
        expect(r.finalUrl).toBe('https://example.com/new');
    });

    it('returns finalStatus 404 directly without following', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(mockResponse(404));
        const r = await probeUrl('https://example.com/missing', { fetchImpl });
        expect(r.finalStatus).toBe(404);
        expect(r.redirectHops).toBe(0);
    });

    it('reports inconclusive on 403', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(mockResponse(403));
        const r = await probeUrl('https://example.com/blocked', { fetchImpl });
        expect(r.finalStatus).toBe(403);
        expect(r.errorKind).toBeNull();
    });

    it('detects too_many_redirects', async () => {
        const fetchImpl = vi.fn().mockImplementation(async (url: string) => {
            const next = url.endsWith('/end') ? '/never' : url + '/r';
            return mockResponse(302, { headers: { location: 'https://example.com' + next } });
        });
        const r = await probeUrl('https://example.com/start', { fetchImpl, maxRedirects: 3 });
        expect(r.errorKind).toBe('too_many_redirects');
        expect(r.redirectHops).toBeGreaterThanOrEqual(3);
    });

    it('reports network error on fetch throw', async () => {
        const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
        const r = await probeUrl('https://bad.example/x', { fetchImpl });
        expect(r.errorKind).toBe('network');
        expect(r.finalStatus).toBeNull();
    });

    it('reports timeout on AbortError', async () => {
        const fetchImpl = vi.fn().mockImplementation(() => {
            const e = new Error('aborted');
            e.name = 'AbortError';
            return Promise.reject(e);
        });
        const r = await probeUrl('https://slow.example/x', { fetchImpl });
        expect(r.errorKind).toBe('timeout');
    });

    it('reports bad_redirect_target on invalid Location header', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(mockResponse(302, { headers: { location: 'http://[bad ipv6' } }));
        const r = await probeUrl('https://example.com/x', { fetchImpl });
        expect(r.errorKind).toBe('bad_redirect_target');
    });

    it('fetches body when fetchBody=true on 2xx', async () => {
        const html = '<p>this position has been filled</p>';
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(mockResponse(200))           // HEAD
            .mockResolvedValueOnce(mockResponse(200, { body: html })); // GET body
        const r = await probeUrl('https://example.com/x', { fetchImpl, fetchBody: true });
        expect(r.bodyHtml).toContain('this position has been filled');
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('does not fetch body when fetchBody=false', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(mockResponse(200));
        const r = await probeUrl('https://example.com/x', { fetchImpl, fetchBody: false });
        expect(r.bodyHtml).toBeNull();
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
});
