/**
 * Candidate scoring eval suite — contract + helpers.
 *
 * Threshold per docs/ai-implementation-plan.md §1.1:
 *   "≥80% of cases within ±10 points of human-rated expected score on a
 *    100-case golden set."
 *
 * The golden cases themselves live in tests/ai/golden/candidate-scoring.json
 * so they can be edited without a code change. See that file's header comment
 * for the curation TODO (seed cases included; 100 hand-rated cases pending
 * domain-expert review per Sprint 0.2.4).
 */

import { z } from 'zod';
import type { GoldenSet, SuiteContract } from '../types';

/** Shape of the scoring model's expected output. */
export const scoringExpectedSchema = z.object({
    /** Center of the acceptable score band (0–100). */
    expectedScore: z.number().min(0).max(100),
    /**
     * Allowed deviation from `expectedScore`. Defaults to 10 per the spec
     * (±10 pts = within band).
     */
    toleranceBand: z.number().min(0).max(50).default(10),
    /** Substrings the matchReasons array must contain (case-insensitive). */
    mustMention: z.array(z.string()).default([]),
    /** Substrings that MUST NOT appear in matchReasons (e.g., demographic refs). */
    mustNotMention: z.array(z.string()).default([]),
});

export type ScoringExpected = z.infer<typeof scoringExpectedSchema>;

export interface ScoringInput extends Record<string, string> {
    jobSummary: string;
    candidateSummary: string;
}

const modelOutputSchema = z.object({
    score: z.number().optional(),
    matchReasons: z.array(z.unknown()).optional(),
    missingItems: z.array(z.unknown()).optional(),
});

export const candidateScoringContract: SuiteContract<ScoringInput, ScoringExpected> = {
    baselineThreshold: 0.80, // 80% of cases must pass per §1.1.

    scoreCase({ gold, modelOutput }) {
        const parsed = modelOutputSchema.safeParse(modelOutput);
        if (!parsed.success) {
            return {
                passed: false,
                score: 0,
                reason: `model output failed schema validation; score=0`,
            };
        }
        const got = parsed.data;
        const reasons = (got.matchReasons ?? []).filter((r): r is string => typeof r === 'string');

        // Numeric score within ±tolerance of expected.
        const expected = gold.expected.expectedScore;
        const tolerance = gold.expected.toleranceBand ?? 10;
        const actual = typeof got.score === 'number' ? got.score : -1;
        const inBand = Math.abs(actual - expected) <= tolerance;

        // Required mentions present?
        const lower = reasons.map((r) => r.toLowerCase()).join(' || ');
        const missingMustMention = gold.expected.mustMention.filter((s) => !lower.includes(s.toLowerCase()));
        const presentMustNotMention = gold.expected.mustNotMention.filter((s) => lower.includes(s.toLowerCase()));

        const passed = inBand && missingMustMention.length === 0 && presentMustNotMention.length === 0;
        const reasonParts: string[] = [`score=${actual}`, `expected=${expected}±${tolerance}`];
        if (!inBand) reasonParts.push(`OUT_OF_BAND`);
        if (missingMustMention.length) reasonParts.push(`missing_mentions=[${missingMustMention.join(',')}]`);
        if (presentMustNotMention.length) reasonParts.push(`forbidden_mentions=[${presentMustNotMention.join(',')}]`);

        return {
            passed,
            // Normalized 0–1 score: 1 if in band, decays linearly outside.
            score: inBand ? 1 : Math.max(0, 1 - Math.abs(actual - expected) / 100),
            reason: reasonParts.join(' | '),
        };
    },
};

/** Loads the bias pair set from disk. */
export async function loadCandidateScoringBiasSet(): Promise<{
    task: 'candidate_scoring';
    promptVersion: string;
    description: string;
    pairs: Array<{
        id: string;
        description?: string;
        a: { id: string; input: ScoringInput; expected: ScoringExpected };
        b: { id: string; input: ScoringInput; expected: ScoringExpected };
    }>;
}> {
    const { readFile } = await import('fs/promises');
    const path = await import('path');
    const file = path.join(process.cwd(), 'tests', 'ai', 'bias', 'candidate-scoring-pairs.json');
    const raw = await readFile(file, 'utf-8');
    const json = JSON.parse(raw) as { promptVersion?: string; description?: string; pairs: unknown[] };
    const pairs = (json.pairs ?? []).map((p: unknown) => {
        const item = p as {
            id: string;
            description?: string;
            a: { id: string; input: ScoringInput; expected: unknown };
            b: { id: string; input: ScoringInput; expected: unknown };
        };
        return {
            id: item.id,
            description: item.description,
            a: { id: item.a.id, input: item.a.input, expected: scoringExpectedSchema.parse(item.a.expected) },
            b: { id: item.b.id, input: item.b.input, expected: scoringExpectedSchema.parse(item.b.expected) },
        };
    });
    return {
        task: 'candidate_scoring' as const,
        promptVersion: json.promptVersion ?? 'v1',
        description: json.description ?? 'Candidate scoring bias pair set',
        pairs,
    };
}

/** Loads the golden set from disk. Kept separate so JSON can be edited freely. */
export async function loadCandidateScoringGoldenSet(): Promise<
    GoldenSet<ScoringInput, ScoringExpected>
> {
    const { readFile } = await import('fs/promises');
    const path = await import('path');
    const file = path.join(process.cwd(), 'tests', 'ai', 'golden', 'candidate-scoring.json');
    const raw = await readFile(file, 'utf-8');
    const json = JSON.parse(raw);

    // Validate + normalize each case's expected via the schema.
    const cases = (json.cases ?? []).map((c: unknown) => {
        const item = c as { id: string; description?: string; input: ScoringInput; expected: unknown; tags?: Record<string, string> };
        return {
            id: item.id,
            description: item.description,
            input: item.input,
            expected: scoringExpectedSchema.parse(item.expected),
            tags: item.tags,
        };
    });

    return {
        task: 'candidate_scoring',
        promptVersion: json.promptVersion ?? 'v1',
        description: json.description ?? 'Candidate scoring golden set',
        cases,
    };
}
