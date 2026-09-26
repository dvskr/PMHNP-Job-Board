/**
 * The admin console's single client-side entry point to its own API.
 *
 * The console used to write `if (res.ok) { ...apply the change... }` with no
 * else branch. A 500 on a role change left the <select> snapping back to the
 * old value with nothing said, and a 429 on the jobs list rendered the empty
 * state, so a throttled request read as "the catalogue is empty" rather than
 * "the request failed". Routing every call through one wrapper means a
 * failure always arrives as a message the operator can act on.
 */

export type AdminFetchResult<T> =
    | { ok: true; data: T }
    | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

/**
 * The sentence shown to the operator for a failed admin request.
 *
 * The API's own `error` string is the most useful thing we can say, so it wins
 * whenever the handler sent one. The status fallbacks exist because the three
 * statuses below are the ones an operator can actually do something about;
 * everything else just needs to be visibly not-success.
 */
export function describeApiFailure(status: number, payload: unknown): string {
    if (isRecord(payload) && typeof payload.error === 'string' && payload.error.trim() !== '') {
        return payload.error.trim();
    }
    if (status === 401 || status === 403) {
        return 'Your admin session is no longer valid. Sign in again and retry.';
    }
    if (status === 429) {
        return 'The admin API is rate limiting this session. Wait a minute, then retry.';
    }
    if (status === 404) {
        return 'That record no longer exists. Refresh the list.';
    }
    return `The request failed (HTTP ${status}). Nothing was changed.`;
}

/** A fetch that never resolved: offline, DNS, aborted tab, blocked by an extension. */
export function describeNetworkFailure(error: unknown): string {
    const detail = error instanceof Error ? error.message : String(error);
    return `Could not reach the server: ${detail}`;
}

async function readJson(res: Response): Promise<unknown> {
    try {
        return await res.json();
    } catch {
        return null;
    }
}

/**
 * Call an admin API route and normalise every outcome into ok/error.
 *
 * A non-2xx status and a 200 carrying `{ success: false }` are both failures:
 * the admin handlers use both shapes, and a caller that only checked one of
 * them is exactly how the silent failures got in.
 *
 * So is a 2xx whose body is not a JSON object. Callers read fields off
 * `data` immediately (`result.data.jobs`), so handing them `null` for an
 * empty or truncated body just moves the failure to a TypeError one line
 * later, after the early return that would have cleared the spinner. A proxy
 * error page or a cut-off response is a failed request, and saying so here is
 * what keeps every caller from having to re-check.
 */
export async function adminFetch<T = unknown>(
    input: string,
    init?: RequestInit,
): Promise<AdminFetchResult<T>> {
    let res: Response;
    try {
        res = await fetch(input, init);
    } catch (err) {
        return { ok: false, error: describeNetworkFailure(err) };
    }

    const payload = await readJson(res);

    if (!res.ok) {
        return { ok: false, error: describeApiFailure(res.status, payload) };
    }
    if (isRecord(payload) && payload.success === false) {
        return { ok: false, error: describeApiFailure(res.status, payload) };
    }
    if (!isRecord(payload)) {
        return {
            ok: false,
            error: `The server answered ${res.status} with no readable data. Retry, and check the admin API logs if it repeats.`,
        };
    }

    return { ok: true, data: payload as T };
}
