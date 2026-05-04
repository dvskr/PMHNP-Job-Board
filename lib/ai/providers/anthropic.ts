/**
 * Anthropic provider for the LLM Gateway — fallback path.
 *
 * Implemented via `fetch` against the Messages API so we don't need to add
 * `@anthropic-ai/sdk` as a dependency just for fallback. When ANTHROPIC_API_KEY
 * is unset (the current default), `isConfigured()` returns false and the
 * fallback chain in lib/ai/gateway.ts skips this provider gracefully.
 *
 * Reference: https://docs.anthropic.com/en/api/messages
 */

import { AiGatewayError } from '../types';
import type {
    ProviderClient,
    ProviderCompleteArgs,
    ProviderCompleteResult,
} from '../types';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

interface AnthropicMessagesResponse {
    content: Array<{ type: string; text?: string }>;
    usage: {
        input_tokens: number;
        output_tokens: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
    };
}

export const anthropicProvider: ProviderClient = {
    name: 'anthropic',

    isConfigured(): boolean {
        return !!process.env.ANTHROPIC_API_KEY;
    },

    async complete(args: ProviderCompleteArgs): Promise<ProviderCompleteResult> {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            throw new AiGatewayError('ANTHROPIC_API_KEY not set', 'provider_not_configured');
        }

        // Anthropic separates the system prompt from the conversation messages.
        const systemMessages = args.messages.filter((m) => m.role === 'system');
        const conversation   = args.messages.filter((m) => m.role !== 'system');
        const system = systemMessages.map((m) => m.content).join('\n\n');

        // JSON mode hint — Anthropic doesn't have a strict JSON mode flag, so
        // we instruct the model to return only JSON. Output validation in the
        // gateway (via Zod) catches violations.
        const finalSystem = args.jsonMode
            ? `${system}\n\nRespond with a single valid JSON object and nothing else. Do not wrap it in markdown.`.trim()
            : system;

        let response: Response;
        try {
            response = await fetch(ANTHROPIC_API_URL, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': ANTHROPIC_VERSION,
                },
                signal: args.signal,
                body: JSON.stringify({
                    model: args.model,
                    max_tokens: args.maxTokens,
                    temperature: args.temperature,
                    system: finalSystem || undefined,
                    messages: conversation.map((m) => ({ role: m.role, content: m.content })),
                }),
            });
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                throw new AiGatewayError('Anthropic request aborted', 'timeout', err);
            }
            throw err;
        }

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new AiGatewayError(
                `Anthropic returned ${response.status}: ${text.slice(0, 300)}`,
                'unknown',
            );
        }

        const data = (await response.json()) as AnthropicMessagesResponse;
        const content = data.content
            .filter((block) => block.type === 'text')
            .map((block) => block.text ?? '')
            .join('');

        // Anthropic reports cached tokens separately from regular input tokens —
        // sum them so our token accounting matches OpenAI's "total prompt tokens".
        const cachedTokens = data.usage.cache_read_input_tokens ?? 0;
        const inputTokens  = (data.usage.input_tokens ?? 0) + cachedTokens;

        return {
            content,
            inputTokens,
            cachedTokens,
            outputTokens: data.usage.output_tokens ?? 0,
        };
    },
};
