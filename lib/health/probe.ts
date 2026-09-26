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
    '169.254.169.254', // AWS / GCP / Azure metadata service
    'metadata.google.internal',
];

/**
 * Private / loopback / link-local / CGNAT IPv4 ranges, matched on the WHOLE
 * dotted quad.
 *
 * The previous version tested only a `^(10\.|172\.16-31\.|192\.168\.|169\.254\.)`
 * prefix plus a literal '127.0.0.1' string, so the rest of the loopback /8
 * walked straight through: `http://127.0.0.2:8080/` was probed. `http://127.1/`
 * and `http://2130706433/` only looked blocked because the WHATWG URL parser
 * normalises them to the literal '127.0.0.1'; 127.0.0.2 has no such
 * normalisation to fall back on.
 *
 *   0.0.0.0/8        "this network" (0.0.0.0 reaches localhost on Linux)
 *   10/8, 172.16/12, 192.168/16   RFC1918
 *   127/8            the whole loopback range, not just .0.1
 *   169.254/16       link-local, incl. the cloud metadata address
 *   100.64/10        RFC6598 CGNAT, routable inside many provider networks
 *   192.0.0/24       IETF protocol assignments
 */
const SSRF_PRIVATE_IPV4_RE =
    /^(?:0\.|10\.|127\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.|192\.0\.0\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;

const IPV4_DOTTED_QUAD_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * Expand an IPv6 literal (already stripped of its surrounding brackets) into
 * its eight 16-bit groups, or null when it is not an IPv6 address.
 *
 * `new URL('http://[::1]/').hostname` hands the host back WITH the brackets, so
 * the old literal '::1' entry in the blocklist could never match, and every
 * other v6 form (fd00::1 ULA, fe80::1 link-local, :: unspecified, and the
 * IPv4-mapped ::ffff:7f00:1 the parser produces for ::ffff:127.0.0.1) was
 * unreachable by the guard entirely. Parsing once and classifying the groups
 * covers all of those without a per-form string list.
 */
function parseIpv6Groups(address: string): number[] | null {
    if (!address.includes(':')) return null;
    // Zone id (fe80::1%eth0) is not part of the address for our purposes.
    const bare = address.split('%')[0];

    // A trailing dotted quad (::ffff:127.0.0.1) becomes two more groups.
    let head = bare;
    const tail: number[] = [];
    const lastColon = bare.lastIndexOf(':');
    const suffix = bare.slice(lastColon + 1);
    const quad = IPV4_DOTTED_QUAD_RE.exec(suffix);
    if (quad) {
        const octets = quad.slice(1).map(Number);
        if (octets.some((o) => o > 255)) return null;
        tail.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
        head = bare.slice(0, lastColon);
    }

    const doubleColon = head.indexOf('::');
    const parseSide = (side: string): number[] | null => {
        if (!side) return [];
        const out: number[] = [];
        for (const part of side.split(':')) {
            if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
            out.push(parseInt(part, 16));
        }
        return out;
    };

    let groups: number[];
    if (doubleColon >= 0) {
        const left = parseSide(head.slice(0, doubleColon));
        const right = parseSide(head.slice(doubleColon + 2));
        if (left === null || right === null) return null;
        const fillCount = 8 - (left.length + right.length + tail.length);
        if (fillCount < 0) return null;
        groups = [...left, ...new Array<number>(fillCount).fill(0), ...right, ...tail];
    } else {
        const parsed = parseSide(head);
        if (parsed === null) return null;
        groups = [...parsed, ...tail];
    }

    return groups.length === 8 ? groups : null;
}

function isPrivateIpv4(host: string): boolean {
    if (SSRF_PRIVATE_IPV4_RE.test(host)) return true;
    // 255.255.255.255 (limited broadcast) is the one private-ish address that
    // is not a prefix match.
    return host === '255.255.255.255';
}

function isPrivateIpv6(groups: number[]): boolean {
    const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
    const leadingZero = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;

    // ::1 loopback and :: unspecified.
    if (leadingZero && g5 === 0 && g6 === 0 && (g7 === 1 || g7 === 0)) return true;

    // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d): classify
    // the embedded v4 address with the v4 rules rather than treating the whole
    // literal as an opaque public host.
    if (leadingZero && (g5 === 0xffff || g5 === 0)) {
        const embedded = [g6 >> 8, g6 & 0xff, g7 >> 8, g7 & 0xff].join('.');
        if (isPrivateIpv4(embedded)) return true;
    }

    if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7  unique local
    if ((g0 & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
    return false;
}

export function isPrivateOrInternalHost(hostname: string): boolean {
    // A trailing dot is a fully-qualified form of the same name: 'localhost.'
    // resolves exactly like 'localhost'.
    let h = hostname.toLowerCase().replace(/\.$/, '');
    if (!h) return true;

    // new URL().hostname keeps the brackets on an IPv6 literal.
    if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);

    if (SSRF_BLOCKED_HOSTNAMES.includes(h)) return true;
    if (h.endsWith('.internal') || h.endsWith('.local') || h.endsWith('.localhost')) return true;

    // Bare-integer IPv4 (http://2130706433/). The URL parser normally expands
    // these, but isPrivateOrInternalHost is also called directly, so it must
    // not depend on the caller having gone through URL.
    if (/^\d+$/.test(h)) {
        const asInt = Number(h);
        if (Number.isSafeInteger(asInt) && asInt >= 0 && asInt <= 0xffffffff) {
            const dotted = [asInt >>> 24, (asInt >>> 16) & 0xff, (asInt >>> 8) & 0xff, asInt & 0xff].join('.');
            if (isPrivateIpv4(dotted)) return true;
        }
    }

    if (IPV4_DOTTED_QUAD_RE.test(h) && isPrivateIpv4(h)) return true;

    const groups = parseIpv6Groups(h);
    if (groups && isPrivateIpv6(groups)) return true;

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
