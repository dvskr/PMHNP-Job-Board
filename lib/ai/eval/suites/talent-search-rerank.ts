/**
 * Talent-search rerank eval suite — Sprint 1.3.4.
 *
 * Two rankings are computed per case from the SAME input candidate list:
 *
 *   1. Vector-only — embed the query + each candidate text; sort by cosine
 *      similarity descending. This is the baseline a pure pgvector pipeline
 *      would produce without an LLM.
 *
 *   2. Rerank — the same prompt the production route uses
 *      (lib/ai/prompts/talent_search_rerank/v1.json) called via the gateway.
 *      The model returns ordered candidate indices.
 *
 * Both are scored with precision@K against the human-curated `expectedTopK`.
 * The suite holds baseline only when:
 *
 *   mean(rerank precision@K) ≥ 1.20 × mean(vector precision@K)
 *
 * That's the "rerank must beat pure vector by 20%" gate from
 * docs/ai-implementation-plan.md §1.3.4. If a future prompt change degrades
 * the rerank below this threshold, `npm run eval talent_search_rerank` exits
 * non-zero and CI blocks merge.
 *
 * The runner uses dynamic imports so module-load doesn't drag the gateway
 * + provider SDKs into unit-test contexts that only want the pure math.
 */

import type { SuiteContract } from '../types';

export interface TalentRerankInput extends Record<string, string> {
    jobSummary: string;
    candidateList: string;
}

export interface TalentRerankExpected {
    /** 1-based candidate indices the human curator considers correct. */
    expectedTopK: ReadonlyArray<number>;
    /** Comparison cutoff. Default = expectedTopK.length. */
    k?: number;
    /** Per-case floor for the rerank ranking. Default 0.5. */
    minPrecisionAtK?: number;
}

/**
 * The "20% better than vector" gate. Tuned by spec; lower it only with a
 * deliberate change to docs/ai-implementation-plan.md §1.3.4.
 */
export const RERANK_LIFT_REQUIRED = 1.20;

/* ─────────────────────────── Pure math ─────────────────────────── */

/**
 * Precision@K = |actual_top_k ∩ expected| / k.
 * Both inputs are 1-based candidate indices to match the golden file format.
 *
 * Edge cases:
 *   - expected empty → 1 (vacuously perfect; nothing to find)
 *   - actual empty → 0
 *   - K larger than actual → divide by actual.length, not K (otherwise the
 *     metric punishes short lists for not having enough hits to pad)
 */
export function precisionAtK(
    actualRanking: ReadonlyArray<number>,
    expected: ReadonlyArray<number>,
    k: number,
): number {
    if (expected.length === 0) return 1;
    if (actualRanking.length === 0) return 0;
    const denom = Math.min(k, actualRanking.length);
    if (denom === 0) return 0;
    const expectedSet = new Set(expected);
    const topK = actualRanking.slice(0, denom);
    let hits = 0;
    for (const i of topK) if (expectedSet.has(i)) hits += 1;
    return hits / denom;
}

/**
 * Cosine similarity for two equal-length vectors. Returns 0 when either
 * vector is the zero vector (avoids NaN from a 0-magnitude divide).
 */
export function cosineSimilarity(a: ReadonlyArray<number>, b: ReadonlyArray<number>): number {
    if (a.length !== b.length || a.length === 0) return 0;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }
    if (magA === 0 || magB === 0) return 0;
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * Parse the multi-line `candidateList` into individual candidate text blocks.
 * The format is: `Candidate #N | field: value | field: value`, one per
 * paragraph (separated by blank lines OR newlines).
 *
 * Returns a 1-indexed map: index N → full candidate text. The text is what
 * gets embedded for the vector ranking.
 */
