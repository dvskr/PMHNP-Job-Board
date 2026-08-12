/**
 * Pure logic for the expiry-date FINAL NOTICE (the second and last email in
 * the expiry sequence, after the 5-day warning).
 *
 * ── THE TIMING PROBLEM THIS SOLVES ──────────────────────────────────────────
 * The cron runs once a day at 22:00 UTC. A posting's `expiresAt` is
 * `createdAt + durationDays`, so it can land on ANY clock time: 20:45 UTC,
 * 00:30 UTC, 13:10 UTC. That means on the expiry date itself, by the time the
 * 22:00 run happens, the expiry instant may already be in the past.
 *
 * So the selection window is a CALENDAR window, not an "is it still live"
 * window: every posting whose `expiresAt` falls inside the run's own UTC
 * calendar date, whether that instant has passed or not, plus a short
 * lookahead for postings that die in the next few hours (see
 * FINAL_NOTICE_LOOKAHEAD_HOURS).
 *
 * Because the instant may be behind or ahead, the copy has to branch. The
 * three honest states are:
 *
 *   'expired' — the instant already passed. Say it HAS expired, and that
 *               renewing brings it back. Never imply it is still up.
 *   'today'   — still ahead of us, same UTC calendar day. Say it expires
 *               TODAY.
 *   'soon'    — just past midnight UTC but inside the lookahead. In the
 *               employer's own (US) timezone this is still the same evening,
 *               so we quote hours instead of a calendar word: honest in every
 *               timezone.
 *
 * There is deliberately no "expires in N days" phrasing anywhere in here. On
 * the expiry date that number is zero, and "expires in 0 days" is the exact
 * sentence this module exists to prevent.
 *
 * Everything here is pure and UTC based (no server-timezone dependence, same
 * discipline as lib/expires-at.ts), so it is fully unit testable.
 */

import { renewalExpiresAt } from '@/lib/expires-at';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * How far past the run instant we still reach for postings that expire
 * "tonight". The cron fires at 22:00 UTC; 6 hours reaches 04:00 UTC, which is
 * midnight US Eastern. A posting dying at 01:30 UTC is, to the employer who
 * bought it, dying tonight. Without the lookahead its notice would wait for
 * the next run 22 hours later, by which time cleanup-expired (10 12,18 * * *)
 * has already pulled the listing down.
 */
export const FINAL_NOTICE_LOOKAHEAD_HOURS = 6;

export interface FinalNoticeWindow {
  /** 00:00:00.000 UTC on the run's own calendar date. */
  start: Date;
  /** End of that UTC day, or now + lookahead, whichever reaches further. */
  end: Date;
}

/**
 * The `expiresAt` range this run claims. Inclusive on both ends.
 *
 * At the scheduled 22:00 UTC run the lookahead always wins (it reaches into
 * tomorrow). The max() matters for manual/admin triggers earlier in the day,
 * where the rest of today is the wider half.
 */
export function buildFinalNoticeWindow(now: Date): FinalNoticeWindow {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  );
  const endOfUtcDay = new Date(start.getTime() + DAY_MS - 1);
  const lookaheadEnd = new Date(now.getTime() + FINAL_NOTICE_LOOKAHEAD_HOURS * HOUR_MS);
  const end = lookaheadEnd.getTime() > endOfUtcDay.getTime() ? lookaheadEnd : endOfUtcDay;
  return { start, end };
}

export type FinalNoticeState = 'expired' | 'today' | 'soon';

export interface ResolvedFinalNoticeState {
  state: FinalNoticeState;
  /**
   * Whole hours until the expiry instant, floored at 1 for anything still in
   * the future so the copy can never say "in 0 hours". Zero when the instant
   * has already passed (the 'expired' branch does not quote a countdown).
   */
  hoursUntilExpiry: number;
}

function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/** Which of the three honest states this posting is in, relative to `now`. */
export function resolveFinalNoticeState(expiresAt: Date, now: Date): ResolvedFinalNoticeState {
  if (expiresAt.getTime() <= now.getTime()) {
    return { state: 'expired', hoursUntilExpiry: 0 };
  }
  // Floor, not round: this number goes into a "renew before it is gone" email,
  // so it must never promise more time than the employer actually has. 5h50m
  // reads as "about 5 hours". The floor at 1 keeps anything still in the
  // future from rendering "about 0 hours".
  const hoursUntilExpiry = Math.max(
    1,
    Math.floor((expiresAt.getTime() - now.getTime()) / HOUR_MS),
  );
  return {
    state: isSameUtcDay(expiresAt, now) ? 'today' : 'soon',
    hoursUntilExpiry,
  };
}

/**
 * The renewal signal the rest of the codebase already writes: the Stripe
 * renewal branch stamps `Job.lastRenewedAt = now` and extends `expiresAt`
 * (lib/expires-at.ts `renewalExpiresAt`).
 *
 * Normally the extension alone drops a renewed posting out of the selection
 * window. The case that survives the window is the 365-day cap in
 * `renewalExpiresAt`: a year-old posting can be renewed and STILL come back
 * with an `expiresAt` at or before today. Its renewal stamp is then newer than
 * its expiry, which is the tell. That employer just paid; they must not get a
 * "your listing expired" email.
 */
export function isRenewedPastExpiry(job: {
  lastRenewedAt: Date | null;
  expiresAt: Date | null;
}): boolean {
  if (!job.lastRenewedAt || !job.expiresAt) return false;
  return job.lastRenewedAt.getTime() > job.expiresAt.getTime();
}

