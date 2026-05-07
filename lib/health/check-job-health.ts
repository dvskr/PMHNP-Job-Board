/**
 * High-level job-health decision.
 *
 * Combines source-specific direct-API probes (when available) with the
 * generic HTTP probe + soft-404 detector to produce a single decision per
 * job. The legacy `isLinkAlive` collapsed everything into a boolean; this
 * returns a `reason` so we can surface why a job was killed, audit FP rates
 * per reason, and stay conservative on inconclusive signals.
 */

import { probeUrl, type ProbeResult } from './probe';
import { detectSoft404, type SoftMatch, SOFT_404_CHECKER_VERSION } from './soft-404-detector';
import { probeGreenhouseApi, resolveGreenhouseRef, type GreenhouseProbeResult } from './probes/greenhouse-api';
import { probeLeverApi, resolveLeverRef, type LeverProbeResult } from './probes/lever-api';
import { probeSmartRecruitersApi, resolveSmartRecruitersRef, type SmartRecruitersProbeResult } from './probes/smartrecruiters-api';

export type HealthReason =
    | 'alive_2xx'
    | 'alive_greenhouse_api'
    | 'alive_lever_api'
    | 'alive_smartrecruiters_api'
    | 'http_404'
    | 'http_410'
    | 'soft_404'
    | 'greenhouse_api_404'
    | 'lever_api_404'
    | 'smartrecruiters_api_404'
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
    /** Set when a source-specific probe (e.g. greenhouse / lever / SR JSON API) was used. */
    sourceProbe: {
        kind: 'greenhouse_api';
        apiUrl: string | null;
        httpStatus: number | null;
        reason: GreenhouseProbeResult['reason'];
    } | {
        kind: 'lever_api';
        apiUrl: string | null;
        httpStatus: number | null;
        reason: LeverProbeResult['reason'];
    } | {
        kind: 'smartrecruiters_api';
        apiUrl: string | null;
        httpStatus: number | null;
        reason: SmartRecruitersProbeResult['reason'];
    } | null;
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
 */
const SOURCES_NEVER_NEED_BODY = new Set<string>([
    // None for now — leaving the structure in case we later prove a source
    // is incapable of soft-404 (e.g. Jooble where 403 is universal).
]);

/**
 * Hosts that consistently return 403 to anonymous probes despite the
 * underlying job listing being alive (anti-scraper protection on the
 * search/redirect wrapper). Probing them just produces inconclusive_403
 * noise — same outcome as not probing at all.
 *
 * Distribution from the 2026-05-06 prod audit: 86% of all weekly
 * inconclusive_403 outcomes came from just 2 hosts (jooble.org +
 * www.adzuna.com). Skipping them entirely shaves ~7k probe calls/week
 * with no change in dead-job detection.
 *
 * GAP G2 trade-off (Dead-detection blind spot, 2026-05-06): for sources in
 * this list that are ALSO our active sources (currently: adzuna), we lose
 * the HTTP-probe layer of dead detection. A bypassed adzuna posting that
 * silently goes dead will be caught by:
 *   1. Source-presence (when its externalId is missing from N consecutive
 *      adzuna fetches → unpublish via /api/cron/source-presence-unpublish).
 *      Detection latency: N × 12h ≈ 36h with the current 3-miss threshold.
 *   2. Engagement-anomaly cron (when it accumulates views with zero apply
 *      clicks for ≥14 days → /api/cron/engagement-anomaly).
 * Acceptable as long as we monitor both. If the latency becomes a problem,
 * we'd need to register a paid Adzuna app key that the probe could attach
 * for an authenticated request (no current contract for that).
 */
const KNOWN_403_HOSTS: ReadonlySet<string> = new Set([
    'jooble.org',
    'www.jooble.org',
    'adzuna.com',
    'www.adzuna.com',
    'ziprecruiter.com',
    'www.ziprecruiter.com',
    'tealhq.com',
    'www.tealhq.com',
]);

function isKnown403Host(applyUrl: string): boolean {
    try {
        return KNOWN_403_HOSTS.has(new URL(applyUrl).hostname.toLowerCase());
    } catch {
        return false;
    }
}

export interface CheckJobHealthOptions {
    /** Override probe options (mostly used in tests). */
    probeImpl?: typeof probeUrl;
    /** Override the greenhouse-API probe (tests). */
    greenhouseProbeImpl?: (
        ref: { boardSlug: string; jobId: string },
    ) => Promise<GreenhouseProbeResult>;
    /** Override the lever-API probe (tests). */
    leverProbeImpl?: (
        ref: { companySlug: string; postingId: string },
    ) => Promise<LeverProbeResult>;
    /** Override the SmartRecruiters-API probe (tests). */
    smartRecruitersProbeImpl?: (
        ref: { companySlug: string; postingId: string },
    ) => Promise<SmartRecruitersProbeResult>;
    /** Override timeout / redirect caps. */
    timeoutMs?: number;
    maxRedirects?: number;
    /**
     * Authoritative source-supplied identifier for the job. Used by the
     * greenhouse-API probe to decode the (boardSlug, jobId) pair.
     */
    externalId?: string | null;
}

