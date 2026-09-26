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

  it('has no cron entry, so nothing schedules it', () => {
    const vercel = fs.readFileSync(path.resolve(__dirname, '../../vercel.json'), 'utf8');
    expect(vercel).not.toContain('full-jd');
  });
});

describe('only employer postings with a real description qualify', () => {
  it('accepts an employer posting with a genuine body', () => {
    expect(isFullJdEligible({ sourceType: FULL_JD_SOURCE_TYPE, description: REAL_BODY })).toBe(true);
  });

  it('refuses an aggregator posting however good its description', () => {
    // The format is gated on provenance, not only on length: aggregator
    // descriptions are plain text with no structure guarantee.
    for (const source of ['adzuna', 'usajobs', 'ashby', 'greenhouse', null]) {
      expect(isFullJdEligible({ sourceType: source, description: REAL_BODY }), String(source)).toBe(false);
    }
  });

  it('refuses an employer posting that is only a stub', () => {
    expect(isFullJdEligible({
      sourceType: FULL_JD_SOURCE_TYPE,
      description: 'Psychiatric NP wanted. Competitive pay and benefits. Apply today.',
    })).toBe(false);
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
