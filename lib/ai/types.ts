/**
 * Shared types for the LLM Gateway.
 *
 * The gateway is the single entry point for every AI call (Phase 0 of the
 * AI roadmap — see docs/ai-architecture.md and docs/ai-implementation-plan.md).
 * Direct provider SDK usage is forbidden outside lib/ai/providers/*.
 */

import type { ZodType } from 'zod';

/**
 * Single source of truth for "which tasks the gateway knows about" — mirrors
 * the routing table in docs/ai-implementation-plan.md §0.1.A. Add a literal
 * here AND a TASK_REGISTRY entry in lib/ai/tasks.ts when shipping a feature.
 */
export type AiTaskId =
    // Phase 0 — already wired through the gateway.
    | 'candidate_scoring'
    | 'resume_parsing'
    | 'embeddings_generic'
    // Phase 1 — wired in Sprint 1.x.
    | 'talent_search_rerank'
    | 'career_path_analysis'
    // Phase 2 — wired in Sprint 2.x.
    | 'application_coach'
    | 'cover_letter'
    // Phase 3 — wired in Sprint 3.x.
    | 'jd_generator'
    | 'bias_audit'
    | 'outreach_composer'
    // Phase 4 — wired in Sprint 4.x.
    | 'spam_fraud_detection'
    | 'support_bot'
    | 'seo_content'
    // Ingest pipeline — JD structured-field extraction (lib/llm-enrichment.ts).
    | 'jd_enrichment';

/** Output mode hint per task — drives JSON-mode and parser selection. */
export type AiOutputMode = 'json' | 'text' | 'vector';

/**
 * Routing priority. `standard` follows the task registry primary; `premium`
 * routes to the higher-tier model for that task (e.g., seo_content premium →
 * gpt-5.5 instead of gpt-5.4). Used for hero content where quality compounds.
 */
export type AiPriority = 'standard' | 'premium';

/** Provider identifier — matches a registered provider in lib/ai/providers/. */
export type AiProvider = 'openai' | 'anthropic';

/** Identity of the entity making the call — drives per-tenant rate limits and cost attribution. */
export interface AiTenant {
    /** 'employer' | 'candidate' | 'admin' | 'system'. Use 'system' for cron / background jobs. */
    type: 'employer' | 'candidate' | 'admin' | 'system';
    /** Stable identifier (employer id, candidate user id, etc.). Use 'system' for type=system. */
    id: string;
}

export interface AiMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface CompleteRequest<T = unknown> {
    task: AiTaskId;
    messages: AiMessage[];
    tenant: AiTenant;
    /** Prompt registry id (typically equals `task`). Logged to ai_call_log for drift detection. */
    promptId?: string;
    /** Prompt version like "v1". Logged to ai_call_log so prompt rollouts are auditable. */
    promptVersion?: string;
    /**
     * Stable cache key parts (will be hashed). If omitted, the request is not cached.
     * Include all inputs that change the output — but NOT PII (DEA, NPI, race, etc.).
     */
    cacheKey?: readonly (string | number | boolean | null | undefined)[];
    /** Optional Zod schema. When set, gateway parses + validates JSON output before returning. */
    outputSchema?: ZodType<T>;
    /**
     * Per-call overrides. Most callers should rely on the task registry defaults
     * in lib/ai/tasks.ts rather than overriding here.
     */
    options?: {
        /**
         * Routing priority. `standard` (default) follows the task registry
         * primary. `premium` routes to the registry-defined premium model for
         * the task (e.g., seo_content premium → gpt-5.5).
         */
        priority?: AiPriority;
        /**
         * Force a specific provider (skips primary/fallback chain selection
         * but the model is still picked from the registry). Used for chaos tests.
         */
        provider?: AiProvider;
        /**
         * Escape hatch: pin an exact model. Bypasses the task registry entirely.
         * Required for one-off A/B experiments. Code review should reject usage
         * without an `// eslint-disable-next-line ai/no-direct-model` comment.
         */
        model?: string;
        temperature?: number;
        maxTokens?: number;
        /** Force JSON mode on. Defaults to true when outputSchema is provided. */
        jsonMode?: boolean;
        /** Skip cache lookup but still write the result. Useful for invalidation. */
        skipCacheRead?: boolean;
    };
}

export interface AiUsage {
    inputTokens: number;
    /** Subset of inputTokens that hit OpenAI's prompt cache (90% off). */
    cachedTokens: number;
    outputTokens: number;
    costUsd: number;
}

export interface CompleteResponse<T = unknown> {
    /** Raw content string returned by the model. */
    content: string;
    /** Parsed + validated output if outputSchema was provided. */
    parsed?: T;
    provider: AiProvider;
    model: string;
    usage: AiUsage;
    latencyMs: number;
    cacheHit: boolean;
    fallbackUsed: boolean;
}

export interface EmbedRequest {
    /** Plain text to embed. Truncate to ~8k tokens before calling. */
    input: string;
    tenant: AiTenant;
    options?: {
        /** Defaults to text-embedding-3-small (1536 dims). */
        model?: string;
    };
}

export interface EmbedResponse {
    embedding: number[];
    model: string;
    usage: { inputTokens: number; costUsd: number };
    latencyMs: number;
}

/**
 * Provider interface every concrete provider implements.
 * Keeping this thin lets us swap providers (or add new ones) without touching the gateway.
 */
export interface ProviderClient {
    name: AiProvider;
    /** Returns false when the provider is missing required env (e.g. ANTHROPIC_API_KEY unset). */
    isConfigured(): boolean;
    complete(args: ProviderCompleteArgs): Promise<ProviderCompleteResult>;
    embed?(args: ProviderEmbedArgs): Promise<ProviderEmbedResult>;
}

export interface ProviderCompleteArgs {
    model: string;
    messages: AiMessage[];
    temperature: number;
    maxTokens: number;
    jsonMode: boolean;
    /** AbortSignal for cancellation / timeout. */
    signal?: AbortSignal;
}

export interface ProviderCompleteResult {
    content: string;
    inputTokens: number;
    cachedTokens: number;
    outputTokens: number;
}

export interface ProviderEmbedArgs {
    model: string;
    input: string;
    signal?: AbortSignal;
}

export interface ProviderEmbedResult {
    embedding: number[];
    inputTokens: number;
}

export class AiGatewayError extends Error {
    constructor(
        message: string,
        readonly code:
            | 'rate_limited'
            | 'all_providers_failed'
            | 'invalid_output'
            | 'provider_not_configured'
            | 'timeout'
            | 'unknown',
        readonly cause?: unknown,
    ) {
        super(message);
        this.name = 'AiGatewayError';
    }
}