export async function checkJobHealth(
    applyUrl: string,
    sourceProvider: string | null,
    options: CheckJobHealthOptions = {},
): Promise<HealthDecision> {
    const {
        probeImpl = probeUrl,
        greenhouseProbeImpl = probeGreenhouseApi,
        leverProbeImpl = probeLeverApi,
        smartRecruitersProbeImpl = probeSmartRecruitersApi,
        timeoutMs,
        maxRedirects,
        externalId,
    } = options;

    const sourceKey = sourceProvider?.toLowerCase() ?? null;

    // 1. Source-specific direct-API probe (preferred when available).
    if (sourceKey === 'greenhouse') {
        const ref = resolveGreenhouseRef(applyUrl, externalId);
        if (ref) {
            const apiResult = await greenhouseProbeImpl(ref);
            if (apiResult.status === 'dead') return decisionFromGreenhouseApi(apiResult, /*alive*/ false);
            if (apiResult.status === 'alive') return decisionFromGreenhouseApi(apiResult, /*alive*/ true);
            // 'unknown' falls through to the generic probe below.
        }
    } else if (sourceKey === 'lever') {
        const ref = resolveLeverRef(applyUrl, externalId);
        if (ref) {
            const apiResult = await leverProbeImpl(ref);
            if (apiResult.status === 'dead') return decisionFromLeverApi(apiResult, /*alive*/ false);
            if (apiResult.status === 'alive') return decisionFromLeverApi(apiResult, /*alive*/ true);
            // 'unknown' falls through.
        }
    } else if (sourceKey === 'smartrecruiters') {
        const ref = resolveSmartRecruitersRef(applyUrl, externalId);
        if (ref) {
            const apiResult = await smartRecruitersProbeImpl(ref);
            if (apiResult.status === 'dead') return decisionFromSmartRecruitersApi(apiResult, /*alive*/ false);
            if (apiResult.status === 'alive') return decisionFromSmartRecruitersApi(apiResult, /*alive*/ true);
            // 'unknown' falls through.
        }
    }

    // 2. Known-403 host bypass — return inconclusive_403 directly without
    //    probing. Same downstream effect (treated as alive, dead-link cron
    //    re-probes later if voted) but saves the network roundtrip.
    if (isKnown403Host(applyUrl)) {
        return {
            alive: true,
            reason: 'inconclusive_403',
            evidence: {
                finalStatus: 403,
                finalUrl: applyUrl,
                redirectHops: 0,
                softMatch: null,
                elapsedMs: 0,
                errorKind: null,
                errorMessage: 'skipped: known-403 host',
                checkerVersion: SOFT_404_CHECKER_VERSION,
                sourceProbe: null,
            },
        };
    }

    // 3. Generic HTTP probe + soft-404 detection.
    const fetchBody = sourceKey === null || !SOURCES_NEVER_NEED_BODY.has(sourceKey);
    const probe = await probeImpl(applyUrl, { fetchBody, timeoutMs, maxRedirects });
    return decide(probe, sourceProvider);
}

function decisionFromGreenhouseApi(result: GreenhouseProbeResult, alive: boolean): HealthDecision {
    return {
        alive,
        reason: alive ? 'alive_greenhouse_api' : 'greenhouse_api_404',
        evidence: {
            finalStatus: result.httpStatus,
            finalUrl: result.apiUrl ?? '',
            redirectHops: 0,
            softMatch: null,
            elapsedMs: result.elapsedMs,
            errorKind: null,
            errorMessage: result.errorMessage,
            checkerVersion: SOFT_404_CHECKER_VERSION,
            sourceProbe: {
                kind: 'greenhouse_api',
                apiUrl: result.apiUrl,
                httpStatus: result.httpStatus,
                reason: result.reason,
            },
        },
    };
}

function decisionFromLeverApi(result: LeverProbeResult, alive: boolean): HealthDecision {
    return {
        alive,
        reason: alive ? 'alive_lever_api' : 'lever_api_404',
        evidence: {
            finalStatus: result.httpStatus,
            finalUrl: result.apiUrl ?? '',
            redirectHops: 0,
            softMatch: null,
            elapsedMs: result.elapsedMs,
            errorKind: null,
            errorMessage: result.errorMessage,
            checkerVersion: SOFT_404_CHECKER_VERSION,
            sourceProbe: {
                kind: 'lever_api',
                apiUrl: result.apiUrl,
                httpStatus: result.httpStatus,
                reason: result.reason,
            },
        },
    };
}

function decisionFromSmartRecruitersApi(result: SmartRecruitersProbeResult, alive: boolean): HealthDecision {
    return {
        alive,
        reason: alive ? 'alive_smartrecruiters_api' : 'smartrecruiters_api_404',
        evidence: {
            finalStatus: result.httpStatus,
            finalUrl: result.apiUrl ?? '',
            redirectHops: 0,
            softMatch: null,
            elapsedMs: result.elapsedMs,
            errorKind: null,
            errorMessage: result.errorMessage,
            checkerVersion: SOFT_404_CHECKER_VERSION,
            sourceProbe: {
                kind: 'smartrecruiters_api',
                apiUrl: result.apiUrl,
                httpStatus: result.httpStatus,
                reason: result.reason,
            },
        },
    };
}

/**
 * Pure decision function over a generic ProbeResult. Exported for tests.
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
        sourceProbe: null,
    };

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

    if (status === 404) return { alive: false, reason: 'http_404', evidence: evidenceBase };
    if (status === 410) return { alive: false, reason: 'http_410', evidence: evidenceBase };

    if (status === 403) return { alive: true, reason: 'inconclusive_403', evidence: evidenceBase };
    if (status === 429) return { alive: true, reason: 'inconclusive_429', evidence: evidenceBase };
    if (status >= 500) return { alive: true, reason: 'inconclusive_5xx', evidence: evidenceBase };

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

    return { alive: true, reason: 'inconclusive_other', evidence: evidenceBase };
}
