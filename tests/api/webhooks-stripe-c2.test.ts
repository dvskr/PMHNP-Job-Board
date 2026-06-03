/**
 * C2 regression — Stripe webhook idempotency must roll back when
 * processing fails, so the retry can succeed.
 *
 * The bug (pre-fix): processedStripeEvent.create was called BEFORE
 * processing; if processing then threw, the dedupe row remained,
 * Stripe redelivered, the redelivery hit P2002 ("already processed"),
 * returned 200, and the side-effects (publish flip, JobCharge, email)
 * silently never happened.
 *
 * Fix: every 500-returning path must call cleanupDedupe(), and the
 * outer catch must delete by the captured `dedupedEventId`.
 *
 * These tests assert the dedupe row is deleted before any 500 response.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';

// Mock Stripe constructEvent so we can drive the handler without a real signature
vi.mock('stripe', () => ({
    default: vi.fn().mockImplementation(() => ({
        webhooks: {
            constructEvent: vi.fn().mockImplementation((rawBody: string) => JSON.parse(rawBody)),
        },
        invoices: { retrieve: vi.fn().mockResolvedValue({ id: 'inv_x', invoice_pdf: null, hosted_invoice_url: null, number: null }) },
    })),
}));
vi.mock('@/lib/email-service', () => ({
    sendConfirmationEmail: vi.fn().mockResolvedValue(undefined),
    sendRenewalConfirmationEmail: vi.fn().mockResolvedValue(undefined),
    sendRefundConfirmationEmail: vi.fn().mockResolvedValue(undefined),
    getOrCreateUnsubToken: vi.fn().mockResolvedValue('utok'),
}));
vi.mock('@/lib/search-indexing', () => ({
    pingAllSearchEngines: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/analytics-server', () => ({
    trackServerPurchase: vi.fn().mockResolvedValue(undefined),
}));

function makeRequest(body: object): Request {
    return new Request('https://example.com/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 'sig_test' },
        body: JSON.stringify(body),
    });
}

describe('Stripe webhook C2 — idempotency rollback', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.STRIPE_SECRET_KEY = 'sk_test_x';
        process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x';
    });

    it('deletes dedupe row when EmployerJob is missing (new-post)', async () => {
        vi.mocked(prisma.processedStripeEvent.create).mockResolvedValue({} as never);
        vi.mocked(prisma.job.update).mockResolvedValue({ id: 'job1', title: 't', slug: null } as never);
        vi.mocked(prisma.employerJob.findFirst).mockResolvedValue(null);

        const { POST } = await import('@/app/api/webhooks/stripe/route');
        const res = await POST(makeRequest({
            id: 'evt_1',
            type: 'checkout.session.completed',
            data: { object: { id: 'cs_1', metadata: { jobId: 'job1' }, payment_intent: null, amount_total: 19900, currency: 'usd' } },
        }) as never);

        expect(res.status).toBe(500);
        expect(prisma.processedStripeEvent.delete).toHaveBeenCalledWith({ where: { eventId: 'evt_1' } });
    });

    it('deletes dedupe row when prisma.job.update throws', async () => {
        vi.mocked(prisma.processedStripeEvent.create).mockResolvedValue({} as never);
        vi.mocked(prisma.job.update).mockRejectedValue(new Error('db boom'));

        const { POST } = await import('@/app/api/webhooks/stripe/route');
        const res = await POST(makeRequest({
            id: 'evt_2',
            type: 'checkout.session.completed',
            data: { object: { id: 'cs_2', metadata: { jobId: 'job2' }, payment_intent: null, amount_total: 19900, currency: 'usd' } },
        }) as never);

        expect(res.status).toBe(500);
        expect(prisma.processedStripeEvent.delete).toHaveBeenCalledWith({ where: { eventId: 'evt_2' } });
    });

    it('does NOT delete dedupe when handler returns success', async () => {
        vi.mocked(prisma.processedStripeEvent.create).mockResolvedValue({} as never);
        vi.mocked(prisma.job.update).mockResolvedValue({ id: 'job3', title: 't', slug: 'slug-job3' } as never);
        vi.mocked(prisma.employerJob.findFirst).mockResolvedValue({
            id: 'ej3', contactEmail: 'x@y.com', dashboardToken: 'tok',
        } as never);
        vi.mocked(prisma.employerJob.update).mockResolvedValue({} as never);
        vi.mocked(prisma.jobCharge.create).mockResolvedValue({} as never);
        vi.mocked(prisma.emailLead.findUnique).mockResolvedValue({ unsubscribeToken: 'utok' } as never);

        const { POST } = await import('@/app/api/webhooks/stripe/route');
        const res = await POST(makeRequest({
            id: 'evt_3',
            type: 'checkout.session.completed',
            data: { object: { id: 'cs_3', metadata: { jobId: 'job3', pricing: 'pro' }, payment_intent: null, amount_total: 19900, currency: 'usd' } },
        }) as never);

        expect(res.status).toBe(200);
        expect(prisma.processedStripeEvent.delete).not.toHaveBeenCalled();
    });

    it('returns 200 (deduped) without re-running on P2002 dedupe collision', async () => {
        vi.mocked(prisma.processedStripeEvent.create).mockRejectedValue(
            Object.assign(new Error('duplicate'), { code: 'P2002' }),
        );

        const { POST } = await import('@/app/api/webhooks/stripe/route');
        const res = await POST(makeRequest({
            id: 'evt_4',
            type: 'checkout.session.completed',
            data: { object: { id: 'cs_4', metadata: { jobId: 'job4' } } },
        }) as never);

        const json = await res.json();
        expect(res.status).toBe(200);
        expect(json.deduped).toBe(true);
        expect(prisma.processedStripeEvent.delete).not.toHaveBeenCalled();
        expect(prisma.job.update).not.toHaveBeenCalled();
    });
});
