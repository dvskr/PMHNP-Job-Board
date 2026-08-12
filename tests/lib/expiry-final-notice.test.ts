/**
 * Expiry-date FINAL notice: window selection, state resolution, the renewal
 * signal, and copy honesty.
 *
 * The thing under test is a timing mismatch. The cron fires at a fixed 22:00
 * UTC; postings expire at whatever clock time they were created at. So on the
 * expiry date the expiry instant is sometimes still ahead of the run and
 * sometimes already behind it, and the email has to be true either way.
 *
 * All fixtures are fictional.
 */
import { describe, it, expect } from 'vitest';
import {
  FINAL_NOTICE_LOOKAHEAD_HOURS,
  buildFinalNoticeCopy,
  buildFinalNoticeWindow,
  isRenewedPastExpiry,
  renewalIsCapped,
  resolveFinalNoticeState,
} from '@/lib/expiry-final-notice';

/** The real production trigger: 0 22 * * * UTC. */
const RUN_AT = new Date('2026-08-12T22:00:00.000Z');

/** Every dash character that must never reach employer-facing copy. */
const DASHES = /[‐‑‒–—―−]/;

function inWindow(expiresAt: string, now: Date = RUN_AT): boolean {
  const { start, end } = buildFinalNoticeWindow(now);
  const t = new Date(expiresAt).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

describe('buildFinalNoticeWindow', () => {
  it('starts at midnight UTC of the run\'s own calendar date', () => {
    expect(buildFinalNoticeWindow(RUN_AT).start.toISOString()).toBe('2026-08-12T00:00:00.000Z');
  });

  it('reaches FINAL_NOTICE_LOOKAHEAD_HOURS past the run when that is further than the day end', () => {
    const { end } = buildFinalNoticeWindow(RUN_AT);
    expect(end.toISOString()).toBe('2026-08-13T04:00:00.000Z');
    expect(FINAL_NOTICE_LOOKAHEAD_HOURS).toBe(6);
  });

  it('falls back to the end of the UTC day for an off-schedule manual trigger', () => {
    // Admin-triggered at 09:00 UTC: now + 6h is only 15:00, so the rest of
    // today is the wider half and the window must not shrink to it.
    const { start, end } = buildFinalNoticeWindow(new Date('2026-08-12T09:00:00.000Z'));
    expect(start.toISOString()).toBe('2026-08-12T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-12T23:59:59.999Z');
  });

  it('THE CASE THAT MOTIVATES THIS: an instant that already passed today is still selected', () => {
    // 20:45 UTC died 75 minutes before the 22:00 run, and cleanup-expired does
    // not sweep it until 12:10 tomorrow. It must still get its notice today.
    expect(inWindow('2026-08-12T20:45:00.000Z')).toBe(true);
  });

  it('selects an instant from earlier in the day, already swept by cleanup-expired', () => {
    // Expired 06:00, unpublished at the 12:10 cleanup run. Still the expiry
    // date, so it still gets exactly one final notice.
    expect(inWindow('2026-08-12T06:00:00.000Z')).toBe(true);
    expect(inWindow('2026-08-12T00:00:00.000Z')).toBe(true);
  });

  it('selects an instant still ahead of the run on the same UTC day', () => {
    expect(inWindow('2026-08-12T23:30:00.000Z')).toBe(true);
  });

  it('selects an instant just past midnight UTC (still tonight for the employer)', () => {
    expect(inWindow('2026-08-13T00:30:00.000Z')).toBe(true);
    expect(inWindow('2026-08-13T04:00:00.000Z')).toBe(true);
  });

  it('does not reach yesterday, or beyond the lookahead into tomorrow', () => {
    expect(inWindow('2026-08-11T23:59:59.000Z')).toBe(false);
    expect(inWindow('2026-08-13T04:00:00.001Z')).toBe(false);
    expect(inWindow('2026-08-13T12:00:00.000Z')).toBe(false);
  });
});

describe('resolveFinalNoticeState', () => {
  it('reads a passed instant as expired', () => {
    expect(resolveFinalNoticeState(new Date('2026-08-12T20:45:00.000Z'), RUN_AT)).toEqual({
      state: 'expired',
      hoursUntilExpiry: 0,
    });
  });

  it('treats the exact expiry instant as expired, not as still live', () => {
    expect(resolveFinalNoticeState(RUN_AT, RUN_AT).state).toBe('expired');
  });

  it('reads a later instant on the same UTC day as today', () => {
    expect(resolveFinalNoticeState(new Date('2026-08-12T23:30:00.000Z'), RUN_AT).state).toBe('today');
  });

  it('reads a lookahead instant on the next UTC day as soon', () => {
    const resolved = resolveFinalNoticeState(new Date('2026-08-13T02:00:00.000Z'), RUN_AT);
    expect(resolved.state).toBe('soon');
    expect(resolved.hoursUntilExpiry).toBe(4);
  });

  it('never reports zero hours for something that has not expired yet', () => {
    // 20 minutes out floors to zero. Held at 1 so no copy can ever say
    // "expires in about 0 hours".
    const resolved = resolveFinalNoticeState(new Date('2026-08-12T22:20:00.000Z'), RUN_AT);
    expect(resolved.hoursUntilExpiry).toBe(1);
  });

  it('never quotes more hours than the employer actually has left', () => {
    // 5h50m must not read as "about 6 hours" in an email whose whole point is
    // "act before this is gone". Floor, so the number is always reachable.
    const resolved = resolveFinalNoticeState(new Date('2026-08-13T03:50:00.000Z'), RUN_AT);
    expect(resolved.hoursUntilExpiry).toBe(5);
  });
});

describe('isRenewedPastExpiry', () => {
  it('flags a posting whose renewal stamp is newer than its expiry', () => {
    // The 365-day cap in renewalExpiresAt can hand a year-old posting a renewed
    // expiry that is still inside today's window. They paid: no death notice.
    expect(isRenewedPastExpiry({
      lastRenewedAt: new Date('2026-08-12T21:00:00.000Z'),
      expiresAt: new Date('2026-08-12T09:00:00.000Z'),
    })).toBe(true);
  });

  it('does not flag a posting renewed in a previous cycle that is now genuinely expiring', () => {
    expect(isRenewedPastExpiry({
      lastRenewedAt: new Date('2026-06-13T10:00:00.000Z'),
      expiresAt: new Date('2026-08-12T10:00:00.000Z'),
    })).toBe(false);
  });

  it('does not flag a posting that was never renewed', () => {
    expect(isRenewedPastExpiry({ lastRenewedAt: null, expiresAt: new Date() })).toBe(false);
    expect(isRenewedPastExpiry({ lastRenewedAt: new Date(), expiresAt: null })).toBe(false);
  });
});

describe('renewalIsCapped', () => {
  const DURATION = 60;

  it('does not flag a normal posting, where a renewal delivers the full cycle', () => {
    expect(renewalIsCapped({
      createdAt: new Date('2026-06-13T20:45:00.000Z'),
      expiresAt: new Date('2026-08-12T20:45:00.000Z'),
      durationDays: DURATION,
      now: RUN_AT,
    })).toBe(false);
  });

  it('flags a posting sitting exactly on the 365-day ceiling, where renewing buys nothing', () => {
    expect(renewalIsCapped({
      createdAt: new Date('2025-08-13T00:00:00.000Z'),
      expiresAt: new Date('2026-08-13T00:00:00.000Z'),
      durationDays: DURATION,
      now: RUN_AT,
    })).toBe(true);
  });

  it('flags a posting that would get back only part of a cycle', () => {
    // Ceiling two days out: renewing buys 2 days while the copy promises 60.
    expect(renewalIsCapped({
      createdAt: new Date('2025-08-14T22:00:00.000Z'),
      expiresAt: new Date('2026-08-12T23:00:00.000Z'),
      durationDays: DURATION,
      now: RUN_AT,
    })).toBe(true);
  });

  it('measures from the renewal date, not the expiry, once the expiry has lapsed', () => {
    // Expired at 20:45, so renewalExpiresAt extends from now. The email says
    // "adds 60 days from the day you renew", and the ceiling is far away, so
    // that promise holds.
    expect(renewalIsCapped({
      createdAt: new Date('2026-06-13T20:45:00.000Z'),
      expiresAt: new Date('2026-08-12T20:45:00.000Z'),
      durationDays: DURATION,
      now: RUN_AT,
    })).toBe(false);
    // Same lapsed expiry, but the posting is a year old: the ceiling is behind
    // us and a renewal cannot deliver 60 days from today either.
    expect(renewalIsCapped({
      createdAt: new Date('2025-08-12T20:45:00.000Z'),
      expiresAt: new Date('2026-08-12T20:45:00.000Z'),
      durationDays: DURATION,
      now: RUN_AT,
    })).toBe(true);
  });

  it('catches the just-renewed posting that isRenewedPastExpiry misses', () => {
    // Renewed at 21:00 tonight; the ceiling held the new expiry at 23:00
    // tonight, so it is still inside the selection window and its renewal
    // stamp is BEFORE its expiry. The cap guard is the only thing standing
    // between that employer and a second renewal pitch on the same day.
    const job = {
      createdAt: new Date('2025-08-12T23:00:00.000Z'),
      expiresAt: new Date('2026-08-12T23:00:00.000Z'),
      lastRenewedAt: new Date('2026-08-12T21:00:00.000Z'),
    };
    expect(isRenewedPastExpiry(job)).toBe(false);
    expect(renewalIsCapped({ ...job, durationDays: DURATION, now: RUN_AT })).toBe(true);
  });
});

describe('copy honesty', () => {
  const base = {
    jobTitleHtml: 'PMHNP Outpatient (Fictional Fixture)',
    now: RUN_AT,
    renewalPrice: 179,
    durationDays: 60,
  };

  const cases = [
    { name: 'expired', expiresAt: new Date('2026-08-12T20:45:00.000Z') },
    { name: 'today', expiresAt: new Date('2026-08-12T23:30:00.000Z') },
    { name: 'soon', expiresAt: new Date('2026-08-13T02:00:00.000Z') },
  ];

  for (const c of cases) {
    describe(`state: ${c.name}`, () => {
      const copy = buildFinalNoticeCopy({ ...base, expiresAt: c.expiresAt });
      const allText = [copy.subject, copy.heading, copy.body, copy.statsLabel, copy.renewLine, copy.ctaLabel, copy.preheader].join(' ');

      it('resolves to the expected state', () => {
        expect(copy.state).toBe(c.name);
      });

      it('never says "0 days" or counts down in days at all', () => {
        expect(allText).not.toMatch(/\b0 days?\b/);
        expect(allText).not.toMatch(/expires in \d+ days?/i);
      });

      it('carries no dash characters', () => {
        expect(allText).not.toMatch(DASHES);
      });

      it('fills every slot', () => {
        for (const value of Object.values(copy)) {
          expect(String(value).trim().length).toBeGreaterThan(0);
        }
      });
    });
  }

  it('expired copy says it HAS expired and that renewing brings it back', () => {
    const copy = buildFinalNoticeCopy({ ...base, expiresAt: new Date('2026-08-12T20:45:00.000Z') });
    expect(copy.subject).toContain('has expired');
    expect(copy.heading).toBe('Your Listing Has Expired');
    expect(copy.body).toContain('has expired');
    expect(copy.body).toMatch(/candidates can no longer find it/);
    expect(copy.body).toMatch(/back in front of them/);
    // It must not claim the listing is still up or still expiring.
    expect(copy.body).not.toMatch(/expires today/i);
    expect(copy.subject).not.toMatch(/expires today/i);
    // Renewing an already-lapsed post extends from the renewal day, not from
    // an expiry that is already gone (see renewalExpiresAt).
    expect(copy.renewLine).toContain('from the day you renew');
    expect(copy.statsLabel).toContain('while it was live');
  });

  it('today copy says it expires today, with the date, and never past tense', () => {
    const copy = buildFinalNoticeCopy({ ...base, expiresAt: new Date('2026-08-12T23:30:00.000Z') });
    expect(copy.subject).toContain('expires today');
    expect(copy.heading).toBe('Your Listing Expires Today');
    expect(copy.body).toContain('expires today, Wednesday, August 12, 2026');
    expect(copy.body).not.toMatch(/has expired/);
    expect(copy.renewLine).toContain('to your current expiration');
  });

  it('soon copy quotes hours, which is true in every timezone, and no calendar word', () => {
    const copy = buildFinalNoticeCopy({ ...base, expiresAt: new Date('2026-08-13T02:00:00.000Z') });
    expect(copy.subject).toBe('Your job posting expires in about 4 hours: renew to keep it live');
    expect(copy.heading).toBe('Your Listing Expires in About 4 Hours');
    expect(copy.body).not.toMatch(/today|tomorrow/i);
    expect(copy.body).not.toMatch(/has expired/);
  });

  it('says "hour" not "hours" at one hour out', () => {
    // Late manual re-run: 23:40 UTC, posting dies 00:20 the next UTC day.
    const copy = buildFinalNoticeCopy({
      ...base,
      now: new Date('2026-08-12T23:40:00.000Z'),
      expiresAt: new Date('2026-08-13T00:20:00.000Z'),
    });
    expect(copy.state).toBe('soon');
    expect(copy.subject).toContain('about 1 hour:');
    expect(copy.heading).toBe('Your Listing Expires in About 1 Hour');
  });

  it('quotes the real renewal price and duration it is handed, inventing nothing', () => {
    const copy = buildFinalNoticeCopy({
      ...base,
      expiresAt: new Date('2026-08-12T23:30:00.000Z'),
      renewalPrice: 179,
      durationDays: 60,
    });
    expect(copy.preheader).toContain('$179');
    expect(copy.renewLine).toContain('60 days');
  });
});
