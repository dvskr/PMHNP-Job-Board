/**
 * Regression — POST /api/job-alerts used to default newsletterOptIn to TRUE
 * (`body.newsletterOptIn !== false`) and synced EVERY alert signup to the
 * Beehiiv newsletter, silently subscribing people who only asked for a job
 * alert. Newsletter consent must be explicit: the sync (and the optIn flag)
 * may only engage when the request carries `newsletterOptIn: true`.
 *
 * Also pins the personalized welcome email: the route passes the created
 * alert's criteria summary, filtered-jobs URL, frequency, and location into
 * sendWelcomeEmail (third argument) instead of sending a generic blast.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { syncToBeehiiv } from '@/lib/beehiiv';
import { sendWelcomeEmail } from '@/lib/email-service';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    emailLead: { upsert: vi.fn() },
    jobAlert: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
  RATE_LIMITS: { jobAlerts: { limit: 10, windowSeconds: 60 } },
}));

vi.mock('@/lib/beehiiv', () => ({
  syncToBeehiiv: vi.fn(),
}));

// Keep the test focused on the route: the summary/URL builders are pinned
// separately (tests/regressions/audit-coverage-static.test.ts).
vi.mock('@/lib/job-alerts-service', () => ({
  buildCriteriaSummary: vi.fn(() => '"psych" · in Texas'),
  buildFilteredJobsUrl: vi.fn(() => 'https://pmhnphiring.com/jobs?q=psych&location=Texas'),
}));

const CREATED_ALERT = {
  id: 'alert-1',
  token: 'tok-alert-1',
  email: 'nurse@example.com',
  name: null,
  keyword: 'psych',
  location: 'Texas',
  mode: null,
  jobType: null,
  minSalary: null,
  maxSalary: null,
  frequency: 'daily',
  isActive: true,
  confirmedAt: new Date(),
};

function postReq(body: unknown): Request {
  return new Request('https://example.com/api/job-alerts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function post(body: unknown): Promise<Response> {
  const { POST } = await import('@/app/api/job-alerts/route');
  return POST(postReq(body) as never);
}

describe('POST /api/job-alerts — newsletter consent is explicit opt-in only', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.emailLead.upsert).mockResolvedValue({} as never);
    vi.mocked(prisma.jobAlert.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.jobAlert.create).mockResolvedValue(CREATED_ALERT as never);
  });

  it('does NOT sync to the newsletter when newsletterOptIn is absent', async () => {
    const res = await post({ email: 'nurse@example.com', keyword: 'psych', location: 'Texas' });
    expect(res.status).toBe(200);
    expect(syncToBeehiiv).not.toHaveBeenCalled();
    const upsertArg = vi.mocked(prisma.emailLead.upsert).mock.calls[0][0] as {
      update: Record<string, unknown>;
      create: Record<string, unknown>;
    };
    expect(upsertArg.create.newsletterOptIn).toBe(false);
    expect(upsertArg.update).toEqual({});
  });

  it('does NOT sync to the newsletter when newsletterOptIn is false', async () => {
    const res = await post({ email: 'nurse@example.com', newsletterOptIn: false });
    expect(res.status).toBe(200);
    expect(syncToBeehiiv).not.toHaveBeenCalled();
  });

  it('syncs to the newsletter ONLY when newsletterOptIn is explicitly true', async () => {
    const res = await post({ email: 'nurse@example.com', newsletterOptIn: true });
    expect(res.status).toBe(200);
    expect(syncToBeehiiv).toHaveBeenCalledTimes(1);
    expect(vi.mocked(syncToBeehiiv).mock.calls[0][0]).toBe('nurse@example.com');
    const upsertArg = vi.mocked(prisma.emailLead.upsert).mock.calls[0][0] as {
      update: Record<string, unknown>;
      create: Record<string, unknown>;
    };
    expect(upsertArg.create.newsletterOptIn).toBe(true);
    expect(upsertArg.update).toEqual({ newsletterOptIn: true });
  });

  it('sends a personalized welcome email (criteria summary + filtered URL + frequency)', async () => {
    const res = await post({ email: 'nurse@example.com', keyword: 'psych', location: 'Texas' });
    expect(res.status).toBe(200);
    expect(sendWelcomeEmail).toHaveBeenCalledTimes(1);
    // No token argument. The route used to pass jobAlert.token here, which
    // neither /unsubscribe nor /api/one-click-unsubscribe can resolve;
    // sendWelcomeEmail now looks up the EmailLead token itself.
    expect(sendWelcomeEmail).toHaveBeenCalledWith('nurse@example.com', {
      criteriaSummary: '"psych" · in Texas',
      filteredJobsUrl: 'https://pmhnphiring.com/jobs?q=psych&location=Texas',
      frequency: 'daily',
      location: 'Texas',
    });
  });

  it('never hands the alert token to the mailer as if it were an unsubscribe token', () => {
    // The two are both cuids on the same row, so a mix-up type-checks and
    // only shows up as a dead opt-out link in a delivered email.
    for (const call of (sendWelcomeEmail as unknown as { mock: { calls: unknown[][] } }).mock.calls) {
      expect(call).not.toContain('tok-alert-1');
    }
  });
});
