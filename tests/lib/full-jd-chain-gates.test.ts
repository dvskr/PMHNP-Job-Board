/**
 * The full-description chain ships inert, and its gates are the safety
 * contract.
 *
 * This is a SECOND sender pointed at the same audience as the daily brief,
 * which is the shape that produces a spam incident when it is wrong. The
 * three things that must hold before it is switched on:
 *
 *  1. It does nothing at all unless an operator sets FULL_JD_ALERTS_ENABLED.
 *  2. It only fires on employer-authored postings with a real description.
 *     Aggregator rows clear a 50 character floor and nothing above it.
 *  3. It coordinates with the brief through AlertJobSend rather than through
 *     a second cutoff, because separate cutoffs mean everyone receives a full
 *     description for jobs the brief already sent them.
 *
 * All fixtures are fictional.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
// Comment-blanked, because these docblocks necessarily name the very things
// the assertions below ban from the code.
import { readCode } from '../helpers/source';

// Both services construct a Resend client at module scope, which throws
// without a key. Nothing here sends, so a shell is enough.
vi.mock('resend', () => ({ Resend: class { emails = {}; batch = {}; } }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  isFullJdEnabled,
  isFullJdEligible,
  sendFullJdAlerts,
  FULL_JD_SOURCE_TYPE,
  FULL_JD_COOLDOWN_HOURS,
} from '@/lib/full-jd-alert-service';

const REAL_BODY = `<h2>About the role</h2><p>${'A genuine sentence about the work. '.repeat(24)}</p>`;

const previous = process.env.FULL_JD_ALERTS_ENABLED;
beforeEach(() => { delete process.env.FULL_JD_ALERTS_ENABLED; });
afterEach(() => {
  if (previous === undefined) delete process.env.FULL_JD_ALERTS_ENABLED;
  else process.env.FULL_JD_ALERTS_ENABLED = previous;
});

describe('the chain is off until someone turns it on', () => {
  it('reports disabled and touches nothing', async () => {
    // prisma is mocked to {}, so any query at all would throw. Returning
    // cleanly is the proof that it short-circuits before reaching one.
    await expect(sendFullJdAlerts()).resolves.toMatchObject({ skipped: 'disabled', sent: 0 });
  });

  it('stays off for any value other than the exact string', async () => {
    for (const v of ['1', 'yes', 'TRUE', 'on', '']) {
      process.env.FULL_JD_ALERTS_ENABLED = v;
      expect(isFullJdEnabled(), v).toBe(false);
    }
  });

  it('turns on only for "true"', () => {
    process.env.FULL_JD_ALERTS_ENABLED = 'true';
    expect(isFullJdEnabled()).toBe(true);
  });

  it('is scheduled, but the schedule is inert while the flag is unset', () => {
    const vercel = fs.readFileSync(path.resolve(__dirname, '../../vercel.json'), 'utf8');
    expect(vercel).toContain('/api/cron/full-jd-alerts');
  });
});

/**
 * The two alert senders split the week.
 *
 * They target overlapping audiences: the brief goes to every confirmed
 * alert, this goes to every mailable lead, and the 937 alert holders are in
 * both. Running both daily would mean two alert emails a day to those
 * people from the same sender, which is the fastest way to teach a list to
 * mark you as spam. So the days are disjoint by construction, and this test
 * is what keeps them that way when someone edits one schedule without
 * looking at the other.
 */
