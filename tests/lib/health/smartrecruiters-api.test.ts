/**
 * SmartRecruiters-API probe: ID parser + decision rules.
 */

import { describe, it, expect, vi } from 'vitest';
import {
    parseSmartRecruitersExternalId,
    parseSmartRecruitersApplyUrl,
    resolveSmartRecruitersRef,
    probeSmartRecruitersApi,
} from '@/lib/health/probes/smartrecruiters-api';

describe('parseSmartRecruitersExternalId', () => {
    it('extracts slug + numeric postingId', () => {
        expect(parseSmartRecruitersExternalId('smartrecruiters-karecruitinginc-80700022')).toEqual({
            companySlug: 'karecruitinginc',
            postingId: '80700022',
        });
    });

    it('handles hyphenated slugs', () => {
        expect(parseSmartRecruitersExternalId('smartrecruiters-some-multi-word-slug-12345')).toEqual({
            companySlug: 'some-multi-word-slug',
            postingId: '12345',
        });
    });

    it('returns null for missing prefix', () => {
        expect(parseSmartRecruitersExternalId('karecruitinginc-80700022')).toBeNull();
    });

    it('returns null when posting id is non-numeric', () => {
        expect(parseSmartRecruitersExternalId('smartrecruiters-foo-not-numeric')).toBeNull();
    });

    it('returns null for null/undefined', () => {
        expect(parseSmartRecruitersExternalId(null)).toBeNull();
        expect(parseSmartRecruitersExternalId(undefined)).toBeNull();
    });
});

describe('parseSmartRecruitersApplyUrl', () => {
    it('extracts slug + postingId', () => {
        expect(parseSmartRecruitersApplyUrl('https://jobs.smartrecruiters.com/karecruitinginc/80700022')).toEqual({
            companySlug: 'karecruitinginc',
            postingId: '80700022',
        });
    });

    it('returns null for non-SR URL', () => {
        expect(parseSmartRecruitersApplyUrl('https://jobs.lever.co/talkiatry/abc')).toBeNull();
    });
});

describe('resolveSmartRecruitersRef', () => {
    it('prefers externalId when both are valid', () => {
        const ref = resolveSmartRecruitersRef(
            'https://jobs.smartrecruiters.com/wrong/99999',
            'smartrecruiters-correct-12345',
        );
        expect(ref?.companySlug).toBe('correct');
    });

    it('falls back to URL when externalId missing', () => {
        const ref = resolveSmartRecruitersRef(
            'https://jobs.smartrecruiters.com/karecruitinginc/80700022',
            null,
        );
        expect(ref?.companySlug).toBe('karecruitinginc');
    });
});

describe('probeSmartRecruitersApi decision rules', () => {
    const ref = { companySlug: 'karecruitinginc', postingId: '80700022' };
    const mockFetch = (status: number) =>
        vi.fn().mockResolvedValue(new Response(null, { status })) as unknown as typeof fetch;

    it('200 → alive', async () => {
        const result = await probeSmartRecruitersApi(ref, { fetchImpl: mockFetch(200) });
        expect(result.status).toBe('alive');
        expect(result.reason).toBe('api_200');
    });

    it('404 → dead', async () => {
        const result = await probeSmartRecruitersApi(ref, { fetchImpl: mockFetch(404) });
        expect(result.status).toBe('dead');
        expect(result.reason).toBe('api_404');
    });

    it('429 → unknown', async () => {
        const result = await probeSmartRecruitersApi(ref, { fetchImpl: mockFetch(429) });
        expect(result.status).toBe('unknown');
    });

    it('500 → unknown', async () => {
        const result = await probeSmartRecruitersApi(ref, { fetchImpl: mockFetch(500) });
        expect(result.status).toBe('unknown');
    });
});
