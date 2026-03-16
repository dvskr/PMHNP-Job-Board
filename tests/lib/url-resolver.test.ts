import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveApplyUrl } from '../../lib/url-resolver';

describe('resolveApplyUrl', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('returns original URL when no redirects occur', async () => {
        // Mock fetch to return 200 (no redirect)
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            status: 200,
            headers: new Headers(),
        }));

        const result = await resolveApplyUrl('https://employer.com/careers/job/123');

        expect(result.resolvedUrl).toBe('https://employer.com/careers/job/123');
        expect(result.hopsFollowed).toBe(0);
        expect(result.wasRedirected).toBe(false);
    });

    it('follows a single redirect', async () => {
        const mockFetch = vi.fn()
            .mockResolvedValueOnce({
                status: 302,
                headers: new Headers({ 'location': 'https://employer.com/careers/job/123' }),
            })
            .mockResolvedValueOnce({
                status: 200,
                headers: new Headers(),
            });

        vi.stubGlobal('fetch', mockFetch);

        const result = await resolveApplyUrl('https://adzuna.com/land/ad/12345');

        expect(result.resolvedUrl).toBe('https://employer.com/careers/job/123');
        expect(result.hopsFollowed).toBe(1);
        expect(result.wasRedirected).toBe(true);
    });

    it('follows multiple redirects', async () => {
        const mockFetch = vi.fn()
            .mockResolvedValueOnce({
                status: 301,
                headers: new Headers({ 'location': 'https://indeed.com/viewjob?id=abc' }),
            })
            .mockResolvedValueOnce({
                status: 302,
                headers: new Headers({ 'location': 'https://employer.com/apply/123' }),
            })
            .mockResolvedValueOnce({
                status: 200,
                headers: new Headers(),
            });

        vi.stubGlobal('fetch', mockFetch);

        const result = await resolveApplyUrl('https://adzuna.com/land/ad/12345');

        expect(result.resolvedUrl).toBe('https://employer.com/apply/123');
        expect(result.hopsFollowed).toBe(2);
        expect(result.wasRedirected).toBe(true);
    });

    it('stops at maxRedirects to prevent infinite loops', async () => {
        // Every response is a redirect
        const mockFetch = vi.fn().mockResolvedValue({
            status: 302,
            headers: new Headers({ 'location': 'https://loop.com/redirect' }),
        });

        vi.stubGlobal('fetch', mockFetch);

        const result = await resolveApplyUrl('https://start.com/job', 3);

        expect(result.hopsFollowed).toBe(3);
        expect(result.resolvedUrl).toBe('https://loop.com/redirect');
    });

    it('returns original URL when fetch throws an error', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

        const result = await resolveApplyUrl('https://bad-url.com/job');

        expect(result.resolvedUrl).toBe('https://bad-url.com/job');
        expect(result.hopsFollowed).toBe(0);
        expect(result.wasRedirected).toBe(false);
    });

    it('handles redirect with no Location header', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            status: 302,
            headers: new Headers(), // No location header
        }));

        const result = await resolveApplyUrl('https://broken-redirect.com/job');

        expect(result.resolvedUrl).toBe('https://broken-redirect.com/job');
        expect(result.hopsFollowed).toBe(0);
        expect(result.wasRedirected).toBe(false);
    });

    it('handles relative redirect URLs', async () => {
        const mockFetch = vi.fn()
            .mockResolvedValueOnce({
                status: 302,
                headers: new Headers({ 'location': '/careers/apply/456' }),
            })
            .mockResolvedValueOnce({
                status: 200,
                headers: new Headers(),
            });

        vi.stubGlobal('fetch', mockFetch);

        const result = await resolveApplyUrl('https://employer.com/redirect?job=123');

        expect(result.resolvedUrl).toBe('https://employer.com/careers/apply/456');
        expect(result.hopsFollowed).toBe(1);
        expect(result.wasRedirected).toBe(true);
    });
});
