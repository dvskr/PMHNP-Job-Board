export { probeUrl, type ProbeResult, type ProbeOptions, type RedirectHop, type ProbeErrorKind } from './probe';
export { detectSoft404, listPatterns, SOFT_404_CHECKER_VERSION, type SoftMatch } from './soft-404-detector';
export {
    checkJobHealth,
    decide,
    type HealthDecision,
    type HealthReason,
    type HealthEvidence,
    type CheckJobHealthOptions,
} from './check-job-health';
export {
    parseGreenhouseExternalId,
    parseGreenhouseApplyUrl,
    resolveGreenhouseRef,
    probeGreenhouseApi,
    type GreenhouseRef,
    type GreenhouseProbeResult,
    type GreenhouseProbeStatus,
    type GreenhouseProbeReason,
} from './probes/greenhouse-api';
export {
    recordSourcePresence,
    loadHistoricalAvgFetched,
    computePresenceDiff,
    PRESENCE_CHECKER_VERSION,
    DEFAULT_MIN_FETCH_RATIO,
    DEFAULT_MAX_UPDATES_PER_RUN,
    type PresenceCheckInput,
    type PresenceCheckResult,
    type PresenceCheckOutcome,
} from './source-presence';
