/**
 * Daily anomaly detector for the job-health system.
 *
 * Reads the last 24h of `job_health_checks` and compares against the
 * preceding 7 days to surface "something looks weird" events:
 *
 *   - Dead rate per source moved > N standard deviations above baseline
 *     (e.g. Greenhouse-API outage misclassifying alive jobs as 404).
 *   - Soft-404 pattern volume spiked > 5× baseline (a new pattern is
 *     over-firing on legitimate content).
 *   - Per-source presence-skip rate jumped from ~0 to > 80% for 3+ days
 *     (the source is broken; presence updates are paused but no alert
 *     surfaces it elsewhere).
 *   - Total daily flips (unpublishes from any path) > N×baseline.
 *
 * Each anomaly is emitted as a structured-logger warning AND a Sentry
 * captureMessage at level=warning, so both Vercel logs and Sentry alerts
 * see the event. Thresholds are conservative defaults — bump
 * `JOB_HEALTH_ANOMALY_*` env vars to tune after observing 1-2 weeks of
 * real production data.
 */

import type { PrismaClient } from '@prisma/client';
import { logger } from '@/lib/logger';

/** Bump if the detection logic or thresholds change. */
export const ANOMALY_DETECTOR_VERSION = 'v1.0.0';

/** Default thresholds — overridable via env. */
const DEFAULTS = {
    DEAD_RATE_SIGMA_MULTIPLE: 3,
    SOFT_PATTERN_VOLUME_MULTIPLE: 5,
    PRESENCE_SKIP_PCT_THRESHOLD: 80,
    FLIP_VOLUME_MULTIPLE: 4,
} as const;

export type AnomalyCategory =
    | 'dead_rate_spike_per_source'
    | 'soft_pattern_volume_spike'
    | 'presence_skip_rate_high'
    | 'total_flip_volume_spike';

export type AnomalySeverity = 'warning' | 'critical';

export interface AnomalyEvent {
    category: AnomalyCategory;
    severity: AnomalySeverity;
    /** Human-readable one-line summary (used for log message + Sentry title). */
    summary: string;
    /** Identifier for grouping in Sentry (`category:source` or `category:pattern`). */
    fingerprint: string;
    metrics: {
        current: number;
        baseline: number;
        ratio?: number;
        zScore?: number;
    };
    extra: Record<string, unknown>;
    detectorVersion: string;
}

interface ThresholdConfig {
    deadRateSigma: number;
    softPatternMultiple: number;
    presenceSkipPct: number;
    flipVolumeMultiple: number;
}

function loadThresholds(): ThresholdConfig {
    return {
        deadRateSigma: parsePositive(
            process.env.JOB_HEALTH_ANOMALY_DEAD_SIGMA,
            DEFAULTS.DEAD_RATE_SIGMA_MULTIPLE,
        ),
        softPatternMultiple: parsePositive(
            process.env.JOB_HEALTH_ANOMALY_SOFT_MULT,
            DEFAULTS.SOFT_PATTERN_VOLUME_MULTIPLE,
        ),
        presenceSkipPct: parsePositive(
            process.env.JOB_HEALTH_ANOMALY_SKIP_PCT,
            DEFAULTS.PRESENCE_SKIP_PCT_THRESHOLD,
        ),
        flipVolumeMultiple: parsePositive(
            process.env.JOB_HEALTH_ANOMALY_FLIP_MULT,
            DEFAULTS.FLIP_VOLUME_MULTIPLE,
        ),
    };
}

