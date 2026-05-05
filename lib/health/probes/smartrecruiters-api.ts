/**
 * SmartRecruiters direct-API health probe.
 *
 * SmartRecruiters exposes a per-posting JSON API at
 *   https://api.smartrecruiters.com/v1/companies/<companySlug>/postings/<postingId>
 * which returns:
 *   - 404 when the posting has been closed/deleted.
 *   - 200 + the canonical posting JSON when alive.
 *
 * external_id schema convention: "smartrecruiters-<companySlug>-<postingId>".
 * companySlug can contain hyphens (rare for SR — most are single-word),
 * postingId is numeric. We anchor on the trailing all-digit segment.
 */

const SR_API_BASE = 'https://api.smartrecruiters.com/v1/companies';
const DEFAULT_TIMEOUT_MS = 8_000;

export type SmartRecruitersProbeStatus = 'alive' | 'dead' | 'unknown';
export type SmartRecruitersProbeReason =
    | 'api_404'
    | 'api_200'
    | 'api_unreachable'
    | 'parse_failed';

export interface SmartRecruitersRef {
    companySlug: string;
    postingId: string;
}

export interface SmartRecruitersProbeResult {
    status: SmartRecruitersProbeStatus;
    reason: SmartRecruitersProbeReason;
    apiUrl: string | null;
    httpStatus: number | null;
    elapsedMs: number;
    errorMessage: string | null;
}

export interface SmartRecruitersProbeOptions {
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
}

/**
 * Parse a SmartRecruiters external_id.
 *
 * Convention: "smartrecruiters-<companySlug>-<numericPostingId>".
 * Slug can contain hyphens, so anchor on the trailing digit run.
 */
export function parseSmartRecruitersExternalId(
    externalId: string | null | undefined,
): SmartRecruitersRef | null {
    if (!externalId) return null;
    const m = externalId.match(/^smartrecruiters-(.+)-(\d+)$/);
    if (!m) return null;
    return { companySlug: m[1], postingId: m[2] };
}

/**
 * Parse a SmartRecruiters apply URL.
 *   https://jobs.smartrecruiters.com/<slug>/<postingId>
 */
export function parseSmartRecruitersApplyUrl(applyUrl: string): SmartRecruitersRef | null {
    const m = applyUrl.match(/jobs\.smartrecruiters\.com\/([^/]+)\/(\d+)/);
    if (!m) return null;
    return { companySlug: m[1], postingId: m[2] };
}

export function resolveSmartRecruitersRef(
    applyUrl: string,
    externalId: string | null | undefined,
): SmartRecruitersRef | null {
    return parseSmartRecruitersExternalId(externalId) ?? parseSmartRecruitersApplyUrl(applyUrl);
}

/**
 * Probe the SmartRecruiters JSON API for a posting ref.
 *   - 200 → alive
 *   - 404 → dead
 *   - 5xx / 429 / network / timeout → unknown
 */
export async function probeSmartRecruitersApi(
    ref: SmartRecruitersRef,
    options: SmartRecruitersProbeOptions = {},
): Promise<SmartRecruitersProbeResult> {
    const { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch } = options;
    const apiUrl = `${SR_API_BASE}/${encodeURIComponent(ref.companySlug)}/postings/${encodeURIComponent(ref.postingId)}`;

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
