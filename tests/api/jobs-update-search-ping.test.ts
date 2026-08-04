/**
 * Workstream B3 regression lock: an employer edit that changes material fields
 * (title, description, location, salary) must re-ping search engines the same
 * way post-free does after creation. Before this fix, Google kept serving the
 * pre-edit listing for the remainder of the paid term because
 * app/api/jobs/update/route.ts never called pingAllSearchEngines.
 *
 * The ping is production-gated and fire-and-forget, and must never fire for
 * cosmetic edits (unchanged material fields) or unpublished listings.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

const mockPing = vi.fn().mockResolvedValue([]);
vi.mock('@/lib/search-indexing', () => ({
  pingAllSearchEngines: mockPing,
}));

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

const read = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

function makeUpdateRequest(): NextRequest {
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
      },
    }),
  });
}

const employerJobRow = {
  id: 'ej-1',
  jobId: 'job-abc',
  contactEmail: 'employer@example.com',
  companyWebsite: null,
  companyLogoUrl: null,
  editToken: 'valid-token-abc',
};

const materialFields = {
  description: '<p>Updated job description with relevant content.</p>',
  location: 'Austin, TX',
  minSalary: null,
  maxSalary: null,
  salaryPeriod: null,
};

afterEach(() => {
  delete process.env.VERCEL_ENV;
});

describe('B3: employer edit re-pings search engines on material change', () => {
  it('pings with the new job URL when the title changed (production)', async () => {
    process.env.VERCEL_ENV = 'production';
    vi.mocked(prisma.employerJob.findFirst).mockResolvedValue(employerJobRow as never);
    vi.mocked(prisma.job.findUnique).mockResolvedValue({
      title: 'PMHNP Old Title', ...materialFields,
    } as never);
    vi.mocked(prisma.job.update).mockResolvedValue({
      id: 'job-abc', title: 'PMHNP Outpatient', isPublished: true, ...materialFields,
    } as never);

    const { POST } = await import('@/app/api/jobs/update/route');
    const res = await POST(makeUpdateRequest());

    expect(res.status).toBe(200);
    expect(mockPing).toHaveBeenCalledOnce();
    const url = mockPing.mock.calls[0][0] as string;
    expect(url).toContain('https://pmhnphiring.com/jobs/');
    expect(url).toContain('job-abc');
  });

  it('does NOT ping when no material field changed (cosmetic edit)', async () => {
    process.env.VERCEL_ENV = 'production';
    vi.mocked(prisma.employerJob.findFirst).mockResolvedValue(employerJobRow as never);
    vi.mocked(prisma.job.findUnique).mockResolvedValue({
      title: 'PMHNP Outpatient', ...materialFields,
    } as never);
    vi.mocked(prisma.job.update).mockResolvedValue({
      id: 'job-abc', title: 'PMHNP Outpatient', isPublished: true, ...materialFields,
    } as never);

    const { POST } = await import('@/app/api/jobs/update/route');
    const res = await POST(makeUpdateRequest());

    expect(res.status).toBe(200);
    expect(mockPing).not.toHaveBeenCalled();
  });

  it('does NOT ping outside production even on material change', async () => {
    vi.mocked(prisma.employerJob.findFirst).mockResolvedValue(employerJobRow as never);
    vi.mocked(prisma.job.findUnique).mockResolvedValue({
      title: 'PMHNP Old Title', ...materialFields,
    } as never);
    vi.mocked(prisma.job.update).mockResolvedValue({
      id: 'job-abc', title: 'PMHNP Outpatient', isPublished: true, ...materialFields,
    } as never);

    const { POST } = await import('@/app/api/jobs/update/route');
    const res = await POST(makeUpdateRequest());

    expect(res.status).toBe(200);
    expect(mockPing).not.toHaveBeenCalled();
  });

  it('does NOT ping when the listing is unpublished', async () => {
    process.env.VERCEL_ENV = 'production';
    vi.mocked(prisma.employerJob.findFirst).mockResolvedValue(employerJobRow as never);
    vi.mocked(prisma.job.findUnique).mockResolvedValue({
      title: 'PMHNP Old Title', ...materialFields,
    } as never);
    vi.mocked(prisma.job.update).mockResolvedValue({
      id: 'job-abc', title: 'PMHNP Outpatient', isPublished: false, ...materialFields,
    } as never);

    const { POST } = await import('@/app/api/jobs/update/route');
    const res = await POST(makeUpdateRequest());

    expect(res.status).toBe(200);
    expect(mockPing).not.toHaveBeenCalled();
  });
});

describe('source lock: the edit-ping stays in the route', () => {
  const src = read('app/api/jobs/update/route.ts');

  it('calls pingAllSearchEngines fire-and-forget with a caught rejection', () => {
    expect(src).toMatch(/pingAllSearchEngines\(jobUrl\)\.catch/);
  });

  it('compares every material field before pinging', () => {
    for (const field of ['title', 'description', 'location', 'minSalary', 'maxSalary', 'salaryPeriod']) {
      expect(src).toMatch(new RegExp(`beforeJob\\.${field} !== updatedJob\\.${field}`));
    }
  });

  it('gates on publication state so unpublished listings are never pinged', () => {
    expect(src).toMatch(/updatedJob\.isPublished/);
  });
});
