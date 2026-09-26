/**
 * PATCH /api/auth/profile accepted two edits it should have refused, and in
 * both cases the settings page showed "Profile updated!" over the result.
 *
 *   - A whitespace-only name. sanitizeText() trims, so "     " reached the
 *     column as an empty string and the candidate's display name was wiped.
 *     The route's `body.X ? sanitize : null` guard saw the untrimmed truthy
 *     string, so nothing rejected it.
 *   - An inverted desired-salary range. Nothing compared the two numbers, so a
 *     min above a max was stored and advertised to employers and to matching.
 *
 * These pin the contract, not the implementation: send a body, assert the
 * status and whether anything was written.
 *
 * All fixtures are fictional.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const USER_ID = 'supabase-seeker-fic-validation-1';

interface MockUser { id: string; email: string }
let mockUser: MockUser | null = null;
vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: mockUser }, error: null }) },
    }),
}));

vi.mock('@/lib/csrf', () => ({ verifyCsrf: () => null }));
vi.mock('@/lib/rate-limit', () => ({
    rateLimit: async () => null,
    RATE_LIMITS: { auth: { limit: 100, windowSeconds: 60 } },
}));
vi.mock('@/lib/beehiiv', () => ({ syncToBeehiiv: vi.fn() }));
vi.mock('@/lib/email-service', () => ({ sendSignupWelcomeEmail: vi.fn() }));
vi.mock('@/lib/auth/ensure-profile', () => ({ ensureProfileFromAuth: vi.fn() }));
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn(async () => undefined) } }));
vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const profileFindUnique = vi.fn();
const profileUpdate = vi.fn();
vi.mock('@/lib/prisma', () => ({
    prisma: {
        userProfile: {
            findUnique: (...a: unknown[]) => profileFindUnique(...a),
            update: (...a: unknown[]) => profileUpdate(...a),
        },
    },
}));

import { PATCH } from '@/app/api/auth/profile/route';

function patchRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/auth/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
}

/** The row the route reads before it writes. */
function stored(overrides: Record<string, unknown> = {}) {
    profileFindUnique.mockResolvedValue({
        company: null,
        desiredSalaryMin: null,
        desiredSalaryMax: null,
        ...overrides,
    });
}

async function written(body: unknown): Promise<Record<string, unknown>> {
    const res = await PATCH(patchRequest(body));
    expect(res.status).toBe(200);
    return profileUpdate.mock.calls[0][0].data as Record<string, unknown>;
}

beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: USER_ID, email: 'seeker@example.test' };
    stored();
    profileUpdate.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
        supabaseId: USER_ID,
        ...args.data,
    }));
});

describe('text a user typed never lands as a blank column', () => {
    it('refuses a whitespace-only first name instead of blanking the name', async () => {
        const res = await PATCH(patchRequest({ firstName: '     ' }));

        expect(res.status).toBe(400);
        expect(profileUpdate).not.toHaveBeenCalled();
        const payload = await res.json();
        expect(String(payload.error)).toMatch(/first name/i);
    });

    it('refuses input that sanitizes away to nothing', async () => {
        const res = await PATCH(patchRequest({ headline: '<script>alert(1)</script>' }));

        expect(res.status).toBe(400);
        expect(profileUpdate).not.toHaveBeenCalled();
    });

    it('names every offending field in one answer', async () => {
        const res = await PATCH(patchRequest({ firstName: ' ', lastName: '\t\n' }));

        expect(res.status).toBe(400);
        const payload = await res.json();
        expect(payload.fields).toEqual(expect.arrayContaining(['firstName', 'lastName']));
    });

    it('still clears a field on an explicit empty value', async () => {
        const data = await written({ headline: '' });
        expect(data.headline).toBeNull();
    });

    it('still clears a field on an explicit null', async () => {
        const data = await written({ bio: null });
        expect(data.bio).toBeNull();
    });

    it('saves a real value with its surrounding whitespace trimmed', async () => {
        const data = await written({ firstName: '  Robin  ' });
        expect(data.firstName).toBe('Robin');
    });
});

describe('desired salary range', () => {
    it('refuses a minimum above the maximum', async () => {
        const res = await PATCH(patchRequest({ desiredSalaryMin: 200000, desiredSalaryMax: 100000 }));

        expect(res.status).toBe(400);
        expect(profileUpdate).not.toHaveBeenCalled();
    });

    it('refuses a minimum raised past the maximum already stored', async () => {
        stored({ desiredSalaryMin: 90000, desiredSalaryMax: 120000 });

        const res = await PATCH(patchRequest({ desiredSalaryMin: 150000 }));

        expect(res.status).toBe(400);
        expect(profileUpdate).not.toHaveBeenCalled();
    });

    it('refuses a maximum lowered below the minimum already stored', async () => {
        stored({ desiredSalaryMin: 140000, desiredSalaryMax: 160000 });

        const res = await PATCH(patchRequest({ desiredSalaryMax: 100000 }));

        expect(res.status).toBe(400);
        expect(profileUpdate).not.toHaveBeenCalled();
    });

    it('accepts a range where the two ends are equal', async () => {
        const data = await written({ desiredSalaryMin: 130000, desiredSalaryMax: 130000 });
        expect(data.desiredSalaryMin).toBe(130000);
        expect(data.desiredSalaryMax).toBe(130000);
    });

    it('accepts an open-ended range against a stored value', async () => {
        stored({ desiredSalaryMin: 90000, desiredSalaryMax: null });

        const data = await written({ desiredSalaryMin: 200000 });
        expect(data.desiredSalaryMin).toBe(200000);
    });

    it('accepts clearing the minimum below a stored maximum', async () => {
        stored({ desiredSalaryMin: 90000, desiredSalaryMax: 120000 });

        const data = await written({ desiredSalaryMin: null });
        expect(data.desiredSalaryMin).toBeNull();
    });
});
