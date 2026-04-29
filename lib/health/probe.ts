/**
 * HTTP health probe with manual redirect tracking.
 *
 * Unlike the legacy fetch with `redirect: 'follow'`, this primitive records
 * every redirect hop, exposes the final landing URL, and optionally reads the
 * response body so callers can run soft-404 detection on it.
 */

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_REDIRECTS = 10;
const DEFAULT_BODY_BYTE_CAP = 200_000;
const DEFAULT_USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const PROBE_HEADERS: Readonly<Record<string, string>> = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
};

export type ProbeErrorKind =
    | 'timeout'
    | 'network'
    | 'too_many_redirects'
    | 'bad_redirect_target';

export interface RedirectHop {
    url: string;
    status: number;
}

export interface ProbeResult {
    finalUrl: string;
    finalStatus: number | null;
    redirectChain: RedirectHop[];
    redirectHops: number;
    /** HTML body text (capped at byteCap) when fetchBody=true and final response was 2xx. */
    bodyHtml: string | null;
    elapsedMs: number;
    errorKind: ProbeErrorKind | null;
    /** Underlying error message if any (sanitized). */
    errorMessage: string | null;
}

export interface ProbeOptions {
    /** When true and the final response is 2xx, fetch the body via GET (capped at byteCap). */
    fetchBody?: boolean;
    /** Per-hop timeout. Default 8000ms. */
    timeoutMs?: number;
    /** Max redirects to follow. Default 10. */
    maxRedirects?: number;
    /** Max body bytes to read. Default 200_000. */
    byteCap?: number;
    /** Override user agent. */
    userAgent?: string;
    /** Optional fetch implementation for testing. */
    fetchImpl?: typeof fetch;
}

/**
 * Probe a URL using HEAD-first, GET-fallback, with manual redirect tracking.
 *
 * Behavior:
 *  - First hop: HEAD. If the server responds 405/501/400 to HEAD, retry GET.
 *  - 3xx with Location: record hop, follow up to maxRedirects.
 *  - 2xx final + fetchBody=true: do an additional GET to read the body.
 *  - 4xx/5xx: stop, record final status.
 *  - Any timeout or network failure: stop, errorKind set, finalStatus=null.
 */
export async function probeUrl(url: string, options: ProbeOptions = {}): Promise<ProbeResult> {
    const {
        fetchBody = false,
        timeoutMs = DEFAULT_TIMEOUT_MS,
        maxRedirects = DEFAULT_MAX_REDIRECTS,
        byteCap = DEFAULT_BODY_BYTE_CAP,
        userAgent = DEFAULT_USER_AGENT,
        fetchImpl = fetch,
    } = options;

    const startedAt = Date.now();
    const redirectChain: RedirectHop[] = [];
    const headers = { ...PROBE_HEADERS, 'User-Agent': userAgent };

    let current = url;
    let finalStatus: number | null = null;
    let errorKind: ProbeErrorKind | null = null;
    let errorMessage: string | null = null;
    let bodyHtml: string | null = null;
    let lastResponseStatus: number | null = null;

    for (let hop = 0; hop <= maxRedirects; hop++) {
        let res: Response;
        const method = hop === 0 ? 'HEAD' : 'GET';
        try {
            res = await timedFetch(fetchImpl, current, { method, headers, redirect: 'manual' }, timeoutMs);

            // Many servers reject HEAD — retry once with GET on the first hop.
            if (hop === 0 && (res.status === 405 || res.status === 501 || res.status === 400)) {
                res = await timedFetch(fetchImpl, current, { method: 'GET', headers, redirect: 'manual' }, timeoutMs);
            }
        } catch (err: unknown) {
            errorKind = errorKindFromException(err);
            errorMessage = errorMessageOf(err);
            break;
        }

        lastResponseStatus = res.status;
        redirectChain.push({ url: current, status: res.status });

        if (isRedirect(res.status)) {
            const location = res.headers.get('location');
            if (!location) {
                finalStatus = res.status;
                break;
            }
            try {
                current = new URL(location, current).toString();
            } catch {
                errorKind = 'bad_redirect_target';
                errorMessage = `invalid Location: ${location.slice(0, 200)}`;
                break;
            }
            continue;
        }

        finalStatus = res.status;

        if (fetchBody && res.status >= 200 && res.status < 300) {
            try {
                bodyHtml = await readBodyCapped(fetchImpl, current, headers, timeoutMs, byteCap);
            } catch {
                // Body fetch failures are non-fatal — we still have a valid status.
            }
        }
        break;
    }

    if (errorKind === null && finalStatus === null && lastResponseStatus !== null) {
        // Loop exited via maxRedirects exhaustion
        errorKind = 'too_many_redirects';
        errorMessage = `exceeded ${maxRedirects} redirects`;
    }

    return {
        finalUrl: current,
        finalStatus,
        redirectChain,
        redirectHops: Math.max(0, redirectChain.length - 1),
        bodyHtml,
        elapsedMs: Date.now() - startedAt,
        errorKind,
        errorMessage,
    };
}

function isRedirect(status: number): boolean {
    return status >= 300 && status < 400 && status !== 304;
}

async function timedFetch(
    fetchImpl: typeof fetch,
    url: string,
    init: RequestInit,
    timeoutMs: number,
): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetchImpl(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

async function readBodyCapped(
    fetchImpl: typeof fetch,
    url: string,
    headers: Record<string, string>,
    timeoutMs: number,
    byteCap: number,
): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetchImpl(url, { method: 'GET', headers, redirect: 'manual', signal: controller.signal });
        if (!res.body) {
            const text = await res.text();
            return text.slice(0, byteCap);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8', { fatal: false });
        let received = 0;
        let out = '';
        while (received < byteCap) {
            const { done, value } = await reader.read();
            if (done) break;
            received += value.byteLength;
            out += decoder.decode(value, { stream: true });
            if (received >= byteCap) break;
        }
        try { await reader.cancel(); } catch { /* ignore */ }
        return out.slice(0, byteCap);
    } finally {
        clearTimeout(timer);
    }
}

function errorKindFromException(err: unknown): ProbeErrorKind {
    if (err instanceof Error && err.name === 'AbortError') return 'timeout';
    return 'network';
}

function errorMessageOf(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
}