export function parseCandidateList(raw: string): Map<number, string> {
    const out = new Map<number, string>();
    const blocks = raw.split(/\n\s*\n|\n(?=Candidate #\d)/g);
    for (const block of blocks) {
        const trimmed = block.trim();
        if (!trimmed) continue;
        // Read just the leading "Candidate #N" — no `s` flag needed; the
        // remaining body stays in `trimmed` and is what we store.
        const match = trimmed.match(/^Candidate #(\d+)\s*\|/);
        if (!match) continue;
        const idx = parseInt(match[1], 10);
        if (Number.isNaN(idx)) continue;
        out.set(idx, trimmed);
    }
    return out;
}

/* ─────────────────────────── Suite contract ─────────────────────────── */

export const talentSearchRerankContract: SuiteContract<TalentRerankInput, TalentRerankExpected> = {
    /**
     * Baseline = the rerank's precision@K floor BEFORE the vector-comparison
     * gate. Set conservatively at 0.50 because the lift gate (1.20×) is the
     * primary signal — a slate that holds 0.50 absolute AND 1.20× lift is
     * unambiguously better than vector.
     */
    baselineThreshold: 0.50,
    scoreCase({ gold, modelOutput }) {
        const out = modelOutput as { ranking?: number[] } | null;
        if (!out || !Array.isArray(out.ranking)) {
            return { passed: false, score: 0, reason: 'no ranking provided to scoreCase' };
        }
        const k = gold.expected.k ?? gold.expected.expectedTopK.length;
        const score = precisionAtK(out.ranking, gold.expected.expectedTopK, k);
        const min = gold.expected.minPrecisionAtK ?? 0.5;
        return {
            passed: score >= min,
            score,
            reason: `precision@${k}=${score.toFixed(3)} (min=${min})`,
        };
    },
};

/* ─────────────────────────── Runner ─────────────────────────── */

export interface TalentRerankPerCase {
    id: string;
    k: number;
    vectorPrecision: number;
    rerankPrecision: number;
    /** Per-case lift, capped at 1.0 / 0 to keep the math sane when vector = 0. */
    lift: number;
    passed: boolean;
    reason: string;
}

export interface TalentRerankSuiteResult {
    promptVersion: string;
    totalCases: number;
    passed: number;
    failed: number;
    meanVectorPrecision: number;
    meanRerankPrecision: number;
    /** Population-level lift = mean(rerank) / mean(vector). Drives the gate. */
    aggregateLift: number;
    perCase: ReadonlyArray<TalentRerankPerCase>;
    holdsBaseline: boolean;
    summary: string;
}

/**
 * Standalone runner. For each case:
 *   1. Embed the query + every candidate text → vector precision@K
 *   2. Call the rerank prompt via the gateway → rerank precision@K
 *   3. Compute per-case lift + populate perCase log
 *
 * Suite holds baseline iff aggregate lift ≥ 1.20 (spec) AND
 * mean rerank precision ≥ 0.50 (sanity floor).
 */
export async function runTalentSearchRerankSuite(): Promise<TalentRerankSuiteResult> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const { embed, complete } = await import('@/lib/ai/gateway');
    const { loadPrompt } = await import('@/lib/ai/prompts/registry');
    const { z } = await import('zod');

    const file = path.join(process.cwd(), 'tests', 'ai', 'golden', 'talent-search-rerank.json');
    const raw = await fs.readFile(file, 'utf-8');
    const json = JSON.parse(raw) as {
        promptVersion?: string;
        cases: Array<{ id: string; input: TalentRerankInput; expected: TalentRerankExpected }>;
    };
    const promptVersion = json.promptVersion ?? 'v1';
    const cases = json.cases ?? [];

    const rerankResultSchema = z.object({
        ranked: z.array(z.object({
            candidateIndex: z.number().int(),
            reason: z.string().max(500).optional(),
        })),
    });

    const perCase: TalentRerankPerCase[] = [];
    const tenant = { type: 'system' as const, id: 'eval-talent-rerank' };
    const prompt = await loadPrompt('talent_search_rerank');

    for (const c of cases) {
        const k = c.expected.k ?? c.expected.expectedTopK.length;
        try {
            const candidateMap = parseCandidateList(c.input.candidateList);
            if (candidateMap.size === 0) {
                perCase.push({
                    id: c.id, k,
                    vectorPrecision: 0, rerankPrecision: 0, lift: 0,
                    passed: false,
                    reason: 'parseCandidateList returned 0 candidates — golden file format issue',
                });
                continue;
            }

            // ── 1. Vector ranking ──────────────────────────────────────
            const queryEmbed = await embed({ input: c.input.jobSummary, tenant });
            const candidateEmbeddings = await Promise.all(
                [...candidateMap.entries()].map(async ([idx, text]) => {
                    const e = await embed({ input: text, tenant });
                    return { idx, similarity: cosineSimilarity(queryEmbed.embedding, e.embedding) };
                }),
            );
            const vectorRanking = [...candidateEmbeddings]
                .sort((a, b) => b.similarity - a.similarity)
                .map((x) => x.idx);
            const vectorPrecision = precisionAtK(vectorRanking, c.expected.expectedTopK, k);

            // ── 2. Rerank ranking ──────────────────────────────────────
            // Routes through the production task registry (lib/ai/tasks.ts)
            // so the eval exercises the EXACT model + temperature + JSON
            // mode the live `/api/employer/talent/search` route uses.
            const result = await complete({
                task: 'talent_search_rerank',
                tenant,
                messages: prompt.render({
                    jobSummary: c.input.jobSummary,
                    candidateList: c.input.candidateList,
                }),
                promptId: prompt.id,
                promptVersion: prompt.version,
                cacheKey: ['eval-rerank', prompt.version, c.id],
                outputSchema: rerankResultSchema,
            });
            const rerankRanking = (result.parsed?.ranked ?? []).map((r) => r.candidateIndex);
            const rerankPrecision = precisionAtK(rerankRanking, c.expected.expectedTopK, k);

            // ── 3. Per-case lift ───────────────────────────────────────
            // When vector = 0 and rerank > 0, lift is conceptually infinite
            // — represent as Infinity in the per-case log but cap to 2.0 in
            // the perCase reason text so logs remain readable.
            const lift = vectorPrecision === 0
                ? (rerankPrecision > 0 ? Infinity : 1)
                : rerankPrecision / vectorPrecision;
            const minP = c.expected.minPrecisionAtK ?? 0.5;
            const passed = rerankPrecision >= minP;

            perCase.push({
                id: c.id,
                k,
                vectorPrecision,
                rerankPrecision,
                lift,
                passed,
                reason: `vector=${vectorPrecision.toFixed(3)} rerank=${rerankPrecision.toFixed(3)} lift=${Number.isFinite(lift) ? lift.toFixed(2) + '×' : '∞'}`,
            });
        } catch (err) {
            perCase.push({
                id: c.id, k,
                vectorPrecision: 0, rerankPrecision: 0, lift: 0,
                passed: false,
                reason: err instanceof Error ? err.message : String(err),
            });
        }
    }

    const meanVector = perCase.length === 0
        ? 0
        : perCase.reduce((a, b) => a + b.vectorPrecision, 0) / perCase.length;
    const meanRerank = perCase.length === 0
        ? 0
        : perCase.reduce((a, b) => a + b.rerankPrecision, 0) / perCase.length;
    // Aggregate lift caps the divide-by-zero edge: if vector is exactly 0,
    // the rerank still passes the gate as long as it cleared the abs floor.
    const aggregateLift = meanVector === 0 ? Infinity : meanRerank / meanVector;
    const passedCases = perCase.filter((p) => p.passed).length;

    const liftHolds = aggregateLift >= RERANK_LIFT_REQUIRED;
    const absHolds = meanRerank >= talentSearchRerankContract.baselineThreshold;
    const holdsBaseline = liftHolds && absHolds;

    const liftStr = Number.isFinite(aggregateLift) ? `${aggregateLift.toFixed(2)}×` : '∞';
    const summary = holdsBaseline
        ? `Rerank holds baseline — mean precision ${meanRerank.toFixed(3)} vs vector ${meanVector.toFixed(3)} (lift ${liftStr}, required ≥${RERANK_LIFT_REQUIRED.toFixed(2)}×). ${passedCases}/${perCase.length} cases passed absolute floor.`
        : !liftHolds
            ? `REGRESSION — rerank lift ${liftStr} < required ${RERANK_LIFT_REQUIRED.toFixed(2)}× over vector. mean(rerank)=${meanRerank.toFixed(3)} mean(vector)=${meanVector.toFixed(3)}.`
            : `REGRESSION — rerank mean precision ${meanRerank.toFixed(3)} < absolute floor ${talentSearchRerankContract.baselineThreshold.toFixed(2)}.`;

    return {
        promptVersion,
        totalCases: perCase.length,
        passed: passedCases,
        failed: perCase.length - passedCases,
        meanVectorPrecision: meanVector,
        meanRerankPrecision: meanRerank,
        aggregateLift,
        perCase,
        holdsBaseline,
        summary,
    };
}
