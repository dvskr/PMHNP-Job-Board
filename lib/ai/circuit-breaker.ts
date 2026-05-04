/**
 * In-memory circuit breaker for provider health.
 *
 * Lives in process memory — that's intentional: each Vercel function instance
 * tracks its own observed failures, so a flaky provider trips the breaker
 * locally without poisoning the whole fleet's view. Cooldown is short so
 * recovery is automatic.
 *
 * Thresholds chosen for first-pass safety. Tune in Sprint 0.4 once we have
 * real failure-mode data.
 */

import type { AiProvider } from './types';

const FAILURE_THRESHOLD = 5;          // consecutive failures before opening
const COOLDOWN_MS       = 30_000;     // how long the breaker stays open

interface BreakerState {
    failures: number;
    openedAt: number | null;
}

const state = new Map<AiProvider, BreakerState>();

function get(provider: AiProvider): BreakerState {
    let s = state.get(provider);
    if (!s) {
        s = { failures: 0, openedAt: null };
        state.set(provider, s);
    }
    return s;
}

/** True when the provider is healthy or its cooldown has elapsed. */
export function isAvailable(provider: AiProvider): boolean {
    const s = get(provider);
    if (s.openedAt === null) return true;
    if (Date.now() - s.openedAt > COOLDOWN_MS) {
        // Half-open: let the next call try, and a success will close us back.
        s.openedAt = null;
        s.failures = 0;
        return true;
    }
    return false;
}

export function recordSuccess(provider: AiProvider): void {
    const s = get(provider);
    s.failures = 0;
    s.openedAt = null;
}

export function recordFailure(provider: AiProvider): void {
    const s = get(provider);
    s.failures += 1;
    if (s.failures >= FAILURE_THRESHOLD) {
        s.openedAt = Date.now();
    }
}

/** Exposed for tests. */
export const __testing = {
    reset(): void { state.clear(); },
    snapshot(provider: AiProvider): BreakerState { return { ...get(provider) }; },
    FAILURE_THRESHOLD,
    COOLDOWN_MS,
};
