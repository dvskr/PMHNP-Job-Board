/**
 * Lever-API probe: ID parser + decision rules.
 *
 * The parser is gnarly because both companySlug and postingId can
 * contain hyphens (slug like "seven-starling", postingId is a UUID).
 * Tests pin the regex anchors so future edits don't regress.
 */

import { describe, it, expect, vi } from 'vitest';
import {
    parseLeverExternalId,
    parseLeverApplyUrl,
    resolveLeverRef,
    probeLeverApi,
    type LeverProbeResult,
} from '@/lib/health/probes/lever-api';

const UUID = 'aabbccdd-1122-3344-5566-77889900aabb';

describe('parseLeverExternalId', () => {
    it('extracts slug + UUID from canonical externalId', () => {
        expect(parseLeverExternalId(`lever-talkiatry-${UUID}`)).toEqual({
            companySlug: 'talkiatry',
            postingId: UUID,
        });
    });

    it('handles hyphenated slugs', () => {
        expect(parseLeverExternalId(`lever-seven-starling-${UUID}`)).toEqual({
            companySlug: 'seven-starling',
            postingId: UUID,
        });
    });

    it('returns null for missing prefix', () => {
        expect(parseLeverExternalId(`talkiatry-${UUID}`)).toBeNull();
    });

    it('returns null for missing UUID', () => {
        expect(parseLeverExternalId('lever-talkiatry-not-a-uuid')).toBeNull();
    });

    it('returns null for null/undefined', () => {
        expect(parseLeverExternalId(null)).toBeNull();
        expect(parseLeverExternalId(undefined)).toBeNull();
    });
});

describe('parseLeverApplyUrl', () => {
    it('extracts slug + postingId from jobs.lever.co URL', () => {
        expect(parseLeverApplyUrl(`https://jobs.lever.co/talkiatry/${UUID}`)).toEqual({
            companySlug: 'talkiatry',
            postingId: UUID,
        });
    });

    it('extracts from jobs.eu.lever.co URL', () => {
        expect(parseLeverApplyUrl(`https://jobs.eu.lever.co/zushealth/${UUID}`)).toEqual({
            companySlug: 'zushealth',
            postingId: UUID,
        });
    });

    it('returns null for non-lever URL', () => {
        expect(parseLeverApplyUrl('https://job-boards.greenhouse.io/headway/jobs/12345')).toBeNull();
    });

    it('returns null when posting id is not a UUID', () => {
        expect(parseLeverApplyUrl('https://jobs.lever.co/talkiatry/12345')).toBeNull();
    });
});

describe('resolveLeverRef', () => {
    it('prefers externalId when both are valid', () => {
        const ref = resolveLeverRef(
            `https://jobs.lever.co/wrong/${UUID}`,
            `lever-correct-${UUID}`,
        );
        expect(ref?.companySlug).toBe('correct');
    });

    it('falls back to URL when externalId missing', () => {
        const ref = resolveLeverRef(`https://jobs.lever.co/talkiatry/${UUID}`, null);
        expect(ref?.companySlug).toBe('talkiatry');
    });

    it('returns null when neither is parseable', () => {
        expect(resolveLeverRef('https://example.com/job/1', null)).toBeNull();
    });
});

describe('probeLeverApi decision rules', () => {
    const ref = { companySlug: 'talkiatry', postingId: UUID };

    function mockFetch(status: number) {
        return vi.fn().mockResolvedValue(new Response(null, { status }));
    }

    it('200 → alive', async () => {
        const result = await probeLeverApi(ref, { fetchImpl: mockFetch(200) as unknown as typeof fetch });
        expect(result.status).toBe('alive');
        expect(result.reason).toBe('api_200');
    });

    it('404 → dead', async () => {
        const result = await probeLeverApi(ref, { fetchImpl: mockFetch(404) as unknown as typeof fetch });
        expect(result.status).toBe('dead');
        expect(result.reason).toBe('api_404');
    });

    it('429 → unknown (don\'t kill on rate-limit)', async () => {
        const result = await probeLeverApi(ref, { fetchImpl: mockFetch(429) as unknown as typeof fetch });
        expect(result.status).toBe('unknown');
    });

    it('500 → unknown', async () => {
        const result = await probeLeverApi(ref, { fetchImpl: mockFetch(500) as unknown as typeof fetch });
        expect(result.status).toBe('unknown');
    });

    it('network error → unknown', async () => {
        const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
        const result = await probeLeverApi(ref, { fetchImpl });
        expect(result.status).toBe('unknown');
        expect(result.errorMessage).toContain('ECONNREFUSED');
    });
});
