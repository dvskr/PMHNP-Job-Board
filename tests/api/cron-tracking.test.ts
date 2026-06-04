/**
 * P5.D — verify a wrapped cron records a cron_runs row (start + success), so a
 * cron that silently stops firing or throws becomes visible in cron_runs instead
 * of failing into the void. cleanup-expired is the verified reference; the same
 * withCronTracking wrap is applied to every other untracked cron.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/auth/verify-cron-or-admin', () => ({
  verifyCronOrAdmin: vi.fn().mockResolvedValue(null), // authorized
}));
vi.mock('@/lib/discord-notifier', () => ({
  sendCronFailureAlert: vi.fn().mockResolvedValue(undefined),
}));

function req(): Request {
  return new Request('https://example.com/api/cron/cleanup-expired', {
    headers: { authorization: 'Bearer test' },
  });
}

describe('cron run-tracking (P5.D)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cleanup-expired records start + success in cron_runs around the run', async () => {
    vi.mocked(prisma.job.findMany).mockResolvedValue([] as never); // nothing expiring → early return path

    const { GET } = await import('@/app/api/cron/cleanup-expired/route');
    const res = await GET(req() as never);

    expect(res.status).toBe(200);
    // start row written immediately (success:false) so a hung run is still visible
    expect(prisma.cronRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'cleanup-expired', success: false }),
      }),
    );
    // finished row flipped to success with duration
    expect(prisma.cronRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ success: true }) }),
    );
  });
});
