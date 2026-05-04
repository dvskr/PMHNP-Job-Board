/**
 * Model pricing table (USD per 1M tokens).
 *
 * Source: docs/ai-architecture.md Section 7.1. Update this table when prices
 * change — every cost calculation in lib/ai/cost-tracker.ts reads from here.
 *
 * `cachedInput` is OpenAI's prompt-caching discounted rate (~90% off). When a
 * provider doesn't support prompt caching, set cachedInput equal to input.
 */

import type { AiProvider } from './types';

export interface ModelPricing {
    provider: AiProvider;
    /** Per 1M input tokens, USD. */
    input: number;
    /** Per 1M cached input tokens, USD. Equals `input` if not supported. */
    cachedInput: number;
    /** Per 1M output tokens, USD. Embeddings models leave this at 0. */
    output: number;
}

/**
 * Pricing entries for the models we actually use. Add a row when a new
 * model is introduced — the gateway will throw at startup if a task is
 * routed to a model with no pricing entry.
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
    // GPT-5 family — primary OpenAI lineup per architecture doc.
    'gpt-5-nano':  { provider: 'openai',    input: 0.05, cachedInput: 0.005, output: 0.40 },
    'gpt-5-mini':  { provider: 'openai',    input: 0.25, cachedInput: 0.025, output: 2.00 },
    'gpt-5':       { provider: 'openai',    input: 1.25, cachedInput: 0.125, output: 10.00 },
    'gpt-5.4':     { provider: 'openai',    input: 3.00, cachedInput: 0.30,  output: 15.00 },
    // Reserved for hero SEO content / premium-only tasks. Opt in via
    // `priority: 'premium'` — the registry routes accordingly.
    'gpt-5.5':     { provider: 'openai',    input: 6.00, cachedInput: 0.60,  output: 30.00 },
    // Legacy — only here so the migration of existing callers is gradual.
    'gpt-4o-mini': { provider: 'openai',    input: 0.15, cachedInput: 0.075, output: 0.60 },
    // Embeddings — output cost is always 0.
    'text-embedding-3-small': { provider: 'openai', input: 0.02, cachedInput: 0.02, output: 0 },
    // Anthropic fallback tier. Sonnet handles structured / mid-reasoning tasks;
    // Opus pairs with the gpt-5.4 creative tier so quality doesn't collapse on
    // a primary outage of cover letters / JDs / outreach.
    'claude-haiku-4-5':  { provider: 'anthropic', input: 1.00, cachedInput: 0.10, output: 5.00 },
    'claude-sonnet-4-6': { provider: 'anthropic', input: 3.00, cachedInput: 0.30, output: 15.00 },
    'claude-opus-4-7':   { provider: 'anthropic', input: 15.00, cachedInput: 1.50, output: 75.00 },
};

/**
 * Compute USD cost for a single LLM call given token usage.
 * Returns 0 if the model is unknown — that's logged elsewhere as a misconfig.
 */
export function calculateCostUsd(
    model: string,
    usage: { inputTokens: number; cachedTokens: number; outputTokens: number },
): number {
    const price = MODEL_PRICING[model];
    if (!price) return 0;

    const billableInput = Math.max(0, usage.inputTokens - usage.cachedTokens);
    const cost =
        (billableInput      / 1_000_000) * price.input       +
        (usage.cachedTokens / 1_000_000) * price.cachedInput +
        (usage.outputTokens / 1_000_000) * price.output;

    // Round to 6 decimal places — dollars-and-microcents granularity.
    return Math.round(cost * 1_000_000) / 1_000_000;
}

/** True if pricing is registered for the given model. */
export function hasPricing(model: string): boolean {
    return model in MODEL_PRICING;
}
