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
    | 'bad_redirect_target'
    | 'ssrf_blocked'
    | 'other';

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
/**
 * P5.A SSRF guard (2026-06-01): the dead-link prober follows redirects
 * up to `maxRedirects` without checking whether the destination
 * resolves to a private/internal IP. A malicious aggregator could
 * publish a job whose applyLink redirects to e.g.
 * `http://169.254.169.254/latest/meta-data/` (AWS metadata) or
 * `http://10.0.0.1/admin` and probe a private network on our behalf.
 *
 * This is a lightweight hostname-level check — it rejects URLs whose
 * literal hostname is a private IP, localhost, or .internal. It does
 * NOT do DNS resolution (the prober's `fetch()` does its own DNS, and
 * resolving twice introduces a TOCTOU race). For full IP-level
 * protection we would need an outbound proxy that enforces a
 * `route-private-ranges-to-null` policy; this guard is the cheapest
 * 80%-effective defense.
 */
const SSRF_BLOCKED_HOSTNAMES = [
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '::1',
    '169.254.169.254', // AWS / GCP / Azure metadata service
    'metadata.google.internal',
];
const SSRF_PRIVATE_IPV4_RE = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/;

export function isPrivateOrInternalHost(hostname: string): boolean {
    const h = hostname.toLowerCase();
    if (SSRF_BLOCKED_HOSTNAMES.includes(h)) return true;
    if (h.endsWith('.internal') || h.endsWith('.local')) return true;
    if (SSRF_PRIVATE_IPV4_RE.test(h)) return true;
    return false;
}

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

    // Pre-flight SSRF guard on the starting URL. Each redirect hop is
    // re-checked in the redirect-following branch below so an attacker
    // can't bypass via a 302 → private IP.
    try {
        const u = new URL(url);
        if (isPrivateOrInternalHost(u.hostname)) {
            return {
                finalStatus: null,
                finalUrl: url,
                redirectChain: [],
                redirectHops: 0,
                bodyHtml: null,
                errorKind: 'ssrf_blocked',
                errorMessage: `SSRF guard: refusing to probe private/internal host ${u.hostname}`,
                elapsedMs: Date.now() - startedAt,
            };
        }
    } catch {
        return {
            finalStatus: null,
            finalUrl: url,
            redirectChain: [],
            redirectHops: 0,
            bodyHtml: null,
            errorKind: 'other',
            errorMessage: 'Malformed URL',
            elapsedMs: Date.now() - startedAt,
        };
    }

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
                const next = new URL(location, current);
                // P5.A: re-check SSRF on every hop. Without this, an
                // attacker-controlled origin could 302 → 169.254.169.254
                // and pull cloud-metadata credentials.
                if (isPrivateOrInternalHost(next.hostname)) {
                    errorKind = 'ssrf_blocked';
                    errorMessage = `SSRF guard: refusing redirect to private/internal host ${next.hostname}`;
                    break;
                }
                current = next.toString();
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
