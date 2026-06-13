/**
 * Regression (audit follow-up) — non-automated DSAR types (correction,
 * portability, object, restrict, opt_out_sale) used to sit in data_requests
 * with nothing ever reading them, silently missing their regulatory deadline.
 * This cron surfaces open + overdue requests via Discord. These tests lock in
 * the overdue/due-soon partition and that it only alerts when there's work.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';

const sendDiscordMock = vi.fn().mockResolvedValue(true);
vi.mock('@/lib/discord-notifier', () => ({
  sendDiscordMessage: sendDiscordMock,
  sendCronFailureAlert: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/prisma', () => ({ prisma: { dataRequest: { findMany: vi.fn() } } }));
vi.mock('@/lib/auth/verify-cron-or-admin', () => ({ verifyCronOrAdmin: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/cron/track', () => ({
  withCronTracking: vi.fn(async (_n: string, body: () => Promise<{ response: unknown }>) => (await body()).response),
}));

const DAY = 24 * 60 * 60 * 1000;
function req(): Request { return new Request('https://example.com/api/cron/dsar-overdue'); }
function row(id: string, type: string, dueOffsetDays: number) {
  return { id, type, status: 'in_progress', jurisdiction: 'gdpr', dueBy: new Date(Date.now() + dueOffsetDays * DAY), createdAt: new Date() };
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/cron/dsar-overdue', () => {
  it('counts overdue + due-soon and alerts Discord when there is work', async () => {
    vi.mocked(prisma.dataRequest.findMany).mockResolvedValue([
      row('overdue01', 'correction', -2), // past due
      row('duesoon01', 'portability', 1), // within 3 days
      row('future001', 'restrict', 10),   // open but not flagged
    ] as never);

    const { GET } = await import('@/app/api/cron/dsar-overdue/route');
    const res = await GET(req() as never);
    const json = await res.json();

    expect(json.open).toBe(3);
    expect(json.overdue).toBe(1);
    expect(json.dueSoon).toBe(1);
    expect(sendDiscordMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT ping Discord when nothing is overdue or due soon', async () => {
    vi.mocked(prisma.dataRequest.findMany).mockResolvedValue([row('future', 'object', 20)] as never);

    const { GET } = await import('@/app/api/cron/dsar-overdue/route');
    const res = await GET(req() as never);
    const json = await res.json();

    expect(json.open).toBe(1);
    expect(json.overdue).toBe(0);
    expect(json.dueSoon).toBe(0);
    expect(sendDiscordMock).not.toHaveBeenCalled();
  });

  it('only considers open requests (excludes completed/rejected in the query)', async () => {
    vi.mocked(prisma.dataRequest.findMany).mockResolvedValue([] as never);
    const { GET } = await import('@/app/api/cron/dsar-overdue/route');
    await GET(req() as never);
    expect(prisma.dataRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: { notIn: ['completed', 'rejected'] } } }),
    );
  });
});
