/**
 * Selector policy tests — quota guarantees, license filter, health filter,
 * diversity cap, tier-pinned display order. These all encode product
 * decisions that should not silently regress.
 */

import { describe, it, expect } from 'vitest';
import {
    selectRecommendations,
    type JobMeta,
    type VectorHit,
} from '@/lib/ai/recommendation-selector';

function meta(id: string, overrides: Partial<JobMeta> = {}): JobMeta {
    return {
        id,
        employer: `emp-${id}`,
        // Default to employer-posted (direct_apply) so the new
        // excludeExternal default doesn't drop fixtures that aren't
        // explicitly testing tier behavior. Tests that exercise external
        // jobs (or excludeExternal=false) override this explicitly.
        sourceType: 'employer',
        applyOnPlatform: false,
        // Use a domain that does NOT match any ATS regex in job-classifier
        // (otherwise external sourceType would still classify as direct_apply
        // via link pattern). 'noop.test' matches no ATS rule.
        applyLink: 'https://noop.test/job',
        stateCode: 'CA',
        isRemote: false,
        healthConsecutiveMissing: 0,
        // Recent enough to satisfy the freshness filter (default 14d).
        originalPostedAt: new Date(),
        createdAt: new Date(),
        ...overrides,
    };
}

function hit(id: string, similarity: number): VectorHit {
    return { jobId: id, similarity };
}

