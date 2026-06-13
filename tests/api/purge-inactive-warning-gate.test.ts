/**
 * Regression (audit H4) — purge-inactive-users stamped purge_warning_email_sent_at
 * while the actual warning email was a TODO. The marker advances an account to
 * soft-delete (then hard-delete), so accounts were erased after a warning that
 * was never sent.
 *
 * The fix sends a real warning and only stamps the marker on a SUCCESSFUL send.
 * These tests lock in: failed send => not stamped; successful send => stamped.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';

const sendWarningMock = vi.fn();
vi.mock('@/lib/email-service', () => ({ sendInactivityPurgeWarningEmail: sendWarningMock }));

vi.mock('@/lib/prisma', () => ({
  prisma: { userProfile: { findMany: vi.fn(), update: vi.fn() } },
}));

vi.mock('@/lib/auth/verify-cron-or-admin', () => ({ verifyCronOrAdmin: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/audit-log', () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/discord-notifier', () => ({ sendCronFailureAlert: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/cron/track', () => ({
  withCronTracking: vi.fn(async (_name: string, body: () => Promise<{ response: unknown }>) => (await body()).response),
}));

function req(): Request {
  return new Request('https://example.com/api/cron/purge-inactive-users');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.userProfile.update).mockResolvedValue({} as never);
  // 1st findMany = warning candidates; 2nd findMany = soft-delete candidates (none).
  vi.mocked(prisma.userProfile.findMany)
    .mockResolvedValueOnce([{ id: 'u1', email: 'u1@example.com' }] as never)
    .mockResolvedValueOnce([] as never);
});

describe('purge-inactive-users — warning gate', () => {
  it('does NOT stamp the warning marker when the email fails to send', async () => {
    sendWarningMock.mockResolvedValue({ success: false, error: 'resend down' });
    const { GET } = await import('@/app/api/cron/purge-inactive-users/route');
    await GET(req() as never);

    expect(sendWarningMock).toHaveBeenCalledWith('u1@example.com', expect.any(Number));
    // The account must not be advanced toward deletion.
    expect(prisma.userProfile.update).not.toHaveBeenCalled();
  });

  it('stamps the marker only after a successful send', async () => {
    sendWarningMock.mockResolvedValue({ success: true });
    const { GET } = await import('@/app/api/cron/purge-inactive-users/route');
    await GET(req() as never);

    expect(sendWarningMock).toHaveBeenCalledWith('u1@example.com', expect.any(Number));
    expect(prisma.userProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: expect.objectContaining({ purgeWarningEmailSentAt: expect.any(Date) }),
      }),
    );
  });
});