function parsePositive(raw: string | undefined, fallback: number): number {
    if (!raw) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

export interface AnomalyDetectionInput {
    prisma: PrismaClient;
    /** Override now() for tests. */
    nowMs?: number;
    /** Override threshold config (tests). */
    thresholds?: ThresholdConfig;
}

export interface AnomalyDetectionResult {
    detectorVersion: string;
    windowEndedAt: string;
    anomalies: AnomalyEvent[];
    countersAnalyzed: {
        deadBySource24h: number;
        softPatterns24h: number;
        presenceRuns24h: number;
        totalFlips24h: number;
    };
}

/**
 * Detect anomalies by comparing the last 24h to the 7-day baseline.
 * Returns the detected events but does not emit them — caller emits via
 * `emitAnomaly()` so test runs don't accidentally fire Sentry alerts.
 */
export async function detectAnomalies(
    input: AnomalyDetectionInput,
): Promise<AnomalyDetectionResult> {
    const now = input.nowMs ?? Date.now();
    const thresholds = input.thresholds ?? loadThresholds();
    const log = logger.withContext({ component: 'anomaly-detector' });

    const last24hStart = new Date(now - 24 * 60 * 60 * 1000);
    const baselineStart = new Date(now - 8 * 24 * 60 * 60 * 1000);
    const baselineEnd = last24hStart;

    const anomalies: AnomalyEvent[] = [];
    const counters = {
        deadBySource24h: 0,
        softPatterns24h: 0,
        presenceRuns24h: 0,
        totalFlips24h: 0,
    };

    // 1. Dead-rate spike per source — group by source_provider, compare
    //    24h dead count to the per-day mean+stddev of the baseline window.
    try {
        const deadAnomalies = await detectDeadRateSpikes(
            input.prisma,
            last24hStart,
            baselineStart,
            baselineEnd,
            thresholds.deadRateSigma,
        );
        counters.deadBySource24h = deadAnomalies.totalCurrentRows;
        anomalies.push(...deadAnomalies.events);
    } catch (err: unknown) {
        log.warn('detectDeadRateSpikes failed (non-fatal)', { err: errMsg(err) });
    }

    // 2. Soft-404 pattern volume spike — per pattern_id.
    try {
        const softAnomalies = await detectSoftPatternSpikes(
            input.prisma,
            last24hStart,
            baselineStart,
            baselineEnd,
            thresholds.softPatternMultiple,
        );
        counters.softPatterns24h = softAnomalies.totalCurrentRows;
        anomalies.push(...softAnomalies.events);
    } catch (err: unknown) {
        log.warn('detectSoftPatternSpikes failed (non-fatal)', { err: errMsg(err) });
    }

    // 3. Per-source presence-skip rate.
    try {
        const skipAnomalies = await detectPresenceSkipSpikes(
            input.prisma,
            last24hStart,
            thresholds.presenceSkipPct,
        );
        counters.presenceRuns24h = skipAnomalies.totalRuns;
        anomalies.push(...skipAnomalies.events);
    } catch (err: unknown) {
        log.warn('detectPresenceSkipSpikes failed (non-fatal)', { err: errMsg(err) });
    }

    // 4. Total flip volume — sanity check across all sources / paths.
    try {
        const flipAnomaly = await detectTotalFlipVolumeSpike(
            input.prisma,
            last24hStart,
            baselineStart,
            baselineEnd,
            thresholds.flipVolumeMultiple,
        );
        counters.totalFlips24h = flipAnomaly.currentTotal;
        if (flipAnomaly.event) anomalies.push(flipAnomaly.event);
    } catch (err: unknown) {
        log.warn('detectTotalFlipVolumeSpike failed (non-fatal)', { err: errMsg(err) });
    }

    return {
        detectorVersion: ANOMALY_DETECTOR_VERSION,
        windowEndedAt: new Date(now).toISOString(),
        anomalies,
        countersAnalyzed: counters,
    };
}

interface SourceDeadCountRow { source_provider: string | null; cnt: bigint }
interface BaselineRow { day: Date; source_provider: string | null; cnt: bigint }
interface PatternRow { soft_pattern_id: string | null; cnt: bigint }
interface PatternBaselineRow { day: Date; soft_pattern_id: string | null; cnt: bigint }
interface PresenceRunRow {
    presence_source: string | null;
    total: bigint;
    skipped: bigint;
}
interface TotalFlipsRow { cnt: bigint }
interface BaselineFlipsRow { day: Date; cnt: bigint }

async function detectDeadRateSpikes(
    prisma: PrismaClient,
    last24hStart: Date,
    baselineStart: Date,
    baselineEnd: Date,
    sigmaMultiple: number,
): Promise<{ totalCurrentRows: number; events: AnomalyEvent[] }> {
    // Current 24h dead count per source.
    const current = await prisma.$queryRaw<SourceDeadCountRow[]>`
        SELECT j.source_provider, COUNT(*)::bigint AS cnt
        FROM job_health_checks c
        JOIN jobs j ON j.id = c.job_id
        WHERE c.alive = false
          AND c.checked_at >= ${last24hStart}
        GROUP BY j.source_provider
    `;

    // 7-day baseline: per-day-per-source dead counts.
    const baseline = await prisma.$queryRaw<BaselineRow[]>`
        SELECT date_trunc('day', c.checked_at) AS day, j.source_provider,
               COUNT(*)::bigint AS cnt
        FROM job_health_checks c
        JOIN jobs j ON j.id = c.job_id
        WHERE c.alive = false
          AND c.checked_at >= ${baselineStart}
          AND c.checked_at < ${baselineEnd}
        GROUP BY 1, 2
    `;

    // Build per-source baseline stats.
    const perSourceBaseline = new Map<string, number[]>();
    for (const row of baseline) {
        const key = row.source_provider ?? '(null)';
        const arr = perSourceBaseline.get(key) ?? [];
        arr.push(Number(row.cnt));
        perSourceBaseline.set(key, arr);
    }

    const events: AnomalyEvent[] = [];
    let totalCurrentRows = 0;
    for (const row of current) {
        const cnt = Number(row.cnt);
        totalCurrentRows += cnt;
        const key = row.source_provider ?? '(null)';
        const series = perSourceBaseline.get(key) ?? [];
        const stats = stdStats(series);
        if (stats.n < 3) continue; // Not enough baseline.
        if (stats.stddev === 0) continue;
        const z = (cnt - stats.mean) / stats.stddev;
        if (z >= sigmaMultiple) {
            events.push({
                category: 'dead_rate_spike_per_source',
                severity: z >= sigmaMultiple * 2 ? 'critical' : 'warning',
                summary: `Dead rate for ${key} spiked: ${cnt} flips today vs baseline mean ${stats.mean.toFixed(1)} (z=${z.toFixed(2)})`,
                fingerprint: `dead_rate_spike_per_source:${key}`,
                metrics: { current: cnt, baseline: stats.mean, zScore: z },
                extra: { source: key, baselineSamples: stats.n, baselineStddev: stats.stddev },
                detectorVersion: ANOMALY_DETECTOR_VERSION,
            });
        }
    }
    return { totalCurrentRows, events };
}

async function detectSoftPatternSpikes(
    prisma: PrismaClient,
    last24hStart: Date,
    baselineStart: Date,
    baselineEnd: Date,
    multiple: number,
): Promise<{ totalCurrentRows: number; events: AnomalyEvent[] }> {
    const current = await prisma.$queryRaw<PatternRow[]>`
        SELECT soft_pattern_id, COUNT(*)::bigint AS cnt
        FROM job_health_checks
        WHERE outcome = 'soft_404'
          AND soft_pattern_id IS NOT NULL
          AND checked_at >= ${last24hStart}
        GROUP BY soft_pattern_id
    `;

    const baseline = await prisma.$queryRaw<PatternBaselineRow[]>`
        SELECT date_trunc('day', checked_at) AS day, soft_pattern_id,
               COUNT(*)::bigint AS cnt
        FROM job_health_checks
        WHERE outcome = 'soft_404'
          AND soft_pattern_id IS NOT NULL
          AND checked_at >= ${baselineStart}
          AND checked_at < ${baselineEnd}
        GROUP BY 1, 2
    `;

    const perPatternBaseline = new Map<string, number[]>();
    for (const row of baseline) {
        const key = row.soft_pattern_id ?? '(null)';
        const arr = perPatternBaseline.get(key) ?? [];
        arr.push(Number(row.cnt));
        perPatternBaseline.set(key, arr);
    }

    const events: AnomalyEvent[] = [];
    let totalCurrentRows = 0;
    for (const row of current) {
        const cnt = Number(row.cnt);
        totalCurrentRows += cnt;
        const key = row.soft_pattern_id ?? '(null)';
        const series = perPatternBaseline.get(key) ?? [];
        const stats = stdStats(series);
        if (stats.n < 3 || stats.mean === 0) continue;
        const ratio = cnt / stats.mean;
        if (ratio >= multiple) {
            events.push({
                category: 'soft_pattern_volume_spike',
                severity: ratio >= multiple * 2 ? 'critical' : 'warning',
                summary: `Soft-404 pattern '${key}' fired ${cnt}× in 24h vs baseline mean ${stats.mean.toFixed(1)} (${ratio.toFixed(1)}× spike)`,
                fingerprint: `soft_pattern_volume_spike:${key}`,
                metrics: { current: cnt, baseline: stats.mean, ratio },
                extra: { patternId: key, baselineSamples: stats.n },
                detectorVersion: ANOMALY_DETECTOR_VERSION,
            });
        }
    }
    return { totalCurrentRows, events };
}

async function detectPresenceSkipSpikes(
    prisma: PrismaClient,
    last24hStart: Date,
    pctThreshold: number,
): Promise<{ totalRuns: number; events: AnomalyEvent[] }> {
    const rows = await prisma.$queryRaw<PresenceRunRow[]>`
        SELECT presence_source,
               COUNT(*)::bigint AS total,
               COUNT(*) FILTER (WHERE outcome LIKE 'skipped_%')::bigint AS skipped
        FROM job_health_checks
        WHERE check_type = 'source_presence'
          AND checked_at >= ${last24hStart}
          AND presence_source IS NOT NULL
        GROUP BY presence_source
    `;

    const events: AnomalyEvent[] = [];
    let totalRuns = 0;
    for (const row of rows) {
        const total = Number(row.total);
        const skipped = Number(row.skipped);
        totalRuns += total;
        if (total < 2) continue;
        const skipPct = (skipped / total) * 100;
        if (skipPct >= pctThreshold) {
            const source = row.presence_source ?? '(null)';
            events.push({
                category: 'presence_skip_rate_high',
                severity: skipPct >= 95 ? 'critical' : 'warning',
                summary: `Presence-skip rate for ${source} is ${skipPct.toFixed(0)}% over last 24h (${skipped}/${total} runs skipped)`,
                fingerprint: `presence_skip_rate_high:${source}`,
                metrics: { current: skipPct, baseline: 0 },
                extra: { source, totalRuns: total, skippedRuns: skipped },
                detectorVersion: ANOMALY_DETECTOR_VERSION,
            });
        }
    }
    return { totalRuns, events };
}

async function detectTotalFlipVolumeSpike(
    prisma: PrismaClient,
    last24hStart: Date,
    baselineStart: Date,
    baselineEnd: Date,
    multiple: number,
): Promise<{ currentTotal: number; event: AnomalyEvent | null }> {
    const currentRow = await prisma.$queryRaw<TotalFlipsRow[]>`
        SELECT COUNT(*)::bigint AS cnt
        FROM job_health_checks
        WHERE alive = false
          AND checked_at >= ${last24hStart}
    `;
    const current = Number(currentRow[0]?.cnt ?? 0);

    const baseline = await prisma.$queryRaw<BaselineFlipsRow[]>`
        SELECT date_trunc('day', checked_at) AS day, COUNT(*)::bigint AS cnt
        FROM job_health_checks
        WHERE alive = false
          AND checked_at >= ${baselineStart}
          AND checked_at < ${baselineEnd}
        GROUP BY 1
    `;
    const series = baseline.map((r) => Number(r.cnt));
    const stats = stdStats(series);
    if (stats.n < 3 || stats.mean === 0) return { currentTotal: current, event: null };
    const ratio = current / stats.mean;
    if (ratio < multiple) return { currentTotal: current, event: null };

    return {
        currentTotal: current,
        event: {
            category: 'total_flip_volume_spike',
            severity: ratio >= multiple * 2 ? 'critical' : 'warning',
            summary: `Total dead flips today is ${current} vs 7d mean ${stats.mean.toFixed(0)} (${ratio.toFixed(1)}× spike)`,
            fingerprint: 'total_flip_volume_spike',
            metrics: { current, baseline: stats.mean, ratio },
            extra: { baselineSamples: stats.n },
            detectorVersion: ANOMALY_DETECTOR_VERSION,
        },
    };
}

interface Stats { n: number; mean: number; stddev: number }
function stdStats(values: ReadonlyArray<number>): Stats {
    if (values.length === 0) return { n: 0, mean: 0, stddev: 0 };
    const n = values.length;
    const mean = values.reduce((s, v) => s + v, 0) / n;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    return { n, mean, stddev: Math.sqrt(variance) };
}

function errMsg(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
}

/**
 * Side-effecting emit. Logs the event and (if `@sentry/nextjs` is wired up
 * via SENTRY_DSN) raises a captureMessage with tags so the alert routes to
 * the right person in Sentry. Safe to call when Sentry is absent — falls
 * back to logger only.
 */
export async function emitAnomaly(event: AnomalyEvent): Promise<void> {
    const log = logger.withContext({
        component: 'anomaly-detector',
        category: event.category,
        fingerprint: event.fingerprint,
    });
    log.warn(`[ANOMALY] ${event.summary}`, { metrics: event.metrics, extra: event.extra });

    // Best-effort Sentry — wrapped in try because the project's Sentry
    // wrapper is currently a no-op stub but the SDK package is installed.
    try {
        const sentry = await import('@sentry/nextjs');
        if (typeof sentry.captureMessage === 'function') {
            sentry.captureMessage(event.summary, {
                level: event.severity === 'critical' ? 'error' : 'warning',
                tags: {
                    component: 'job-health',
                    category: event.category,
                    detectorVersion: event.detectorVersion,
                },
                extra: { ...event.metrics, ...event.extra },
                fingerprint: [event.fingerprint],
            });
        }
    } catch {
        // Sentry unavailable — already logged above. Non-fatal.
    }
}
