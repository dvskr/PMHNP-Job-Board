/**
 * POST /api/employer/testimonials is a claim about being a paying customer.
 *
 * It used to check only "is someone signed in", so any job seeker could file a
 * testimonial that landed in the admin feature queue attributed to them, and
 * the employer-name fallback chain ended in `user.email`: the row an admin
 * reviews (and can publish) carried the submitter's email address as the
 * display name.
 *
 * The route now uses the shared employer role gate, and the name falls back to
 * the profile company, never to an email.
 *
 * All fixtures are fictional.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const SEEKER_ID = 'supabase-seeker-fic-1';
const EMPLOYER_ID = 'supabase-employer-fic-2';
const EMPLOYER_EMAIL = 'hiring@examplepsych.example';

interface MockUser { id: string; email: string }
let mockUser: MockUser | null = null;

vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: mockUser }, error: null }) },
    }),
}));

vi.mock('@/lib/rate-limit', () => ({
    rateLimit: async () => null,
    RATE_LIMITS: { feedback: { limit: 100, windowSeconds: 60 } },
}));

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const profileFindUnique = vi.fn();
const employerJobFindFirst = vi.fn();
const testimonialCreate = vi.fn();
vi.mock('@/lib/prisma', () => ({
    prisma: {
        userProfile: { findUnique: (...a: unknown[]) => profileFindUnique(...a) },
        employerJob: { findFirst: (...a: unknown[]) => employerJobFindFirst(...a) },
        employerTestimonial: { create: (...a: unknown[]) => testimonialCreate(...a) },
    },
}));

import { POST } from '@/app/api/employer/testimonials/route';

function request(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/employer/testimonials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

const VALID_BODY = {
    content: 'We filled a hard to staff evening slot in under three weeks.',
    consent: true,
    displayAs: 'initial',
};

beforeEach(() => {
    vi.clearAllMocks();
    employerJobFindFirst.mockResolvedValue(null);
    testimonialCreate.mockResolvedValue({ id: 'testimonial-fic-1' });
});

describe('POST /api/employer/testimonials role gate', () => {
    it('refuses a signed-in job seeker', async () => {
        mockUser = { id: SEEKER_ID, email: 'seeker@examplemail.example' };
        profileFindUnique.mockResolvedValue({ id: 'profile-seeker', role: 'candidate', company: null });

        const res = await POST(request(VALID_BODY));

        expect(res.status).toBe(403);
        expect(testimonialCreate).not.toHaveBeenCalled();
    });

    it('refuses an anonymous visitor', async () => {
        mockUser = null;

        const res = await POST(request(VALID_BODY));

        expect(res.status).toBe(401);
        expect(testimonialCreate).not.toHaveBeenCalled();
    });

    it('accepts an employer', async () => {
        mockUser = { id: EMPLOYER_ID, email: EMPLOYER_EMAIL };
        profileFindUnique.mockResolvedValue({ id: 'profile-employer', role: 'employer', company: 'Example Psychiatry (Fixture)' });

        const res = await POST(request(VALID_BODY));

        expect(res.status).toBe(200);
        expect(testimonialCreate).toHaveBeenCalledTimes(1);
    });
});

describe('the stored employer name', () => {
    beforeEach(() => {
        mockUser = { id: EMPLOYER_ID, email: EMPLOYER_EMAIL };
    });

    it('never falls back to the account email', async () => {
        profileFindUnique.mockResolvedValue({ id: 'profile-employer', role: 'employer', company: null });

        await POST(request(VALID_BODY));

        const stored = testimonialCreate.mock.calls[0][0].data;
        expect(stored.employerName).not.toBe(EMPLOYER_EMAIL);
        expect(stored.employerName).not.toContain('@');
        expect(stored.employerName).toBe('Anonymous employer');
    });

    it('prefers the posting name, then the profile company', async () => {
        profileFindUnique.mockResolvedValue({ id: 'profile-employer', role: 'employer', company: 'Example Psychiatry (Fixture)' });
        employerJobFindFirst.mockResolvedValue({ employerName: 'Example Behavioral Health (Fixture)' });

        await POST(request(VALID_BODY));
        expect(testimonialCreate.mock.calls[0][0].data.employerName).toBe('Example Behavioral Health (Fixture)');

        vi.clearAllMocks();
        testimonialCreate.mockResolvedValue({ id: 'testimonial-fic-2' });
        profileFindUnique.mockResolvedValue({ id: 'profile-employer', role: 'employer', company: 'Example Psychiatry (Fixture)' });
        employerJobFindFirst.mockResolvedValue(null);

        await POST(request(VALID_BODY));
        expect(testimonialCreate.mock.calls[0][0].data.employerName).toBe('Example Psychiatry (Fixture)');
    });
});
