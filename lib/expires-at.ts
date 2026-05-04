/**
 * Pure utilities for computing job posting expiration dates.
 *
 * Why this lives in its own file: previously every call site used
 * `expiresAt.setDate(expiresAt.getDate() + N)` which is timezone-dependent
 * and caused off-by-1/2 drift across DST boundaries (see the NYPCC anomaly
 * in production: posted Jan 26 + 60 days landed on Mar 29 instead of Mar 27,
 * because the server local TZ math crossed the US DST transition).
 *
 * All math here uses UTC milliseconds so the result is deterministic
 * regardless of server timezone, daylight-saving boundaries, or
 * Postgres TIMESTAMP storage semantics.
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
export function renewalExpiresAt(opts: {
  currentExpiry: Date | null;
  originalCreatedAt: Date;
  durationDays: number;
  maxFromOriginalDays?: number;
  now?: Date;
}): Date {
  const { currentExpiry, originalCreatedAt, durationDays } = opts;
  const now = opts.now ?? new Date();
  const maxFromOriginalDays = opts.maxFromOriginalDays ?? 365;

  const baseDate = currentExpiry && currentExpiry.getTime() > now.getTime()
    ? currentExpiry
    : now;
  const proposed = expiresFromNow(durationDays, baseDate);
  const cap = expiresFromNow(maxFromOriginalDays, originalCreatedAt);

  return proposed.getTime() > cap.getTime() ? cap : proposed;
}
