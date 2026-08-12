/**
 * /api/cron/expiry-warnings — the expiry-date FINAL notice pass.
 *
 * This email goes out live and unflagged to real employers, so the properties
 * that matter are: it selects the right day (including postings whose expiry
 * instant already passed hours before the 22:00 run), it claims BEFORE it
 * sends so it can never send twice, it stays away from renewed postings, and
 * ?dryRun=1 touches nothing.
 *
 * All fixtures are fictional.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  order: [] as string[],
  sendFinal: vi.fn(),
  sendWarning: vi.fn(),
  isEmailSuppressed: vi.fn(),
  db: {
    job: { findMany: vi.fn(), findUnique: vi.fn() },
    employerJob: { update: vi.fn(), updateMany: vi.fn() },
    cronRun: { create: vi.fn(), update: vi.fn() },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: h.db }));
vi.mock('@/lib/email-service', () => ({
  sendExpiryWarningEmail: h.sendWarning,
  sendExpiryFinalNoticeEmail: h.sendFinal,
  isEmailSuppressed: h.isEmailSuppressed,
}));
vi.mock('@/lib/auth/verify-cron-or-admin', () => ({
  verifyCronOrAdmin: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/discord-notifier', () => ({
  sendCronFailureAlert: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/cron/track', () => ({
  withCronTracking: vi.fn(async (_n: string, body: () => Promise<{ response: unknown }>) => (await body()).response),
}));

/** The real production trigger: 0 22 * * * UTC. */
const RUN_AT = new Date('2026-08-12T22:00:00.000Z');

interface JobRowOverrides {
  id?: string;
  expiresAt?: Date;
  createdAt?: Date;
  lastRenewedAt?: Date | null;
  viewCount?: number;
  applyClickCount?: number;
  applications?: number;
  contactEmail?: string | null;
}

function jobRow(o: JobRowOverrides = {}) {
  return {
    id: o.id ?? 'job-fic-1',
    title: 'PMHNP Outpatient (Fictional Fixture)',
    // Default: died at 20:45 UTC, 75 minutes before the run.
    expiresAt: o.expiresAt ?? new Date('2026-08-12T20:45:00.000Z'),
    // Default: a first 60-day cycle, nowhere near the 365-day renewal cap.
    createdAt: o.createdAt ?? new Date('2026-06-13T20:45:00.000Z'),
    lastRenewedAt: o.lastRenewedAt ?? null,
    viewCount: o.viewCount ?? 412,
    applyClickCount: o.applyClickCount ?? 19,
    _count: { jobApplications: o.applications ?? 3 },
    employerJobs: {
      id: `ej-${o.id ?? 'job-fic-1'}`,
      contactEmail: o.contactEmail === undefined ? 'talent@examplepsych.example' : o.contactEmail,
    },
  };
}

/** What the post-claim verification read returns for a row. */
function freshRow(row: ReturnType<typeof jobRow>, over: Partial<{
  expiresAt: Date;
  createdAt: Date;
  lastRenewedAt: Date | null;
  archivedAt: Date | null;
  isManuallyUnpublished: boolean;
}> = {}) {
  return {
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    lastRenewedAt: row.lastRenewedAt,
    archivedAt: null,
    isManuallyUnpublished: false,
    ...over,
  };
}

/**
 * First findMany call is the 5-day warning pass, second is the final notice.
 * The post-claim verification read defaults to "nothing changed": the same row
 * the selection query returned.
 */
function primeQueries(finalRows: ReturnType<typeof jobRow>[], warningRows: unknown[] = []) {
  h.db.job.findMany
    .mockResolvedValueOnce(warningRows as never)
    .mockResolvedValueOnce(finalRows as never);
  h.db.job.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const row = finalRows.find((r) => r.id === where.id);
    return row ? freshRow(row) : null;
  });
}

function req(query = ''): NextRequest {
  return new NextRequest(`https://example.com/api/cron/expiry-warnings${query}`);
}

async function run(query = '') {
  const { GET } = await import('@/app/api/cron/expiry-warnings/route');
  const res = await GET(req(query));
  return res.json();
}

