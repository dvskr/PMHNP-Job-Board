/**
 * /api/cron/employer-report — the monthly performance report.
 *
 * It looped over every employer with a live posting and mailed them, with no
 * opt-out check of any kind: the email carries an unsubscribe link and a
 * List-Unsubscribe header, and the next month's run ignored both. It also
 * counted every call as a report sent, including refusals.
 *
 * All fixtures are fictional.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  sendReport: vi.fn(),
  isMarketingOptedOut: vi.fn(),
  db: {
    employerJob: { findMany: vi.fn() },
    jobApplication: { count: vi.fn() },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: h.db }));
vi.mock('@/lib/email-service', () => ({
  sendPerformanceReportEmail: h.sendReport,
  isMarketingOptedOut: h.isMarketingOptedOut,
}));
vi.mock('@/lib/auth/verify-cron-or-admin', () => ({
  verifyCronOrAdmin: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/discord-notifier', () => ({
  sendCronFailureAlert: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/cron/track', () => ({
  withCronTracking: vi.fn(async (_n: string, body: () => Promise<{ response: unknown }>) => (await body()).response),
}));

const EMPLOYER_ROW = {
  contactEmail: 'talent@examplepsych.example',
  employerName: 'Example Behavioral Health',
  dashboardToken: 'dash-fic-1',
  editToken: 'edit-fic-1',
  jobId: 'job-fic-1',
  job: { title: 'PMHNP Outpatient (Fictional Fixture)', viewCount: 120, applyClickCount: 8 },
};

async function run() {
  const { GET } = await import('@/app/api/cron/employer-report/route');
  const res = await GET(new Request('https://pmhnphiring.com/api/cron/employer-report') as never);
  return res.json();
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.OUTBOUND_MESSAGING_PAUSED;
  h.db.employerJob.findMany.mockResolvedValue([EMPLOYER_ROW]);
  h.db.jobApplication.count.mockResolvedValue(2);
  h.sendReport.mockResolvedValue({ success: true });
  h.isMarketingOptedOut.mockResolvedValue(false);
});

afterEach(() => {
  delete process.env.OUTBOUND_MESSAGING_PAUSED;
});

describe('employer report cron — opt-out', () => {
  it('does not mail an employer who unsubscribed', async () => {
    h.isMarketingOptedOut.mockResolvedValue(true);

    const body = await run();

    expect(h.sendReport).not.toHaveBeenCalled();
    expect(body.reportsSent).toBe(0);
    expect(body.optedOut).toBe(1);
  });

  it('mails an employer who is still subscribed', async () => {
    const body = await run();

    expect(h.sendReport).toHaveBeenCalledTimes(1);
    expect(body.reportsSent).toBe(1);
    expect(body.optedOut).toBe(0);
  });

  it('does not count a refused send as a report sent', async () => {
    h.sendReport.mockResolvedValue({ success: false, error: 'Provider rejected the message' });

    const body = await run();

    expect(body.reportsSent).toBe(0);
    expect(body.errors).toHaveLength(1);
  });
});

describe('employer report cron — emergency brake', () => {
  it('sends nothing and does no eligibility work while paused', async () => {
    process.env.OUTBOUND_MESSAGING_PAUSED = '1';

    const body = await run();

    expect(body.enabled).toBe(false);
    expect(h.db.employerJob.findMany).not.toHaveBeenCalled();
    expect(h.sendReport).not.toHaveBeenCalled();
  });
});
