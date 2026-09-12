/**
 * Regression (audit H5) — executeBroadcast never consulted the suppression list,
 * so admin broadcasts mailed bounced / complained / unsubscribed / soft-deleted
 * addresses (deliverability + CAN-SPAM/GDPR risk).
 *
 * Follow-up: the check it did gain read only the hard-suppression flags, so the
 * person who clicked Unsubscribe in a broadcast footer (which writes
 * EmailLead.isSubscribed=false and nothing else) was mailed by the next one.
 * The gate is isMarketingOptedOut now, and the emergency brake stops a run
 * outright instead of quietly mailing through it.
 *
 * All fixtures are fictional.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/lib/prisma';

const isMarketingOptedOutMock = vi.fn();
const sendBroadcastEmailMock = vi.fn();
vi.mock('@/lib/email-service', () => ({
  isMarketingOptedOut: isMarketingOptedOutMock,
  sendBroadcastEmail: sendBroadcastEmailMock,
  buildBroadcastHtml: vi.fn().mockReturnValue('<html></html>'),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    emailBroadcast: { findUnique: vi.fn(), update: vi.fn() },
    emailBroadcastRecipient: { findMany: vi.fn(), update: vi.fn() },
  },
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const BROADCAST = { id: 'b1', subject: 'Hi {{firstName}}', body: 'Hello', sentCount: 0, failedCount: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.OUTBOUND_MESSAGING_PAUSED;
  vi.mocked(prisma.emailBroadcast.findUnique).mockResolvedValue(BROADCAST as never);
  vi.mocked(prisma.emailBroadcast.update).mockResolvedValue({} as never);
  vi.mocked(prisma.emailBroadcastRecipient.update).mockResolvedValue({} as never);
  sendBroadcastEmailMock.mockResolvedValue({ success: true });
});

afterEach(() => {
  delete process.env.OUTBOUND_MESSAGING_PAUSED;
});

describe('executeBroadcast — opt-out enforcement', () => {
  it('does NOT send to an opted-out recipient and marks them skipped', async () => {
    isMarketingOptedOutMock.mockResolvedValue(true);
    vi.mocked(prisma.emailBroadcastRecipient.findMany).mockResolvedValue([
      { id: 'r1', email: 'unsubscribed@examplepsych.example', firstName: 'B', status: 'pending' },
    ] as never);

    const { executeBroadcast } = await import('@/lib/broadcast-sender');
    const result = await executeBroadcast('b1');

    expect(sendBroadcastEmailMock).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
    expect(result.sent).toBe(0);
    expect(prisma.emailBroadcastRecipient.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'r1' }, data: expect.objectContaining({ status: 'skipped' }) }),
    );
  });

  it('gates on the marketing opt-out, which sees a hand unsubscribe', async () => {
    // isEmailSuppressed reads isSuppressed / emailSuppressed only. The visible
    // Unsubscribe control writes isSubscribed=false, so only the wider check
    // honours the link in this broadcast's own footer.
    isMarketingOptedOutMock.mockResolvedValue(false);
    vi.mocked(prisma.emailBroadcastRecipient.findMany).mockResolvedValue([
      { id: 'r2', email: 'ok@examplepsych.example', firstName: 'O', status: 'pending' },
    ] as never);

    const { executeBroadcast } = await import('@/lib/broadcast-sender');
    await executeBroadcast('b1');

    expect(isMarketingOptedOutMock).toHaveBeenCalledWith('ok@examplepsych.example');
  });

  it('sends normally to a subscribed recipient', async () => {
    isMarketingOptedOutMock.mockResolvedValue(false);
    vi.mocked(prisma.emailBroadcastRecipient.findMany).mockResolvedValue([
      { id: 'r2', email: 'ok@examplepsych.example', firstName: 'O', status: 'pending' },
    ] as never);

    const { executeBroadcast } = await import('@/lib/broadcast-sender');
    const result = await executeBroadcast('b1');

    expect(sendBroadcastEmailMock).toHaveBeenCalledTimes(1);
    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(0);
  });
});

describe('executeBroadcast — emergency brake', () => {
  it('refuses to start while OUTBOUND_MESSAGING_PAUSED=1, and touches nothing', async () => {
    process.env.OUTBOUND_MESSAGING_PAUSED = '1';
    isMarketingOptedOutMock.mockResolvedValue(false);
    vi.mocked(prisma.emailBroadcastRecipient.findMany).mockResolvedValue([
      { id: 'r3', email: 'ok@examplepsych.example', firstName: 'O', status: 'pending' },
    ] as never);

    const { executeBroadcast } = await import('@/lib/broadcast-sender');

    await expect(executeBroadcast('b1')).rejects.toThrow(/paused/i);
    expect(sendBroadcastEmailMock).not.toHaveBeenCalled();
    expect(prisma.emailBroadcast.update).not.toHaveBeenCalled();
  });
});
