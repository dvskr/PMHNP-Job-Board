/**
 * Resend engagement webhooks arrive out of order.
 *
 * The idempotency row is keyed on the svix id, so it only suppresses a replay
 * of the SAME event. A 'delivered' retried after a transient 5xx carries its
 * own id and lands after the 'clicked' it preceded, and the tracking branch
 * wrote the new status unconditionally: the click was recorded and then erased,
 * and the open/click funnel under-reported for ever.
 *
 * Status may now only move forward along delivered, opened, clicked. The guard
 * lives in the WHERE clause rather than a read-then-write so two concurrent
 * deliveries cannot race through it.
 *
 * All fixtures are fictional.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// The route reads RESEND_WEBHOOK_SECRET at module scope, and vitest hoists
// imports above plain top-level statements, so this has to be hoisted too or
// the handler short-circuits with "Webhook not configured".
vi.hoisted(() => {
    process.env.RESEND_WEBHOOK_SECRET = 'whsec_fixture';
});

const state = vi.hoisted(() => ({ payload: {} as Record<string, unknown> }));

vi.mock('svix', () => ({
    Webhook: class {
        verify() { return state.payload; }
    },
}));

const emailSendUpdateMany = vi.fn();
vi.mock('@/lib/prisma', () => ({
    prisma: {
        processedStripeEvent: {
            create: async () => ({ id: 'dedupe-fic-1' }),
            delete: async () => ({}),
        },
        emailSend: { updateMany: (...a: unknown[]) => emailSendUpdateMany(...a) },
        emailLead: { updateMany: async () => ({ count: 0 }) },
        userProfile: { updateMany: async () => ({ count: 0 }) },
        programDirectorLead: { updateMany: async () => ({ count: 0 }) },
    },
}));

vi.mock('@/lib/logger', () => ({
    logger: { info: () => {}, warn: () => {}, error: () => {} },
}));

import { POST } from '@/app/api/webhooks/resend/route';

const RESEND_ID = 'resend-fic-1';

function deliver(type: string, svixId: string): NextRequest {
    state.payload = {
        type,
        data: {
            email_id: RESEND_ID,
            to: ['fixture@example.invalid'],
            from: 'fixture@example.invalid',
            subject: 'Fixture',
            created_at: '2026-09-26T00:00:00.000Z',
        },
    };
    return new NextRequest('http://localhost/api/webhooks/resend', {
        method: 'POST',
        headers: {
            'svix-id': svixId,
            'svix-timestamp': '1758844800',
            'svix-signature': 'v1,fixture',
        },
        body: JSON.stringify(state.payload),
    });
}

beforeEach(() => {
    emailSendUpdateMany.mockReset().mockResolvedValue({ count: 1 });
});

describe('engagement status only moves forward', () => {
    it('a delivered event cannot overwrite an opened or clicked row', async () => {
        await POST(deliver('email.delivered', 'svix-fic-a'));

        expect(emailSendUpdateMany).toHaveBeenCalledTimes(1);
        const call = emailSendUpdateMany.mock.calls[0][0];
        expect(call.data.status).toBe('delivered');
        expect(call.where.status.in).not.toContain('opened');
        expect(call.where.status.in).not.toContain('clicked');
        expect(call.where.status.in).toContain('sent');
    });

    it('an opened event may overwrite delivered but not clicked', async () => {
        await POST(deliver('email.opened', 'svix-fic-b'));

        const call = emailSendUpdateMany.mock.calls[0][0];
        expect(call.data.status).toBe('opened');
        expect(call.where.status.in).toContain('delivered');
        expect(call.where.status.in).not.toContain('clicked');
    });

    it('a clicked event may overwrite every earlier stage', async () => {
        await POST(deliver('email.clicked', 'svix-fic-c'));

        const call = emailSendUpdateMany.mock.calls[0][0];
        expect(call.data.status).toBe('clicked');
        expect(call.where.status.in).toEqual(
            expect.arrayContaining(['sent', 'delivered', 'opened']),
        );
        expect(call.where.status.in).not.toContain('clicked');
    });

    it('every engagement write is scoped to the one resendId', async () => {
        await POST(deliver('email.opened', 'svix-fic-d'));
        expect(emailSendUpdateMany.mock.calls[0][0].where.resendId).toBe(RESEND_ID);
    });
});

describe('bounce and complaint stay terminal', () => {
    it('a bounce overwrites whatever stage the row reached', async () => {
        await POST(deliver('email.bounced', 'svix-fic-e'));

        const call = emailSendUpdateMany.mock.calls.at(-1)![0];
        expect(call.data.status).toBe('bounced');
        // No ladder filter: a bounce is an outcome, not a funnel stage.
        expect(call.where.status).toBeUndefined();
    });
});
