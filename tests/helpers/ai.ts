/**
 * Reusable AI test helpers — Sprint 0.5.1.
 *
 * The standard pattern for testing an AI feature:
 *
 *   import { mockLLMResponse, getRecordedAiCalls } from '../../helpers/ai';
 *
 *   beforeEach(() => mockLLMResponse({ content: '{"score": 87}' }));
 *
 *   it('persists score on application', async () => {
 *     await scoreCandidate(...);
 *     const calls = getRecordedAiCalls();
 *     expect(calls).toHaveLength(1);
 *     expect(calls[0].task).toBe('candidate_scoring');
 *   });
 *
 * The helpers stub `lib/ai/providers` + `lib/ai/cost-tracker` + `lib/ai/cache`
 * + `lib/ai/rate-limiter` — the same surface the gateway tests use, but
 * factored out so feature tests don't have to repeat the wiring.
 *
 * Call `mockLLMResponse()` from a `beforeEach` to reset state. State is
 * process-scoped, so tests must not run in parallel within a file (Vitest's
 * default within a file is sequential — safe).
 */

import { vi } from 'vitest';
import type { CallLogEntry } from '@/lib/ai/cost-tracker';

let recordedCalls: CallLogEntry[] = [];
let nextResponses: Array<{
    content: string;
    inputTokens: number;
    cachedTokens: number;
    outputTokens: number;
}> = [];
let providerErrors: Array<Error | null> = [];

/**
 * Stub the next N gateway calls. Each call to `mockLLMResponse` queues another
 * scripted response. Clear with `resetAiMocks()`.
 */
export function mockLLMResponse(opts: {
    content: string;
    inputTokens?: number;
    cachedTokens?: number;
    outputTokens?: number;
}): void {
    nextResponses.push({
        content: opts.content,
        inputTokens:  opts.inputTokens  ?? 100,
        cachedTokens: opts.cachedTokens ?? 0,
        outputTokens: opts.outputTokens ?? 50,
    });
}

/** Queue a provider error for the next call instead of a successful response. */
export function mockLLMError(err: Error): void {
    providerErrors.push(err);
    nextResponses.push({ content: '', inputTokens: 0, cachedTokens: 0, outputTokens: 0 });
}

/** Returns the recorded ai_call_log entries from the run. Useful for asserting cost/task/tenant. */
export function getRecordedAiCalls(): readonly CallLogEntry[] {
    return recordedCalls.slice();
}

export function resetAiMocks(): void {
    recordedCalls = [];
    nextResponses = [];
    providerErrors = [];
}

/**
 * Install the gateway mocks. Call once at module load (top of test file)
 * BEFORE importing whatever-uses-the-gateway. Pattern:
 *
 *   import { installAiGatewayMocks } from '../../helpers/ai';
 *   installAiGatewayMocks();
 *   // …then import the module under test.
 */
export function installAiGatewayMocks(): void {
    vi.mock('@/lib/ai/providers', () => ({
        getProvider: () => ({
            name: 'openai' as const,
            isConfigured: () => true,
            complete: async () => {
                const errIdx = providerErrors.length > 0 ? 0 : -1;
                if (errIdx === 0) {
                    const e = providerErrors.shift()!;
                    nextResponses.shift(); // consume the paired placeholder
                    if (e) throw e;
                }
                const r = nextResponses.shift();
                if (!r) throw new Error('No mocked LLM response queued — call mockLLMResponse() first');
                return r;
            },
            embed: async () => ({ embedding: new Array(1536).fill(0), inputTokens: 10 }),
        }),
        listProviders: () => [],
    }));

    vi.mock('@/lib/ai/cost-tracker', () => ({
        recordAiCall: async (entry: CallLogEntry) => { recordedCalls.push(entry); },
    }));

    vi.mock('@/lib/ai/cache', () => ({
        readCache: async () => ({ hit: false }),
        writeCache: async () => undefined,
    }));

    vi.mock('@/lib/ai/rate-limiter', () => ({
        checkAiRateLimit: async () => ({ success: true, remaining: 100, reset: Date.now() + 60_000 }),
    }));
}
