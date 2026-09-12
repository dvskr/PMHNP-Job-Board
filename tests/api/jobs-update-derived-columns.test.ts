/**
 * An employer edit must refresh the DERIVED columns every public surface
 * actually reads, and must not touch the column that decides who owns the
 * posting.
 *
 * Two bugs, one write path:
 *
 *  1. Derived-column staleness. lib/salary-display.ts prefers the stored
 *     displaySalary, then the normalized pair, and only then the raw
 *     minSalary/maxSalary; the salary filters query the normalized pair. This
 *     route wrote the raw pair alone, so an employer correcting their range
 *     got a success toast while the detail header, the OG image, the cards
 *     and the filters kept serving the figure from post time. The same gap
 *     left jobTypes and eligibleStateCodes frozen, so a posting that moved
 *     from remote to on-site kept advertising state licences it no longer
 *     needed. The create path (app/api/create-checkout) derives all of these;
 *     the edit path now derives them from the same helpers.
 *
 *  2. contactEmail on a bearer-token path. Roughly twenty employer routes
 *     resolve access to legacy postings with
 *     `{ userId: null, contactEmail: user.email }`, so a forwarded edit link
 *     that could repoint that address was an account-takeover primitive
 *     (and, per docs/pricing-audit.md, a quota-evasion one). The field is now
 *     dropped at the door.
 *
 * All fixtures are fictional.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('@/lib/search-indexing', () => ({ pingAllSearchEngines: vi.fn().mockResolvedValue([]) }));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
  RATE_LIMITS: { general: { limit: 30, windowSeconds: 60 } },
}));

vi.mock('@/lib/description-cleaner', () => ({
  summarizeForMeta: vi.fn().mockReturnValue('summary'),
}));

const TOKEN = 'edit-token-fic-1';

// Imported once in a hook with its own generous timeout. Importing the route
// inside the first `it` charged that test the whole module graph's transform
// cost, which blew the 5s default; the timed-out call then resolved during the
// NEXT test and its prisma.job.update landed in that test's mock.calls[0],
// failing it with the previous test's data.
let POST: typeof import('@/app/api/jobs/update/route').POST;
beforeAll(async () => {
  ({ POST } = await import('@/app/api/jobs/update/route'));
}, 120_000);

interface JobDataOverrides {
  [key: string]: unknown;
}

function updateRequest(overrides: JobDataOverrides = {}): NextRequest {
  return new NextRequest('http://localhost:3000/api/jobs/update', {
    method: 'POST',
    body: JSON.stringify({
      token: TOKEN,
      jobData: {
        title: 'PMHNP Outpatient (Fixture)',
        location: 'Austin, TX',
        mode: 'In-Person',
        jobType: 'Full-Time',
        description: '<p>Outpatient psychiatric care for adults.</p>',
        applyLink: 'https://careers.example/apply',
        ...overrides,
      },
    }),
  });
}

/** The `data` object the route handed prisma.job.update. */
function jobUpdateData(): Record<string, unknown> {
  const call = vi.mocked(prisma.job.update).mock.calls[0]?.[0] as
    | { data: Record<string, unknown> }
    | undefined;
  expect(call, 'prisma.job.update was never called').toBeDefined();
  return call!.data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.employerJob.findFirst).mockResolvedValue({
    id: 'ej-fic-1',
    jobId: 'job-fic-1',
    contactEmail: 'hiring@examplepsych.example',
    companyWebsite: null,
    companyLogoUrl: null,
    editToken: TOKEN,
    job: { isPublished: true, expiresAt: null },
  } as never);
  vi.mocked(prisma.job.findUnique).mockResolvedValue({
    title: 'PMHNP Outpatient (Fixture)',
    description: '<p>old</p>',
    location: 'Austin, TX',
    minSalary: null,
    maxSalary: null,
    salaryPeriod: null,
  } as never);
  vi.mocked(prisma.job.update).mockResolvedValue({
    id: 'job-fic-1',
    title: 'PMHNP Outpatient (Fixture)',
    isPublished: true,
  } as never);
  vi.mocked(prisma.employerJob.update).mockResolvedValue({} as never);
});

