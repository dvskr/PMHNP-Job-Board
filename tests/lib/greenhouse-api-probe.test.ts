import { describe, it, expect, vi } from 'vitest';
import {
    parseGreenhouseExternalId,
    parseGreenhouseApplyUrl,
    resolveGreenhouseRef,
    probeGreenhouseApi,
} from '../../lib/health/probes/greenhouse-api';

describe('parseGreenhouseExternalId', () => {
    it('parses simple slug-id form', () => {
        expect(parseGreenhouseExternalId('greenhouse-akidolabs-4623235006')).toEqual({
            boardSlug: 'akidolabs',
            jobId: '4623235006',
        });
    });

    it('parses multi-hyphen slugs (anchored on trailing numeric id)', () => {
        expect(parseGreenhouseExternalId('greenhouse-blue-sky-telepsych-1234567')).toEqual({
            boardSlug: 'blue-sky-telepsych',
            jobId: '1234567',
        });
    });

    it('returns null on missing prefix', () => {
        expect(parseGreenhouseExternalId('lever-acme-12345')).toBeNull();
    });

    it('returns null on missing numeric tail', () => {
        expect(parseGreenhouseExternalId('greenhouse-acme-')).toBeNull();
        expect(parseGreenhouseExternalId('greenhouse-acme-abcd')).toBeNull();
    });

    it('returns null on null/empty input', () => {
        expect(parseGreenhouseExternalId(null)).toBeNull();
        expect(parseGreenhouseExternalId(undefined)).toBeNull();
        expect(parseGreenhouseExternalId('')).toBeNull();
    });
});

describe('parseGreenhouseApplyUrl', () => {
    it('parses job-boards.greenhouse.io URL', () => {
        expect(parseGreenhouseApplyUrl('https://job-boards.greenhouse.io/akidolabs/jobs/4623235006')).toEqual({
            boardSlug: 'akidolabs',
            jobId: '4623235006',
        });
    });

    it('parses legacy boards.greenhouse.io URL', () => {
        expect(parseGreenhouseApplyUrl('https://boards.greenhouse.io/headway/jobs/12345')).toEqual({
            boardSlug: 'headway',
            jobId: '12345',
        });
    });

    it('returns null for embedded gh_jid (slug not in URL)', () => {
        expect(parseGreenhouseApplyUrl('https://riviamind.com/contact-us/careers/?gh_jid=5120318007')).toBeNull();
    });

    it('returns null for unrelated URLs', () => {
        expect(parseGreenhouseApplyUrl('https://lever.co/headway/12345')).toBeNull();
    });
});

describe('resolveGreenhouseRef', () => {
    it('prefers external_id when present', () => {
        const ref = resolveGreenhouseRef(
            'https://job-boards.greenhouse.io/wrongboard/jobs/9999999',
            'greenhouse-rightboard-1234567',
        );
        expect(ref).toEqual({ boardSlug: 'rightboard', jobId: '1234567' });
    });

    it('falls back to URL when external_id missing', () => {
        const ref = resolveGreenhouseRef(
            'https://job-boards.greenhouse.io/headway/jobs/4567',
            null,
        );
        expect(ref).toEqual({ boardSlug: 'headway', jobId: '4567' });
    });

    it('returns null when both fail', () => {
        expect(resolveGreenhouseRef('https://riviamind.com/careers?gh_jid=5120318007', null)).toBeNull();
    });
});

describe('probeGreenhouseApi', () => {
    const ref = { boardSlug: 'acme', jobId: '12345' };

    it('returns alive on 200', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
        const r = await probeGreenhouseApi(ref, { fetchImpl });
        expect(r.status).toBe('alive');
        expect(r.reason).toBe('api_200');
        expect(r.httpStatus).toBe(200);
        expect(r.apiUrl).toBe('https://boards-api.greenhouse.io/v1/boards/acme/jobs/12345');
    });

    it('returns dead on 404', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(
            new Response('{"status":404,"error":"Job not found"}', { status: 404 }),
        );
        const r = await probeGreenhouseApi(ref, { fetchImpl });
        expect(r.status).toBe('dead');
        expect(r.reason).toBe('api_404');
    });

    it('returns unknown on 5xx', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 503 }));
        const r = await probeGreenhouseApi(ref, { fetchImpl });
        expect(r.status).toBe('unknown');
        expect(r.reason).toBe('api_unreachable');
        expect(r.httpStatus).toBe(503);
    });

    it('returns unknown on 429', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 429 }));
        const r = await probeGreenhouseApi(ref, { fetchImpl });
        expect(r.status).toBe('unknown');
    });

    it('returns unknown on network error', async () => {
        const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
        const r = await probeGreenhouseApi(ref, { fetchImpl });
        expect(r.status).toBe('unknown');
        expect(r.errorMessage).toContain('fetch failed');
    });

    it('returns unknown with errorMessage=timeout on AbortError', async () => {
        const fetchImpl = vi.fn().mockImplementation(() => {
            const e = new Error('aborted');
            e.name = 'AbortError';
            return Promise.reject(e);
        });
        const r = await probeGreenhouseApi(ref, { fetchImpl });
        expect(r.status).toBe('unknown');
        expect(r.errorMessage).toBe('timeout');
    });

    it('URL-encodes board and job ID', async () => {
        const odd = { boardSlug: 'co/op', jobId: '12 345' };
        const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
        await probeGreenhouseApi(odd, { fetchImpl });
        const calledWith = fetchImpl.mock.calls[0][0] as string;
        expect(calledWith).toContain('co%2Fop');
        expect(calledWith).toContain('12%20345');
    });
});
