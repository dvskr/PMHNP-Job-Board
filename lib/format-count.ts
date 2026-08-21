/**
 * Shared display formatting for site-wide counters. Every surface that shows
 * a rounded job/employer count renders through this helper so the same
 * number can never appear as "1,600+" in one place and "1600+" in another.
 */

/**
 * Round a live count down to the nearest hundred and format it as an
 * en-US "1,600+" display. Counts under 100 render exactly (no "+"): a
 * rounded "0+" would read as having no inventory at all.
 */
export function roundedCountDisplay(n: number): string {
    if (n < 100) return String(n);
    return `${(Math.floor(n / 100) * 100).toLocaleString('en-US')}+`;
}
