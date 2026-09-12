/**
 * The editToken window is enforced on the MUTATING handlers, not just the loader.
 *
 * P5.A (2026-06-01) bounded the employer magic link to "published, or within 30
 * days of expiry" and implemented it in GET /api/jobs/edit/[token]. The
 * 2026-09-02 hunt found POST and DELETE /api/jobs/update resolved the token with
 * a bare `findFirst({ where: { editToken } })` and no window check, so a leaked
 * link could still rewrite a long-dead posting — including its applyLink, which
 * every applicant follows — or unpublish it, with no session and no expiry.
 *
 * All fixtures are fictional.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

// Warm the route's module graph in a hook with its own timeout. The tests below
// each `await import(...)` it, and whichever ran first paid the whole transform
// cost inside a 5s test budget; that timed-out call then resolved during the
// next test and polluted its mock call list.
beforeAll(async () => {
  await import('@/app/api/jobs/update/route');
}, 120_000);

vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn().mockResolvedValue(undefined) } }));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
  RATE_LIMITS: { general: { limit: 30, windowSeconds: 60 } },
}));

vi.mock('@/lib/sanitize', () => ({
  sanitizeJobPosting: vi.fn().mockImplementation((d: Record<string, unknown>) => d),
  sanitizeUrl: vi.fn().mockImplementation((u: string) => u),
  sanitizeEmail: vi.fn().mockImplementation((e: string) => e),
  sanitizeText: vi.fn().mockImplementation((t: string) => t),
  normalizeContentWhitespace: vi.fn().mockImplementation((s: string) => s),
}));

vi.mock('@/lib/description-cleaner', () => ({
  summarizeForMeta: vi.fn().mockReturnValue('summary'),
}));

const TOKEN = 'leaked-token-fic-1';
const DAY_MS = 24 * 60 * 60 * 1000;

function updateRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/jobs/update', {
    method: 'POST',
    body: JSON.stringify({
      token: TOKEN,
      jobData: {
        title: 'PMHNP Outpatient (Fixture)',
        location: 'Austin, TX',
        mode: 'In-Person',
        jobType: 'Full-Time',
        description: '<p>Rewritten by whoever holds the link.</p>',
        // The payload an attacker actually cares about: every applicant follows it.
        applyLink: 'https://attacker.example/apply',
      },
    }),
  });
}

function unpublishRequest(): NextRequest {
  return new NextRequest(`http://localhost:3000/api/jobs/update?token=${TOKEN}`, { method: 'DELETE' });
}

function employerJobWith(job: { isPublished: boolean; expiresAt: Date | null }) {
  return {
    id: 'ej-fic-1',
    jobId: 'job-fic-1',
    contactEmail: 'employer@examplepsych.example',
    companyWebsite: null,
    companyLogoUrl: null,
    editToken: TOKEN,
    job,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.job.update).mockResolvedValue({
    id: 'job-fic-1', title: 'PMHNP Outpatient (Fixture)', isPublished: true,
  } as never);
  vi.mocked(prisma.job.findUnique).mockResolvedValue({
    title: 'PMHNP Outpatient (Fixture)', description: '<p>old</p>', location: 'Austin, TX',
    minSalary: null, maxSalary: null, salaryPeriod: null,
  } as never);
});

describe('POST /api/jobs/update editToken window', () => {
  it('rejects a token whose posting expired beyond the grace window', async () => {
    vi.mocked(prisma.employerJob.findFirst).mockResolvedValue(
      employerJobWith({ isPublished: false, expiresAt: new Date(Date.now() - 400 * DAY_MS) }) as never,
    );

    const { POST } = await import('@/app/api/jobs/update/route');
    const res = await POST(updateRequest());

    expect(res.status).toBe(401);
    expect(prisma.job.update).not.toHaveBeenCalled();
  });

  it('still accepts a token for a published posting', async () => {
    vi.mocked(prisma.employerJob.findFirst).mockResolvedValue(
      employerJobWith({ isPublished: true, expiresAt: null }) as never,
    );

    const { POST } = await import('@/app/api/jobs/update/route');
    const res = await POST(updateRequest());

    expect(res.status).toBe(200);
    expect(prisma.job.update).toHaveBeenCalled();
  });

  it('still accepts a token inside the 30-day grace window', async () => {
    vi.mocked(prisma.employerJob.findFirst).mockResolvedValue(
      employerJobWith({ isPublished: false, expiresAt: new Date(Date.now() - 5 * DAY_MS) }) as never,
    );

    const { POST } = await import('@/app/api/jobs/update/route');
    const res = await POST(updateRequest());

    expect(res.status).toBe(200);
  });

  it('fails closed when the posting relation is missing', async () => {
    vi.mocked(prisma.employerJob.findFirst).mockResolvedValue(
      { id: 'ej-fic-2', jobId: 'job-gone', editToken: TOKEN, job: null } as never,
    );

    const { POST } = await import('@/app/api/jobs/update/route');
    const res = await POST(updateRequest());

    expect(res.status).toBe(401);
    expect(prisma.job.update).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/jobs/update editToken window', () => {
  it('refuses to unpublish through a token past the grace window', async () => {
    vi.mocked(prisma.employerJob.findFirst).mockResolvedValue(
      employerJobWith({ isPublished: false, expiresAt: new Date(Date.now() - 400 * DAY_MS) }) as never,
    );

    const { DELETE } = await import('@/app/api/jobs/update/route');
    const res = await DELETE(unpublishRequest());

    expect(res.status).toBe(401);
    expect(prisma.job.update).not.toHaveBeenCalled();
  });

  it('still unpublishes a live posting', async () => {
    vi.mocked(prisma.employerJob.findFirst).mockResolvedValue(
      employerJobWith({ isPublished: true, expiresAt: null }) as never,
    );

    const { DELETE } = await import('@/app/api/jobs/update/route');
    const res = await DELETE(unpublishRequest());

    expect(res.status).toBe(200);
    expect(prisma.job.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isPublished: false }) }),
    );
  });
});
