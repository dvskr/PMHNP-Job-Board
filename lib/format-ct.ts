/**
 * Centralized America/Chicago (CT) date formatter for the admin panel
 * (Goal #5 — every admin timestamp displayed in CT, not UTC).
 *
 * Why this lives in its own file: the prior pattern was bare
 * `.toLocaleDateString()` calls scattered across 18 admin pages. On
 * Vercel that resolves to server local time (UTC), so admins in CT
 * saw timestamps that drift up to 6 hours from when events actually
 * happened. This util forces an explicit `timeZone: 'America/Chicago'`
 * and a consistent " CT" suffix so the timezone is unambiguous.
 *
 * Null-safe by design — returns '—' for null/undefined so admin tables
 * don't crash on never-contacted leads, unfinished crons, etc.
 *
 *   formatCT(date)            → "May 06, 02:35 PM CT"
 *   formatCT(date, 'date')    → "May 06, 2026 CT"
 *   formatCT(null)            → "—"
 *   formatCT(undefined)       → "—"
 */

export type FormatCTMode = 'date' | 'datetime' | 'time';

export function formatCT(
    d: Date | string | null | undefined,
    mode: FormatCTMode = 'datetime',
): string {
    if (d == null) return '—';
    const date = typeof d === 'string' ? new Date(d) : d;
    if (Number.isNaN(date.getTime())) return '—';

    const baseOpts: Intl.DateTimeFormatOptions = { timeZone: 'America/Chicago' };
    const opts: Intl.DateTimeFormatOptions =
        mode === 'date'
            ? { ...baseOpts, month: 'short', day: '2-digit', year: 'numeric' }
            : mode === 'time'
            ? { ...baseOpts, hour: 'numeric', minute: '2-digit', hour12: true }
            : { ...baseOpts, month: 'short', day: '2-digit', hour: 'numeric', minute: '2-digit', hour12: true };

    return date.toLocaleString('en-US', opts) + ' CT';
}

/**
 * Compute "today" boundaries in America/Chicago timezone. Use this
 * instead of `new Date().setHours(0,0,0,0)` (which sets UTC midnight)
 * for any "today" / "yesterday" stats meant to be CT-day-bounded.
 *
 * Returns { startUtc, endUtc } as Date objects expressed in UTC such
 * that startUtc ≤ ts < endUtc means "ts is in today's CT calendar day".
 */
export function ctDayBounds(now: Date = new Date()): { startUtc: Date; endUtc: Date } {
    // Step 1: extract today's CT calendar date.
    const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Chicago',
        year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const td = (t: string): number => Number(today.find((p) => p.type === t)?.value ?? 0);
    const startUtc = ctMidnightUtc(td('year'), td('month'), td('day'));
    return { startUtc, endUtc: new Date(startUtc.getTime() + 24 * 60 * 60 * 1000) };
}

/**
 * Resolve the UTC instant that corresponds to 00:00 wall-clock in
 * America/Chicago for the given calendar date (year, month=1-12, day).
 * Handles CDT/CST automatically via Intl offset detection.
 */
function ctMidnightUtc(year: number, month: number, day: number): Date {
    // Probe at ~6 UTC on that date — guaranteed to be the same calendar
    // day in CT regardless of CDT/CST (CT lags UTC by 5–6h).
    const probe = new Date(Date.UTC(year, month - 1, day, 6, 0, 0));
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
    }).formatToParts(probe);
    const pp = (t: string): number => Number(parts.find((p) => p.type === t)?.value ?? 0);
    // Hour can come back as "24" for midnight in some locales; normalize.
    const ctHour = pp('hour') === 24 ? 0 : pp('hour');
    // The probe's CT wall-clock interpreted as UTC, minus the actual UTC
    // instant, yields the CT offset (negative for CT — e.g., -5h CDT).
    const ctWallAsUtc = Date.UTC(pp('year'), pp('month') - 1, pp('day'), ctHour, pp('minute'), pp('second'));
    const offsetMs = ctWallAsUtc - probe.getTime();
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMs);
}