describe('the brief and the full description never land on the same day', () => {
  const crons: { path: string; schedule: string }[] =
    JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../vercel.json'), 'utf8')).crons;

  const scheduleFor = (p: string) => {
    const row = crons.find((c) => c.path === p);
    expect(row, `${p} is not scheduled`).toBeDefined();
    return row!.schedule;
  };

  /** The weekday field of a 5-part cron, expanded to a set. 0 and 7 are Sunday. */
  const days = (schedule: string): Set<number> => {
    const field = schedule.trim().split(/\s+/)[4];
    if (field === '*') return new Set([0, 1, 2, 3, 4, 5, 6]);
    const out = new Set<number>();
    for (const part of field.split(',')) {
      if (part.includes('-')) {
        const [a, b] = part.split('-').map(Number);
        for (let d = a; d <= b; d += 1) out.add(d % 7);
      } else {
        out.add(Number(part) % 7);
      }
    }
    return out;
  };

  const brief = days(scheduleFor('/api/cron/send-alerts'));
  const full = days(scheduleFor('/api/cron/full-jd-alerts'));

  it('share no day of the week', () => {
    const both = [...brief].filter((d) => full.has(d));
    expect(both, `both senders run on weekday(s) ${both.join(',')}`).toEqual([]);
  });

  it('between them cover every day, so the list hears something daily', () => {
    expect(new Set([...brief, ...full]).size).toBe(7);
  });

  it('the full description runs three days a week', () => {
    expect(full.size).toBe(3);
  });
});

/**
 * The gate is description quality, not provenance.
 *
 * This chain was first written employer-only. Production then said there
 * were 9 employer postings with a description long enough to fill the email
 * against 597 across all sources, so employer-only would have run dry in
 * about nine sends. Aggregator bodies are plain text and go through
 * lib/jd-blocks.ts, the same reflow the web job page uses.
 */
describe('any posting with a real description qualifies', () => {
  it('accepts an employer posting with a genuine body', () => {
    expect(isFullJdEligible({ sourceType: FULL_JD_SOURCE_TYPE, description: REAL_BODY })).toBe(true);
  });

  it('accepts an aggregator posting with a genuine body', () => {
    for (const source of ['adzuna', 'usajobs', 'ashby', 'greenhouse', null]) {
      expect(isFullJdEligible({ sourceType: source, description: REAL_BODY }), String(source)).toBe(true);
    }
  });

  it('still refuses a stub, whoever posted it', () => {
    for (const source of ['employer', 'adzuna']) {
      expect(isFullJdEligible({
        sourceType: source,
        description: 'Psychiatric NP wanted. Competitive pay and benefits. Apply today.',
      }), source).toBe(false);
    }
  });

  it('refuses an empty description rather than sending a shell', () => {
    expect(isFullJdEligible({ sourceType: FULL_JD_SOURCE_TYPE, description: '' })).toBe(false);
  });
});

describe('it coordinates with the brief instead of keeping its own cutoff', () => {
  const src = readCode('lib/full-jd-alert-service.ts');

  it('never writes lastSentAt, which would starve the brief', () => {
    // A shared cutoff means whichever cron runs first advances it past
    // everything accumulated and the other sends nothing.
    expect(src).not.toMatch(/lastSentAt/);
  });

  it('claims through the ledger before sending', () => {
    expect(src).toMatch(/claimJobsForRecipient/);
    expect(src).toMatch(/alertJobSend/);
  });

  it('caps itself at one email per recipient per day', () => {
    expect(FULL_JD_COOLDOWN_HOURS).toBe(24);
    expect(src).toMatch(/FULL_JD_COOLDOWN_HOURS/);
  });

  it('releases the claim when the provider definitively refused', () => {
    // Otherwise a rejected send burns the job for that recipient forever.
    expect(src).toMatch(/releaseClaim/);
  });
});

describe('the brief records what it sent, so enabling this cannot duplicate', () => {
  const src = readCode('lib/job-alerts-service.ts');

  it('writes the ledger after a successful batch', () => {
    expect(src).toMatch(/recordAlertJobSends\(batch, 'digest'\)/);
  });

  it('records the jobs the email actually showed', () => {
    expect(src).toMatch(/jobIds: displayJobs\.map/);
  });

  it('a ledger failure never fails a send that already went out', () => {
    const fn = src.slice(src.indexOf('async function recordAlertJobSends'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).toMatch(/try \{[\s\S]*catch/);
  });
});
