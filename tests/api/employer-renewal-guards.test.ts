/**
 * Renewal checkout guards.
 *
 * Two ways a renewal took money it should not have:
 *
 * 1. A chargeback ('disputed') unpublishes the posting and strips its featured
 *    entitlements, but the renewal webhook re-publishes and re-features
 *    whatever it is handed. Only 'pending', 'free' and 'refunded' were
 *    refused, so a disputed posting could buy its own revocation back.
 * 2. Every path back from a completed renewal (the success page, the
 *    confirmation email, a cached dashboard) lands the employer next to a
 *    renew control for the posting they just paid for, so a second charge was
 *    one click away.
 *
 * All fixtures are fictional.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

process.env.STRIPE_SECRET_KEY = 'sk_test_fixture';

const sessionCreate = vi.fn();
vi.mock('stripe', () => ({
    default: class {
        checkout = { sessions: { create: (...a: unknown[]) => sessionCreate(...a) } };
    },
}));

vi.mock('@/lib/rate-limit', () => ({
    rateLimit: async () => null,
    RATE_LIMITS: { postJob: { limit: 100, windowSeconds: 60 } },
}));

const employerJobFindFirst = vi.fn();
vi.mock('@/lib/prisma', () => ({
    prisma: {
        employerJob: { findFirst: (...a: unknown[]) => employerJobFindFirst(...a) },
    },
}));

import { POST } from '@/app/api/create-renewal-checkout/route';

const JOB_ID = 'job-fic-1';
const EDIT_TOKEN = 'edit-token-fic-1';
const DAY = 24 * 60 * 60 * 1000;

function request(): NextRequest {
    return new NextRequest('http://localhost/api/create-renewal-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: JOB_ID, editToken: EDIT_TOKEN }),
    });
}

/** A posting that is otherwise perfectly renewable. */
function posting(overrides: {
    paymentStatus?: string;
    lastRenewedAt?: Date | null;
} = {}) {
    return {
        id: 'employer-job-fic-1',
        contactEmail: 'hiring@examplepsych.example',
        paymentStatus: overrides.paymentStatus ?? 'paid',
        createdAt: new Date(Date.now() - 40 * DAY),
        job: {
            id: JOB_ID,
            title: 'PMHNP Outpatient (Fixture)',
            employer: 'Example Psychiatry (Fixture)',
            location: 'Austin, TX',
            createdAt: new Date(Date.now() - 40 * DAY),
            expiresAt: new Date(Date.now() + 3 * DAY),
            lastRenewedAt: overrides.lastRenewedAt ?? null,
        },
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    sessionCreate.mockResolvedValue({ id: 'cs_test_fic', url: 'https://checkout.stripe.example/cs_test_fic' });
});

describe('payment status guards', () => {
    it('refuses a posting with an open chargeback', async () => {
        employerJobFindFirst.mockResolvedValue(posting({ paymentStatus: 'disputed' }));

        const res = await POST(request());
        const body = await res.json();

        expect(res.status).toBe(409);
        expect(body.error).toMatch(/dispute/i);
        expect(sessionCreate).not.toHaveBeenCalled();
    });

    it('still refuses a refunded posting', async () => {
        employerJobFindFirst.mockResolvedValue(posting({ paymentStatus: 'refunded' }));

        const res = await POST(request());

        expect(res.status).toBe(409);
        expect(sessionCreate).not.toHaveBeenCalled();
    });

    it('still refuses a posting that was never paid for', async () => {
        employerJobFindFirst.mockResolvedValue(posting({ paymentStatus: 'pending' }));

        expect((await POST(request())).status).toBe(409);

        employerJobFindFirst.mockResolvedValue(posting({ paymentStatus: 'free' }));

        expect((await POST(request())).status).toBe(409);
        expect(sessionCreate).not.toHaveBeenCalled();
    });
});

describe('double-charge guard', () => {
    it('refuses a posting renewed moments ago', async () => {
        employerJobFindFirst.mockResolvedValue(posting({ lastRenewedAt: new Date(Date.now() - 60 * 1000) }));

        const res = await POST(request());
        const body = await res.json();

        expect(res.status).toBe(409);
        expect(body.error).toMatch(/renewed in the last/i);
        expect(sessionCreate).not.toHaveBeenCalled();
    });

    it('allows a renewal once the lockout has passed', async () => {
        employerJobFindFirst.mockResolvedValue(posting({ lastRenewedAt: new Date(Date.now() - 5 * DAY) }));

        const res = await POST(request());
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.url).toBeTruthy();
        expect(sessionCreate).toHaveBeenCalledTimes(1);
    });

    it('allows a first-time renewal', async () => {
        employerJobFindFirst.mockResolvedValue(posting());

        const res = await POST(request());

        expect(res.status).toBe(200);
        expect(sessionCreate).toHaveBeenCalledTimes(1);
    });
});
