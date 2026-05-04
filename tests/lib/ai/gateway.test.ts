/**
 * LLM Gateway integration tests.
 *
 * Mocks the provider registry so nothing hits OpenAI/Anthropic. Covers:
 *   - successful primary call writes ai_call_log + applies schema
 *   - fallback engages when primary throws
 *   - schema validation failures bail without recording success
 *   - rate-limit hit raises AiGatewayError(rate_limited)
 *   - all-providers-failed raises AiGatewayError(all_providers_failed)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { __testing as breakerTesting } from '@/lib/ai/circuit-breaker';

// ── Provider mocks ───────────────────────────────────────────────────
// Keep references so each test can swap behaviors.
const openaiComplete    = vi.fn();
const anthropicComplete = vi.fn();
const openaiConfigured    = vi.fn(() => true);
const anthropicConfigured = vi.fn(() => true);

vi.mock('@/lib/ai/providers', () => ({
    getProvider: (name: 'openai' | 'anthropic') =>
        name === 'openai'
            ? { name: 'openai', isConfigured: openaiConfigured, complete: openaiComplete }
            : { name: 'anthropic', isConfigured: anthropicConfigured, complete: anthropicComplete },
    listProviders: () => [],
}));

// ── Cache + cost-tracker + rate-limit mocks ──────────────────────────
const cacheRead  = vi.fn();
const cacheWrite = vi.fn();
vi.mock('@/lib/ai/cache', () => ({
    readCache:  (...args: unknown[]) => cacheRead(...args),
    writeCache: (...args: unknown[]) => cacheWrite(...args),
}));

const recordCallMock = vi.fn();
vi.mock('@/lib/ai/cost-tracker', () => ({
    recordAiCall: (...args: unknown[]) => recordCallMock(...args),
}));

const rateLimitMock = vi.fn();
vi.mock('@/lib/ai/rate-limiter', () => ({
    checkAiRateLimit: (...args: unknown[]) => rateLimitMock(...args),
}));

// Import AFTER mocks so the gateway picks up our stubs.
import { complete, AiGatewayError } from '@/lib/ai/gateway';

const TENANT = { type: 'candidate' as const, id: 'user_123' };
const MESSAGES = [
    { role: 'system' as const, content: 'You are a tester.' },
    { role: 'user'   as const, content: 'Return JSON.' },
];

const passingSchema = z.object({ score: z.number() });

beforeEach(() => {
    openaiComplete.mockReset();
    anthropicComplete.mockReset();
    openaiConfigured.mockReturnValue(true);
    anthropicConfigured.mockReturnValue(true);
    cacheRead.mockReset();
    cacheRead.mockResolvedValue({ hit: false });
    cacheWrite.mockReset();
    cacheWrite.mockResolvedValue(undefined);
    recordCallMock.mockReset();
    recordCallMock.mockResolvedValue(undefined);
    rateLimitMock.mockReset();
    rateLimitMock.mockResolvedValue({ success: true, remaining: 100, reset: Date.now() + 60_000 });
    breakerTesting.reset();
});

describe('lib/ai/gateway.complete', () => {
    it('routes to the primary provider, validates schema, records cost, writes cache', async () => {
        openaiComplete.mockResolvedValue({
            content: JSON.stringify({ score: 87 }),
            inputTokens: 1000,
            cachedTokens: 0,
            outputTokens: 50,
        });

        const result = await complete({
            task: 'candidate_scoring',
            tenant: TENANT,
            messages: MESSAGES,
            cacheKey: ['v1', 'job1', 'cand1'],
            outputSchema: passingSchema,
        });

        expect(openaiComplete).toHaveBeenCalledOnce();
        expect(anthropicComplete).not.toHaveBeenCalled();
        expect(result.provider).toBe('openai');
        expect(result.model).toBe('gpt-5-mini');
        expect(result.cacheHit).toBe(false);
        expect(result.fallbackUsed).toBe(false);
        expect(result.parsed).toEqual({ score: 87 });
        expect(result.usage.costUsd).toBeGreaterThan(0);

        expect(cacheWrite).toHaveBeenCalledOnce();
        expect(recordCallMock).toHaveBeenCalledOnce();
        const [logged] = recordCallMock.mock.calls[0];
        expect(logged).toMatchObject({
            task: 'candidate_scoring',
            provider: 'openai',
            model: 'gpt-5-mini',
            cacheHit: false,
            fallbackUsed: false,
        });
    });

    it('serves from cache on hit and skips the provider entirely', async () => {
        cacheRead.mockResolvedValue({
            hit: true,
            response: {
                content: JSON.stringify({ score: 42 }),
                provider: 'openai',
                model: 'gpt-5-mini',
                usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 0, costUsd: 0 },
                latencyMs: 0,
                cacheHit: true,
                fallbackUsed: false,
            },
        });

        const result = await complete({
            task: 'candidate_scoring',
            tenant: TENANT,
            messages: MESSAGES,
            cacheKey: ['v1', 'job1', 'cand1'],
            outputSchema: passingSchema,
        });

        expect(openaiComplete).not.toHaveBeenCalled();
        expect(rateLimitMock).not.toHaveBeenCalled();
        expect(result.cacheHit).toBe(true);
        expect(result.parsed).toEqual({ score: 42 });
        expect(result.usage.costUsd).toBe(0);

        const [logged] = recordCallMock.mock.calls[0];
        expect(logged).toMatchObject({ cacheHit: true });
    });

    it('falls back to the next provider when the primary throws', async () => {
        openaiComplete.mockRejectedValue(new Error('primary boom'));
        anthropicComplete.mockResolvedValue({
            content: JSON.stringify({ score: 55 }),
            inputTokens: 800,
            cachedTokens: 0,
            outputTokens: 30,
        });

        const result = await complete({
            task: 'candidate_scoring',
            tenant: TENANT,
            messages: MESSAGES,
            outputSchema: passingSchema,
        });

        expect(openaiComplete).toHaveBeenCalledOnce();
        expect(anthropicComplete).toHaveBeenCalledOnce();
        expect(result.provider).toBe('anthropic');
        expect(result.model).toBe('claude-sonnet-4-6');
        expect(result.fallbackUsed).toBe(true);
    });

    it('skips providers that are not configured (without tripping the breaker)', async () => {
        anthropicConfigured.mockReturnValue(false);
        openaiComplete.mockRejectedValue(new Error('primary down'));

        await expect(complete({
            task: 'candidate_scoring',
            tenant: TENANT,
            messages: MESSAGES,
        })).rejects.toMatchObject({ code: 'all_providers_failed' });

        // Anthropic should NOT have been called (configured = false).
        expect(anthropicComplete).not.toHaveBeenCalled();

        // Anthropic breaker stays closed because we never recorded a failure for it.
        expect(breakerTesting.snapshot('anthropic').failures).toBe(0);
        // OpenAI fired exactly once (the gpt-5-mini primary), then bailed
        // because the only fallback (anthropic) was not configured.
        expect(breakerTesting.snapshot('openai').failures).toBe(1);
        expect(openaiComplete).toHaveBeenCalledTimes(1);
    });

    it('refuses to merge when output fails schema validation (no silent retry on next provider)', async () => {
        openaiComplete.mockResolvedValue({
            content: JSON.stringify({ score: 'not a number' }),
            inputTokens: 100,
            cachedTokens: 0,
            outputTokens: 10,
        });

        await expect(complete({
            task: 'candidate_scoring',
            tenant: TENANT,
            messages: MESSAGES,
            outputSchema: passingSchema,
        })).rejects.toMatchObject({ code: 'invalid_output' });

        // Did NOT try the fallback — invalid_output is the caller's fault, not the provider's.
        expect(anthropicComplete).not.toHaveBeenCalled();

        // We did record the failed call so cost dashboards see it.
        const [logged] = recordCallMock.mock.calls.at(-1) ?? [];
        expect(logged).toMatchObject({ error: 'invalid_output' });
    });

    it('raises rate_limited without calling any provider', async () => {
        rateLimitMock.mockResolvedValue({ success: false, remaining: 0, reset: Date.now() + 60_000 });

        await expect(complete({
            task: 'candidate_scoring',
            tenant: TENANT,
            messages: MESSAGES,
        })).rejects.toMatchObject({ code: 'rate_limited' });

        expect(openaiComplete).not.toHaveBeenCalled();
    });

    it('raises all_providers_failed when every chain entry throws', async () => {
        openaiComplete.mockRejectedValue(new Error('openai down'));
        anthropicComplete.mockRejectedValue(new Error('anthropic down'));

        await expect(complete({
            task: 'candidate_scoring',
            tenant: TENANT,
            messages: MESSAGES,
        })).rejects.toBeInstanceOf(AiGatewayError);
    });

    it('routes priority=premium to the registry-defined premium model', async () => {
        openaiComplete.mockResolvedValue({
            content: 'Long-form SEO copy.',
            inputTokens: 5_000,
            cachedTokens: 0,
            outputTokens: 800,
        });

        const result = await complete({
            task: 'seo_content',
            tenant: { type: 'admin', id: 'admin_1' },
            messages: [{ role: 'user', content: 'Write me a hero page.' }],
            options: { priority: 'premium' },
        });

        expect(result.model).toBe('gpt-5.5');
    });

    it('honors per-call provider/model override (escape hatch)', async () => {
        anthropicComplete.mockResolvedValue({
            content: JSON.stringify({ score: 11 }),
            inputTokens: 50,
            cachedTokens: 0,
            outputTokens: 5,
        });

        const result = await complete({
            task: 'candidate_scoring',
            tenant: TENANT,
            messages: MESSAGES,
            outputSchema: passingSchema,
            options: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
        });

        expect(openaiComplete).not.toHaveBeenCalled();
        expect(anthropicComplete).toHaveBeenCalledOnce();
        expect(result.provider).toBe('anthropic');
    });
});
