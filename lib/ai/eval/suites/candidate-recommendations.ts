/**
 * Candidate-recommendations eval suite — Sprint 1.2.4.
 *
 * Scoring metric: hit-rate. For each (candidate-profile, expected-relevant-jobs)
 * tuple, run the SAME selector pipeline the cron uses (vector search + union
 * platform-revenue pool + filters + selector) and check how many of the
 * expected jobs actually appear in the resulting top-N.
 *
 * Threshold per docs/ai-implementation-plan.md §1.2.4: ≥40% hit rate
 * across cases. Until real CTR data is in, this is the best proxy for
 * "would the candidate apply" that we can measure offline.
 *
 * Run with `npm run eval candidate_recommendations` once the standalone
 * runner below is wired into EVAL_REGISTRY.
 */

import type { SuiteContract } from '../types';

export interface RecommendationsInput extends Record<string, string> {
    /** Free-text profile summary the embedder turns into a candidate vector. */
    profileSummary: string;
    /** Comma-separated 2-letter state codes for the license filter. */
    licenseStates: string;
}

export interface RecommendationsExpected {
    /** Job IDs the human curator believes should appear in the top-N rec batch. */
    expectedJobIds: ReadonlyArray<string>;
    /** Hit-rate floor for this case to count as passing. Default 0.4. */
    minHitRate?: number;
    /** How many recs the selector should produce (default 10). */
    topN?: number;
}

/** Hit-rate = |expected ∩ actual| / |expected|. Returns 0..1. */
export function hitRate(actual: ReadonlyArray<string>, expected: ReadonlyArray<string>): number {
    if (expected.length === 0) return 1; // nothing to recall
    const actualSet = new Set(actual);
    let hits = 0;
    for (const e of expected) if (actualSet.has(e)) hits += 1;
    return hits / expected.length;
}

export const candidateRecommendationsContract: SuiteContract<RecommendationsInput, RecommendationsExpected> = {
    baselineThreshold: 0.40, // mean hit rate across cases (per spec)
    scoreCase({ gold, modelOutput }) {
        const out = modelOutput as { jobIds?: string[] } | null;
        if (!out || !Array.isArray(out.jobIds)) {
            return { passed: false, score: 0, reason: 'no jobIds returned to scoreCase' };
        }
        const rate = hitRate(out.jobIds, gold.expected.expectedJobIds);
        const min = gold.expected.minHitRate ?? 0.4;
        return {
            passed: rate >= min,
            score: rate,
            reason: `hit_rate=${rate.toFixed(3)} (min=${min}) score=${(rate * 100).toFixed(1)}`,
        };
    },
};

export interface RecommendationsSuiteResult {
    promptVersion: string;
    totalCases: number;
    passed: number;
    failed: number;
    meanHitRate: number;
    perCase: ReadonlyArray<{ id: string; hitRate: number; passed: boolean; reason: string }>;
    holdsBaseline: boolean;
    summary: string;
}

/**
 * Standalone runner — embeds each case's profile, runs the SAME selector
 * the cron uses, computes hit-rate against the expected job set.
 *
 * Imports are dynamic so the harness CLI doesn't pay the import cost
 * unless the user runs this suite specifically.
 */
export async function runRecommendationsSuite(): Promise<RecommendationsSuiteResult> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const { embed } = await import('@/lib/ai/gateway');
    const {
        semanticJobSearch,
        platformRevenueJobsWithSimilarity,
    } = await import('@/lib/ai/vector-search');
    const { selectRecommendations } = await import('@/lib/ai/recommendation-selector');
    const { EMPLOYER_PIN_POLICY } = await import('@/lib/ai/recommendation-policy');
    const { prisma } = await import('@/lib/prisma');

    const file = path.join(process.cwd(), 'tests', 'ai', 'golden', 'candidate-recommendations.json');
    const raw = await fs.readFile(file, 'utf-8');
    const json = JSON.parse(raw) as {
        promptVersion?: string;
        cases: Array<{ id: string; input: RecommendationsInput; expected: RecommendationsExpected }>;
    };
    const promptVersion = json.promptVersion ?? 'v1';
    const cases = json.cases ?? [];

    const perCase: Array<{ id: string; hitRate: number; passed: boolean; reason: string }> = [];

    for (const c of cases) {
        try {
            const tenant = { type: 'system' as const, id: 'eval-recommendations' };
            const embedded = await embed({ input: c.input.profileSummary, tenant });
            const [topK, pool] = await Promise.all([
                semanticJobSearch(embedded.embedding, { k: 80 }),
                platformRevenueJobsWithSimilarity(embedded.embedding),
            ]);
            const merged = new Map<string, { jobId: string; similarity: number }>();
            for (const h of topK) merged.set(h.jobId, h);
            for (const h of pool) merged.set(h.jobId, h);

            const jobRows = await prisma.job.findMany({
                where: { id: { in: [...merged.keys()] } },
                select: {
                    id: true, employer: true, sourceType: true, applyOnPlatform: true,
                    applyLink: true, stateCode: true, isRemote: true,
                    healthConsecutiveMissing: true,
                    originalPostedAt: true, createdAt: true,
                },
            });
            const metaByJob = new Map(jobRows.map((j) => [j.id, j]));
            const states = c.input.licenseStates
                .split(',')
                .map((s) => s.trim().toUpperCase())
                .filter((s) => /^[A-Z]{2}$/.test(s));

            const totalSlots = c.expected.topN ?? EMPLOYER_PIN_POLICY.totalSlots;
            const picked = selectRecommendations([...merged.values()], metaByJob, {
                licensedStates: states,
                policy: {
                    pinned: EMPLOYER_PIN_POLICY.pinned,
                    totalSlots,
                } as typeof EMPLOYER_PIN_POLICY,
            });

            const actual = picked.map((p) => p.jobId);
            const rate = hitRate(actual, c.expected.expectedJobIds);
            const min = c.expected.minHitRate ?? 0.4;
            perCase.push({
                id: c.id,
                hitRate: rate,
                passed: rate >= min,
                reason: `hit_rate=${rate.toFixed(3)} (min=${min})`,
            });
        } catch (err) {
            perCase.push({
                id: c.id,
                hitRate: 0,
                passed: false,
                reason: err instanceof Error ? err.message : String(err),
            });
        }
    }

    const passed = perCase.filter((p) => p.passed).length;
    const meanHitRate = perCase.length === 0
        ? 0
        : perCase.reduce((a, b) => a + b.hitRate, 0) / perCase.length;
    const baseline = candidateRecommendationsContract.baselineThreshold;
    const holdsBaseline = meanHitRate >= baseline;

    return {
        promptVersion,
        totalCases: perCase.length,
        passed,
        failed: perCase.length - passed,
        meanHitRate,
        perCase,
        holdsBaseline,
        summary: holdsBaseline
            ? `Mean hit rate ${meanHitRate.toFixed(3)} ≥ baseline ${baseline.toFixed(3)} (${passed}/${perCase.length} cases passed)`
            : `Mean hit rate ${meanHitRate.toFixed(3)} < baseline ${baseline.toFixed(3)} (${passed}/${perCase.length} cases passed) — REGRESSION`,
    };
}
