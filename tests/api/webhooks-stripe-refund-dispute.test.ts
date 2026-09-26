/**
 * Regression (audit) — Stripe refund/dispute entitlement handling:
 *  - A PARTIAL refund must NOT revoke entitlement (only a full refund does),
 *    otherwise the customer keeps a live job but loses invoice/receipt/republish.
 *  - A FULL refund flips paymentStatus='refunded' and unpublishes.
 *  - A chargeback (charge.dispute.created) — which never emits charge.refunded —
 *    must revoke: unpublish + paymentStatus='disputed'.
 *
 * Extended 2026-09-26 for two more entitlement-scope rules:
 *  - A posting can carry several charges (the post plus a renewal each time it
 *    is extended). Revocation belongs to the POSTING, so a full refund of one
 *    charge must not pull down a posting whose other charges still stand.
 *  - charge.dispute.closed with a status that means we kept the funds restores
 *    paymentStatus so the employer is not locked out for ever; it does NOT
 *    auto-republish, since the relist is their call.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';

vi.mock('stripe', () => ({
    default: vi.fn().mockImplementation(() => ({
        webhooks: { constructEvent: vi.fn().mockImplementation((raw: string) => JSON.parse(raw)) },
    })),
}));
vi.mock('@/lib/email-service', () => ({
    sendRefundConfirmationEmail: vi.fn().mockResolvedValue(undefined),
    getOrCreateUnsubToken: vi.fn().mockResolvedValue('utok'),
}));
vi.mock('@/lib/search-indexing', () => ({ pingAllSearchEngines: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/analytics-server', () => ({ trackServerPurchase: vi.fn().mockResolvedValue(undefined) }));

function makeRequest(body: object): Request {
    return new Request('https://example.com/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 'sig_test' },
        body: JSON.stringify(body),
    });
}

const AMOUNT = 19900;

beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x';
    vi.mocked(prisma.processedStripeEvent.create).mockResolvedValue({} as never);
    vi.mocked(prisma.jobCharge.findUnique).mockResolvedValue({ id: 'jc1', employerJobId: 'ej1', amountCents: AMOUNT, type: 'new' } as never);
    vi.mocked(prisma.jobCharge.update).mockResolvedValue({} as never);
    // No sibling charges by default: this posting was paid for once.
    vi.mocked(prisma.jobCharge.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.employerJob.findUnique).mockResolvedValue({ id: 'ej1', jobId: 'job1', contactEmail: 'e@x.com', job: { id: 'job1', title: 'PMHNP' } } as never);
    vi.mocked(prisma.employerJob.update).mockResolvedValue({} as never);
    vi.mocked(prisma.job.update).mockResolvedValue({} as never);
});

describe('Stripe webhook — refund/dispute entitlement', () => {
    it('PARTIAL refund keeps entitlement (no status flip, no unpublish)', async () => {
        const { POST } = await import('@/app/api/webhooks/stripe/route');
        const res = await POST(makeRequest({
            id: 'evt_pr', type: 'charge.refunded',
            data: { object: { id: 'ch1', payment_intent: 'pi1', amount_refunded: 5000, refunds: { data: [{ reason: 'requested_by_customer' }] } } },
        }) as never);

        expect(res.status).toBe(200);
        expect(prisma.jobCharge.update).toHaveBeenCalled(); // ledger still records the partial refund
        // Entitlement preserved: status not flipped, job not unpublished.
        expect(prisma.employerJob.update).not.toHaveBeenCalled();
        expect(prisma.job.update).not.toHaveBeenCalled();
    });

    it('FULL refund revokes entitlement (status refunded + unpublish)', async () => {
        const { POST } = await import('@/app/api/webhooks/stripe/route');
        const res = await POST(makeRequest({
            id: 'evt_fr', type: 'charge.refunded',
            data: { object: { id: 'ch2', payment_intent: 'pi1', amount_refunded: AMOUNT, refunds: { data: [{ reason: 'requested_by_customer' }] } } },
        }) as never);

        expect(res.status).toBe(200);
        expect(prisma.employerJob.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ paymentStatus: 'refunded' }) }),
        );
        // Revocation strips BOTH flags: isFeatured gates messaging + candidate
        // unlocks, so a fully refunded post must not retain paid entitlements.
        expect(prisma.job.update).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'job1' }, data: { isPublished: false, isFeatured: false } }),
        );
    });

    it('refunding ONE charge leaves a posting whose other charge still stands', async () => {
        // The duplicate-renewal case: two charges on one posting, the extra one
        // refunded. Revoking here unpublished a posting whose original payment
        // was never touched, and left it permanently unrenewable.
        vi.mocked(prisma.jobCharge.findMany).mockResolvedValue([
            { id: 'jc0', type: 'new', amountCents: AMOUNT, refundedAmountCents: null },
        ] as never);

        const { POST } = await import('@/app/api/webhooks/stripe/route');
        const res = await POST(makeRequest({
            id: 'evt_dup', type: 'charge.refunded',
            data: { object: { id: 'ch3', payment_intent: 'pi1', amount_refunded: AMOUNT, refunds: { data: [{ reason: 'duplicate' }] } } },
        }) as never);

        expect(res.status).toBe(200);
        expect(prisma.jobCharge.update).toHaveBeenCalled(); // ledger still records it
        expect(prisma.employerJob.update).not.toHaveBeenCalled();
        expect(prisma.job.update).not.toHaveBeenCalled();
    });

    it('refunding the LAST unrefunded charge still revokes', async () => {
        vi.mocked(prisma.jobCharge.findMany).mockResolvedValue([
            { id: 'jc0', type: 'new', amountCents: AMOUNT, refundedAmountCents: AMOUNT },
        ] as never);

        const { POST } = await import('@/app/api/webhooks/stripe/route');
        const res = await POST(makeRequest({
            id: 'evt_last', type: 'charge.refunded',
            data: { object: { id: 'ch4', payment_intent: 'pi1', amount_refunded: AMOUNT, refunds: { data: [{ reason: 'requested_by_customer' }] } } },
        }) as never);

        expect(res.status).toBe(200);
        expect(prisma.employerJob.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ paymentStatus: 'refunded' }) }),
        );
    });

    it('chargeback (dispute.created) revokes: unpublish + disputed', async () => {
        const { POST } = await import('@/app/api/webhooks/stripe/route');
        const res = await POST(makeRequest({
            id: 'evt_dp', type: 'charge.dispute.created',
            data: { object: { id: 'dp1', payment_intent: 'pi1', amount: AMOUNT } },
        }) as never);

        expect(res.status).toBe(200);
        expect(prisma.employerJob.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: { paymentStatus: 'disputed' } }),
        );
        // Chargeback revokes the featured entitlements too (same as refund).
        expect(prisma.job.update).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'job1' }, data: { isPublished: false, isFeatured: false } }),
        );
    });

    it('a dispute WON restores paymentStatus without republishing', async () => {
        vi.mocked(prisma.employerJob.findUnique).mockResolvedValue({ id: 'ej1', paymentStatus: 'disputed' } as never);

        const { POST } = await import('@/app/api/webhooks/stripe/route');
        const res = await POST(makeRequest({
            id: 'evt_dc_won', type: 'charge.dispute.closed',
            data: { object: { id: 'dp2', payment_intent: 'pi1', status: 'won', amount: AMOUNT } },
        }) as never);

        expect(res.status).toBe(200);
        expect(prisma.employerJob.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: { paymentStatus: 'paid' } }),
        );
        // Relisting is the employer's decision, not the webhook's.
        expect(prisma.job.update).not.toHaveBeenCalled();
    });

    it('a dispute LOST leaves the revocation in place', async () => {
        vi.mocked(prisma.employerJob.findUnique).mockResolvedValue({ id: 'ej1', paymentStatus: 'disputed' } as never);

        const { POST } = await import('@/app/api/webhooks/stripe/route');
        const res = await POST(makeRequest({
            id: 'evt_dc_lost', type: 'charge.dispute.closed',
            data: { object: { id: 'dp3', payment_intent: 'pi1', status: 'lost', amount: AMOUNT } },
        }) as never);

        expect(res.status).toBe(200);
        expect(prisma.employerJob.update).not.toHaveBeenCalled();
    });

    it('a dispute closure does not overwrite a separate refund revocation', async () => {
        vi.mocked(prisma.employerJob.findUnique).mockResolvedValue({ id: 'ej1', paymentStatus: 'refunded' } as never);

        const { POST } = await import('@/app/api/webhooks/stripe/route');
        const res = await POST(makeRequest({
            id: 'evt_dc_refunded', type: 'charge.dispute.closed',
            data: { object: { id: 'dp4', payment_intent: 'pi1', status: 'won', amount: AMOUNT } },
        }) as never);

        expect(res.status).toBe(200);
        expect(prisma.employerJob.update).not.toHaveBeenCalled();
    });
});