describe('POST /api/jobs/update refreshes the derived salary columns', () => {
  it('writes displaySalary and the normalized pair alongside the raw pair', async () => {
    const res = await POST(updateRequest({
      minSalary: 120000,
      maxSalary: 150000,
      salaryPeriod: 'annual',
    }));

    expect(res.status).toBe(200);
    const data = jobUpdateData();
    expect(data.minSalary).toBe(120000);
    expect(data.maxSalary).toBe(150000);
    expect(data.normalizedMinSalary).toBe(120000);
    expect(data.normalizedMaxSalary).toBe(150000);
    expect(data.displaySalary).toMatch(/\$120k.*\$150k/);
    expect(data.salaryIsEstimated).toBe(false);
    expect(data.salaryConfidence).toEqual(expect.any(Number));
  });

  it('clears the derived columns when the employer removes the salary', async () => {
    await POST(updateRequest({ minSalary: null, maxSalary: null, salaryPeriod: null }));

    const data = jobUpdateData();
    expect(data.minSalary).toBeNull();
    expect(data.maxSalary).toBeNull();
    expect(data.salaryPeriod).toBeNull();
    expect(data.normalizedMinSalary).toBeNull();
    expect(data.normalizedMaxSalary).toBeNull();
    expect(data.displaySalary).toBeNull();
  });

  it('swaps a transposed range instead of storing a negative band', async () => {
    await POST(updateRequest({
      minSalary: 150000,
      maxSalary: 120000,
      salaryPeriod: 'annual',
    }));

    const data = jobUpdateData();
    expect(data.minSalary).toBe(120000);
    expect(data.maxSalary).toBe(150000);
    expect(data.normalizedMinSalary).toBe(120000);
    expect(data.normalizedMaxSalary).toBe(150000);
  });
});

describe('POST /api/jobs/update refreshes the structured arrays', () => {
  it('derives jobTypes from the primary type plus every schedule the title names', async () => {
    await POST(updateRequest({
      title: 'PMHNP Outpatient, Full-Time or Part-Time',
      jobType: 'Full-Time',
    }));

    expect(jobUpdateData().jobTypes).toEqual(['Full-Time', 'Part-Time']);
  });

  it('stores the licence states a fully-remote posting restricts itself to', async () => {
    await POST(updateRequest({
      location: 'Remote',
      description:
        '<p>Fully remote telehealth caseload. Candidates must be licensed in Texas and Florida.</p>',
    }));

    const data = jobUpdateData();
    expect(data.isRemote).toBe(true);
    expect(data.eligibleStateCodes).toEqual(['TX', 'FL']);
  });

  it('clears a stale eligibility list when the posting stops being remote', async () => {
    await POST(updateRequest({
      location: 'Austin, TX',
      description:
        '<p>On-site outpatient clinic. Candidates must be licensed in Texas and Florida.</p>',
    }));

    const data = jobUpdateData();
    expect(data.isRemote).toBe(false);
    expect(data.eligibleStateCodes).toEqual([]);
  });
});

describe('POST /api/jobs/update never rewrites contactEmail', () => {
  it('ignores a contactEmail sent alongside a legitimate edit', async () => {
    const res = await POST(updateRequest({
      contactEmail: 'attacker@not-the-employer.example',
      companyWebsite: 'https://examplepsych.example',
    }));

    expect(res.status).toBe(200);
    const employerCall = vi.mocked(prisma.employerJob.update).mock.calls[0]?.[0] as
      | { data: Record<string, unknown> }
      | undefined;
    expect(employerCall).toBeDefined();
    expect(employerCall!.data).not.toHaveProperty('contactEmail');
    expect(JSON.stringify(employerCall!.data)).not.toContain('not-the-employer.example');
  });

  it('does not touch the EmployerJob row at all when contactEmail is the only change', async () => {
    const res = await POST(updateRequest({ contactEmail: 'attacker@not-the-employer.example' }));

    expect(res.status).toBe(200);
    expect(prisma.employerJob.update).not.toHaveBeenCalled();
  });
});

describe('source lock: the edit path stays aligned with the create path', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../../', 'app/api/jobs/update/route.ts'),
    'utf8',
  );

  it('writes every derived column the public surfaces read', () => {
    for (const column of [
      'normalizedMinSalary',
      'normalizedMaxSalary',
      'salaryIsEstimated',
      'salaryConfidence',
      'displaySalary',
      'jobTypes',
      'eligibleStateCodes',
    ]) {
      expect(src, `${column} missing from the update data block`).toContain(column);
    }
  });

  it('drops a client-supplied contactEmail before anything can read it', () => {
    expect(src).toMatch(/contactEmail:\s*_rejectedContactEmail/);
  });

  it('never assigns contactEmail into a Prisma write', () => {
    // Matches `contactEmail: <expression>` in the write blocks while ignoring
    // the destructure above and the prose that explains why it is missing.
    expect(src).not.toMatch(/contactEmail:\s*(jobData|rawJobData|sanitize|employerJob)\b/);
  });

  it('no longer imports the email sanitizer it only needed for that write', () => {
    expect(src).not.toMatch(/sanitizeEmail/);
  });
});
