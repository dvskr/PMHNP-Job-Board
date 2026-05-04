/**
 * Public entrypoint for the eval harness. Higher-level helpers that other
 * modules (CLI, drift cron, CI) consume.
 *
 * Two suite shapes are supported:
 *   - `runGolden` + `runBias` — model-output suites. The harness runner
 *     calls `complete()` per case and scores the LLM response against the
 *     golden expected output. Used for prompt-driven tasks like
 *     `candidate_scoring`.
 *   - `runRanking` — ranking suites. Standalone runners that score the
 *     ORDER of results returned by a non-LLM pipeline (vector search,
 *     selector). Used for `job_search` (NDCG@10) and `candidate_recommendations`
 *     (hit-rate). The CLI calls these when the task has no `runGolden`.
 */

import { runEvalSuite, runBiasSuite, type RunSuiteOptions, type RunBiasSuiteOptions } from './runner';
import {
    candidateScoringContract,
    loadCandidateScoringGoldenSet,
    loadCandidateScoringBiasSet,
} from './suites/candidate-scoring';
import { runJobSearchSuite, type JobSearchSuiteResult } from './suites/job-search';
import { runRecommendationsSuite, type RecommendationsSuiteResult } from './suites/candidate-recommendations';
import { runTalentSearchRerankSuite, type TalentRerankSuiteResult } from './suites/talent-search-rerank';
import type { AiTaskId } from '../types';

export interface RankingSuiteResult {
    holdsBaseline: boolean;
    summary: string;
    /** Free-form per-case payload printed by the CLI; shape varies by suite. */
    perCase: ReadonlyArray<{ id: string; passed: boolean; reason: string }>;
}

export interface EvalSuiteEntry {
    /** Model-output golden suite (LLM call per case). Optional. */
    runGolden?(opts?: RunSuiteOptions): Promise<Awaited<ReturnType<typeof runEvalSuite>>>;
    /** Model-output bias-pair suite. Optional. Pairs with runGolden. */
    runBias?(opts?: RunBiasSuiteOptions): Promise<Awaited<ReturnType<typeof runBiasSuite>>>;
    /** Ranking suite (non-LLM pipeline scoring). Optional, mutually exclusive with runGolden. */
    runRanking?(): Promise<RankingSuiteResult>;
}

/**
 * Registry of every task with eval coverage. Adding a new suite here is the
 * only step required to make `npm run eval <task>` work.
 */
export const EVAL_REGISTRY: Partial<Record<AiTaskId, EvalSuiteEntry>> = {
    candidate_scoring: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        runGolden: async (opts) => runEvalSuite(await loadCandidateScoringGoldenSet(), candidateScoringContract as any, opts),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        runBias:   async (opts) => runBiasSuite(await loadCandidateScoringBiasSet() as any, candidateScoringContract as any, opts),
    },
    talent_search_rerank: {
        // Sprint 1.3.4 — rerank precision@K must beat vector by 1.20×.
        // Suite holds baseline only when both the absolute floor (0.50) AND
        // the lift gate are satisfied; see runTalentSearchRerankSuite.
        runRanking: async () => {
            const r: TalentRerankSuiteResult = await runTalentSearchRerankSuite();
            return {
                holdsBaseline: r.holdsBaseline,
                summary: r.summary,
                perCase: r.perCase.map((c) => ({ id: c.id, passed: c.passed, reason: c.reason })),
            };
        },
    },
    embeddings_generic: {
        // Embedding similarity has no eval — quality drift surfaces via the
        // downstream task evals (search NDCG, recs hit-rate).
    },
};

// `job_search` and `talent_search_rerank` aren't real AiTaskId values for the
// gateway/registry, but eval suites for them are still useful. We track them
// in a parallel ranking-only registry so the CLI can dispatch to them by
// string key without polluting the typed AiTaskId union.
export const RANKING_EVAL_REGISTRY: Record<string, EvalSuiteEntry> = {
    job_search: {
        runRanking: async () => {
            const r: JobSearchSuiteResult = await runJobSearchSuite();
            return {
                holdsBaseline: r.holdsBaseline,
                summary: r.summary,
                perCase: r.perCase.map((c) => ({ id: c.id, passed: c.passed, reason: c.reason })),
            };
        },
    },
    candidate_recommendations: {
        runRanking: async () => {
            const r: RecommendationsSuiteResult = await runRecommendationsSuite();
            return {
                holdsBaseline: r.holdsBaseline,
                summary: r.summary,
                perCase: r.perCase.map((c) => ({ id: c.id, passed: c.passed, reason: c.reason })),
            };
        },
    },
};

export function listEvalTasks(): string[] {
    const fromTyped = (Object.keys(EVAL_REGISTRY) as AiTaskId[]).filter((k) => {
        const entry = EVAL_REGISTRY[k];
        return entry && (entry.runGolden || entry.runRanking);
    });
    return [...fromTyped, ...Object.keys(RANKING_EVAL_REGISTRY)];
}

export function getEvalEntry(task: string): EvalSuiteEntry | undefined {
    return (EVAL_REGISTRY[task as AiTaskId] ?? RANKING_EVAL_REGISTRY[task]);
}
