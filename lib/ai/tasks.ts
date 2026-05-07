/**
 * Task registry — single source of truth for which model + provider handles
 * each AI task, plus its cache TTL, output mode, and per-tenant rate limit.
 *
 * Mirrors docs/ai-implementation-plan.md §0.1.A "Task → Model Routing Table".
 * Add an entry here AND extend AiTaskId in types.ts when shipping a new feature.
 *
 * The gateway throws at call-time if asked for a task that isn't registered.
 *
 * Migration path when a model upgrades (e.g., gpt-5.5 → gpt-5.6):
 *   1. Update one row here.
 *   2. Eval suite runs on the affected task(s) — must hold baseline.
 *   3. Bias eval runs — variance still ≤ 2pt.
 *   4. Cost dashboard alerts if unit cost drifts > 20%.
 *   5. Single-line change ships, NO call sites touched.
 */

import type { AiOutputMode, AiProvider, AiTaskId } from './types';
import type { AiRateLimit } from './rate-limiter';

export interface TaskTarget {
    provider: AiProvider;
    model: string;
}

export interface TaskConfig {
    /** Default model + provider for this task. */
    primary: TaskTarget;
    /**
     * Fallback chain in order. Tried only when the primary fails or its circuit
     * breaker is open. Empty array = no fallback (fail loud). Embeddings_generic
     * uses an empty chain by design — there is no off-the-shelf substitute at
     * the same dim count.
     */
    fallbacks: ReadonlyArray<TaskTarget>;
    /**
     * Optional premium upgrade — routed when caller passes `priority: 'premium'`.
     * Reserved for tasks where quality compounds (SEO hero pages today). Falls
     * back to the standard primary if absent.
     */
    premium?: TaskTarget;
    /** Output mode hint — drives JSON-mode and downstream parsing. */
    outputMode: AiOutputMode;
    /** TTL for cached responses. Set to 0 to disable caching for this task. */
    cacheTtlSeconds: number;
    /** Default sampling temperature. */
    temperature: number;
    /** Default max output tokens. */
    maxOutputTokens: number;
    /** Default request timeout. */
    timeoutMs: number;
    /** Per-tenant rate limit. */
    rateLimit: AiRateLimit;
}

const SCORING_LIKE: Pick<TaskConfig, 'temperature' | 'maxOutputTokens' | 'timeoutMs'> = {
    temperature: 0.1,
    // Bumped 600 → 4000 (2026-05-04) because gpt-5-mini and other reasoning
    // models use the max_completion_tokens budget for INTERNAL reasoning
    // PLUS the visible JSON output. 600 was being eaten by reasoning, the
    // JSON envelope got cut off mid-stream, and Zod parse failed. Symptom:
    // 'Output failed schema validation: Unexpected end of JSON input'.
    // 4000 is comfortable for a single scoring object (~50 tokens output)
    // plus several thousand reasoning tokens. Same fix that landed for
    // talent_search_rerank (8000); this tier is half because output is
    // smaller.
    maxOutputTokens: 4_000,
    timeoutMs: 30_000,
};
const CREATIVE_LIKE: Pick<TaskConfig, 'temperature' | 'maxOutputTokens' | 'timeoutMs'> = {
    temperature: 0.7,
    maxOutputTokens: 1_500,
    timeoutMs: 60_000,
};

