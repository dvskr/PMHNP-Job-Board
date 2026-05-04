/**
 * LLM Gateway — single entry point for every AI call across the codebase.
 *
 * Why this exists (see docs/ai-architecture.md §4.1):
 *   - Provider routing: each task picks its model; fallbacks engage on failure.
 *   - Cost tracking: every call writes to ai_call_log so dashboards work.
 *   - Caching: deterministic prompts hit Redis (~70% cost cut on scoring).
 *   - Rate limiting: per-tenant caps so one employer can't burn the budget.
 *   - Output validation: optional Zod schema parses + validates JSON output.
 *   - Circuit breaker: trip after consecutive failures, auto-recover on cooldown.
 *
 * USAGE — from anywhere outside lib/ai/:
 *
 *     import { complete, embed } from '@/lib/ai/gateway';
 *
 *     const result = await complete({
 *         task: 'candidate_scoring',
 *         tenant: { type: 'employer', id: employerId },
 *         messages: [{ role: 'system', content: PROMPT }, ...],
 *         cacheKey: ['v1', jobId, candidateId],
 *         outputSchema: scoringResultSchema,
 *     });
 *     // result.parsed is typed by the schema.
 *
 * Direct imports of `openai` / `@anthropic-ai/sdk` outside lib/ai/providers/
 * are forbidden. Code review should reject them.
 */

import { logger } from '../logger';
import { calculateCostUsd, hasPricing } from './pricing';
import { readCache, writeCache } from './cache';
import { recordAiCall } from './cost-tracker';
import { checkAiRateLimit } from './rate-limiter';
import * as breaker from './circuit-breaker';
import { getProvider } from './providers';
import { getTaskConfig } from './tasks';
import {
    AiGatewayError,
    type AiProvider,
    type CompleteRequest,
    type CompleteResponse,
    type EmbedRequest,
    type EmbedResponse,
    type ProviderClient,
} from './types';

interface AttemptTarget {
    provider: AiProvider;
    model: string;
    isFallback: boolean;
}

function buildAttemptChain(
    task: ReturnType<typeof getTaskConfig>,
    override?: { provider?: AiProvider; model?: string; priority?: 'standard' | 'premium' },
): AttemptTarget[] {
    // Hard escape hatch — caller pinned an exact (provider, model). Skip the chain.
    if (override?.provider && override?.model) {
        return [{ provider: override.provider, model: override.model, isFallback: false }];
    }
    // Premium routing — substitutes a tier-up model when the task has one defined.
    const useTarget: { provider: AiProvider; model: string } =
        override?.priority === 'premium' && task.premium
            ? task.premium
            : task.primary;
    const primary: AttemptTarget = {
        provider: override?.provider ?? useTarget.provider,
        model:    override?.model    ?? useTarget.model,
        isFallback: false,
    };
    const fallbacks: AttemptTarget[] = task.fallbacks.map((f) => ({
        provider: f.provider, model: f.model, isFallback: true,
    }));
    return [primary, ...fallbacks];
}

