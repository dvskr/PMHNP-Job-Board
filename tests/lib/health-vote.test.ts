import { describe, it, expect, vi } from 'vitest';
import { tally, castFlipVote } from '../../lib/health/vote';
import type { HealthDecision, HealthReason } from '../../lib/health/check-job-health';

function decision(reason: HealthReason, alive?: boolean): HealthDecision {
    return {
        alive: alive ?? !['http_404', 'http_410', 'soft_404', 'greenhouse_api_404'].includes(reason),
        reason,
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
    };
}

describe('tally', () => {
    it('does not flip when current decision is alive', () => {
        const r = tally(decision('alive_2xx'), []);
        expect(r.flip).toBe(false);
        expect(r.outcome).toBe('still_alive');
    });

    it('flips immediately on greenhouse_api_404 (high confidence)', () => {
        const r = tally(decision('greenhouse_api_404'), []);
        expect(r.flip).toBe(true);
        expect(r.outcome).toBe('flip_high_confidence');
    });

    it('flips immediately on http_404 (high confidence)', () => {
        const r = tally(decision('http_404'), []);
        expect(r.flip).toBe(true);
        expect(r.outcome).toBe('flip_high_confidence');
    });

    it('flips immediately on http_410 (high confidence)', () => {
        const r = tally(decision('http_410'), []);
        expect(r.flip).toBe(true);
        expect(r.outcome).toBe('flip_high_confidence');
    });

    it('does NOT flip on a single soft_404 with no history', () => {
        const r = tally(decision('soft_404'), []);
        expect(r.flip).toBe(false);
        expect(r.outcome).toBe('awaiting_confirmation');
        expect(r.deadCount).toBe(1);
    });

    it('does NOT flip on a single soft_404 even when prior decisions were inconclusive', () => {
        const r = tally(decision('soft_404'), ['inconclusive_403', 'inconclusive_5xx']);
        expect(r.flip).toBe(false);
        expect(r.outcome).toBe('awaiting_confirmation');
    });

    it('flips on two consecutive soft_404 signals', () => {
        const r = tally(decision('soft_404'), ['soft_404']);
        expect(r.flip).toBe(true);
        expect(r.outcome).toBe('flip_two_low_signals');
        expect(r.deadCount).toBe(2);
    });

    it('flips on soft_404 confirmed by a prior http_404', () => {
        const r = tally(decision('soft_404'), ['http_404']);
        expect(r.flip).toBe(true);
        expect(r.outcome).toBe('flip_low_plus_high');
        expect(r.highConfidenceDeadCount).toBe(1);
    });

    it('records all considered reasons in chronological order (newest first)', () => {
        const r = tally(decision('soft_404'), ['http_404', 'inconclusive_403']);
        expect(r.consideredReasons).toEqual(['soft_404', 'http_404', 'inconclusive_403']);
    });

    it('emits the checker version', () => {
        const r = tally(decision('alive_2xx'), []);
        expect(r.voteCheckerVersion).toMatch(/^v\d/);
    });
});

describe('castFlipVote', () => {
    it('uses historyOverride when provided (no DB read)', async () => {
        const findMany = vi.fn();
        const fakePrisma = { jobHealthCheck: { findMany } } as unknown as Parameters<typeof castFlipVote>[0];

        const r = await castFlipVote(fakePrisma, 'job-1', decision('soft_404'), {
            historyOverride: ['http_404'],
        });
        expect(r.flip).toBe(true);
        expect(r.outcome).toBe('flip_low_plus_high');
        expect(findMany).not.toHaveBeenCalled();
    });

    it('reads recent rows from DB when no override', async () => {
        const findMany = vi.fn().mockResolvedValue([
            { outcome: 'soft_404' },
            { outcome: 'inconclusive_403' },
        ]);
        const fakePrisma = { jobHealthCheck: { findMany } } as unknown as Parameters<typeof castFlipVote>[0];

        const r = await castFlipVote(fakePrisma, 'job-1', decision('soft_404'));
        expect(findMany).toHaveBeenCalledOnce();
        expect(r.flip).toBe(true);
        expect(r.outcome).toBe('flip_two_low_signals');
    });

    it('queries with voteWindow - 1 take param (default 3 -> take 2)', async () => {
        const findMany = vi.fn().mockResolvedValue([]);
        const fakePrisma = { jobHealthCheck: { findMany } } as unknown as Parameters<typeof castFlipVote>[0];

        await castFlipVote(fakePrisma, 'job-1', decision('http_404'));
        expect(findMany.mock.calls[0][0].take).toBe(2);
    });

    it('honors a custom voteWindow', async () => {
        const findMany = vi.fn().mockResolvedValue([]);
        const fakePrisma = { jobHealthCheck: { findMany } } as unknown as Parameters<typeof castFlipVote>[0];

        await castFlipVote(fakePrisma, 'job-1', decision('soft_404'), { voteWindow: 5 });
        expect(findMany.mock.calls[0][0].take).toBe(4);
    });

    it('filters out unknown outcome strings from DB', async () => {
        // Older audit rows might carry a version of HealthReason that has since
        // been retired. The vote must ignore unknown values rather than crash.
        const findMany = vi.fn().mockResolvedValue([
            { outcome: 'soft_404' },
            { outcome: 'some_retired_reason' },
            { outcome: 'http_404' },
        ]);
        const fakePrisma = { jobHealthCheck: { findMany } } as unknown as Parameters<typeof castFlipVote>[0];

        const r = await castFlipVote(fakePrisma, 'job-1', decision('soft_404'));
        // soft_404 + http_404 → flip_low_plus_high; the retired reason is ignored
        expect(r.flip).toBe(true);
        expect(r.outcome).toBe('flip_low_plus_high');
    });
});
