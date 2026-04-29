/**
 * Greenhouse direct-API health probe.
 *
 * Greenhouse exposes a per-board JSON API at
 *   https://boards-api.greenhouse.io/v1/boards/<boardSlug>/jobs/<jobId>
 * which returns:
 *   - 404 + { "error": "Job not found" } when the listing is closed.
 *   - 200 + the canonical job JSON when alive.
 *
 * This is dramatically more reliable than HTML scraping because:
 *   1. There is no soft-404 to detect.
 *   2. There is no bot-block — the API is public and stable.
 *   3. The signal applies even when the apply_link is a third-party
 *      careers page wrapping a `gh_jid` query parameter.
 *
 * Three apply-link shapes are supported:
 *   1. https://job-boards.greenhouse.io/<slug>/jobs/<id>
 *   2. https://boards.greenhouse.io/<slug>/jobs/<id>
 *   3. https://<company>.com/careers?gh_jid=<id> — slug must come from external_id.
 *
 * `external_id` is the authoritative source when available. Schema convention:
 *   external_id = "greenhouse-<boardSlug>-<numericJobId>"
 */

const GREENHOUSE_API_BASE = 'https://boards-api.greenhouse.io/v1/boards';
const DEFAULT_TIMEOUT_MS = 8_000;

export type GreenhouseProbeStatus = 'alive' | 'dead' | 'unknown';
export type GreenhouseProbeReason =
    | 'api_404'
    | 'api_200'
    | 'api_unreachable'
    | 'parse_failed';

export interface GreenhouseRef {
    boardSlug: string;
    jobId: string;
}

export interface GreenhouseProbeResult {
    status: GreenhouseProbeStatus;
    reason: GreenhouseProbeReason;
    apiUrl: string | null;
    httpStatus: number | null;
    elapsedMs: number;
    errorMessage: string | null;
}

export interface GreenhouseProbeOptions {
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
}

/**
 * Parse a Greenhouse external_id.
 *
 * Convention: "greenhouse-<boardSlug>-<numericJobId>". boardSlug may itself
 * contain hyphens (e.g. "blue-sky-telepsych"), so we anchor on the trailing
 * numeric ID.
 */
export function parseGreenhouseExternalId(externalId: string | null | undefined): GreenhouseRef | null {
    if (!externalId) return null;
    const m = externalId.match(/^greenhouse-(.+)-(\d+)$/);
    if (!m) return null;
    return { boardSlug: m[1], jobId: m[2] };
}

/**
 * Parse a Greenhouse apply URL into a (boardSlug, jobId).
 * Returns null if the URL cannot be unambiguously decoded (e.g. embedded
 * gh_jid without a known slug — caller should fall back to external_id).
 */
export function parseGreenhouseApplyUrl(applyUrl: string): GreenhouseRef | null {
    // Pattern 1+2: direct boards URL
    const direct = applyUrl.match(/(?:job-boards|boards)\.greenhouse\.io\/([\w-]+)\/jobs\/(\d+)/);
    if (direct) return { boardSlug: direct[1], jobId: direct[2] };

    // Pattern 3: gh_jid query param — slug not recoverable from URL.
    return null;
}

/**
 * Resolve a (boardSlug, jobId) for a Greenhouse-sourced job.
 * Prefers external_id, falls back to URL parsing.
 */
export function resolveGreenhouseRef(
    applyUrl: string,
    externalId: string | null | undefined,
): GreenhouseRef | null {
    return parseGreenhouseExternalId(externalId) ?? parseGreenhouseApplyUrl(applyUrl);
}

/**
 * Probe the Greenhouse JSON API for a job ref.
 *
 * Decision rules:
 *   - 200 → alive
 *   - 404 → dead
 *   - 5xx / 429 / network / timeout → unknown (caller should fall back)
 *   - other 4xx → unknown (could be tenant-level config; do not flip dead)
 */
export async function probeGreenhouseApi(
    ref: GreenhouseRef,
    options: GreenhouseProbeOptions = {},
): Promise<GreenhouseProbeResult> {
    const { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch } = options;
    const apiUrl = `${GREENHOUSE_API_BASE}/${encodeURIComponent(ref.boardSlug)}/jobs/${encodeURIComponent(ref.jobId)}`;
    const start = Date.now();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetchImpl(apiUrl, {
            method: 'GET',
            redirect: 'manual',
            headers: { 'Accept': 'application/json' },
            signal: controller.signal,
        });
        clearTimeout(timer);

        if (res.status === 200) {
            return {
                status: 'alive',
                reason: 'api_200',
                apiUrl,
                httpStatus: 200,
                elapsedMs: Date.now() - start,
                errorMessage: null,
            };
        }
        if (res.status === 404) {
            return {
                status: 'dead',
                reason: 'api_404',
                apiUrl,
                httpStatus: 404,
                elapsedMs: Date.now() - start,
                errorMessage: null,
            };
        }
        return {
            status: 'unknown',
            reason: 'api_unreachable',
            apiUrl,
            httpStatus: res.status,
            elapsedMs: Date.now() - start,
            errorMessage: `unexpected status ${res.status}`,
        };
    } catch (err: unknown) {
        clearTimeout(timer);
        const isTimeout = err instanceof Error && err.name === 'AbortError';
        return {
            status: 'unknown',
            reason: 'api_unreachable',
            apiUrl,
            httpStatus: null,
            elapsedMs: Date.now() - start,
            errorMessage: isTimeout ? 'timeout' : (err instanceof Error ? err.message : String(err)),
        };
    }
}