/**
 * True when buying a renewal right now would deliver LESS than the
 * `durationDays` every branch of this email promises.
 *
 * `renewalExpiresAt` caps every renewal at `createdAt + 365 days`. A posting
 * that has been renewed its way up to that ceiling gets back less than a full
 * cycle, and once it is sitting on the ceiling it gets back nothing at all.
 *
 * Two things follow, and both matter here:
 *
 *   1. The copy would be false. "Renewing adds 60 days" is a promise the cap
 *      cannot keep, and the charge is the same either way.
 *   2. It is the exact shape a just-renewed posting takes when it is still
 *      inside the selection window. An uncapped renewal pushes `expiresAt` a
 *      full cycle out, far past the window, so the ONLY way a posting renewed
 *      earlier today can still be selected is that the cap held it back. Those
 *      employers paid hours ago; pitching them again would be indefensible.
 *
 * So this is both the honesty guard and the second half of the renewal guard
 * (`isRenewedPastExpiry` covers the case where the renewal stamp lands after
 * an expiry that had already lapsed).
 */
export function renewalIsCapped(opts: {
  expiresAt: Date;
  createdAt: Date;
  durationDays: number;
  now: Date;
}): boolean {
  const { expiresAt, createdAt, durationDays, now } = opts;
  // What the email promises: a full cycle on top of whichever base
  // renewalExpiresAt would extend from (existing expiry if still ahead of us,
  // otherwise the renewal date itself).
  const base = expiresAt.getTime() > now.getTime() ? expiresAt : now;
  const promised = base.getTime() + durationDays * DAY_MS;
  const actual = renewalExpiresAt({
    currentExpiry: expiresAt,
    originalCreatedAt: createdAt,
    durationDays,
    now,
  });
  return actual.getTime() < promised;
}

/** "Wednesday, August 12, 2026" in UTC, so the string never shifts with the host. */
export function formatUtcDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export interface FinalNoticeCopy {
  state: FinalNoticeState;
  subject: string;
  /** Email H1. */
  heading: string;
  /** Lead paragraph. Contains the job title wrapped in <strong>. */
  body: string;
  /** Label above the performance numbers. */
  statsLabel: string;
  /** One line explaining what renewing actually does from this state. */
  renewLine: string;
  /** Label on the renew button. */
  ctaLabel: string;
  /** Inbox preview text. */
  preheader: string;
}

export interface FinalNoticeCopyInput {
  /** Job title, ALREADY HTML escaped by the caller. */
  jobTitleHtml: string;
  expiresAt: Date;
  now: Date;
  renewalPrice: number;
  durationDays: number;
}

/**
 * Build every user-visible string for the final notice.
 *
 * House copy rules this obeys: no em or en dashes (colons, commas and "X to Y"
 * instead), no invented numbers, and no claim that the listing is still live
 * once the instant has passed.
 */
export function buildFinalNoticeCopy(input: FinalNoticeCopyInput): FinalNoticeCopy {
  const { jobTitleHtml, expiresAt, now, renewalPrice, durationDays } = input;
  const { state, hoursUntilExpiry } = resolveFinalNoticeState(expiresAt, now);
  const titleHtml = `<strong>${jobTitleHtml}</strong>`;
  const hourWord = hoursUntilExpiry === 1 ? 'hour' : 'hours';

  if (state === 'expired') {
    return {
      state,
      subject: 'Your job posting has expired: renew to bring it back live',
      heading: 'Your Listing Has Expired',
      // Past tense, no hedging: the instant is behind us and candidates have
      // stopped seeing it. Renewal is framed as recovery, not maintenance.
      body: `Your posting for ${titleHtml} has expired, so candidates can no longer find it. Renewing puts the same listing back in front of them.`,
      statsLabel: 'What this listing earned while it was live',
      // renewalExpiresAt() extends from NOW once the old expiry has lapsed,
      // so "from the day you renew" is the literal truth in this state.
      renewLine: `Renewing adds ${durationDays} days from the day you renew and puts the listing back into search results.`,
      ctaLabel: 'Bring Your Listing Back',
      preheader: `Your listing has expired. Renew for $${renewalPrice} to bring it back live.`,
    };
  }

  if (state === 'today') {
    return {
      state,
      subject: 'Your job posting expires today: renew to keep it live',
      heading: 'Your Listing Expires Today',
      body: `Your posting for ${titleHtml} expires today, ${formatUtcDate(expiresAt)}. Renew before it comes down and candidates keep seeing it without a gap.`,
      statsLabel: 'What this listing has earned so far',
      // Still ahead of the expiry instant, so renewalExpiresAt() extends from
      // the existing expiry: nothing already paid for is thrown away.
      renewLine: `Renewing adds ${durationDays} days to your current expiration, so none of the time you have left is lost.`,
      ctaLabel: 'Renew Your Listing',
      preheader: `Your listing expires today. Renew for $${renewalPrice} to keep it live.`,
    };
  }

  // 'soon': past midnight UTC but inside the lookahead. A calendar word would
  // be arguable here (it is tomorrow in UTC, tonight in the US), so quote the
  // countdown instead, which is true in every timezone.
  return {
    state,
    subject: `Your job posting expires in about ${hoursUntilExpiry} ${hourWord}: renew to keep it live`,
    heading: `Your Listing Expires in About ${hoursUntilExpiry} ${hoursUntilExpiry === 1 ? 'Hour' : 'Hours'}`,
    body: `Your posting for ${titleHtml} expires in about ${hoursUntilExpiry} ${hourWord}. Renew before then and candidates keep seeing it without a gap.`,
    statsLabel: 'What this listing has earned so far',
    renewLine: `Renewing adds ${durationDays} days to your current expiration, so none of the time you have left is lost.`,
    ctaLabel: 'Renew Your Listing',
    preheader: `Your listing expires in about ${hoursUntilExpiry} ${hourWord}. Renew for $${renewalPrice} to keep it live.`,
  };
}
