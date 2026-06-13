/**
 * Regression (audit H3) — POST /api/jobs/report had no per-reporter dedup and
 * counted ALL report rows toward AUTO_UNPUBLISH_THRESHOLD (3). One logged-in
 * account could file the same job 3× and auto-unpublish any competitor's job.
 *
 * The fix de-dups per (jobId, reporterEmail) and measures the threshold in
 * DISTINCT reporters. These tests lock that in.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';

const getUserMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({ auth: { getUser: getUserMock } }),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    job: { findUnique: vi.fn(), update: vi.fn() },
    userProfile: { findUnique: vi.fn() },
    jobReport: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
  RATE_LIMITS: { feedback: { limit: 5, windowSeconds: 60 } },
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

function req(body: Record<string, unknown>): Request {
  return new Request('https://example.com/api/jobs/report', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: 'sb-rep', email: 'reporter@example.com' } } });
  vi.mocked(prisma.userProfile.findUnique).mockResolvedValue({ firstName: 'R', lastName: 'X', email: 'reporter@example.com' } as never);
});

describe('POST /api/jobs/report — abuse-resistant threshold', () => {
  it('a repeat report from the same reporter does not create a duplicate row', async () => {
    vi.mocked(prisma.job.findUnique).mockResolvedValue({ id: 'job1', title: 'T', employer: 'E', isPublished: true } as never);
    vi.mocked(prisma.jobReport.findFirst).mockResolvedValue({ id: 'existing' } as never); // already reported
    vi.mocked(prisma.jobReport.findMany).mockResolvedValue([{ reporterEmail: 'reporter@example.com' }] as never);

    const { POST } = await import('@/app/api/jobs/report/route');
    const res = await POST(req({ jobId: 'job1', reason: 'scam' }) as never);

    expect(res.status).toBe(200);
    expect(prisma.jobReport.create).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json.alreadyReported).toBe(true);
  });

  it('does NOT auto-unpublish when one reporter accounts for all reports (1 distinct)', async () => {
    vi.mocked(prisma.job.findUnique).mockResolvedValue({ id: 'job1', title: 'T', employer: 'E', isPublished: true } as never);
    vi.mocked(prisma.jobReport.findFirst).mockResolvedValue({ id: 'existing' } as never);
    vi.mocked(prisma.jobReport.findMany).mockResolvedValue([{ reporterEmail: 'reporter@example.com' }] as never);

    const { POST } = await import('@/app/api/jobs/report/route');
    const res = await POST(req({ jobId: 'job1', reason: 'scam' }) as never);

    const json = await res.json();
    expect(json.autoUnpublished).toBe(false);
    expect(prisma.job.update).not.toHaveBeenCalled();
  });

  it('auto-unpublishes only at 3 DISTINCT reporters', async () => {
    vi.mocked(prisma.job.findUnique).mockResolvedValue({ id: 'job1', title: 'T', employer: 'E', isPublished: true } as never);
    vi.mocked(prisma.jobReport.findFirst).mockResolvedValue(null as never); // new reporter
    vi.mocked(prisma.jobReport.create).mockResolvedValue({ id: 'r3' } as never);
    vi.mocked(prisma.jobReport.findMany).mockResolvedValue([
      { reporterEmail: 'a@x.com' }, { reporterEmail: 'b@x.com' }, { reporterEmail: 'reporter@example.com' },
    ] as never);

    const { POST } = await import('@/app/api/jobs/report/route');
    const res = await POST(req({ jobId: 'job1', reason: 'scam' }) as never);

    const json = await res.json();
    expect(json.totalReports).toBe(3);
    expect(json.autoUnpublished).toBe(true);
    expect(prisma.job.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'job1' }, data: { isPublished: false } }),
    );
  });
});
