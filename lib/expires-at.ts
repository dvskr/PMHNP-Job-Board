/**
 * Pure utilities for computing job posting expiration dates.
 *
 * Why this lives in its own file: previously every call site used
 * `expiresAt.setDate(expiresAt.getDate() + N)` which is timezone-dependent
 * and caused off-by-1/2 drift across DST boundaries. Seen in production: a
 * posting created Jan 26 with a 60-day term landed on Mar 29 instead of
 * Mar 27, because the server local TZ math crossed the US DST transition.
 *
 * All math here uses UTC milliseconds so the result is deterministic
 * regardless of server timezone, daylight-saving boundaries, or
 * Postgres TIMESTAMP storage semantics.
 *
 * Every post now runs config.durationDays. The 30-day free-post term is
 * retired, so nothing branches on duration any more: callers pass the one
 * value and this file stays a pure date utility.
 */

const DAY_IN_MS = 24 * 60 * 60 * 1000;

/**
 * Compute an expiration date `durationDays` days from `from`.
 * Defaults `from` to now. Always uses UTC math — adds exactly
 * durationDays × 86_400_000 ms.
 *
 * @param durationDays integer ≥ 0
 * @param from base date (defaults to now)
 */
export function expiresFromNow(durationDays: number, from: Date = new Date()): Date {
  if (!Number.isInteger(durationDays) || durationDays < 0) {
    throw new Error(`expiresFromNow: durationDays must be a non-negative integer, got ${durationDays}`);
  }
  return new Date(from.getTime() + durationDays * DAY_IN_MS);
}

/**
 * Renewal expiry: extend from existing expiry if it's still in the future
 * (don't penalize early renewers — audit #22), otherwise extend from now.
 *
 * Capped at maxFromOriginalDays (default 365) days past `originalCreatedAt`
 * so that repeated renewals can't push a posting indefinitely far into
 * the future. Returns the capped date if the natural extension exceeds it.
 */
export interface RenewalExpiryOptions {
  currentExpiry: Date | null;
  originalCreatedAt: Date;
  durationDays: number;
  maxFromOriginalDays?: number;
  now?: Date;
}

/** The point a renewal extends FROM: the live expiry, else now. */
function renewalBaseDate(opts: RenewalExpiryOptions): Date {
  const now = opts.now ?? new Date();
  return opts.currentExpiry && opts.currentExpiry.getTime() > now.getTime()
    ? opts.currentExpiry
    : now;
}

export function renewalExpiresAt(opts: RenewalExpiryOptions): Date {
  const { originalCreatedAt, durationDays } = opts;
  const maxFromOriginalDays = opts.maxFromOriginalDays ?? 365;

  const baseDate = renewalBaseDate(opts);
  const proposed = expiresFromNow(durationDays, baseDate);
  const cap = expiresFromNow(maxFromOriginalDays, originalCreatedAt);
  const capped = proposed.getTime() > cap.getTime() ? cap : proposed;

  // A renewal must never move the expiry BACKWARDS. Once a posting is older
  // than maxFromOriginalDays the cap is already in the past, so the raw
  // `min(proposed, cap)` returned a date behind both `now` and the posting's
  // current expiry: the employer paid and the listing expired within hours, or
  // was cut shorter than before the payment. Callers are expected to refuse the
  // charge up front (see renewalRunwayMs); this is the backstop that keeps a
  // completed payment from ever reducing what the employer already had.
  return capped.getTime() < baseDate.getTime() ? baseDate : capped;
}

/**
 * How much additional live time a renewal would actually buy, in milliseconds.
 *
 * Zero means the 365-day cap leaves nothing to sell, so the charge must be
 * refused before Stripe is involved rather than discovered after payment.
 */
export function renewalRunwayMs(opts: RenewalExpiryOptions): number {
  const baseDate = renewalBaseDate(opts);
  const newExpiry = renewalExpiresAt(opts);
  return Math.max(0, newExpiry.getTime() - baseDate.getTime());
}

/** renewalRunwayMs expressed in whole days (rounded down). */
export function renewalRunwayDays(opts: RenewalExpiryOptions): number {
  return Math.floor(renewalRunwayMs(opts) / DAY_IN_MS);
}
