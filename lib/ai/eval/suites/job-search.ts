/**
 * Job-search eval suite — Sprint 1.1.5.
 *
 * Scoring metric: NDCG@10 against a manually-curated ranked list of
 * relevant job IDs per query. Threshold per docs/ai-implementation-plan.md
 * §1.1.5: semantic search must beat the keyword baseline by ≥15%. The
 * baseline isn't tracked here — that's a separate suite.
 *
 * The runner is wired so each case calls the live `/api/jobs/search/semantic`
 * route via the `complete()` gateway pattern is NOT used here — this suite
 * runs DB-side semantic search, not an LLM completion. Therefore the suite
 * scoring is unusual: instead of letting the eval-runner compare a model
 * output to expected, we score the route's RANKING against an expected
 * ranked list, computing NDCG@10 directly.
 *
 * Because the eval-harness runner (lib/ai/eval/runner.ts) is hard-wired to
 * call `complete()`, we expose a STANDALONE runner here that the CLI can
 * call separately. The shared SuiteContract is still defined for symmetry
 * but isn't invoked through the eval-harness path.
 */

import type { SuiteContract } from '../types';

export interface JobSearchInput extends Record<string, string> {
    query: string;
}

export interface JobSearchExpected {
    /** Ranked list of job IDs the human curator considers relevant. Top = most relevant. */
    expectedTopK: ReadonlyArray<string>;
    /** Threshold this case must clear independently. Default 0.6. */
    minNdcgAt10?: number;
    /** Optional state filter to constrain the search the same way the user would. */
    filters?: { state?: string };
}

/**
 * Discounted cumulative gain — relevance(i) / log2(rank + 1).
 * For binary relevance (in expectedTopK = 1, else = 0), this is the
 * standard NDCG calculation.
 */
function dcg(ranked: ReadonlyArray<string>, expectedSet: ReadonlySet<string>, k: number): number {
    let sum = 0;
    const limit = Math.min(k, ranked.length);
    for (let i = 0; i < limit; i++) {
        const rel = expectedSet.has(ranked[i]) ? 1 : 0;
        sum += rel / Math.log2(i + 2); // +2 because log2(1) = 0
    }
    return sum;
}

function idealDcg(expectedCount: number, k: number): number {
    let sum = 0;
    const limit = Math.min(k, expectedCount);
    for (let i = 0; i < limit; i++) {
        sum += 1 / Math.log2(i + 2);
    }
    return sum;
}

/** Pure NDCG@K calculation. Exported for testing + reuse. */
export function ndcgAtK(
    actualRanking: ReadonlyArray<string>,
    expected: ReadonlyArray<string>,
    k = 10,
): number {
    if (expected.length === 0) return 1; // nothing to recall = vacuously perfect
    const expectedSet = new Set(expected);
    const idcg = idealDcg(expected.length, k);
    if (idcg === 0) return 0;
    return dcg(actualRanking, expectedSet, k) / idcg;
}

/**
 * Suite contract — the eval harness's standard scoreCase() signature.
 *
 * Job-search isn't an LLM-output suite though, so the harness's "feed model
 * output to scoreCase" path isn't useful here. Callers that want NDCG@K
 * scoring should call `ndcgAtK()` directly with the route's response.
 *
 * This contract exists so `EVAL_REGISTRY` has a uniform shape; the actual
 * eval execution lives in a separate runner (see runJobSearchSuite below).
 */
export const jobSearchContract: SuiteContract<JobSearchInput, JobSearchExpected> = {
    baselineThreshold: 0.65, // mean NDCG@10 across cases
    scoreCase({ gold, modelOutput }) {
        // modelOutput should be { ranking: string[] } when called from the
        // dedicated runner. If it isn't (e.g. someone wired this into the
        // standard harness), bail with a clear failure.
        const out = modelOutput as { ranking?: string[] } | null;
        if (!out || !Array.isArray(out.ranking)) {
            return { passed: false, score: 0, reason: 'no ranking provided to scoreCase' };
        }
        const ndcg = ndcgAtK(out.ranking, gold.expected.expectedTopK, 10);
        const minThreshold = gold.expected.minNdcgAt10 ?? 0.6;
        return {
            passed: ndcg >= minThreshold,
            score: ndcg,
            reason: `ndcg@10=${ndcg.toFixed(3)} (min=${minThreshold}) score=${(ndcg * 100).toFixed(1)}`,
        };
    },
};

