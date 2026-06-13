/**
 * Regression (audit H5) — executeBroadcast never consulted the suppression list,
 * so admin broadcasts mailed bounced / complained / unsubscribed / soft-deleted
 * addresses (deliverability + CAN-SPAM/GDPR risk).
 *
 * The fix skips suppressed recipients (status 'skipped', not sent). These tests
 * lock that in.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';

const isEmailSuppressedMock = vi.fn();
const sendBroadcastEmailMock = vi.fn();
vi.mock('@/lib/email-service', () => ({
  isEmailSuppressed: isEmailSuppressedMock,
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
  vi.mocked(prisma.emailBroadcast.findUnique).mockResolvedValue(BROADCAST as never);
  vi.mocked(prisma.emailBroadcast.update).mockResolvedValue({} as never);
  vi.mocked(prisma.emailBroadcastRecipient.update).mockResolvedValue({} as never);
  sendBroadcastEmailMock.mockResolvedValue({ success: true });
});

describe('executeBroadcast — suppression enforcement', () => {
  it('does NOT send to a suppressed recipient and marks them skipped', async () => {
    isEmailSuppressedMock.mockResolvedValue(true);
    vi.mocked(prisma.emailBroadcastRecipient.findMany).mockResolvedValue([
      { id: 'r1', email: 'bounced@example.com', firstName: 'B', status: 'pending' },
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

  it('sends normally to a non-suppressed recipient', async () => {
    isEmailSuppressedMock.mockResolvedValue(false);
    vi.mocked(prisma.emailBroadcastRecipient.findMany).mockResolvedValue([
      { id: 'r2', email: 'ok@example.com', firstName: 'O', status: 'pending' },
    ] as never);

    const { executeBroadcast } = await import('@/lib/broadcast-sender');
    const result = await executeBroadcast('b1');

    expect(sendBroadcastEmailMock).toHaveBeenCalledTimes(1);
    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(0);
  });
});
