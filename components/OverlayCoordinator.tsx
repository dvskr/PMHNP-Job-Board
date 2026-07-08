'use client';

/**
 * Overlay Coordinator (SEO Fix H9)
 *
 * Several full-screen / bottom-sheet overlays can be triggered concurrently
 * on the homepage:
 *   - CookieConsent       (legal — must always win when undecided)
 *   - PushNotificationPrompt
 *   - PWAInstallBanner
 *
 * Without coordination, two of these can stack, which (a) looks broken and
 * (b) is exactly the "intrusive interstitial" pattern Google penalizes.
 *
 * This module exports `useOverlaySlot(priority)` — a hook each overlay calls
 * to ask permission to show. Only the highest-priority overlay that wants
 * the slot gets it. When the active overlay dismisses, the next one in
 * priority order can take the slot.
 *
 * Usage:
 *   const canShow = useOverlaySlot('cookie');     // priority 1
 *   if (!canShow) return null;
 *
 * Priority order (lower number = wins):
 *   1. cookie  — consent must be granted/declined before anything else shows
 *   2. push    — notification permission ask
 *   3. pwa     — install banner
 *
 * Module-scoped state is fine here: the coordinator is per-tab, browser
 * navigation reloads it, and overlays are all sibling clients of the same
 * root layout. A React Context would add ceremony without value.
 */

import { useEffect, useState } from 'react';

export type OverlayId = 'cookie' | 'push' | 'pwa';

const PRIORITY: Record<OverlayId, number> = {
    cookie: 1,
    push: 2,
    pwa: 3,
};

interface CoordinatorState {
    pending: Set<OverlayId>;
    listeners: Set<() => void>;
}

const state: CoordinatorState = {
    pending: new Set<OverlayId>(),
    listeners: new Set<() => void>(),
};

function notify() {
    for (const fn of state.listeners) fn();
}

function highestPending(): OverlayId | null {
    let winner: OverlayId | null = null;
    for (const id of state.pending) {
        if (winner === null || PRIORITY[id] < PRIORITY[winner]) {
            winner = id;
        }
    }
    return winner;
}

/**
 * Each overlay calls this hook with its id and a `wantsSlot` boolean
 * (typically the same internal `show`/`isOpen` state the overlay would use
 * to decide whether to render). Returns true ONLY when this overlay holds
 * the slot (no higher-priority overlay is also pending). Pass `false` to
 * release the slot to lower-priority overlays.
 */
export function useOverlaySlot(id: OverlayId, wantsSlot: boolean): boolean {
    const [active, setActive] = useState<OverlayId | null>(null);

    useEffect(() => {
        const recompute = () => setActive(highestPending());
        state.listeners.add(recompute);
        recompute();
        return () => {
            state.listeners.delete(recompute);
        };
    }, []);

    useEffect(() => {
        if (wantsSlot) {
            state.pending.add(id);
        } else {
            state.pending.delete(id);
        }
        notify();
        return () => {
            state.pending.delete(id);
            notify();
        };
    }, [id, wantsSlot]);

    return wantsSlot && active === id;
}

/** Imperative release for overlays that stay mounted but dismiss themselves. */
export function releaseOverlaySlot(id: OverlayId): void {
    state.pending.delete(id);
    notify();
}

/** Imperative claim for overlays that mount but want to wait to register. */
export function claimOverlaySlot(id: OverlayId): void {
    state.pending.add(id);
    notify();
}