/**
 * Standalone runner that calls the live semantic search route per query and
 * computes NDCG@10. Returns a suite-level summary suitable for CI gating.
 *
 * Imports are dynamic so the CLI doesn't pull in Prisma at module-load time
 * for environments that don't need it (e.g. unit tests of ndcgAtK alone).
 */
export interface JobSearchSuiteResult {
    promptVersion: string;
    totalCases: number;
    passed: number;
    failed: number;
    meanNdcgAt10: number;
    perCase: ReadonlyArray<{ id: string; ndcg: number; passed: boolean; reason: string }>;
    holdsBaseline: boolean;
    summary: string;
}

export async function runJobSearchSuite(): Promise<JobSearchSuiteResult> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const { embed } = await import('@/lib/ai/gateway');
    const { semanticJobSearch, platformRevenueJobsWithSimilarity, reciprocalRankFusion } = await import('@/lib/ai/vector-search');

    const file = path.join(process.cwd(), 'tests', 'ai', 'golden', 'job-search.json');
    const raw = await fs.readFile(file, 'utf-8');
    const json = JSON.parse(raw) as {
        promptVersion?: string;
        cases: Array<{ id: string; input: JobSearchInput; expected: JobSearchExpected }>;
    };
    const promptVersion = json.promptVersion ?? 'v1';
    const cases = json.cases ?? [];

    const perCase: Array<{ id: string; ndcg: number; passed: boolean; reason: string }> = [];

    for (const c of cases) {
        try {
            const tenant = { type: 'system' as const, id: 'eval-job-search' };
            const embedded = await embed({ input: c.input.query, tenant });
            const [topK, pool] = await Promise.all([
                semanticJobSearch(embedded.embedding, {
                    k: 50,
                    states: c.expected.filters?.state ? [c.expected.filters.state] : undefined,
                }),
                platformRevenueJobsWithSimilarity(embedded.embedding),
            ]);
            // Same fusion the production route uses.
            const rrf = reciprocalRankFusion([
                topK.map((h) => ({ id: h.jobId })),
                pool.map((h) => ({ id: h.jobId })),
            ]);
            const ranking = rrf.slice(0, 10).map((r) => r.id);

            const ndcg = ndcgAtK(ranking, c.expected.expectedTopK, 10);
            const min = c.expected.minNdcgAt10 ?? 0.6;
            perCase.push({
                id: c.id,
                ndcg,
                passed: ndcg >= min,
                reason: `ndcg@10=${ndcg.toFixed(3)} (min=${min})`,
            });
        } catch (err) {
            perCase.push({
                id: c.id,
                ndcg: 0,
                passed: false,
                reason: err instanceof Error ? err.message : String(err),
            });
        }
    }

    const passed = perCase.filter((p) => p.passed).length;
    const meanNdcg = perCase.length === 0
        ? 0
        : perCase.reduce((a, b) => a + b.ndcg, 0) / perCase.length;
    const baseline = jobSearchContract.baselineThreshold;
    const holdsBaseline = meanNdcg >= baseline;

    return {
        promptVersion,
        totalCases: perCase.length,
        passed,
        failed: perCase.length - passed,
        meanNdcgAt10: meanNdcg,
        perCase,
        holdsBaseline,
        summary: holdsBaseline
            ? `Mean NDCG@10 ${meanNdcg.toFixed(3)} ≥ baseline ${baseline.toFixed(3)} (${passed}/${perCase.length} cases passed)`
            : `Mean NDCG@10 ${meanNdcg.toFixed(3)} < baseline ${baseline.toFixed(3)} (${passed}/${perCase.length} cases passed) — REGRESSION`,
    };
}
