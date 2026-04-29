import { describe, it, expect, vi } from 'vitest';
import { HealthRecorder, rowFromDecision, rowFromPresence } from '../../lib/health/recorder';
import type { HealthDecision } from '../../lib/health/check-job-health';
import type { PresenceCheckResult } from '../../lib/health/source-presence';

function decision(partial: Partial<HealthDecision> = {}): HealthDecision {
    return {
        alive: true,
        reason: 'alive_2xx',
        evidence: {
            finalStatus: 200,
            finalUrl: 'https://example.com/x',
            redirectHops: 0,
            softMatch: null,
            elapsedMs: 100,
            errorKind: null,
            errorMessage: null,
            checkerVersion: 'v1.0.0',
            sourceProbe: null,
        },
        ...partial,
    };
}

function presence(partial: Partial<PresenceCheckResult> = {}): PresenceCheckResult {
    return {
        outcome: 'completed',
        source: 'jooble',
        fetched: 1500,
        historicalAvgFetched: 1500,
        publishedFromSource: 100,
        seenAgain: 95,
        missingThisRun: 5,
        updatesIssued: 100,
        skippedReason: null,
        elapsedMs: 200,
        checkerVersion: 'v1.0.0',
        ...partial,
    };
}

function fakePrisma() {
    const createMany = vi.fn().mockResolvedValue({ count: 0 });
    return {
        prisma: {
            jobHealthCheck: { createMany },
        } as unknown as ConstructorParameters<typeof HealthRecorder>[0],
        createMany,
    };
}

describe('rowFromDecision', () => {
    it('builds an http_probe row for a 2xx alive decision', () => {
        const r = rowFromDecision('job-1', decision());
        expect(r.checkType).toBe('http_probe');
        expect(r.outcome).toBe('alive_2xx');
        expect(r.alive).toBe(true);
        expect(r.httpStatus).toBe(200);
    });

    it('builds a greenhouse_api row when sourceProbe is greenhouse_api', () => {
        const r = rowFromDecision('job-1', decision({
            alive: false,
            reason: 'greenhouse_api_404',
            evidence: {
                finalStatus: 404,
                finalUrl: 'https://boards-api.greenhouse.io/v1/boards/acme/jobs/123',
                redirectHops: 0,
                softMatch: null,
                elapsedMs: 50,
                errorKind: null,
                errorMessage: null,
                checkerVersion: 'v1.0.0',
                sourceProbe: {
                    kind: 'greenhouse_api',
                    apiUrl: 'https://boards-api.greenhouse.io/v1/boards/acme/jobs/123',
                    httpStatus: 404,
                    reason: 'api_404',
                },
            },
        }));
        expect(r.checkType).toBe('greenhouse_api');
        expect(r.outcome).toBe('greenhouse_api_404');
        expect(r.apiUrl).toContain('acme/jobs/123');
        expect(r.alive).toBe(false);
    });

    it('captures soft-404 pattern + match text', () => {
        const r = rowFromDecision('job-1', decision({
            alive: false,
            reason: 'soft_404',
            evidence: {
                finalStatus: 200,
                finalUrl: 'https://example.com/x',
                redirectHops: 0,
                softMatch: { patternId: 'position_filled', matchText: 'this position has been filled', location: 'body' },
                elapsedMs: 80,
                errorKind: null,
                errorMessage: null,
                checkerVersion: 'v1.0.0',
                sourceProbe: null,
            },
        }));
        expect(r.softPatternId).toBe('position_filled');
        expect(r.softMatchText).toContain('filled');
    });

    it('captures error info on inconclusive_network', () => {
        const r = rowFromDecision('job-1', decision({
            reason: 'inconclusive_network',
            evidence: {
                finalStatus: null,
                finalUrl: 'https://example.com/x',
                redirectHops: 0,
                softMatch: null,
                elapsedMs: 8000,
                errorKind: 'timeout',
                errorMessage: 'aborted',
                checkerVersion: 'v1.0.0',
                sourceProbe: null,
            },
        }));
        expect(r.errorKind).toBe('timeout');
        expect(r.errorMessage).toBe('aborted');
    });
});

describe('rowFromPresence', () => {
    it('builds a source_presence row from a completed run', () => {
        const r = rowFromPresence('job-1', presence());
        expect(r.checkType).toBe('source_presence');
        expect(r.outcome).toBe('completed');
        expect(r.alive).toBe(true);
        expect(r.presenceSource).toBe('jooble');
        expect(r.presenceSeenAgain).toBe(95);
        expect(r.presenceMissing).toBe(5);
    });

    it('preserves skip reason', () => {
        const r = rowFromPresence('job-1', presence({
            outcome: 'skipped_partial_fetch',
            skippedReason: 'fetched=100 < required=750',
            seenAgain: 0,
            missingThisRun: 0,
            updatesIssued: 0,
        }));
        expect(r.outcome).toBe('skipped_partial_fetch');
        expect(r.presenceSkippedReason).toMatch(/required=750/);
    });
});

describe('HealthRecorder', () => {
    it('flushes on size threshold', async () => {
        const { prisma, createMany } = fakePrisma();
        const r = new HealthRecorder(prisma, /* batchSize */ 3);
        await r.stageDecision('j1', decision());
        await r.stageDecision('j2', decision());
        expect(createMany).not.toHaveBeenCalled();
        await r.stageDecision('j3', decision());
        expect(createMany).toHaveBeenCalledOnce();
        expect(r.stats()).toMatchObject({ staged: 3, flushed: 3, failedFlushes: 0 });
    });

    it('flush() drains a partial buffer', async () => {
        const { prisma, createMany } = fakePrisma();
        const r = new HealthRecorder(prisma, 100);
        await r.stageDecision('j1', decision());
        await r.flush();
        expect(createMany).toHaveBeenCalledOnce();
        expect(r.stats().flushed).toBe(1);
    });

    it('flush() is a no-op on empty buffer', async () => {
        const { prisma, createMany } = fakePrisma();
        const r = new HealthRecorder(prisma);
        await r.flush();
        expect(createMany).not.toHaveBeenCalled();
    });

    it('captures DB errors in stats and never throws', async () => {
        const createMany = vi.fn().mockRejectedValue(new Error('connection lost'));
        const errLog = vi.fn();
        const r = new HealthRecorder(
            { jobHealthCheck: { createMany } } as unknown as ConstructorParameters<typeof HealthRecorder>[0],
            10,
            errLog,
        );
        await r.stageDecision('j1', decision());
        await r.flush();
        expect(r.stats().failedFlushes).toBe(1);
        expect(r.stats().flushed).toBe(0);
        expect(errLog).toHaveBeenCalledOnce();
    });

    it('stagePresence records when anchor is provided', async () => {
        const { prisma, createMany } = fakePrisma();
        const r = new HealthRecorder(prisma, 1);
        await r.stagePresence('anchor-job', presence());
        expect(createMany).toHaveBeenCalledOnce();
        const data = createMany.mock.calls[0][0].data;
        expect(data[0].checkType).toBe('source_presence');
        expect(data[0].presenceSource).toBe('jooble');
    });

    it('stagePresence drops records when anchor is null', async () => {
        const { prisma, createMany } = fakePrisma();
        const r = new HealthRecorder(prisma, 1);
        await r.stagePresence(null, presence());
        await r.flush();
        expect(createMany).not.toHaveBeenCalled();
        expect(r.stats().staged).toBe(0);
    });
});
