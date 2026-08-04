/**
 * A2/A3 regression — daily alert eligibility window + renewal re-entry.
 *
 * A2: the daily cron fires every 24h at a fixed slot, but lastSentAt is
 * stamped minutes AFTER the slot starts. The old `lastSentAt < now - 24h`
 * predicate therefore raced the cron's own stamp: an alert stamped at 13:31
 * yesterday was not eligible at 13:30 today, silently skipping alerts on many
 * days. The window is now 20h (weekly: 164h) via shared helpers.
 *
 * A3: the freshness gate was `createdAt > cutoff` only, so an employer post
 * reached alert inboxes exactly once. Renewals (which stamp Job.lastRenewedAt
 * in the Stripe webhook) now re-enter the pool via buildJobFreshnessOr.
 */
import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// The service instantiates Resend at module scope, which throws without an
// API key. These tests exercise pure helpers only — stub the SDK.
vi.mock('resend', () => ({
  Resend: class {
    batch = { send: vi.fn() };
    emails = { send: vi.fn() };
  },
}));

import {
  isAlertDue,
  buildAlertEligibilityWhere,
  buildJobFreshnessOr,
  DAILY_ELIGIBILITY_HOURS,
  WEEKLY_ELIGIBILITY_HOURS,
} from '@/lib/job-alerts-service';

const NOW = new Date('2026-08-04T13:30:00Z');
const hoursAgo = (h: number): Date => new Date(NOW.getTime() - h * 60 * 60 * 1000);

describe('isAlertDue: A2 20h window', () => {
  it('never-sent alerts are always due', () => {
    expect(isAlertDue({ frequency: 'daily', lastSentAt: null }, NOW)).toBe(true);
    expect(isAlertDue({ frequency: 'weekly', lastSentAt: null }, NOW)).toBe(true);
  });

  it('daily alert stamped 23.9h ago is due (the cron-stamp race the 24h cutoff lost)', () => {
    // Yesterday's run started at the same slot but stamped lastSentAt minutes
    // after the slot. Under the old strict-24h cutoff this alert was skipped
    // today, and the drift compounded on every successful send.
    expect(isAlertDue({ frequency: 'daily', lastSentAt: hoursAgo(23.9) }, NOW)).toBe(true);
  });

  it('daily alert stamped 19h ago is NOT due (same-day double-send guard)', () => {
    expect(isAlertDue({ frequency: 'daily', lastSentAt: hoursAgo(19) }, NOW)).toBe(false);
  });

  it('daily boundary sits at 20h', () => {
    expect(isAlertDue({ frequency: 'daily', lastSentAt: hoursAgo(20.01) }, NOW)).toBe(true);
    expect(isAlertDue({ frequency: 'daily', lastSentAt: hoursAgo(19.99) }, NOW)).toBe(false);
  });

  it('weekly gets the same 4h slack (164h boundary)', () => {
    expect(isAlertDue({ frequency: 'weekly', lastSentAt: hoursAgo(165) }, NOW)).toBe(true);
    expect(isAlertDue({ frequency: 'weekly', lastSentAt: hoursAgo(163) }, NOW)).toBe(false);
  });

  it('unknown frequency values with a stamp are not due (parity with the DB OR arms)', () => {
    expect(isAlertDue({ frequency: 'monthly', lastSentAt: hoursAgo(9999) }, NOW)).toBe(false);
  });
});

describe('buildAlertEligibilityWhere mirrors isAlertDue', () => {
  it('requires double opt-in (isActive + confirmedAt)', () => {
    const where = buildAlertEligibilityWhere(NOW);
    expect(where.isActive).toBe(true);
    expect(where.confirmedAt).toEqual({ not: null });
  });

  it('uses the 20h / 164h cutoffs, not the old 24h / 7d', () => {
    expect(DAILY_ELIGIBILITY_HOURS).toBe(20);
    expect(WEEKLY_ELIGIBILITY_HOURS).toBe(164);
    const arms = buildAlertEligibilityWhere(NOW).OR as Array<Record<string, unknown>>;
    expect(arms[0]).toEqual({ lastSentAt: null });
    expect(arms[1]).toEqual({ frequency: 'daily', lastSentAt: { lt: hoursAgo(DAILY_ELIGIBILITY_HOURS) } });
    expect(arms[2]).toEqual({ frequency: 'weekly', lastSentAt: { lt: hoursAgo(WEEKLY_ELIGIBILITY_HOURS) } });
  });
});

describe('buildJobFreshnessOr: A3 renewal re-entry predicate', () => {
  it('admits jobs created OR renewed after the cutoff', () => {
    const cutoff = hoursAgo(24);
    expect(buildJobFreshnessOr(cutoff)).toEqual({
      OR: [
        { createdAt: { gt: cutoff } },
        { lastRenewedAt: { gt: cutoff } },
      ],
    });
  });
});

describe('sendJobAlerts wiring (source lock)', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../../lib/job-alerts-service.ts'),
    'utf8',
  );

  it('queries alerts through the shared eligibility builder', () => {
    // The builder is the FIRST arm of the alert findMany's AND (the optional
    // arms behind it are the fan-out's email/frequency scoping).
    expect(src).toMatch(/AND:\s*\[\s*\n?\s*buildAlertEligibilityWhere\(now\)/);
  });

  it('a scoped run with an explicit empty recipient list sends nothing', () => {
    expect(src).toMatch(/restrictToEmails && options\.restrictToEmails\.length === 0\) return results/);
  });

  it('the raw 24h/7d cutoff variables are gone', () => {
    expect(src).not.toMatch(/oneDayAgo|oneWeekAgo/);
  });

  it('the per-alert freshness gate goes through buildJobFreshnessOr', () => {
    expect(src).toMatch(/buildJobFreshnessOr\(cutoff\)/);
  });
});
