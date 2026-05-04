/**
 * Shared types for the AI eval harness.
 *
 * A "golden set" is the source of truth for what we expect a prompt to do —
 * curated by humans, run on every prompt change, hard-required to hold the
 * baseline before merge (Sprint 0.2.5 CI gate).
 */

import type { AiTaskId } from '../types';

/** A single hand-rated case. */
export interface GoldenCase<TInput = Record<string, unknown>, TOutput = unknown> {
    /** Stable id; used in CI output + diff reports. */
    id: string;
    /** Free-form description of what this case is testing. */
    description?: string;
    /** Inputs to feed into the prompt's template variables. */
    input: TInput;
    /** What we expect the model to produce. Shape is task-specific. */
    expected: TOutput;
    /** Optional metadata — e.g. demographic markers for bias pair sets. */
    tags?: Record<string, string>;
}

/** A pair of cases used for bias evaluation (same content, different demographics). */
export interface BiasPairCase<TInput = Record<string, unknown>, TOutput = unknown> {
    id: string;
    description?: string;
    /** First half of the demographic pair (e.g., male candidate). */
    a: GoldenCase<TInput, TOutput>;
    /** Second half (e.g., female candidate). Same content, demographic markers differ. */
    b: GoldenCase<TInput, TOutput>;
}

export interface GoldenSet<TInput = Record<string, unknown>, TOutput = unknown> {
    task: AiTaskId;
    promptVersion: string;
    /** Description of what the set covers + curation date. Goes in CI output. */
    description: string;
    cases: ReadonlyArray<GoldenCase<TInput, TOutput>>;
}

export interface BiasPairSet<TInput = Record<string, unknown>, TOutput = unknown> {
    task: AiTaskId;
    promptVersion: string;
    description: string;
    pairs: ReadonlyArray<BiasPairCase<TInput, TOutput>>;
}

/** Result of running a single golden case. */
export interface CaseResult {
    caseId: string;
    /** True if the case passes the task-specific scoring function. */
    passed: boolean;
    /** Numeric quality score 0–1, or null if not applicable. */
    score: number | null;
    /** Human-readable explanation of why pass/fail. */
    reason: string;
    /** Cost in USD for this case (informational; aggregated by suite). */
    costUsd: number;
    latencyMs: number;
    cacheHit: boolean;
}

export interface SuiteResult {
    task: AiTaskId;
    promptVersion: string;
    totalCases: number;
    passed: number;
    failed: number;
    /** Mean of all numeric scores (null entries excluded). 0–1. */
    meanScore: number;
    totalCostUsd: number;
    p95LatencyMs: number;
    cases: ReadonlyArray<CaseResult>;
    /**
     * Whether the suite as a whole holds the baseline. CI gates merge on this.
     * Threshold per task lives in the suite definition.
     */
    holdsBaseline: boolean;
    /** Threshold the suite needed to clear (e.g., 0.80 for "80% within ±10pt"). */
    threshold: number;
    /** Reason the suite did or did not hold. */
    summary: string;
}

/** Per-task pluggable scoring + threshold. Lives next to the golden set. */
export interface SuiteContract<TInput = Record<string, unknown>, TOutput = unknown> {
    /**
     * Convert the loaded golden case + raw model output into a CaseResult.
     * Implementations decide what "passing" means (e.g., score within ±10 pts).
     */
    scoreCase(args: {
        gold: GoldenCase<TInput, TOutput>;
        modelOutput: unknown;
        rawContent: string;
    }): { passed: boolean; score: number | null; reason: string };

    /** Mean numeric score the suite must clear to "hold baseline". 0–1. */
    baselineThreshold: number;
}
