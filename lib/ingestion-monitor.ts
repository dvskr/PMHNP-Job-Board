/**
 * Ingestion Monitor
 * 
 * Provides source health alerting, performance metrics, and reporting
 * for the job ingestion pipeline.
 * 
 * Features:
 * - Source health checks (detects dead sources within 3 days)
 * - Per-source performance timing
 * - Ingestion summary reporting
 * - Console-based alerts (can be extended to Discord/Slack)
 */

import { prisma } from './prisma';

export interface SourceHealthStatus {
    source: string;
    lastSuccessful: Date | null;
    daysSinceLastJob: number;
    last7DayAvg: number;
    todayCount: number;
    status: 'healthy' | 'warning' | 'dead';
    alert?: string;
}

export interface IngestionTimings {
    source: string;
    fetchMs: number;
    normalizeMs: number;
    dedupMs: number;
    insertMs: number;
    totalMs: number;
}

/**
 * Check health of all sources — detects dead or degraded sources
 */
export async function checkSourceHealth(): Promise<SourceHealthStatus[]> {
    const sources = await prisma.job.groupBy({
        by: ['sourceProvider'],
        where: { isPublished: true },
        _count: { id: true },
        _max: { createdAt: true },
    });

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const results: SourceHealthStatus[] = [];

    for (const source of sources) {
        const provider = source.sourceProvider || 'unknown';
        const lastCreated = source._max.createdAt;
        const daysSinceLastJob = lastCreated
            ? (now.getTime() - lastCreated.getTime()) / (1000 * 60 * 60 * 24)
            : 999;

        // Count jobs added in last 7 days
        const recentCount = await prisma.job.count({
            where: {
                sourceProvider: provider,
                isPublished: true,
                createdAt: { gte: sevenDaysAgo },
            },
        });

        // Count jobs added today
        const todayCount = await prisma.job.count({
            where: {
                sourceProvider: provider,
                isPublished: true,
                createdAt: { gte: oneDayAgo },
            },
        });

        const last7DayAvg = recentCount / 7;

        let status: 'healthy' | 'warning' | 'dead' = 'healthy';
        let alert: string | undefined;

        if (daysSinceLastJob >= 7) {
            status = 'dead';
            alert = `🔴 DEAD: ${provider} has not produced a job in ${Math.round(daysSinceLastJob)} days`;
        } else if (daysSinceLastJob >= 3) {
            status = 'warning';
            alert = `🟡 WARNING: ${provider} has not produced a job in ${Math.round(daysSinceLastJob)} days`;
        } else if (last7DayAvg > 0 && todayCount < last7DayAvg * 0.3) {
            status = 'warning';
            alert = `🟡 WARNING: ${provider} today (${todayCount}) is 70%+ below 7-day avg (${last7DayAvg.toFixed(1)}/day)`;
        }

        results.push({
            source: provider,
            lastSuccessful: lastCreated,
            daysSinceLastJob: Math.round(daysSinceLastJob * 10) / 10,
            last7DayAvg: Math.round(last7DayAvg * 10) / 10,
            todayCount,
            status,
            alert,
        });
    }

    // Sort: dead first, then warning, then healthy
    results.sort((a, b) => {
        const order = { dead: 0, warning: 1, healthy: 2 };
        return order[a.status] - order[b.status];
    });

    return results;
}

/**
 * Generate ingestion summary for logging/alerting
 */
export function generateIngestionSummary(results: Array<{
    source: string;
    fetched: number;
    added: number;
    duplicates: number;
    errors: number;
    duration: number;
}>): string {
    const totalFetched = results.reduce((s, r) => s + r.fetched, 0);
    const totalAdded = results.reduce((s, r) => s + r.added, 0);
    const totalDupes = results.reduce((s, r) => s + r.duplicates, 0);
    const totalErrors = results.reduce((s, r) => s + r.errors, 0);
    const totalDuration = results.reduce((s, r) => s + r.duration, 0);

    const lines: string[] = [
        `📊 INGESTION SUMMARY`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `Total: ${totalFetched} fetched → ${totalAdded} added | ${totalDupes} dupes | ${totalErrors} errors | ${(totalDuration / 1000).toFixed(1)}s`,
        ``,
    ];

    // Per-source breakdown
    for (const r of results) {
        const efficiency = r.fetched > 0 ? ((r.added / r.fetched) * 100).toFixed(0) : '0';
        const icon = r.added > 0 ? '✅' : r.errors > 0 ? '❌' : '⬜';
        lines.push(`  ${icon} ${r.source.padEnd(16)} ${String(r.fetched).padStart(5)} → ${String(r.added).padStart(3)} added (${efficiency}%) | ${(r.duration / 1000).toFixed(1)}s`);
    }

    // Alerts for zero-add sources
    const zeroSources = results.filter(r => r.fetched > 0 && r.added === 0);
    if (zeroSources.length > 0) {
        lines.push('');
        lines.push(`⚠️  ${zeroSources.length} source(s) fetched jobs but added 0: ${zeroSources.map(s => s.source).join(', ')}`);
    }

    // Time budget warning
    if (totalDuration > 200_000) {
        lines.push('');
        lines.push(`🚨 TIME BUDGET: ${(totalDuration / 1000).toFixed(0)}s / 240s limit (${((totalDuration / 240_000) * 100).toFixed(0)}% used)`);
    }

    return lines.join('\n');
}

/**
 * Log source health check results
 */
export async function logSourceHealthCheck(): Promise<void> {
    const health = await checkSourceHealth();

    console.log('\n📡 SOURCE HEALTH CHECK');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    for (const s of health) {
        const icon = s.status === 'dead' ? '🔴' : s.status === 'warning' ? '🟡' : '🟢';
        console.log(`  ${icon} ${s.source.padEnd(16)} | Last: ${s.daysSinceLastJob}d ago | 7d avg: ${s.last7DayAvg}/day | Today: ${s.todayCount}`);
    }

    const alerts = health.filter(s => s.alert);
    if (alerts.length > 0) {
        console.log('\n⚠️  ALERTS:');
        for (const alert of alerts) {
            console.log(`  ${alert.alert}`);
        }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

/**
 * Performance timer for ingestion stages
 */
export class IngestionTimer {
    private timings: Map<string, { start: number; end?: number }> = new Map();
    private source: string;

    constructor(source: string) {
        this.source = source;
    }

    startStage(stage: string): void {
        this.timings.set(stage, { start: Date.now() });
    }

    endStage(stage: string): number {
        const timing = this.timings.get(stage);
        if (!timing) return 0;
        timing.end = Date.now();
        return timing.end - timing.start;
    }

    getTimings(): IngestionTimings {
        const get = (stage: string) => {
            const t = this.timings.get(stage);
            return t && t.end ? t.end - t.start : 0;
        };
        return {
            source: this.source,
            fetchMs: get('fetch'),
            normalizeMs: get('normalize'),
            dedupMs: get('dedup'),
            insertMs: get('insert'),
            totalMs: get('fetch') + get('normalize') + get('dedup') + get('insert'),
        };
    }

    logTimings(): void {
        const t = this.getTimings();
        console.log(`  ⏱️  ${this.source}: fetch=${(t.fetchMs / 1000).toFixed(1)}s normalize=${(t.normalizeMs / 1000).toFixed(1)}s dedup=${(t.dedupMs / 1000).toFixed(1)}s insert=${(t.insertMs / 1000).toFixed(1)}s total=${(t.totalMs / 1000).toFixed(1)}s`);
    }
}
