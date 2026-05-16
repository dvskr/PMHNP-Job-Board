/**
 * Time helpers shared across server-side rate-limit windows.
 *
 * The product is US-based and employers think in their local day, not
 * UTC. Per-day caps therefore reset at midnight Central Time, not 00:00Z.
 * Originally lived inline in app/api/employer/talent/search/route.ts —
 * extracted here so the JD generation cap and any future per-day-AI
 * caps stay in lockstep with the talent-search behavior.
 */

/**
 * Returns the UTC moment corresponding to the most recent midnight in
 * America/Chicago (CST or CDT depending on time of year). Handles DST
 * automatically via Intl.DateTimeFormat's longOffset — in May the
 * offset is -05:00 (CDT); in winter it's -06:00 (CST).
 */
export function midnightCentralTimeAsUtc(): Date {
  const now = new Date();
  // Today's date in Chicago (e.g. "2026-05-14").
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  // Chicago's current UTC offset (e.g. "GMT-05:00" → "-05:00").
  const offsetParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    timeZoneName: 'longOffset',
  }).formatToParts(now);
  const offsetRaw = offsetParts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-06:00';
  const isoOffset = offsetRaw.replace('GMT', '') || '-06:00';
  return new Date(`${dateStr}T00:00:00${isoOffset}`);
}

/**
 * The next midnight CT — used in API responses so the client can render
 * "resets at 12:00 AM CT" or compute a friendly "in 3h 22m".
 */
export function nextMidnightCentralTimeAsUtc(): Date {
  const today = midnightCentralTimeAsUtc();
  return new Date(today.getTime() + 24 * 60 * 60 * 1000);
}
