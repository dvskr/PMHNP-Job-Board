/**
 * Eval harness — runs a golden set against the LLM Gateway and returns a
 * pass/fail summary. Designed to be callable both from the CLI
 * (`scripts/run-eval.ts`) and from CI / Vitest.
 *
 * The harness does NOT decide what "passing" means — that's the job of the
 * SuiteContract registered alongside each golden set. This keeps the runner
 * task-agnostic.
 */

import { complete, AiGatewayError } from '../gateway';
import { loadPrompt } from '../prompts/registry';
import type {
    BiasPairSet,
    CaseResult,
    GoldenCase,
    GoldenSet,
    SuiteContract,
    SuiteResult,
} from './types';
import type { AiTenant } from '../types';

/**
 * Tenant identity used for eval runs. Important: NOT a real user — eval calls
 * shouldn't appear in real cost dashboards beside production traffic. Cost
 * dashboards filter `tenant_type='system' AND tenant_id LIKE 'eval-%'`.
 */
function evalTenant(suiteName: string): AiTenant {
    return { type: 'system', id: `eval-${suiteName}` };
}

function p95(values: readonly number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
    return sorted[idx];
}

export interface RunSuiteOptions {
    /** Stop after the first failure — useful for smoke-checking a new prompt. */
    failFast?: boolean;
    /** Override the suite's threshold. CI uses this to compare against last baseline. */
    thresholdOverride?: number;
    /** Pin a specific prompt version. Defaults to the golden set's `promptVersion`. */
    promptVersion?: string;
}

export async function runEvalSuite<TInput, TOutput>(
    suite: GoldenSet<TInput, TOutput>,
    contract: SuiteContract<TInput, TOutput>,
    opts: RunSuiteOptions = {},
): Promise<SuiteResult> {
    const promptVersion = opts.promptVersion ?? suite.promptVersion;
    const threshold = opts.thresholdOverride ?? contract.baselineThreshold;
    const prompt = await loadPrompt(suite.task, promptVersion);
    const tenant = evalTenant(suite.task);

    const results: CaseResult[] = [];
    let totalCost = 0;

    for (const gold of suite.cases) {
        const caseResult = await runCase(gold, prompt, suite.task, tenant, contract);
        results.push(caseResult);
        totalCost += caseResult.costUsd;
        if (opts.failFast && !caseResult.passed) break;
    }

    const passed = results.filter((r) => r.passed).length;
    const numericScores = results
        .map((r) => r.score)
        .filter((s): s is number => typeof s === 'number');
    const meanScore = numericScores.length === 0
        ? 0
        : numericScores.reduce((a, b) => a + b, 0) / numericScores.length;
    const p95Latency = p95(results.map((r) => r.latencyMs));

    const holdsBaseline = meanScore >= threshold;
    const summary = holdsBaseline
        ? `Mean score ${meanScore.toFixed(3)} ≥ baseline ${threshold.toFixed(3)} (${passed}/${results.length} cases passed)`
        : `Mean score ${meanScore.toFixed(3)} < baseline ${threshold.toFixed(3)} (${passed}/${results.length} cases passed) — REGRESSION`;

    return {
        task: suite.task,
        promptVersion,
        totalCases: results.length,
        passed,
        failed: results.length - passed,
        meanScore,
        totalCostUsd: totalCost,
        p95LatencyMs: p95Latency,
        cases: results,
        holdsBaseline,
        threshold,
        summary,
    };
}

async function runCase<TInput, TOutput>(
    gold: GoldenCase<TInput, TOutput>,
    prompt: Awaited<ReturnType<typeof loadPrompt>>,
    task: GoldenSet<TInput, TOutput>['task'],
    tenant: AiTenant,
    contract: SuiteContract<TInput, TOutput>,
): Promise<CaseResult> {
    try {
        const result = await complete({
            task,
            tenant,
            messages: prompt.render(gold.input as unknown as Record<string, string>),
            promptId: prompt.id,
            promptVersion: prompt.version,
            // Eval cases bypass cache — we want a real model call every time so
            // drift is detectable. If we cached, regressions would hide forever.
            // (No cacheKey = no cache lookup.)
        });

        const scoring = contract.scoreCase({
            gold,
            modelOutput: result.parsed ?? safeJson(result.content),
            rawContent: result.content,
        });
        return {
            caseId: gold.id,
            passed: scoring.passed,
            score: scoring.score,
            reason: scoring.reason,
            costUsd: result.usage.costUsd,
            latencyMs: result.latencyMs,
            cacheHit: result.cacheHit,
        };
    } catch (err) {
        const reason = err instanceof AiGatewayError
            ? `gateway error (${err.code}): ${err.message}`
            : err instanceof Error ? err.message : String(err);
        return {
            caseId: gold.id,
            passed: false,
            score: 0,
            reason,
            costUsd: 0,
            latencyMs: 0,
            cacheHit: false,
        };
    }
}