export const TASK_REGISTRY: Record<AiTaskId, TaskConfig> = {
    // ── PHASE 0 — wired ───────────────────────────────────────────────────
    candidate_scoring: {
        primary:   { provider: 'openai',    model: 'gpt-5-mini' },
        fallbacks: [{ provider: 'anthropic', model: 'claude-sonnet-4-6' }],
        outputMode: 'json',
        cacheTtlSeconds: 86_400,
        ...SCORING_LIKE,
        rateLimit: { limit: 200, windowSeconds: 3600 },
    },
    resume_parsing: {
        primary:   { provider: 'openai',    model: 'gpt-5-mini' },
        fallbacks: [{ provider: 'anthropic', model: 'claude-sonnet-4-6' }],
        outputMode: 'json',
        cacheTtlSeconds: 7 * 86_400,
        temperature: 0.1,
        // Bumped 8_000 → 16_000 (2026-05-07). The v2 prompt asks for
        // verbatim bullets per work-experience role + a verbatim
        // professionalSummary paragraph, both of which dramatically
        // increase the OUTPUT side of the budget on top of gpt-5-mini's
        // hidden reasoning tokens. A kitchen-sink resume (5 degrees,
        // 6 licenses, 7 work entries with 3-5 bullets each, 8 certs,
        // a long summary paragraph) easily needs 6-8k just for the
        // visible JSON output, plus reasoning headroom.
        maxOutputTokens: 16_000,
        // Bumped 90_000 → 180_000 (2026-05-07). The 90s cap was hitting
        // the abort signal mid-stream on real resumes — symptom was
        // "OpenAI request aborted" / "All providers failed" with the
        // total request time clocking in at ~92s. gpt-5-mini's reasoning
        // pass on the v2 verbatim-bullet schema regularly takes 60-150s
        // on complex inputs. 3 minutes gives realistic headroom while
        // still bounded enough that runaway calls are caught.
        timeoutMs: 180_000,
        rateLimit: { limit: 20, windowSeconds: 3600 },
    },
    embeddings_generic: {
        primary:   { provider: 'openai', model: 'text-embedding-3-small' },
        fallbacks: [], // No drop-in substitute at 1536 dims; rare failure mode.
        outputMode: 'vector',
        cacheTtlSeconds: 0, // Caching is handled by the embedding worker (table is the cache).
        temperature: 0,
        maxOutputTokens: 0,
        timeoutMs: 15_000,
        rateLimit: { limit: 5_000, windowSeconds: 3600 },
    },

    // ── PHASE 1 — wires up in Sprint 1.x ──────────────────────────────────
    talent_search_rerank: {
        primary:   { provider: 'openai',    model: 'gpt-5-mini' },
        fallbacks: [{ provider: 'anthropic', model: 'claude-sonnet-4-6' }],
        outputMode: 'json',
        cacheTtlSeconds: 600, // 10 min — searches repeat fast within a session.
        temperature: 0.2,
        // gpt-5-mini and other reasoning-capable models use the
        // max_completion_tokens budget for BOTH internal reasoning
        // AND the visible output. With ~30 candidates in the input
        // and a JSON envelope that needs 10 picks × one-sentence reason
        // each, 1200 was getting cut off mid-array (truncated JSON →
        // 'Unexpected end of JSON input'). 8000 leaves plenty of head-
        // room for reasoning while keeping cost bounded — output tokens
        // are billed at $2/M for gpt-5-mini, so worst-case ~$0.016/call.
        maxOutputTokens: 8_000,
        // Bumped 45s → 90s (2026-05-04). With 50-candidate input,
        // 8000 token reasoning budget, and gpt-5-mini's variable
        // thinking time, single calls regularly hit 60-80s and the
        // 45s cap was aborting mid-stream during eval suites. 90s is
        // still well under the workflow timeout.
        timeoutMs: 90_000,
        // 200/hour is well above any realistic per-employer load (the
        // route enforces 10/day per employer separately) and gives eval
        // suites of 30-40 cases enough headroom to complete in one run.
        rateLimit: { limit: 200, windowSeconds: 3600 },
    },
    career_path_analysis: {
        primary:   { provider: 'openai',    model: 'gpt-5.4' },
        fallbacks: [{ provider: 'anthropic', model: 'claude-opus-4-7' }],
        outputMode: 'json',
        cacheTtlSeconds: 7 * 86_400,
        ...CREATIVE_LIKE,
        rateLimit: { limit: 10, windowSeconds: 3600 },
    },

    // ── PHASE 2 — wires up in Sprint 2.x ──────────────────────────────────
    application_coach: {
        primary:   { provider: 'openai',    model: 'gpt-5-mini' },
        fallbacks: [{ provider: 'anthropic', model: 'claude-sonnet-4-6' }],
        outputMode: 'json',
        cacheTtlSeconds: 3_600,
        ...SCORING_LIKE,
        rateLimit: { limit: 30, windowSeconds: 3600 },
    },
    cover_letter: {
        primary:   { provider: 'openai',    model: 'gpt-5.4' },
        fallbacks: [{ provider: 'anthropic', model: 'claude-opus-4-7' }],
        outputMode: 'text',
        cacheTtlSeconds: 0, // Each generation should feel fresh — no cache.
        ...CREATIVE_LIKE,
        rateLimit: { limit: 20, windowSeconds: 3600 },
    },

    // ── PHASE 3 — wires up in Sprint 3.x ──────────────────────────────────
    jd_generator: {
        primary:   { provider: 'openai',    model: 'gpt-5.4' },
        fallbacks: [{ provider: 'anthropic', model: 'claude-opus-4-7' }],
        outputMode: 'text',
        cacheTtlSeconds: 0,
        ...CREATIVE_LIKE,
        rateLimit: { limit: 20, windowSeconds: 3600 },
    },
    bias_audit: {
        primary:   { provider: 'openai',    model: 'gpt-5-mini' },
        fallbacks: [{ provider: 'anthropic', model: 'claude-sonnet-4-6' }],
        outputMode: 'json',
        cacheTtlSeconds: 86_400,
        ...SCORING_LIKE,
        rateLimit: { limit: 100, windowSeconds: 3600 },
    },
    outreach_composer: {
        primary:   { provider: 'openai',    model: 'gpt-5.4' },
        fallbacks: [{ provider: 'anthropic', model: 'claude-opus-4-7' }],
        outputMode: 'text',
        cacheTtlSeconds: 0,
        ...CREATIVE_LIKE,
        rateLimit: { limit: 50, windowSeconds: 3600 },
    },

    // ── PHASE 4 — wires up in Sprint 4.x ──────────────────────────────────
    spam_fraud_detection: {
        primary:   { provider: 'openai', model: 'gpt-5-nano' },
        fallbacks: [{ provider: 'openai', model: 'gpt-5-mini' }],
        outputMode: 'json',
        cacheTtlSeconds: 86_400,
        temperature: 0,
        maxOutputTokens: 200,
        timeoutMs: 15_000,
        rateLimit: { limit: 1_000, windowSeconds: 3600 },
    },
    support_bot: {
        primary:   { provider: 'openai',    model: 'gpt-5-mini' },
        fallbacks: [{ provider: 'anthropic', model: 'claude-sonnet-4-6' }],
        outputMode: 'text',
        cacheTtlSeconds: 0, // Conversational — no caching across sessions.
        temperature: 0.3,
        maxOutputTokens: 800,
        timeoutMs: 30_000,
        rateLimit: { limit: 30, windowSeconds: 3600 },
    },
    seo_content: {
        primary:   { provider: 'openai',    model: 'gpt-5.4' },
        fallbacks: [{ provider: 'anthropic', model: 'claude-opus-4-7' }],
        // Hero pages opt in via `priority: 'premium'`.
        premium:   { provider: 'openai',    model: 'gpt-5.5' },
        outputMode: 'text',
        cacheTtlSeconds: 30 * 86_400,
        temperature: 0.6,
        maxOutputTokens: 4_000,
        timeoutMs: 90_000,
        rateLimit: { limit: 30, windowSeconds: 3600 },
    },
};

export function getTaskConfig(task: AiTaskId): TaskConfig {
    const config = TASK_REGISTRY[task];
    if (!config) {
        throw new Error(`Unknown AI task "${task}" — register it in lib/ai/tasks.ts`);
    }
    return config;
}
