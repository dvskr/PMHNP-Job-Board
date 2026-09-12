/**
 * PATCH /api/auth/profile has to persist exactly what the settings form sent.
 * Three ways it did not:
 *
 *   - `parseInt(x, 10) || null` turned a legitimate 0 into null, so
 *     "New Grad (0)" years of experience vanished on every save (the select
 *     came back empty under a success toast) and new grads fell out of every
 *     `yearsExperience >= N` employer filter and out of the embedding text.
 *   - the professional summary was sanitized to 500 characters while the
 *     editor counted to 1000, so the tail was sliced off and the PATCH still
 *     answered 200.
 *   - the desired-salary rate type was stored verbatim, and every reader
 *     falls back to 'yearly', so a typo would present an hourly range as an
 *     annual salary.
 *
 * All fixtures are fictional.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const USER_ID = 'supabase-seeker-fic-fidelity-1';

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

async function written(body: unknown): Promise<Record<string, unknown>> {
    const res = await PATCH(patchRequest(body));
    expect(res.status).toBe(200);
    return profileUpdate.mock.calls[0][0].data as Record<string, unknown>;
}

beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: USER_ID, email: 'seeker@example.test' };
    profileFindUnique.mockResolvedValue({ company: null });
    profileUpdate.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
        supabaseId: USER_ID,
        ...args.data,
    }));
});

describe('integer fields keep a legitimate zero', () => {
    it('stores yearsExperience 0 instead of nulling New Grad', async () => {
        const data = await written({ yearsExperience: 0 });
        expect(data.yearsExperience).toBe(0);
    });

    it('stores a 0 salary floor', async () => {
        const data = await written({ desiredSalaryMin: 0, desiredSalaryMax: 120000 });
        expect(data.desiredSalaryMin).toBe(0);
        expect(data.desiredSalaryMax).toBe(120000);
    });

    it('still clears on an explicit null and on unparseable input', async () => {
        const cleared = await written({ yearsExperience: null });
        expect(cleared.yearsExperience).toBeNull();

        vi.clearAllMocks();
        profileFindUnique.mockResolvedValue({ company: null });
        profileUpdate.mockImplementation(async (args: { data: Record<string, unknown> }) => args.data);
        const garbage = await written({ yearsExperience: 'not a number' });
        expect(garbage.yearsExperience).toBeNull();
    });

    it('leaves an omitted field untouched', async () => {
        const data = await written({ headline: 'PMHNP-BC (Fixture)' });
        expect(data).not.toHaveProperty('yearsExperience');
    });
});

describe('professional summary length', () => {
    it('keeps the full 1000 characters the editor allows', async () => {
        const bio = 'a'.repeat(1000);
        const data = await written({ bio });
        expect(String(data.bio)).toHaveLength(1000);
    });
});

describe('available date', () => {
    it('answers 400 for an unparseable date instead of letting Prisma 500', async () => {
        const res = await PATCH(patchRequest({ availableDate: 'next Tuesday-ish' }));

        expect(res.status).toBe(400);
        expect(profileUpdate).not.toHaveBeenCalled();
    });
});

describe('desired salary rate type', () => {
    it('persists hourly so an hourly range is not read as annual', async () => {
        const data = await written({ desiredSalaryType: 'hourly' });
        expect(data.desiredSalaryType).toBe('hourly');
    });

    it('rejects an unknown rate type instead of storing it', async () => {
        const res = await PATCH(patchRequest({ desiredSalaryType: 'weekly' }));

        expect(res.status).toBe(400);
        expect(profileUpdate).not.toHaveBeenCalled();
    });
});
