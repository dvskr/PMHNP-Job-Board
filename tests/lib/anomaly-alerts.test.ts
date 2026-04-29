import { describe, it, expect, vi } from 'vitest';
import {
    detectAnomalies,
    emitAnomaly,
    ANOMALY_DETECTOR_VERSION,
    type AnomalyEvent,
} from '../../lib/health/anomaly-alerts';

function fakePrisma(rows: Record<string, unknown[]>) {
    const queryRaw = vi.fn(async (template: TemplateStringsArray) => {
        const sql = template.join(' ');
        if (sql.includes('alive = false') && sql.includes('GROUP BY j.source_provider') && !sql.includes('day')) {
            return rows.deadBySource24h ?? [];
        }
        if (sql.includes('alive = false') && sql.includes("date_trunc('day'") && sql.includes('source_provider')) {
            return rows.deadBySourceBaseline ?? [];
        }
        if (sql.includes('soft_404') && !sql.includes("date_trunc('day'")) {
            return rows.softPatterns24h ?? [];
        }
        if (sql.includes('soft_404') && sql.includes("date_trunc('day'")) {
            return rows.softPatternsBaseline ?? [];
        }
        if (sql.includes('source_presence')) {
            return rows.presenceRuns ?? [];
        }
        if (sql.includes('alive = false') && !sql.includes('source_provider') && !sql.includes('soft_404') && !sql.includes("date_trunc('day'")) {
            return rows.totalFlips24h ?? [{ cnt: BigInt(0) }];
        }
        if (sql.includes('alive = false') && !sql.includes('source_provider') && !sql.includes('soft_404')) {
            return rows.totalFlipsBaseline ?? [];
        }
        return [];
    });
    return {
        prisma: { $queryRaw: queryRaw } as unknown as Parameters<typeof detectAnomalies>[0]['prisma'],
        queryRaw,
    };
}

const baselineThresholds = {
    deadRateSigma: 3,
    softPatternMultiple: 5,
    presenceSkipPct: 80,
    flipVolumeMultiple: 4,
};

