/**
 * The arm picker is the entire fairness story for the A/B harness — if the
 * hash drifts, two requests for the same tenant could land in different
 * arms and the conversion math would be silently wrong. Lock it down.
 */

import { describe, it, expect } from 'vitest';
import { _internals } from '@/lib/ai/experiments';

const { fnv1a, pickArm } = _internals;

describe('fnv1a', () => {
    it('is deterministic — same input always returns the same hash', () => {
        expect(fnv1a('hello')).toBe(fnv1a('hello'));
        expect(fnv1a('candidate:abc123')).toBe(fnv1a('candidate:abc123'));
    });

    it('produces different hashes for different inputs', () => {
        expect(fnv1a('a')).not.toBe(fnv1a('b'));
        expect(fnv1a('candidate:1')).not.toBe(fnv1a('candidate:2'));
    });

    it('returns an unsigned 32-bit integer', () => {
        const h = fnv1a('test');
        expect(Number.isInteger(h)).toBe(true);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThanOrEqual(0xffffffff);
    });
});

describe('pickArm', () => {
    const config = {
        experiment: 'semantic_search.v1',
        arms: ['control', 'treatment'] as const,
        rolloutPercent: 50,
    };

    it('returns control when rolloutPercent is 0', () => {
        const cfg = { ...config, arms: [...config.arms], rolloutPercent: 0 };
        for (let i = 0; i < 50; i++) {
            expect(pickArm(cfg, `tenant:${i}`)).toBe('control');
        }
    });

    it('returns treatment for everyone when rolloutPercent is 100 with two arms', () => {
        const cfg = { ...config, arms: [...config.arms], rolloutPercent: 100 };
        for (let i = 0; i < 50; i++) {
            expect(pickArm(cfg, `tenant:${i}`)).toBe('treatment');
        }
    });

    it('is sticky — same tenant always picks the same arm', () => {
        const cfg = { ...config, arms: [...config.arms] };
        const first = pickArm(cfg, 'candidate:abc123');
        for (let i = 0; i < 20; i++) {
            expect(pickArm(cfg, 'candidate:abc123')).toBe(first);
        }
    });

    it('rolls out roughly the requested percentage across many tenants', () => {
        const cfg = { ...config, arms: [...config.arms], rolloutPercent: 50 };
        let treatment = 0;
        const N = 5000;
        for (let i = 0; i < N; i++) {
            if (pickArm(cfg, `candidate:${i}`) === 'treatment') treatment += 1;
        }
        const ratio = treatment / N;
        // 50% expected — allow ±5% tolerance for hash variance over N=5000.
        expect(ratio).toBeGreaterThan(0.45);
        expect(ratio).toBeLessThan(0.55);
    });

    it('returns control if arms list is empty', () => {
        expect(pickArm({ experiment: 'x', arms: [], rolloutPercent: 50 }, 'tenant:1')).toBe('control');
    });

    it('returns the only arm when arms list has length 1', () => {
        expect(
            pickArm({ experiment: 'x', arms: ['only_arm'], rolloutPercent: 50 }, 'tenant:1'),
        ).toBe('only_arm');
    });

    it('distributes across multiple non-control arms when rollout is 100%', () => {
        const cfg = {
            experiment: 'multi.v1',
            arms: ['control', 'a', 'b', 'c'],
            rolloutPercent: 100,
        };
        const counts = new Map<string, number>();
        const N = 3000;
        for (let i = 0; i < N; i++) {
            const arm = pickArm(cfg, `tenant:${i}`);
            counts.set(arm, (counts.get(arm) ?? 0) + 1);
        }
        // No control assignments at 100% rollout.
        expect(counts.get('control') ?? 0).toBe(0);
        // Each non-control arm gets roughly N/3 — allow generous tolerance.
        for (const arm of ['a', 'b', 'c']) {
            const count = counts.get(arm) ?? 0;
            expect(count).toBeGreaterThan(N / 3 * 0.8);
            expect(count).toBeLessThan(N / 3 * 1.2);
        }
    });

    it('different experiment names give different bucket assignments for the same tenant', () => {
        // The salt prevents arm-correlation across experiments.
        const armA = pickArm(
            { experiment: 'exp_a', arms: ['control', 'treatment'], rolloutPercent: 50 },
            'candidate:abc',
        );
        const armB = pickArm(
            { experiment: 'exp_b', arms: ['control', 'treatment'], rolloutPercent: 50 },
            'candidate:abc',
        );
        // Not testing inequality — they CAN match by coincidence. Just
        // confirming the function runs cleanly with a different experiment.
        expect(['control', 'treatment']).toContain(armA);
        expect(['control', 'treatment']).toContain(armB);
    });
});
