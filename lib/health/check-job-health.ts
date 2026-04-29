/**
 * High-level job-health decision.
 *
 * Combines an HTTP probe with soft-404 detection to produce a single
 * decision per job. The legacy `isLinkAlive` collapsed everything into a
 * boolean; this returns a `reason` so we can surface why a job was killed,
 * audit FP rates per reason, and stay conservative on inconclusive signals.
 */

import { probeUrl, type ProbeResult } from './probe';
import { detectSoft404, type SoftMatch, SOFT_404_CHECKER_VERSION } from './soft-404-detector';

export type HealthReason =
    | 'alive_2xx'
    | 'http_404'
    | 'http_410'
    | 'soft_404'
    | 'inconclusive_403'
    | 'inconclusive_429'
    | 'inconclusive_5xx'
    | 'inconclusive_3xx_loop'
    | 'inconclusive_network'
    | 'inconclusive_other';

export interface HealthEvidence {
    finalStatus: number | null;
    finalUrl: string;
    redirectHops: number;
    softMatch: SoftMatch | null;
    elapsedMs: number;
    errorKind: ProbeResult['errorKind'];
    errorMessage: string | null;
    checkerVersion: string;
}

export interface HealthDecision {
    /** True when the job is verified alive OR signal is inconclusive (conservative). */
    alive: boolean;
    /** Specific reason for the decision. */
    reason: HealthReason;
    evidence: HealthEvidence;
}

/**
 * Sources for which we always fetch the response body so soft-404 detection
 * can run. The probe diagnostic on 2026-04-29 showed Greenhouse, Adzuna,
 * JSearch and Fantastic-jobs-db return 200 OK on closed listings.
 *
 * Default policy: include any external source. Only excluded when we know
 * body fetch is wasted (e.g. blanket-403 sources where we never see 2xx).
 */
const SOURCES_NEVER_NEED_BODY = new Set<string>([
    // None for now — leaving the structure in case we later prove a source
    // is incapable of soft-404 (e.g. Jooble where 403 is universal).
]);

export interface CheckJobHealthOptions {
    /** Override probe options (mostly used in tests). */
    probeImpl?: typeof probeUrl;
    /** Override timeout / redirect caps. */
    timeoutMs?: number;
    maxRedirects?: number;
}

export async function checkJobHealth(
    applyUrl: string,
    sourceProvider: string | null,
    options: CheckJobHealthOptions = {},
): Promise<HealthDecision> {
    const { probeImpl = probeUrl, timeoutMs, maxRedirects } = options;

    const sourceKey = sourceProvider?.toLowerCase() ?? null;
    const fetchBody = sourceKey === null || !SOURCES_NEVER_NEED_BODY.has(sourceKey);

    const probe = await probeImpl(applyUrl, { fetchBody, timeoutMs, maxRedirects });

    return decide(probe, sourceProvider);
}

/**
 * Pure decision function. Exported for tests.
 *
 * Decision policy (conservative — never kill on a single ambiguous signal):
 *   - 404 / 410 → dead
 *   - 200 with soft-404 match → dead
 *   - 200 without soft-404 → alive
 *   - 403 / 429 / 5xx / network / timeout → alive (inconclusive — could be
 *     bot block or transient outage; let the next run try again)
 *   - 3xx loop or too many redirects → alive (inconclusive)
 *
 * False-positive guard: we never call something dead based purely on a body
 * pattern match without also seeing 2xx — i.e. we will not declare a job
 * dead when the probe failed before reading the body.
 */
export function decide(probe: ProbeResult, sourceProvider: string | null): HealthDecision {
    const evidenceBase: HealthEvidence = {
        finalStatus: probe.finalStatus,
        finalUrl: probe.finalUrl,
        redirectHops: probe.redirectHops,
        softMatch: null,
        elapsedMs: probe.elapsedMs,
        errorKind: probe.errorKind,
        errorMessage: probe.errorMessage,
        checkerVersion: SOFT_404_CHECKER_VERSION,
    };

    // 1. Probe-level errors
    if (probe.errorKind === 'too_many_redirects') {
        return { alive: true, reason: 'inconclusive_3xx_loop', evidence: evidenceBase };
    }
    if (probe.errorKind === 'timeout' || probe.errorKind === 'network' || probe.errorKind === 'bad_redirect_target') {
        return { alive: true, reason: 'inconclusive_network', evidence: evidenceBase };
    }

    const status = probe.finalStatus;
    if (status === null) {
        return { alive: true, reason: 'inconclusive_other', evidence: evidenceBase };
    }

    // 2. Hard-dead statuses
    if (status === 404) return { alive: false, reason: 'http_404', evidence: evidenceBase };
    if (status === 410) return { alive: false, reason: 'http_410', evidence: evidenceBase };

    // 3. Inconclusive statuses
    if (status === 403) return { alive: true, reason: 'inconclusive_403', evidence: evidenceBase };
    if (status === 429) return { alive: true, reason: 'inconclusive_429', evidence: evidenceBase };
    if (status >= 500) return { alive: true, reason: 'inconclusive_5xx', evidence: evidenceBase };

    // 4. 2xx — check for soft-404
    if (status >= 200 && status < 300) {
        const softMatch = detectSoft404(sourceProvider, probe.finalUrl, probe.bodyHtml);
        if (softMatch) {
            return {
                alive: false,
                reason: 'soft_404',
                evidence: { ...evidenceBase, softMatch },
            };
        }
        return { alive: true, reason: 'alive_2xx', evidence: evidenceBase };
    }

    // 5. 3xx with no Location, 4xx other than 404/410, etc — stay conservative.
    return { alive: true, reason: 'inconclusive_other', evidence: evidenceBase };
}