beforeEach(() => {
  vi.clearAllMocks();
  h.order.length = 0;
  vi.useFakeTimers();
  vi.setSystemTime(RUN_AT);

  h.isEmailSuppressed.mockResolvedValue(false);
  h.db.employerJob.updateMany.mockImplementation(async () => {
    h.order.push('claim');
    return { count: 1 };
  });
  h.sendFinal.mockImplementation(async () => {
    h.order.push('send');
    return { success: true };
  });
  h.sendWarning.mockResolvedValue({ success: true });
  h.db.job.findMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('final notice: which postings the run claims', () => {
  it('asks for the whole UTC day plus the lookahead, not just what is still live', async () => {
    primeQueries([]);
    await run();

    const where = h.db.job.findMany.mock.calls[1][0].where;
    expect(where.expiresAt.gte.toISOString()).toBe('2026-08-12T00:00:00.000Z');
    expect(where.expiresAt.lte.toISOString()).toBe('2026-08-13T04:00:00.000Z');
    // No isPublished filter: cleanup-expired (10 12,18 * * *) already
    // unpublishes anything past expiry, so requiring "published" would drop
    // every posting that died before 12:10 today.
    expect(where.isPublished).toBeUndefined();
    expect(where.sourceType).toBe('employer');
    expect(where.archivedAt).toBeNull();
    expect(where.isManuallyUnpublished).toBe(false);
  });

  it('dedupes on expiryFinalNoticeSentAt and skips never-paid or refunded postings', async () => {
    primeQueries([]);
    await run();

    const where = h.db.job.findMany.mock.calls[1][0].where;
    expect(where.employerJobs.expiryFinalNoticeSentAt).toBeNull();
    expect(where.employerJobs.paymentStatus.notIn).toEqual(['pending', 'refunded', 'disputed']);
  });

  it('sends the expired-variant email for an instant that passed before the run', async () => {
    primeQueries([jobRow()]);

    const json = await run();

    expect(h.sendFinal).toHaveBeenCalledTimes(1);
    const arg = h.sendFinal.mock.calls[0][0];
    expect(arg.expiresAt.toISOString()).toBe('2026-08-12T20:45:00.000Z');
    expect(arg.now.toISOString()).toBe(RUN_AT.toISOString());
    expect(json.finalNoticesSent).toBe(1);
  });

  it('passes the posting\'s live numbers through, including the application count', async () => {
    primeQueries([jobRow({ viewCount: 412, applyClickCount: 19, applications: 3 })]);
    await run();

    expect(h.sendFinal.mock.calls[0][0].stats).toEqual({
      viewCount: 412,
      applyClickCount: 19,
      applicationCount: 3,
    });
  });

  it('reads the application count in the selection query rather than guessing it', async () => {
    primeQueries([]);
    await run();
    expect(h.db.job.findMany.mock.calls[1][0].select._count).toEqual({
      select: { jobApplications: true },
    });
  });

  it('skips a row with no contact address instead of claiming it', async () => {
    primeQueries([jobRow({ contactEmail: null })]);
    await run();
    expect(h.db.employerJob.updateMany).not.toHaveBeenCalled();
    expect(h.sendFinal).not.toHaveBeenCalled();
  });

  it('skips a suppressed address WITHOUT stamping it', async () => {
    h.isEmailSuppressed.mockResolvedValue(true);
    primeQueries([jobRow()]);

    const json = await run();

    expect(h.db.employerJob.updateMany).not.toHaveBeenCalled();
    expect(h.sendFinal).not.toHaveBeenCalled();
    expect(json.skippedSuppressed).toBe(1);
  });
});

describe('final notice: exactly once', () => {
  it('stamps the claim BEFORE handing anything to the sender', async () => {
    primeQueries([jobRow()]);
    await run();

    expect(h.order).toEqual(['claim', 'send']);
    const claim = h.db.employerJob.updateMany.mock.calls[0][0];
    expect(claim.where.id).toBe('ej-job-fic-1');
    // Null guard: a concurrent run that already stamped this row wins.
    expect(claim.where.expiryFinalNoticeSentAt).toBeNull();
    expect(claim.data.expiryFinalNoticeSentAt).toEqual(RUN_AT);
  });

  it('claims on scalar columns of the claimed row ONLY, so it is one atomic UPDATE', async () => {
    primeQueries([jobRow()]);
    await run();

    // Exactly-once rests on Postgres re-checking this predicate against the
    // committed new row version after it releases the row lock. A relation
    // filter would make it a subquery and put that guarantee in doubt, so the
    // WHERE must stay limited to the primary key and the dedupe stamp.
    const claim = h.db.employerJob.updateMany.mock.calls[0][0];
    expect(Object.keys(claim.where).sort()).toEqual(['expiryFinalNoticeSentAt', 'id']);
    expect(claim.where.job).toBeUndefined();
  });

  it('re-reads the posting after winning the claim and before sending', async () => {
    primeQueries([jobRow()]);
    await run();

    expect(h.db.job.findUnique).toHaveBeenCalledWith({
      where: { id: 'job-fic-1' },
      select: {
        expiresAt: true,
        createdAt: true,
        lastRenewedAt: true,
        archivedAt: true,
        isManuallyUnpublished: true,
      },
    });
    // And the email quotes the freshly read instant, not the stale one.
    expect(h.sendFinal.mock.calls[0][0].expiresAt.toISOString()).toBe('2026-08-12T20:45:00.000Z');
  });

  it('releases the claim and sends nothing when a renewal lands between select and claim', async () => {
    const row = jobRow();
    primeQueries([row]);
    // Renewal committed after the selection query: expiresAt is 60 days out
    // and lastRenewedAt is stamped. The row we hold a claim on is no longer
    // the row we selected.
    h.db.job.findUnique.mockResolvedValue(freshRow(row, {
      expiresAt: new Date('2026-10-11T20:45:00.000Z'),
      lastRenewedAt: new Date('2026-08-12T21:59:00.000Z'),
    }));

    const json = await run();

    expect(h.sendFinal).not.toHaveBeenCalled();
    expect(json.skippedChangedUnderUs).toBe(1);
    const release = h.db.employerJob.updateMany.mock.calls[1][0];
    expect(release.where).toEqual({ id: 'ej-job-fic-1', expiryFinalNoticeSentAt: RUN_AT });
    expect(release.data).toEqual({ expiryFinalNoticeSentAt: null });
  });

  it('releases the claim and sends nothing when the employer paused the listing under us', async () => {
    const row = jobRow();
    primeQueries([row]);
    h.db.job.findUnique.mockResolvedValue(freshRow(row, { isManuallyUnpublished: true }));

    const json = await run();

    expect(h.sendFinal).not.toHaveBeenCalled();
    expect(json.skippedChangedUnderUs).toBe(1);
  });

  it('sends nothing when the claim is lost to a concurrent run', async () => {
    h.db.employerJob.updateMany.mockResolvedValue({ count: 0 });
    primeQueries([jobRow()]);

    const json = await run();

    expect(h.sendFinal).not.toHaveBeenCalled();
    expect(json.skippedClaimLost).toBe(1);
    expect(json.finalNoticesSent).toBe(0);
  });

  it('keeps the claim on an ambiguous send failure, so tomorrow cannot double up', async () => {
    h.sendFinal.mockResolvedValue({ success: false, error: 'socket hang up' });
    primeQueries([jobRow()]);

    const json = await run();

    // Exactly one updateMany: the claim. Nothing wrote the stamp back.
    expect(h.db.employerJob.updateMany).toHaveBeenCalledTimes(1);
    expect(json.finalNoticesSent).toBe(0);
    expect(json.errors.join(' ')).toContain('claim kept');
  });

  it('gives the claim back only on a definitive provider rejection', async () => {
    h.sendFinal.mockResolvedValue({ success: false, error: 'Domain is not verified', rejected: true });
    primeQueries([jobRow()]);

    const json = await run();

    expect(h.db.employerJob.updateMany).toHaveBeenCalledTimes(2);
    const revert = h.db.employerJob.updateMany.mock.calls[1][0];
    // Guarded on our own stamp so a concurrent writer is never clobbered.
    expect(revert.where).toEqual({ id: 'ej-job-fic-1', expiryFinalNoticeSentAt: RUN_AT });
    expect(revert.data).toEqual({ expiryFinalNoticeSentAt: null });
    expect(json.finalNoticesSent).toBe(0);
  });

  it('a claim write failure means no send at all', async () => {
    h.db.employerJob.updateMany.mockRejectedValue(new Error('db connection lost'));
    primeQueries([jobRow()]);

    const json = await run();

    expect(h.sendFinal).not.toHaveBeenCalled();
    expect(json.errors.join(' ')).toContain('db connection lost');
  });
});

describe('final notice: renewed postings are left alone', () => {
  it('does not email a posting whose renewal stamp is newer than its expiry', async () => {
    // Renewed at 21:00 today; the 365-day cap in renewalExpiresAt left the new
    // expiry inside today's window, so the query still returns it.
    primeQueries([jobRow({
      expiresAt: new Date('2026-08-12T09:00:00.000Z'),
      lastRenewedAt: new Date('2026-08-12T21:00:00.000Z'),
    })]);

    const json = await run();

    expect(h.db.employerJob.updateMany).not.toHaveBeenCalled();
    expect(h.sendFinal).not.toHaveBeenCalled();
    expect(json.skippedIneligible).toBe(1);
  });

  it('still emails a posting renewed in an earlier cycle that is genuinely expiring now', async () => {
    primeQueries([jobRow({
      createdAt: new Date('2026-02-13T10:00:00.000Z'),
      expiresAt: new Date('2026-08-12T20:45:00.000Z'),
      lastRenewedAt: new Date('2026-06-13T10:00:00.000Z'),
    })]);

    const json = await run();

    expect(h.sendFinal).toHaveBeenCalledTimes(1);
    expect(json.finalNoticesSent).toBe(1);
    expect(json.skippedIneligible).toBe(0);
  });

  it('does not pitch a renewal the 365-day cap cannot deliver', async () => {
    // Posted 2025-08-13, renewed its way to the ceiling. A renewal bought
    // today returns the same expiry it already has: the employer would pay the
    // renewal price for zero extra days, and "renewing adds 60 days" would be
    // a lie. Nothing is claimed and nothing is sent.
    primeQueries([jobRow({
      createdAt: new Date('2025-08-13T00:00:00.000Z'),
      expiresAt: new Date('2026-08-13T00:00:00.000Z'),
      lastRenewedAt: new Date('2026-06-14T00:00:00.000Z'),
    })]);

    const json = await run();

    expect(h.db.employerJob.updateMany).not.toHaveBeenCalled();
    expect(h.sendFinal).not.toHaveBeenCalled();
    expect(json.skippedIneligible).toBe(1);
  });

  it('does not pitch a posting that would get back only part of a cycle', async () => {
    // The cap lands two days out, so renewing buys 2 days, not 60. Same lie,
    // smaller: the guard is "delivers the promised cycle", not "delivers
    // something".
    primeQueries([jobRow({
      createdAt: new Date('2025-08-14T22:00:00.000Z'),
      expiresAt: new Date('2026-08-12T23:00:00.000Z'),
    })]);

    const json = await run();

    expect(h.sendFinal).not.toHaveBeenCalled();
    expect(json.skippedIneligible).toBe(1);
  });

  it('does not pitch a posting renewed hours ago that the cap left inside the window', async () => {
    // Renewed at 21:00 today. An uncapped renewal would have moved expiresAt
    // 60 days out and dropped it from the query; the cap kept it at 23:00
    // tonight, so the selection query still returns it. isRenewedPastExpiry
    // does NOT catch this one (21:00 is before the 23:00 expiry), which is
    // exactly why the cap guard exists.
    const row = jobRow({
      createdAt: new Date('2025-08-12T23:00:00.000Z'),
      expiresAt: new Date('2026-08-12T23:00:00.000Z'),
      lastRenewedAt: new Date('2026-08-12T21:00:00.000Z'),
    });
    expect(row.lastRenewedAt!.getTime()).toBeLessThan(row.expiresAt.getTime());
    primeQueries([row]);

    const json = await run();

    expect(h.sendFinal).not.toHaveBeenCalled();
    expect(json.skippedIneligible).toBe(1);
  });
});

describe('?dryRun=1', () => {
  it('names exactly who would get the final notice and sends nothing', async () => {
    primeQueries([
      jobRow(),
      jobRow({ id: 'job-fic-2', expiresAt: new Date('2026-08-12T23:30:00.000Z') }),
      jobRow({
        id: 'job-fic-3',
        expiresAt: new Date('2026-08-12T09:00:00.000Z'),
        lastRenewedAt: new Date('2026-08-12T21:00:00.000Z'),
      }),
    ]);

    const json = await run('?dryRun=1');

    expect(json.dryRun).toBe(true);
    expect(json.wouldSendFinalNotices).toEqual([
      expect.objectContaining({ jobId: 'job-fic-1', state: 'expired', to: 'talent@examplepsych.example', views: 412, applyClicks: 19, applications: 3 }),
      expect.objectContaining({ jobId: 'job-fic-2', state: 'today' }),
    ]);
    // The renewed posting is named nowhere.
    expect(json.skippedIneligible).toBe(1);
    expect(JSON.stringify(json)).not.toContain('job-fic-3');

    expect(h.sendFinal).not.toHaveBeenCalled();
    expect(h.db.employerJob.updateMany).not.toHaveBeenCalled();
    expect(h.db.employerJob.update).not.toHaveBeenCalled();
  });

  it('sends no 5-day warnings either, and writes no warning stamps', async () => {
    primeQueries([], [{
      id: 'job-fic-warn-1',
      title: 'PMHNP Inpatient (Fictional Fixture)',
      expiresAt: new Date('2026-08-17T12:00:00.000Z'),
      viewCount: 10,
      applyClickCount: 1,
      employerJobs: {
        id: 'ej-warn-1',
        contactEmail: 'hiring@examplepsych.example',
        dashboardToken: 'dash-fic-1',
        editToken: 'edit-fic-1',
      },
    }]);

    const json = await run('?dryRun=1');

    expect(h.sendWarning).not.toHaveBeenCalled();
    expect(h.db.employerJob.update).not.toHaveBeenCalled();
    expect(json.wouldSendWarnings).toEqual([
      expect.objectContaining({ jobId: 'job-fic-warn-1', to: 'hiring@examplepsych.example' }),
    ]);
  });
});

describe('the 5-day warning pass is untouched', () => {
  it('still sends and still stamps expiryWarningSentAt on a real run', async () => {
    primeQueries([], [{
      id: 'job-fic-warn-1',
      title: 'PMHNP Inpatient (Fictional Fixture)',
      expiresAt: new Date('2026-08-17T12:00:00.000Z'),
      viewCount: 10,
      applyClickCount: 1,
      employerJobs: {
        id: 'ej-warn-1',
        contactEmail: 'hiring@examplepsych.example',
        dashboardToken: 'dash-fic-1',
        editToken: 'edit-fic-1',
      },
    }]);

    const json = await run();

    expect(h.sendWarning).toHaveBeenCalledTimes(1);
    expect(h.db.employerJob.update).toHaveBeenCalledWith({
      where: { id: 'ej-warn-1' },
      data: { expiryWarningSentAt: expect.any(Date) },
    });
    expect(json.warningsSent).toBe(1);
    // Its own query still only looks at live postings five days out.
    expect(h.db.job.findMany.mock.calls[0][0].where.isPublished).toBe(true);
    expect(h.db.job.findMany.mock.calls[0][0].where.employerJobs).toEqual({ expiryWarningSentAt: null });
  });
});