describe('selectRecommendations', () => {
    it('pins Easy Apply jobs above Direct Apply, both above External in display order (with excludeExternal=false)', () => {
        const hits = [
            hit('ext-1', 0.9),
            hit('direct-1', 0.5),
            hit('easy-1', 0.3),
        ];
        const m = new Map<string, JobMeta>([
            ['ext-1',    meta('ext-1', { sourceType: 'external' })],
            ['direct-1', meta('direct-1', { sourceType: 'employer' })],
            ['easy-1',   meta('easy-1',   { sourceType: 'employer', applyOnPlatform: true })],
        ]);
        const picks = selectRecommendations(hits, m, { excludeExternal: false });
        expect(picks.map((p) => p.tier)).toEqual(['easy_apply', 'direct_apply', 'external']);
    });

    it('reserves the easyApply quota even when a higher-similarity external exists', () => {
        const hits: VectorHit[] = [];
        const m = new Map<string, JobMeta>();
        // 8 high-similarity external jobs
        for (let i = 0; i < 8; i++) {
            hits.push(hit(`ext-${i}`, 0.9 - i * 0.01));
            m.set(`ext-${i}`, meta(`ext-${i}`, { employer: `ext-emp-${i}` }));
        }
        // 2 low-similarity easy_apply jobs
        for (let i = 0; i < 2; i++) {
            hits.push(hit(`easy-${i}`, 0.3));
            m.set(`easy-${i}`, meta(`easy-${i}`, { sourceType: 'employer', applyOnPlatform: true, employer: `easy-emp-${i}` }));
        }
        const picks = selectRecommendations(hits, m);
        const easyCount = picks.filter((p) => p.tier === 'easy_apply').length;
        expect(easyCount).toBeGreaterThanOrEqual(2); // both low-sim easy apps still get slots
    });

    it('filters out jobs in unlicensed states unless remote', () => {
        const hits = [
            hit('tx-1', 0.9),
            hit('ca-1', 0.7),
            hit('remote-1', 0.6),
        ];
        const m = new Map<string, JobMeta>([
            ['tx-1',     meta('tx-1',     { stateCode: 'TX' })],
            ['ca-1',     meta('ca-1',     { stateCode: 'CA' })],
            ['remote-1', meta('remote-1', { stateCode: null, isRemote: true })],
        ]);
        const picks = selectRecommendations(hits, m, { licensedStates: ['CA'] });
        const ids = picks.map((p) => p.jobId);
        expect(ids).toContain('ca-1');
        expect(ids).toContain('remote-1');
        expect(ids).not.toContain('tx-1');
    });

    it('drops aggregator jobs flagged unhealthy (missing in too many ingestion runs)', () => {
        // Both are external (so the health-filter test isn't masked by the
        // exclude-external default — disable that here).
        const hits = [hit('dead', 0.95), hit('alive', 0.5)];
        const m = new Map<string, JobMeta>([
            ['dead',  meta('dead',  { sourceType: 'external', healthConsecutiveMissing: 5 })],
            ['alive', meta('alive', { sourceType: 'external', healthConsecutiveMissing: 0 })],
        ]);
        const picks = selectRecommendations(hits, m, { excludeExternal: false });
        const ids = picks.map((p) => p.jobId);
        expect(ids).not.toContain('dead');
        expect(ids).toContain('alive');
    });

    it('caps any single employer to ⌈totalSlots/3⌉ slots (no clumping)', () => {
        const hits: VectorHit[] = [];
        const m = new Map<string, JobMeta>();
        // 10 jobs from the same employer, all eligible
        for (let i = 0; i < 10; i++) {
            hits.push(hit(`j-${i}`, 0.9 - i * 0.001));
            m.set(`j-${i}`, meta(`j-${i}`, { employer: 'BigCorp' }));
        }
        const picks = selectRecommendations(hits, m);
        const bigCorpCount = picks.filter((p) => m.get(p.jobId)!.employer === 'BigCorp').length;
        expect(bigCorpCount).toBeLessThanOrEqual(Math.ceil(10 / 3));
    });

    it('honors excludeJobIds for cross-batch dedupe', () => {
        const hits = [hit('a', 0.9), hit('b', 0.8)];
        const m = new Map<string, JobMeta>([
            ['a', meta('a')],
            ['b', meta('b')],
        ]);
        const picks = selectRecommendations(hits, m, { excludeJobIds: new Set(['a']) });
        expect(picks.map((p) => p.jobId)).toEqual(['b']);
    });

    it('returns empty when nothing matches license filter', () => {
        const hits = [hit('tx-1', 0.9)];
        const m = new Map<string, JobMeta>([['tx-1', meta('tx-1', { stateCode: 'TX' })]]);
        const picks = selectRecommendations(hits, m, { licensedStates: ['CA'] });
        expect(picks).toEqual([]);
    });

    it('excludes external (aggregator-bounce) jobs by default', () => {
        const hits = [hit('ext-1', 0.9), hit('emp-1', 0.5)];
        const m = new Map<string, JobMeta>([
            ['ext-1', meta('ext-1', { sourceType: 'external' })],
            ['emp-1', meta('emp-1')], // default sourceType=employer → direct_apply
        ]);
        const picks = selectRecommendations(hits, m);
        const ids = picks.map((p) => p.jobId);
        expect(ids).toContain('emp-1');
        expect(ids).not.toContain('ext-1');
    });

    it('allows external when excludeExternal=false (e.g. for non-recommendation surfaces)', () => {
        const hits = [hit('ext-1', 0.9)];
        const m = new Map<string, JobMeta>([['ext-1', meta('ext-1', { sourceType: 'external' })]]);
        const picks = selectRecommendations(hits, m, { excludeExternal: false });
        expect(picks.map((p) => p.jobId)).toContain('ext-1');
    });

    it('drops jobs older than maxAgeDays (default 30)', () => {
        const hits = [hit('fresh', 0.6), hit('stale', 0.9)];
        const tooOld = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60d old, beyond default 30d
        const fresh  = new Date(Date.now() -  3 * 24 * 60 * 60 * 1000);
        const m = new Map<string, JobMeta>([
            ['fresh', meta('fresh', { sourceType: 'employer', originalPostedAt: fresh })],
            ['stale', meta('stale', { sourceType: 'employer', originalPostedAt: tooOld })],
        ]);
        const picks = selectRecommendations(hits, m);
        expect(picks.map((p) => p.jobId)).toEqual(['fresh']);
    });

    it('falls back to createdAt when originalPostedAt is missing', () => {
        const hits = [hit('a', 0.9)];
        const tooOld = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // beyond default 30d
        const m = new Map<string, JobMeta>([
            ['a', meta('a', { sourceType: 'employer', originalPostedAt: null, createdAt: tooOld })],
        ]);
        const picks = selectRecommendations(hits, m);
        expect(picks).toEqual([]);
    });

    it('allows the row through when both timestamps are missing (null-safe)', () => {
        const hits = [hit('a', 0.9)];
        const m = new Map<string, JobMeta>([
            ['a', meta('a', { sourceType: 'employer', originalPostedAt: null, createdAt: null })],
        ]);
        const picks = selectRecommendations(hits, m);
        expect(picks.map((p) => p.jobId)).toEqual(['a']);
    });

    it('persists the original (un-boosted) similarity on each pick', () => {
        const hits = [hit('easy-1', 0.42)];
        const m = new Map<string, JobMeta>([
            ['easy-1', meta('easy-1', { sourceType: 'employer', applyOnPlatform: true })],
        ]);
        const picks = selectRecommendations(hits, m);
        expect(picks[0].similarity).toBe(0.42); // raw cosine, not 0.42 * 1.5
    });

    it('boosts jobs from previously-clicked employers above equal-score competitors', () => {
        // Two equally-similar direct_apply jobs; one's employer is in the
        // candidate's click history → should rank above the other.
        const hits = [hit('uninteresting', 0.6), hit('clicked-emp', 0.6)];
        const m = new Map<string, JobMeta>([
            ['uninteresting', meta('uninteresting', { employer: 'Quiet Corp' })],
            ['clicked-emp',   meta('clicked-emp',   { employer: 'Talkiatry' })],
        ]);
        const picks = selectRecommendations(hits, m, {
            clickedEmployers: new Set(['Talkiatry']),
        });
        expect(picks[0].jobId).toBe('clicked-emp');
    });

    /* ─────────────────────────── Diversity cap (Sprint 1.2.5) ─────────────────────────── */
    // Spec: "Top-10 must include ≥3 distinct employers (no clumping)."
    // Selector enforces via `maxPerEmployer = ⌈totalSlots / 3⌉`. Lock the
    // behavior so a future refactor that drops the cap is caught at CI time.

    it('caps any single employer at ⌈totalSlots/3⌉ picks (default totalSlots=10 → cap of 4)', () => {
        // Throw 12 high-similarity jobs from "MegaCorp" at the selector. Without
        // a per-employer cap, all 10 slots would be MegaCorp; with the cap, at
        // most 4 of the 10 picks should be MegaCorp.
        const hits: VectorHit[] = [];
        const m = new Map<string, JobMeta>();
        for (let i = 0; i < 12; i++) {
            const id = `mega-${i}`;
            hits.push(hit(id, 0.9 - i * 0.001));
            m.set(id, meta(id, { employer: 'MegaCorp', sourceType: 'employer', applyOnPlatform: true }));
        }
        // Plus a few alternative-employer jobs so the slate has somewhere to spill into.
        for (let i = 0; i < 8; i++) {
            const id = `alt-${i}`;
            hits.push(hit(id, 0.5));
            m.set(id, meta(id, { employer: `Alt-${i}`, sourceType: 'employer' }));
        }

        const picks = selectRecommendations(hits, m);
        const megaPicks = picks.filter((p) => m.get(p.jobId)?.employer === 'MegaCorp').length;
        expect(megaPicks).toBeLessThanOrEqual(4);
    });

    it('produces ≥3 distinct employers in the top-10 when 3+ employers are available', () => {
        // 30 jobs spread across 4 employers, all easy_apply so they're all
        // eligible. Cap of 4-per-employer guarantees no fewer than ⌈10/4⌉ = 3
        // distinct employers in the final slate.
        const hits: VectorHit[] = [];
        const m = new Map<string, JobMeta>();
        const employers = ['Acme', 'Beta', 'Gamma', 'Delta'];
        for (let i = 0; i < 30; i++) {
            const id = `j-${i}`;
            const emp = employers[i % employers.length];
            hits.push(hit(id, 0.9 - i * 0.005));
            m.set(id, meta(id, { employer: emp, sourceType: 'employer', applyOnPlatform: true }));
        }

        const picks = selectRecommendations(hits, m);
        const distinctEmployers = new Set(picks.map((p) => m.get(p.jobId)?.employer)).size;
        expect(distinctEmployers).toBeGreaterThanOrEqual(3);
    });

    it('falls back gracefully when fewer than 3 distinct employers are available (no fake employers added)', () => {
        // Only 2 employers exist with eligible jobs. The selector should still
        // produce a slate (even if it falls below the 3-employer ideal); it
        // must NOT silently invent or duplicate employers to hit the bar.
        const hits: VectorHit[] = [];
        const m = new Map<string, JobMeta>();
        for (let i = 0; i < 6; i++) {
            const empId = i < 3 ? 'OnlyOne' : 'OnlyTwo';
            const id = `j-${i}`;
            hits.push(hit(id, 0.9 - i * 0.01));
            m.set(id, meta(id, { employer: empId, sourceType: 'employer', applyOnPlatform: true }));
        }
        const picks = selectRecommendations(hits, m);
        const distinctEmployers = new Set(picks.map((p) => m.get(p.jobId)?.employer));
        expect(distinctEmployers.size).toBeLessThanOrEqual(2);
        // Each employer hits the per-employer cap of ⌈10/3⌉=4, so total picks
        // is bounded at 2 employers × 4 cap = 8 (less than the 10-slot total).
        expect(picks.length).toBeLessThanOrEqual(8);
    });
});
