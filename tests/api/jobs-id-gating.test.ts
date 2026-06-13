/**
 * Regression (audit low) — GET /api/jobs/[id] used findUnique with no
 * publish/expiry filter, so it returned the full row for unpublished/expired
 * jobs (and counted a view on them). It must only expose live jobs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/prisma', () => ({
  prisma: { job: { findFirst: vi.fn(), update: vi.fn(), findUnique: vi.fn() }, jobViewEvent: { create: vi.fn() } },
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

function req(): Request {
  // A real-user UA so the (non-bot) view-count path is exercised.
  return new Request('https://example.com/api/jobs/job-1', {
    headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
  });
}
const params = Promise.resolve({ id: 'job-1' });

beforeEach(() => vi.clearAllMocks());

describe('GET /api/jobs/[id] — only live jobs', () => {
  it('404s an unpublished/expired job and does not count a view', async () => {
    // findFirst with the publish/expiry gate returns nothing.
    vi.mocked(prisma.job.findFirst).mockResolvedValue(null as never);
    const { GET } = await import('@/app/api/jobs/[id]/route');
    const res = await GET(req() as never, { params } as never);
    expect(res.status).toBe(404);
    expect(prisma.job.update).not.toHaveBeenCalled(); // no view increment
    // The query must include the publish gate.
    expect(prisma.job.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'job-1', isPublished: true }) }),
    );
  });

  it('returns a live job', async () => {
    vi.mocked(prisma.job.findFirst).mockResolvedValue({ id: 'job-1', title: 'PMHNP', isPublished: true } as never);
    vi.mocked(prisma.job.update).mockResolvedValue({} as never);
    vi.mocked(prisma.jobViewEvent.create).mockResolvedValue({} as never);
    const { GET } = await import('@/app/api/jobs/[id]/route');
    const res = await GET(req() as never, { params } as never);
    expect(res.status).toBe(200);
  });
});