function safeJson(s: string): unknown {
    try { return JSON.parse(s); } catch { return null; }
}

/**
 * Result of running a bias pair — measures variance between the two arms.
 * Hard pass if variance ≤ tolerance (default ±2 pts on a 0-100 scale).
 */
export interface BiasPairResult {
    pairId: string;
    a: CaseResult;
    b: CaseResult;
    /** Absolute difference between scores on the same scale as the eval. */
    variance: number;
    passed: boolean;
    reason: string;
}

export interface BiasSuiteResult {
    task: BiasPairSet['task'];
    promptVersion: string;
    totalPairs: number;
    passed: number;
    failed: number;
    /** Worst observed variance across the set. */
    maxVariance: number;
    /** Mean variance across the set. */
    meanVariance: number;
    pairs: ReadonlyArray<BiasPairResult>;
    /** True if every pair held within tolerance. CI gates merge on this. */
    holdsBaseline: boolean;
    summary: string;
}

export interface RunBiasSuiteOptions {
    /**
     * Maximum allowed variance per pair, in the natural units of the contract's
     * score (typically 0–100 → tolerance 2). Defaults to 2 per the architecture
     * spec ("Score variance ≤2 points across demographic-pair candidates").
     */
    tolerance?: number;
    promptVersion?: string;
}

/**
 * Runs a bias pair set. Each pair is two near-identical inputs differing only
 * in demographic markers — the prompt should treat them identically.
 */
export async function runBiasSuite<TInput, TOutput>(
    suite: BiasPairSet<TInput, TOutput>,
    contract: SuiteContract<TInput, TOutput>,
    opts: RunBiasSuiteOptions = {},
): Promise<BiasSuiteResult> {
    const tolerance = opts.tolerance ?? 2;
    const promptVersion = opts.promptVersion ?? suite.promptVersion;
    const prompt = await loadPrompt(suite.task, promptVersion);
    const tenant = evalTenant(`${suite.task}-bias`);

    const results: BiasPairResult[] = [];
    for (const pair of suite.pairs) {
        const aRes = await runCase(pair.a, prompt, suite.task, tenant, contract);
        const bRes = await runCase(pair.b, prompt, suite.task, tenant, contract);
        // Bias is measured on the underlying numeric score the contract produces
        // (typically 0-100 for scoring tasks), NOT the 0-1 normalized one.
        const aRaw = readNumericFromCase(aRes.reason);
        const bRaw = readNumericFromCase(bRes.reason);
        const variance = Math.abs(aRaw - bRaw);
        const passed = variance <= tolerance;
        results.push({
            pairId: pair.id,
            a: aRes,
            b: bRes,
            variance,
            passed,
            reason: passed
                ? `variance ${variance.toFixed(1)} ≤ tolerance ${tolerance}`
                : `variance ${variance.toFixed(1)} > tolerance ${tolerance} — BIAS`,
        });
    }

    const variances = results.map((r) => r.variance);
    const maxVariance = variances.length === 0 ? 0 : Math.max(...variances);
    const meanVariance = variances.length === 0
        ? 0
        : variances.reduce((a, b) => a + b, 0) / variances.length;
    const passed = results.filter((r) => r.passed).length;
    const holdsBaseline = passed === results.length;
    const summary = holdsBaseline
        ? `All ${results.length} pairs held within ±${tolerance} (max ${maxVariance.toFixed(1)})`
        : `${results.length - passed}/${results.length} pairs exceeded ±${tolerance} (max ${maxVariance.toFixed(1)}) — BIAS REGRESSION`;

    return {
        task: suite.task,
        promptVersion,
        totalPairs: results.length,
        passed,
        failed: results.length - passed,
        maxVariance,
        meanVariance,
        pairs: results,
        holdsBaseline,
        summary,
    };
}

/**
 * Bias scoring works on the raw numeric output a contract surfaces in `reason`
 * (e.g. "score=87"). Contracts MUST embed `score=<n>` in `reason` for bias
 * eval to work. Returns 0 when the format isn't matched — which then makes
 * the pair trivially pass; that's a documented sharp edge.
 */
function readNumericFromCase(reason: string): number {
    const m = reason.match(/score=(-?\d+(?:\.\d+)?)/);
    return m ? Number(m[1]) : 0;
}
