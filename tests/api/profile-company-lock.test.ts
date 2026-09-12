/**
 * The employer company name is write-once. PATCH /api/employer/settings has
 * always enforced that (409 COMPANY_NAME_LOCKED), but /api/auth/profile, which
 * is what the /settings page actually posts the whole profile to, accepted any
 * new name. So the strict endpoint sat behind a wide-open one: an employer
 * could rename the organization between postings, publish under a
 * fresh-looking brand, and reset the acct:/dom:/org: quota identity in
 * lib/employer-quota.ts that gates the discounted first post.
 *
 * These tests pin both directions of that contract: a rename is refused with
 * the SAME error contract as the employer settings route, and a same-value
 * write (what every unrelated save sends) still succeeds.
 *
 * All fixtures are fictional.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const USER_ID = 'supabase-employer-fic-lock-1';
const USER_EMAIL = 'hiring@examplepsych.example';
const CURRENT_COMPANY = 'Example Psych Group (Fixture)';

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
const profileUpsert = vi.fn();
const employerLeadFindFirst = vi.fn();
const employerLeadCreate = vi.fn();
const emailLeadUpsert = vi.fn();
const jobAlertFindFirst = vi.fn();
const jobAlertCreate = vi.fn();
vi.mock('@/lib/prisma', () => ({
    prisma: {
        userProfile: {
            findUnique: (...a: unknown[]) => profileFindUnique(...a),
            update: (...a: unknown[]) => profileUpdate(...a),
            upsert: (...a: unknown[]) => profileUpsert(...a),
        },
        employerLead: {
            findFirst: (...a: unknown[]) => employerLeadFindFirst(...a),
            create: (...a: unknown[]) => employerLeadCreate(...a),
        },
        emailLead: { upsert: (...a: unknown[]) => emailLeadUpsert(...a) },
        jobAlert: {
            findFirst: (...a: unknown[]) => jobAlertFindFirst(...a),
            create: (...a: unknown[]) => jobAlertCreate(...a),
        },
    },
}));

import { PATCH, POST } from '@/app/api/auth/profile/route';

function patchRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/auth/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
}

function postRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/auth/profile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: USER_ID, email: USER_EMAIL };
    profileFindUnique.mockResolvedValue({ company: CURRENT_COMPANY, role: 'employer' });
    profileUpdate.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
        supabaseId: USER_ID,
        company: CURRENT_COMPANY,
        ...args.data,
    }));
    profileUpsert.mockResolvedValue({ supabaseId: USER_ID, company: CURRENT_COMPANY });
    employerLeadFindFirst.mockResolvedValue({ id: 'lead-fic-1' });
});

describe('PATCH /api/auth/profile company lock', () => {
    it('refuses a rename with the same contract as PATCH /api/employer/settings', async () => {
        const res = await PATCH(patchRequest({ company: 'Rebranded Psych (Fixture)' }));

        expect(res.status).toBe(409);
        const body = await res.json();
        expect(body.code).toBe('COMPANY_NAME_LOCKED');
        expect(body.currentName).toBe(CURRENT_COMPANY);
        // The rename must never reach the database.
        expect(profileUpdate).not.toHaveBeenCalled();
    });

    it('refuses an attempt to clear the name (park-and-rename evasion)', async () => {
        const res = await PATCH(patchRequest({ company: '' }));

        expect(res.status).toBe(409);
        expect(profileUpdate).not.toHaveBeenCalled();
    });

    it('lets an unrelated save through when the name is echoed back unchanged', async () => {
        const res = await PATCH(patchRequest({ company: CURRENT_COMPANY, phone: '555-0100' }));

        expect(res.status).toBe(200);
        expect(profileUpdate).toHaveBeenCalledTimes(1);
        expect(profileUpdate.mock.calls[0][0].data.phone).toBe('555-0100');
    });

    it('still captures a first name for an account that has none yet', async () => {
        profileFindUnique.mockResolvedValue({ company: null, role: 'employer' });

        const res = await PATCH(patchRequest({ company: 'First Name Ever (Fixture)' }));

        expect(res.status).toBe(200);
        expect(profileUpdate.mock.calls[0][0].data.company).toBe('First Name Ever (Fixture)');
    });

    it('answers 404 rather than 500 when the profile row is missing', async () => {
        profileFindUnique.mockResolvedValue(null);

        const res = await PATCH(patchRequest({ phone: '555-0100' }));

        expect(res.status).toBe(404);
        expect(profileUpdate).not.toHaveBeenCalled();
    });
});

describe('POST /api/auth/profile company capture', () => {
    it('does not rewrite an existing company name on a signup re-call', async () => {
        const res = await POST(postRequest({
            firstName: 'Fixture',
            lastName: 'Employer',
            role: 'employer',
            company: 'Rebranded Psych (Fixture)',
        }));

        expect(res.status).toBe(200);
        const update = profileUpsert.mock.calls[0][0].update;
        expect(update).not.toHaveProperty('company');
    });

    it('captures the name when the existing profile has none (job_seeker upgrade)', async () => {
        profileFindUnique.mockResolvedValue({ company: null, role: 'job_seeker' });
        employerLeadFindFirst.mockResolvedValue(null);

        const res = await POST(postRequest({
            firstName: 'Fixture',
            lastName: 'Employer',
            role: 'employer',
            company: 'Newly Named Clinic (Fixture)',
        }));

        expect(res.status).toBe(200);
        const args = profileUpsert.mock.calls[0][0];
        expect(args.update.company).toBe('Newly Named Clinic (Fixture)');
        expect(args.update.role).toBe('employer');
    });
});
