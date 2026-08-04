/**
 * Cadence hard rule — functional proof of the claim-first send order in
 * sendJobAlerts (lib/job-alerts-service.ts) and of the fan-out scoping
 * options. All fixtures are fictional.
 *
 * The rule: lastSentAt is stamped (claimed) BEFORE a batch is handed to
 * Resend, so a crash or retry between send and stamp can only mean a MISSED
 * email (recovered by the next digest cycle, whose cutoff is the honest
 * lastSentAt), never a duplicate. Failure handling after a claim:
 *   - definitive Resend rejection (error in the response: nothing was sent)
 *     reverts the claim so the alerts are re-selected next cycle;
 *   - ambiguous mid-flight throw keeps the claim (fail closed: fewer emails,
 *     never doubles).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  order: [] as string[],
  batchSend: vi.fn(),
  db: {
    jobAlert: { findMany: vi.fn(), updateMany: vi.fn() },
    job: { count: vi.fn(), findMany: vi.fn() },
    emailSend: { createMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('resend', () => ({
  Resend: class {
    batch = { send: h.batchSend };
    emails = { send: vi.fn() };
  },
}));
vi.mock('@/lib/prisma', () => ({ prisma: h.db }));
vi.mock('@/lib/email-service', () => ({
  isEmailSuppressed: vi.fn(async () => false),
  getOrCreateUnsubToken: vi.fn(async () => 'unsub-token-fictional'),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { sendJobAlerts } from '@/lib/job-alerts-service';

const PREV_SENT_AT = new Date('2026-08-03T13:35:00Z'); // ~24h ago, due under 20h window

const fictionalAlert = {
  id: 'alert-fic-1',
  email: 'casey.example@example.com',
  token: 'alert-token-fic-1',
  frequency: 'daily',
  lastSentAt: PREV_SENT_AT,
  createdAt: new Date('2026-07-01T00:00:00Z'),
  confirmedAt: new Date('2026-07-01T00:05:00Z'),
  isActive: true,
  keyword: null,
  location: null,
  mode: null,
  jobType: null,
  minSalary: null,
  maxSalary: null,
  newGradFriendly: null,
  minYearsExperience: null,
};

const fictionalJob = {
  id: 'job-fic-1',
  title: 'PMHNP: Outpatient (Fictional Fixture)',
  employer: 'Example Behavioral Health',
  location: 'Springfield, XX',
  city: 'Springfield',
  state: 'XX',
  stateCode: 'XX',
  mode: 'On-site',
  jobType: 'Full-time',
  isRemote: false,
  isHybrid: false,
  minSalary: null,
  maxSalary: null,
  normalizedMinSalary: null,
  normalizedMaxSalary: null,
  newGradFriendly: false,
  minYearsExperience: null,
  isFeatured: true,
  applyOnPlatform: true,
  applyLink: null,
  sourceType: 'employer',
  isPublished: true,
  expiresAt: null,
  createdAt: new Date('2026-08-04T09:00:00Z'),
  lastRenewedAt: null,
  qualityScore: 80,
  healthConsecutiveMissing: 0,
};

function primeHappyPath(): void {
  h.db.jobAlert.findMany.mockResolvedValue([fictionalAlert]);
  h.db.jobAlert.updateMany.mockImplementation(async () => {
    h.order.push('stamp');
    return { count: 1 };
  });
  h.db.job.count.mockResolvedValue(1);
  h.db.job.findMany.mockResolvedValue([fictionalJob]);
  h.db.emailSend.createMany.mockResolvedValue({ count: 1 });
  h.db.$transaction.mockImplementation(async (ops: unknown[]) => ops);
  h.batchSend.mockImplementation(async () => {
    h.order.push('send');
    return { data: { data: [{ id: 'resend-msg-fic-1' }] }, error: null };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.order.length = 0;
  primeHappyPath();
});

describe('claim-first send order', () => {
  it('stamps lastSentAt BEFORE handing the batch to Resend', async () => {
    const results = await sendJobAlerts();

    expect(h.order).toEqual(['stamp', 'send']);
    expect(results.sent).toBe(1);
    expect(results.errors).toEqual([]);
    // Successful send: the claim stays, nothing is reverted.
    expect(h.db.$transaction).not.toHaveBeenCalled();
    // The claim carries the batch's alert ids and a fresh stamp.
    const claim = h.db.jobAlert.updateMany.mock.calls[0][0];
    expect(claim.where.id.in).toEqual(['alert-fic-1']);
    expect(claim.data.lastSentAt).toBeInstanceOf(Date);
  });

  it('logs the EmailSend row with the real resendId on success', async () => {
    await sendJobAlerts();
    const rows = h.db.emailSend.createMany.mock.calls[0][0].data;
    expect(rows).toEqual([
      expect.objectContaining({
        to: 'casey.example@example.com',
        emailType: 'job_alert',
        resendId: 'resend-msg-fic-1',
        status: 'sent',
      }),
    ]);
  });

  it('a claim failure skips the batch entirely: no email may go out ahead of its stamp', async () => {
    h.db.jobAlert.updateMany.mockRejectedValue(new Error('db connection lost'));

    const results = await sendJobAlerts();

    expect(h.batchSend).not.toHaveBeenCalled();
    expect(results.sent).toBe(0);
    expect(results.errors.join(' ')).toContain('claim failed');
  });
});

describe('failure handling after a claim', () => {
  it('definitive Resend rejection reverts the claim to the previous lastSentAt', async () => {
    h.batchSend.mockResolvedValue({ data: null, error: { message: 'Invalid API key' } });

    const results = await sendJobAlerts();

    expect(results.sent).toBe(0);
    expect(results.errors.join(' ')).toContain('Invalid API key');
    // Revert executed inside a transaction, restoring the previous stamp and
    // guarding on the claim value so a concurrent writer is never clobbered.
    expect(h.db.$transaction).toHaveBeenCalledTimes(1);
    const revert = h.db.jobAlert.updateMany.mock.calls.at(-1)![0];
    expect(revert.where.id.in).toEqual(['alert-fic-1']);
    expect(revert.where.lastSentAt).toBeInstanceOf(Date);
    expect(revert.data.lastSentAt).toEqual(PREV_SENT_AT);
    // Failed rows are recorded honestly.
    const rows = h.db.emailSend.createMany.mock.calls[0][0].data;
    expect(rows[0].status).toBe('failed');
    expect(rows[0].resendId).toBeNull();
  });

  it('ambiguous mid-flight throw keeps the claim (fail closed: never doubles)', async () => {
    h.batchSend.mockRejectedValue(new Error('socket hang up'));

    const results = await sendJobAlerts();

    expect(results.sent).toBe(0);
    expect(results.errors.join(' ')).toContain('socket hang up');
    // No revert: the request may have reached Resend, so these alerts skip
    // one cycle instead of risking a duplicate tomorrow.
    expect(h.db.$transaction).not.toHaveBeenCalled();
    // Exactly one updateMany: the claim. Nothing wrote the old stamp back.
    expect(h.db.jobAlert.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe('fan-out scoping options', () => {
  it('an explicit empty recipient list sends nothing and touches nothing', async () => {
    const results = await sendJobAlerts({ restrictToEmails: [] });

    expect(results).toEqual({ sent: 0, skipped: 0, suppressed: 0, errors: [] });
    expect(h.db.jobAlert.findMany).not.toHaveBeenCalled();
    expect(h.batchSend).not.toHaveBeenCalled();
  });

  it('scopes the alert query by case-insensitive email and frequency', async () => {
    h.db.jobAlert.findMany.mockResolvedValue([]);

    await sendJobAlerts({ restrictToEmails: ['Casey.Example@Example.com'], frequency: 'daily' });

    const where = h.db.jobAlert.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual([
      expect.objectContaining({ isActive: true }),
      { frequency: 'daily' },
      { email: { in: ['Casey.Example@Example.com'], mode: 'insensitive' } },
    ]);
  });
});