function makeAbortSignal(timeoutMs: number): { signal: AbortSignal; cancel: () => void } {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

async function tryProvider(
    target: AttemptTarget,
    args: { messages: CompleteRequest['messages']; temperature: number; maxTokens: number; jsonMode: boolean; timeoutMs: number },
): Promise<{ content: string; inputTokens: number; cachedTokens: number; outputTokens: number }> {
    const provider: ProviderClient = getProvider(target.provider);
    if (!provider.isConfigured()) {
        throw new AiGatewayError(
            `Provider "${target.provider}" is not configured`,
            'provider_not_configured',
        );
    }
    const { signal, cancel } = makeAbortSignal(args.timeoutMs);
    try {
        return await provider.complete({
            model: target.model,
            messages: args.messages,
            temperature: args.temperature,
            maxTokens: args.maxTokens,
            jsonMode: args.jsonMode,
            signal,
        });
    } finally {
        cancel();
    }
}

export async function complete<T = unknown>(req: CompleteRequest<T>): Promise<CompleteResponse<T>> {
    const task = getTaskConfig(req.task);
    const startedAt = Date.now();

    // ── 1. Cache lookup (free; no rate-limit consumed) ───────────────────
    if (!req.options?.skipCacheRead && req.cacheKey) {
        const cached = await readCache<T>(req.task, req.cacheKey);
        if (cached.hit && cached.response) {
            const out = cached.response;
            if (req.outputSchema) {
                try {
                    out.parsed = req.outputSchema.parse(JSON.parse(out.content));
                } catch (err) {
                    // Cached entry is malformed against current schema. Drop it,
                    // fall through to a fresh call.
                    logger.warn('Cached AI response failed schema validation; refetching', { task: req.task }, err);
                }
            }
            if (!req.outputSchema || out.parsed !== undefined) {
                await recordAiCall({
                    task: req.task,
                    provider: out.provider,
                    model: out.model,
                    promptId: req.promptId,
                    promptVersion: req.promptVersion,
                    tenant: req.tenant,
                    usage: out.usage,
                    latencyMs: Date.now() - startedAt,
                    cacheHit: true,
                    fallbackUsed: false,
                });
                return out;
            }
        }
    }

    // ── 2. Rate-limit check (only for live calls) ───────────────────────
    const rl = await checkAiRateLimit(req.task, req.tenant, task.rateLimit);
    if (!rl.success) {
        throw new AiGatewayError(
            `AI rate limit exceeded for task=${req.task} tenant=${req.tenant.type}:${req.tenant.id}`,
            'rate_limited',
        );
    }

    // ── 3. Attempt chain with circuit breaker ───────────────────────────
    const chain = buildAttemptChain(task, req.options);
    // JSON mode is auto-enabled by either an outputSchema OR a task whose
    // declared outputMode is 'json'. Lets text-only tasks (cover_letter etc.)
    // pass through without JSON coercion even when no schema is provided.
    const jsonMode = req.options?.jsonMode ?? (!!req.outputSchema || task.outputMode === 'json');
    const temperature = req.options?.temperature ?? task.temperature;
    const maxTokens   = req.options?.maxTokens   ?? task.maxOutputTokens;

    let lastError: unknown;
    for (const target of chain) {
        if (!hasPricing(target.model)) {
            // Misconfig — log loudly so it's caught in CI tests, but skip rather than 500.
            logger.error('No pricing entry for model; skipping target', undefined, { model: target.model });
            continue;
        }
        if (!breaker.isAvailable(target.provider)) {
            continue;
        }
        try {
            const raw = await tryProvider(target, {
                messages: req.messages,
                temperature,
                maxTokens,
                jsonMode,
                timeoutMs: task.timeoutMs,
            });
            breaker.recordSuccess(target.provider);

            const usage = {
                inputTokens:  raw.inputTokens,
                cachedTokens: raw.cachedTokens,
                outputTokens: raw.outputTokens,
                costUsd: calculateCostUsd(target.model, raw),
            };
            const response: CompleteResponse<T> = {
                content: raw.content,
                provider: target.provider,
                model: target.model,
                usage,
                latencyMs: Date.now() - startedAt,
                cacheHit: false,
                fallbackUsed: target.isFallback,
            };

            if (req.outputSchema) {
                try {
                    response.parsed = req.outputSchema.parse(JSON.parse(raw.content));
                } catch (err) {
                    await recordAiCall({
                        task: req.task,
                        provider: target.provider,
                        model: target.model,
                        promptId: req.promptId,
                        promptVersion: req.promptVersion,
                        tenant: req.tenant,
                        usage,
                        latencyMs: response.latencyMs,
                        cacheHit: false,
                        fallbackUsed: target.isFallback,
                        error: 'invalid_output',
                    });
                    throw new AiGatewayError(
                        `Output failed schema validation for task=${req.task}`,
                        'invalid_output',
                        err,
                    );
                }
            }

            await writeCache(req.task, req.cacheKey, response, task.cacheTtlSeconds);
            await recordAiCall({
                task: req.task,
                provider: target.provider,
                model: target.model,
                promptId: req.promptId,
                promptVersion: req.promptVersion,
                tenant: req.tenant,
                usage,
                latencyMs: response.latencyMs,
                cacheHit: false,
                fallbackUsed: target.isFallback,
            });
            return response;
        } catch (err) {
            lastError = err;
            // Don't trip the breaker for not_configured — that's a static condition.
            if (!(err instanceof AiGatewayError) || err.code !== 'provider_not_configured') {
                breaker.recordFailure(target.provider);
            }
            logger.warn(
                `AI provider attempt failed (task=${req.task} provider=${target.provider} model=${target.model})`,
                undefined,
                err,
            );
            // If this was an invalid_output (caller's schema is wrong, not a provider problem), bail immediately.
            if (err instanceof AiGatewayError && err.code === 'invalid_output') throw err;
        }
    }

    await recordAiCall({
        task: req.task,
        provider: chain[0]?.provider ?? 'openai',
        model: chain[0]?.model ?? 'unknown',
        promptId: req.promptId,
        promptVersion: req.promptVersion,
        tenant: req.tenant,
        usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, costUsd: 0 },
        latencyMs: Date.now() - startedAt,
        cacheHit: false,
        fallbackUsed: false,
        error: 'all_providers_failed',
    });
    throw new AiGatewayError(
        `All providers failed for task=${req.task}`,
        'all_providers_failed',
        lastError,
    );
}

export async function embed(req: EmbedRequest): Promise<EmbedResponse> {
    const task = getTaskConfig('embeddings_generic');
    const model = req.options?.model ?? task.primary.model;
    const startedAt = Date.now();

    const provider = getProvider(task.primary.provider);
    if (!provider.embed) {
        throw new AiGatewayError(
            `Provider "${task.primary.provider}" does not support embeddings`,
            'unknown',
        );
    }

    const { signal, cancel } = makeAbortSignal(task.timeoutMs);
    try {
        const raw = await provider.embed({ model, input: req.input, signal });
        const usage = {
            inputTokens: raw.inputTokens,
            costUsd: calculateCostUsd(model, { inputTokens: raw.inputTokens, cachedTokens: 0, outputTokens: 0 }),
        };
        const latencyMs = Date.now() - startedAt;

        await recordAiCall({
            task: 'embeddings_generic',
            provider: task.primary.provider,
            model,
            tenant: req.tenant,
            usage: { ...usage, cachedTokens: 0, outputTokens: 0 },
            latencyMs,
            cacheHit: false,
            fallbackUsed: false,
        });

        return { embedding: raw.embedding, model, usage, latencyMs };
    } finally {
        cancel();
    }
}

export { AiGatewayError } from './types';
