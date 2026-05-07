/**
 * Lever direct-API health probe.
 *
 * Lever exposes a per-posting JSON API at
 *   https://api.lever.co/v0/postings/<companySlug>/<postingId>
 * which returns:
 *   - 404 when the posting has been closed/deleted.
 *   - 200 + the canonical posting JSON when alive.
 *
 * Like the Greenhouse equivalent, this is much more reliable than
 * HTML-scraping the apply page because there's no soft-404 to detect
 * and the API is public + stable.
 *
 * Two apply-link shapes are supported:
 *   1. https://jobs.lever.co/<slug>/<postingId>
 *   2. https://jobs.eu.lever.co/<slug>/<postingId>
 *
 * external_id schema convention: "lever-<companySlug>-<postingId>".
 * companySlug may contain hyphens (e.g. "seven-starling"), and postingId
 * is a UUID (also hyphen-rich), so we cannot split by '-'. We anchor
 * the parser on the trailing UUID format.
 */

const LEVER_API_BASE = 'https://api.lever.co/v0/postings';
const DEFAULT_TIMEOUT_MS = 8_000;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export type LeverProbeStatus = 'alive' | 'dead' | 'unknown';
export type LeverProbeReason =
    | 'api_404'
    | 'api_200'
    | 'api_unreachable'
    | 'parse_failed';

export interface LeverRef {
    companySlug: string;
    postingId: string;
}

export interface LeverProbeResult {
    status: LeverProbeStatus;
    reason: LeverProbeReason;
    apiUrl: string | null;
    httpStatus: number | null;
    elapsedMs: number;
    errorMessage: string | null;
}

export interface LeverProbeOptions {
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
}

/**
 * Parse a Lever external_id.
 *
 * Convention: "lever-<companySlug>-<postingUuid>". Both slug and UUID
 * may contain hyphens, so we extract the UUID via regex and treat
 * everything between "lever-" and the UUID as the slug.
 */
export function parseLeverExternalId(externalId: string | null | undefined): LeverRef | null {
    if (!externalId) return null;
    if (!externalId.startsWith('lever-')) return null;
    const uuidMatch = externalId.match(UUID_RE);
    if (!uuidMatch) return null;
    const postingId = uuidMatch[0];
    const slugEnd = externalId.lastIndexOf('-' + postingId);
    if (slugEnd <= 'lever-'.length) return null;
    const companySlug = externalId.slice('lever-'.length, slugEnd);
    if (!companySlug) return null;
    return { companySlug, postingId };
}

/**
 * Parse a Lever apply URL into a (companySlug, postingId).
 */
export function parseLeverApplyUrl(applyUrl: string): LeverRef | null {
    const m = applyUrl.match(/jobs(?:\.eu)?\.lever\.co\/([^/]+)\/([0-9a-f-]{36})/i);
    if (!m) return null;
    if (!UUID_RE.test(m[2])) return null;
    return { companySlug: m[1], postingId: m[2] };
}

/**
 * Resolve a (companySlug, postingId) for a Lever-sourced job. Prefers
 * external_id, falls back to URL parsing.
 */
export function resolveLeverRef(
    applyUrl: string,
    externalId: string | null | undefined,
): LeverRef | null {
    return parseLeverExternalId(externalId) ?? parseLeverApplyUrl(applyUrl);
}

/**
 * Probe the Lever JSON API for a posting ref.
 *
 * Decision rules:
 *   - 200 → alive
 *   - 404 → dead
 *   - 5xx / 429 / network / timeout → unknown (caller falls back)
 *   - other 4xx → unknown (could be transient tenant config issue)
 */
export async function probeLeverApi(
    ref: LeverRef,
    options: LeverProbeOptions = {},
): Promise<LeverProbeResult> {
    const { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch } = options;
    const apiUrl = `${LEVER_API_BASE}/${encodeURIComponent(ref.companySlug)}/${encodeURIComponent(ref.postingId)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();

    try {
        const res = await fetchImpl(apiUrl, {
            method: 'GET',
            signal: controller.signal,
            headers: { Accept: 'application/json' },
        });
        const elapsedMs = Date.now() - startedAt;

        if (res.status === 404) {
            return {
                status: 'dead',
                reason: 'api_404',
                apiUrl,
                httpStatus: 404,
                elapsedMs,
                errorMessage: null,
            };
        }
        if (res.status === 200) {
            return {
                status: 'alive',
                reason: 'api_200',
                apiUrl,
                httpStatus: 200,
                elapsedMs,
                errorMessage: null,
            };
        }
        return {
            status: 'unknown',
            reason: 'api_unreachable',
            apiUrl,
            httpStatus: res.status,
            elapsedMs,
            errorMessage: `HTTP ${res.status}`,
        };
    } catch (err: unknown) {
        return {
            status: 'unknown',
            reason: 'api_unreachable',
            apiUrl,
            httpStatus: null,
            elapsedMs: Date.now() - startedAt,
            errorMessage: err instanceof Error ? err.message : String(err),
        };
    } finally {
        clearTimeout(timer);
    }
}
