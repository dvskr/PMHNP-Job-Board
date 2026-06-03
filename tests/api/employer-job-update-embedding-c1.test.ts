/**
 * C1 regression — the employer edit route must emit 'embedding.refresh.job'
 * after updating job content, so the semantic-search vector stays in sync with
 * the edited title/description/setting/population. Before this fix the
 * token-gated edit path (app/api/jobs/update/route.ts) never dispatched the event.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

const mockInngestSend = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: mockInngestSend } }));

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

function makeUpdateRequest(overrides: Record<string, unknown> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/api/jobs/update', {
    method: 'POST',
    body: JSON.stringify({
      token: 'valid-token-abc',
      jobData: {
        title: 'PMHNP Outpatient',
        location: 'Austin, TX',
        mode: 'In-Person',
        jobType: 'Full-Time',
        description: '<p>Updated job description with relevant content.</p>',
        applyLink: 'https://example.com/apply',
        ...overrides,
      },
    }),
  });
}

describe('C1 — employer job update emits embedding.refresh.job', () => {
  beforeEach(() => vi.clearAllMocks());

  it('emits embedding.refresh.job after a successful update', async () => {
    vi.mocked(prisma.employerJob.findFirst).mockResolvedValue({
      id: 'ej-1', jobId: 'job-abc', contactEmail: 'employer@example.com',
      companyWebsite: null, companyLogoUrl: null, editToken: 'valid-token-abc',
    } as never);
    vi.mocked(prisma.job.update).mockResolvedValue({
      id: 'job-abc', title: 'PMHNP Outpatient', isPublished: true,
    } as never);

    const { POST } = await import('@/app/api/jobs/update/route');
    const res = await POST(makeUpdateRequest());

    expect(res.status).toBe(200);
    expect(mockInngestSend).toHaveBeenCalledOnce();
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'embedding.refresh.job',
        data: expect.objectContaining({ jobId: 'job-abc' }),
      }),
    );
  });

  it('still returns 200 even if inngest.send rejects (fire-and-forget)', async () => {
    mockInngestSend.mockRejectedValueOnce(new Error('inngest unreachable'));
    vi.mocked(prisma.employerJob.findFirst).mockResolvedValue({
      id: 'ej-2', jobId: 'job-xyz', contactEmail: 'employer@example.com',
      companyWebsite: null, companyLogoUrl: null, editToken: 'valid-token-abc',
    } as never);
    vi.mocked(prisma.job.update).mockResolvedValue({
      id: 'job-xyz', title: 'PMHNP Inpatient', isPublished: true,
    } as never);

    const { POST } = await import('@/app/api/jobs/update/route');
    const res = await POST(makeUpdateRequest());
    expect(res.status).toBe(200);
  });

  it('does NOT emit when the edit token is invalid (401)', async () => {
    vi.mocked(prisma.employerJob.findFirst).mockResolvedValue(null);

    const { POST } = await import('@/app/api/jobs/update/route');
    const res = await POST(makeUpdateRequest());

    expect(res.status).toBe(401);
    expect(mockInngestSend).not.toHaveBeenCalled();
  });
});
