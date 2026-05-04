/**
 * Pricing math tests. The cost-tracker reads `cost_usd` from this module
 * and writes it to ai_call_log — a regression here corrupts every dashboard.
 */

import { describe, it, expect } from 'vitest';
import { calculateCostUsd, hasPricing, MODEL_PRICING } from '@/lib/ai/pricing';

describe('lib/ai/pricing', () => {
    describe('calculateCostUsd', () => {
        it('prices a typical gpt-5-mini scoring call', () => {
            // ~3000 input tokens, ~200 output tokens, no caching.
            const cost = calculateCostUsd('gpt-5-mini', { inputTokens: 3000, cachedTokens: 0, outputTokens: 200 });
            // (3000 / 1M * 0.25) + (200 / 1M * 2.00) = 0.00075 + 0.0004 = 0.00115
            expect(cost).toBeCloseTo(0.00115, 6);
        });

        it('applies the 90%-off cached input discount', () => {
            // Same call but with all input tokens cached.
            const cached = calculateCostUsd('gpt-5-mini', { inputTokens: 3000, cachedTokens: 3000, outputTokens: 200 });
            // (0 / 1M * 0.25) + (3000 / 1M * 0.025) + (200 / 1M * 2.00) = 0.000075 + 0.0004 = 0.000475
            expect(cached).toBeCloseTo(0.000475, 6);

            // Cached cost must be lower than uncached.
            const uncached = calculateCostUsd('gpt-5-mini', { inputTokens: 3000, cachedTokens: 0, outputTokens: 200 });
            expect(cached).toBeLessThan(uncached);
        });

        it('returns 0 for unknown models (logged elsewhere as misconfig)', () => {
            const cost = calculateCostUsd('imaginary-model-xyz', { inputTokens: 1000, cachedTokens: 0, outputTokens: 100 });
            expect(cost).toBe(0);
        });

        it('handles embedding models (output cost = 0)', () => {
            const cost = calculateCostUsd('text-embedding-3-small', { inputTokens: 100_000, cachedTokens: 0, outputTokens: 0 });
            // 100k / 1M * 0.02 = 0.002
            expect(cost).toBeCloseTo(0.002, 6);
        });

        it('rounds to 6 decimal places (microcents)', () => {
            const cost = calculateCostUsd('gpt-5-mini', { inputTokens: 1, cachedTokens: 0, outputTokens: 1 });
            // Anything beyond 6 decimals is dropped.
            expect(Number.isInteger(cost * 1_000_000)).toBe(true);
        });

        it('caps billable input tokens at zero (defensive — cached should never exceed input)', () => {
            const cost = calculateCostUsd('gpt-5-mini', { inputTokens: 100, cachedTokens: 999, outputTokens: 0 });
            // billableInput = max(0, 100 - 999) = 0; cached uses the cached price.
            // (0 * 0.25 / 1M) + (999 * 0.025 / 1M) = 0.000024975 ≈ 0.000025
            expect(cost).toBeCloseTo(0.000025, 6);
        });
    });

    describe('hasPricing', () => {
        it('reports known models', () => {
            expect(hasPricing('gpt-5-mini')).toBe(true);
            expect(hasPricing('claude-haiku-4-5')).toBe(true);
        });

        it('reports unknown models', () => {
            expect(hasPricing('not-a-model')).toBe(false);
        });
    });

    describe('MODEL_PRICING table', () => {
        it('keeps cached input rate at-or-below regular input rate for every model', () => {
            for (const [model, p] of Object.entries(MODEL_PRICING)) {
                expect(p.cachedInput, `cachedInput must be <= input for ${model}`).toBeLessThanOrEqual(p.input);
            }
        });

        it('keeps output rate non-negative for every model', () => {
            for (const [model, p] of Object.entries(MODEL_PRICING)) {
                expect(p.output, `output must be >= 0 for ${model}`).toBeGreaterThanOrEqual(0);
            }
        });
    });
});
