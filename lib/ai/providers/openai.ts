/**
 * OpenAI provider for the LLM Gateway.
 *
 * Uses the official `openai` SDK (already a dependency). Captures cached-input
 * token counts from `prompt_tokens_details.cached_tokens` so the cost tracker
 * can apply the 90%-off prompt-caching rate.
 *
 * Direct callers should use lib/ai/gateway.ts, NOT this module — gateway adds
 * routing, caching, fallback, cost tracking, and rate limiting.
 */

import { AiGatewayError } from '../types';
import type {
    ProviderClient,
    ProviderCompleteArgs,
    ProviderCompleteResult,
    ProviderEmbedArgs,
    ProviderEmbedResult,
} from '../types';

let cachedClient: unknown = null;

async function getClient() {
    if (cachedClient) return cachedClient;
    const { OpenAI } = await import('openai');
    cachedClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return cachedClient;
}

export const openaiProvider: ProviderClient = {
    name: 'openai',

    isConfigured(): boolean {
        return !!process.env.OPENAI_API_KEY;
    },

    async complete(args: ProviderCompleteArgs): Promise<ProviderCompleteResult> {
        if (!this.isConfigured()) {
            throw new AiGatewayError('OPENAI_API_KEY not set', 'provider_not_configured');
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const client = await getClient() as any;

        try {
            // OpenAI's newer reasoning + GPT-5-family models require
            // `max_completion_tokens` and reject `max_tokens` with a 400.
            // Older chat models still accept `max_tokens`. Send the new
            // param when the model name signals it; otherwise the legacy
            // one. Send temperature only when the model supports it
            // (some reasoning models reject anything other than 1.0).
            const usesCompletionTokens = /^(gpt-5|o1|o3|o4)/.test(args.model);
            const tokenParam = usesCompletionTokens
                ? { max_completion_tokens: args.maxTokens }
                : { max_tokens: args.maxTokens };
            // Reasoning + GPT-5 family models reject non-default
            // temperature with a 400 ("only the default (1) value is
            // supported"). Suppress the param for those; older chat
            // models still accept it as before.
            const fixedTempOnly = /^(gpt-5|o1|o3|o4)/.test(args.model);
            const temperatureParam = fixedTempOnly ? {} : { temperature: args.temperature };

            const response = await client.chat.completions.create(
                {
                    model: args.model,
                    messages: args.messages,
                    ...temperatureParam,
                    ...tokenParam,
                    ...(args.jsonMode ? { response_format: { type: 'json_object' } } : {}),
                },
                args.signal ? { signal: args.signal } : undefined,
            );

            const content = response.choices?.[0]?.message?.content ?? '';
            const usage = response.usage ?? {};
            return {
                content,
                inputTokens:  usage.prompt_tokens     ?? 0,
                cachedTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
                outputTokens: usage.completion_tokens ?? 0,
            };
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                throw new AiGatewayError('OpenAI request aborted', 'timeout', err);
            }
            throw err;
        }
    },

    async embed(args: ProviderEmbedArgs): Promise<ProviderEmbedResult> {
        if (!this.isConfigured()) {
            throw new AiGatewayError('OPENAI_API_KEY not set', 'provider_not_configured');
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const client = await getClient() as any;

        const response = await client.embeddings.create(
            { model: args.model, input: args.input },
            args.signal ? { signal: args.signal } : undefined,
        );

        const embedding = response.data?.[0]?.embedding ?? [];
        const inputTokens = response.usage?.prompt_tokens ?? 0;
        return { embedding, inputTokens };
    },
};
