/**
 * Client-side usage tracking and quota management.
 * Wraps the backend usage API and provides local caching.
 */

import { API_BASE_URL, AUTOFILL_USAGE_ENDPOINT, AUTOFILL_TRACK_ENDPOINT } from './constants';
import type { UsageData } from './types';
import { getCachedUsage, setCachedUsage } from './storage';
import { getAuthHeaders } from './auth';

/**
 * Fetch current usage data, preferring cached version if fresh.
 */
export async function getUsage(forceRefresh = false): Promise<UsageData | null> {
    if (!forceRefresh) {
        const cached = await getCachedUsage();
        if (cached) return cached;
    }

    try {
        const headers = await getAuthHeaders();
        if (!headers) return null;

        const res = await fetch(`${API_BASE_URL}${AUTOFILL_USAGE_ENDPOINT}`, { headers });
        if (!res.ok) return null;

        const data: UsageData = await res.json();
        await setCachedUsage(data);
        return data;
    } catch {
        return null;
    }
}

/**
 * Record an autofill event on the backend.
 */
export async function recordAutofill(params: {
    pageUrl: string;
    atsName: string | null;
    fieldsFilled: number;
    aiGenerations: number;
}): Promise<boolean> {
    try {
        const headers = await getAuthHeaders();
        if (!headers) return false;

        const res = await fetch(`${API_BASE_URL}${AUTOFILL_TRACK_ENDPOINT}`, {
            method: 'POST',
            headers: {
                ...headers,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(params),
        });

        return res.ok;
    } catch {
        return false;
    }
}

/**
 * Check whether the user can perform an autofill based on their quota.
 */
export async function canAutofill(): Promise<{ allowed: boolean; reason?: string }> {
    const usage = await getUsage();
    if (!usage) {
        return { allowed: true }; // Allow if we can't determine — backend will enforce
    }

    if (usage.autofillsRemaining !== 'unlimited' && usage.autofillsRemaining <= 0) {
        return { allowed: false, reason: 'Autofill limit reached. Upgrade to continue.' };
    }

    return { allowed: true };
}

/**
 * Check whether the user can use AI generation.
 */
export async function canUseAI(): Promise<{ allowed: boolean; reason?: string }> {
    const usage = await getUsage();
    if (!usage) {
        return { allowed: true };
    }

    if (usage.aiGenerationsRemaining !== 'unlimited' && usage.aiGenerationsRemaining <= 0) {
        return { allowed: false, reason: 'AI generation limit reached. Upgrade to continue.' };
    }

    return { allowed: true };
}
