/**
 * Joining a vercel.json cron path to its cron_runs history.
 *
 * withCronTracking is called with a bare name ('ingest', 'index-pseo') while
 * vercel.json holds a path with an optional query string
 * ('/api/cron/ingest?source=adzuna&chunk=1'). The name is always the last path
 * segment, so the join is mechanical, but it is worth its own tested function:
 * getting it subtly wrong shows "never run" next to a cron that runs hourly,
 * which is worse than showing nothing.
 */

/** The cron_runs.name a vercel.json cron path records under. */
export function cronNameFromPath(path: string): string {
    const withoutQuery = path.split('?')[0];
    const segments = withoutQuery.split('/').filter(Boolean);
    return segments[segments.length - 1] ?? '';
}

/**
 * Whether a run finished recently enough to be worth trusting.
 *
 * A cron whose last success is older than its own cadence is the case an
 * operator needs to spot, but the dashboard does not know each cadence, so
 * this only flags the blunt case: nothing at all for over a week.
 */
export const STALE_RUN_MS = 7 * 24 * 60 * 60 * 1000;

export function isRunStale(startedAtIso: string, now: number = Date.now()): boolean {
    const started = Date.parse(startedAtIso);
    if (Number.isNaN(started)) return false;
    return now - started > STALE_RUN_MS;
}