describe('detectAnomalies', () => {
    it('returns empty when there are no rows', async () => {
        const { prisma } = fakePrisma({});
        const r = await detectAnomalies({ prisma, thresholds: baselineThresholds });
        expect(r.detectorVersion).toBe(ANOMALY_DETECTOR_VERSION);
        expect(r.anomalies).toEqual([]);
    });

    it('flags a per-source dead-rate spike when current is >= sigma_multiple stddevs above baseline', async () => {
        // Baseline: 7 days of 10 dead/day for source X → mean=10, stddev=0
        // We need stddev > 0 to compute z-score, so vary slightly.
        const baselineRows = [
            { day: new Date('2026-04-22'), source_provider: 'srcX', cnt: BigInt(8) },
            { day: new Date('2026-04-23'), source_provider: 'srcX', cnt: BigInt(10) },
            { day: new Date('2026-04-24'), source_provider: 'srcX', cnt: BigInt(12) },
            { day: new Date('2026-04-25'), source_provider: 'srcX', cnt: BigInt(11) },
            { day: new Date('2026-04-26'), source_provider: 'srcX', cnt: BigInt(9) },
            { day: new Date('2026-04-27'), source_provider: 'srcX', cnt: BigInt(10) },
            { day: new Date('2026-04-28'), source_provider: 'srcX', cnt: BigInt(10) },
        ];
        // Today: 100 dead — way above baseline mean ~10 / stddev ~1.3.
        const currentRows = [{ source_provider: 'srcX', cnt: BigInt(100) }];

        const { prisma } = fakePrisma({
            deadBySource24h: currentRows,
            deadBySourceBaseline: baselineRows,
        });
        const r = await detectAnomalies({ prisma, thresholds: baselineThresholds });
        const spikes = r.anomalies.filter((a) => a.category === 'dead_rate_spike_per_source');
        expect(spikes.length).toBe(1);
        expect(spikes[0].fingerprint).toBe('dead_rate_spike_per_source:srcX');
        expect(spikes[0].metrics.current).toBe(100);
        expect(spikes[0].metrics.zScore).toBeGreaterThan(3);
    });

    it('does not flag when current is within baseline stddev', async () => {
        const baselineRows = [
            { day: new Date('2026-04-22'), source_provider: 'srcX', cnt: BigInt(8) },
            { day: new Date('2026-04-23'), source_provider: 'srcX', cnt: BigInt(10) },
            { day: new Date('2026-04-24'), source_provider: 'srcX', cnt: BigInt(12) },
            { day: new Date('2026-04-25'), source_provider: 'srcX', cnt: BigInt(11) },
        ];
        const currentRows = [{ source_provider: 'srcX', cnt: BigInt(11) }];
        const { prisma } = fakePrisma({
            deadBySource24h: currentRows,
            deadBySourceBaseline: baselineRows,
        });
        const r = await detectAnomalies({ prisma, thresholds: baselineThresholds });
        expect(r.anomalies.filter((a) => a.category === 'dead_rate_spike_per_source')).toEqual([]);
    });

    it('flags a soft-404 pattern volume spike when current >= multiple × baseline mean', async () => {
        const baselineRows = [
            { day: new Date('2026-04-22'), soft_pattern_id: 'position_filled', cnt: BigInt(2) },
            { day: new Date('2026-04-23'), soft_pattern_id: 'position_filled', cnt: BigInt(3) },
            { day: new Date('2026-04-24'), soft_pattern_id: 'position_filled', cnt: BigInt(2) },
            { day: new Date('2026-04-25'), soft_pattern_id: 'position_filled', cnt: BigInt(3) },
        ];
        const currentRows = [{ soft_pattern_id: 'position_filled', cnt: BigInt(50) }];
        const { prisma } = fakePrisma({
            softPatterns24h: currentRows,
            softPatternsBaseline: baselineRows,
        });
        const r = await detectAnomalies({ prisma, thresholds: baselineThresholds });
        const spikes = r.anomalies.filter((a) => a.category === 'soft_pattern_volume_spike');
        expect(spikes.length).toBe(1);
        expect(spikes[0].fingerprint).toBe('soft_pattern_volume_spike:position_filled');
        expect(spikes[0].metrics.ratio).toBeGreaterThan(5);
    });

    it('flags presence-skip spike when >= threshold pct of runs skipped', async () => {
        const presenceRows = [
            { presence_source: 'jooble', total: BigInt(10), skipped: BigInt(9) },
        ];
        const { prisma } = fakePrisma({
            presenceRuns: presenceRows,
        });
        const r = await detectAnomalies({ prisma, thresholds: baselineThresholds });
        const spikes = r.anomalies.filter((a) => a.category === 'presence_skip_rate_high');
        expect(spikes.length).toBe(1);
        expect(spikes[0].fingerprint).toBe('presence_skip_rate_high:jooble');
        expect(spikes[0].metrics.current).toBeCloseTo(90, 0);
    });

    it('does not crash when individual queries throw — surfaces remaining anomalies', async () => {
        const failingPrisma = {
            $queryRaw: vi.fn().mockRejectedValue(new Error('connection lost')),
        } as unknown as Parameters<typeof detectAnomalies>[0]['prisma'];
        const r = await detectAnomalies({ prisma: failingPrisma, thresholds: baselineThresholds });
        // Should return cleanly with empty anomalies when all queries fail
        expect(r.anomalies).toEqual([]);
        expect(r.detectorVersion).toBe(ANOMALY_DETECTOR_VERSION);
    });
});

describe('emitAnomaly', () => {
    it('does not throw when Sentry is absent (logs only)', async () => {
        const event: AnomalyEvent = {
            category: 'dead_rate_spike_per_source',
            severity: 'warning',
            summary: 'test anomaly',
            fingerprint: 'test:fingerprint',
            metrics: { current: 100, baseline: 10 },
            extra: {},
            detectorVersion: ANOMALY_DETECTOR_VERSION,
        };
        await expect(emitAnomaly(event)).resolves.toBeUndefined();
    });
});
