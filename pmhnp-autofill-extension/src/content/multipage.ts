/**
 * Multi-page form support.
 * Tracks which fields have been filled across page navigations
 * and resumes autofill on subsequent pages of multi-step applications.
 */

import { STORAGE_KEYS } from '@/shared/constants';

interface MultiPageState {
    url: string;
    atsName: string | null;
    filledFields: string[];
    startedAt: string;
    currentPage: number;
}

const STORAGE_KEY = STORAGE_KEYS.AUTOFILLED_URLS; // Reuse URL tracking key

/** Save the current multi-page state. */
export async function saveMultiPageState(state: MultiPageState): Promise<void> {
    const domain = new URL(state.url).hostname;
    const key = `mp_${domain}`;
    await chrome.storage.local.set({ [key]: state });
}

/** Load the multi-page state for the current page. */
export async function loadMultiPageState(): Promise<MultiPageState | null> {
    const domain = window.location.hostname;
    const key = `mp_${domain}`;
    const result = await chrome.storage.local.get(key);
    const state = result[key] as MultiPageState | undefined;

    if (!state) return null;

    // Expire after 30 minutes
    const age = Date.now() - new Date(state.startedAt).getTime();
    if (age > 30 * 60 * 1000) {
        await chrome.storage.local.remove(key);
        return null;
    }

    return state;
}

/** Clear the multi-page state for the current domain. */
export async function clearMultiPageState(): Promise<void> {
    const domain = window.location.hostname;
    const key = `mp_${domain}`;
    await chrome.storage.local.remove(key);
}

/** Record that a field was filled. */
export async function recordFilledField(fieldId: string): Promise<void> {
    const state = await loadMultiPageState();
    if (state) {
        if (!state.filledFields.includes(fieldId)) {
            state.filledFields.push(fieldId);
        }
        state.currentPage++;
        await saveMultiPageState(state);
    }
}

/** Check if a field was already filled in a previous page. */
export function wasFieldFilled(state: MultiPageState, fieldId: string): boolean {
    return state.filledFields.includes(fieldId);
}

/**
 * Detect if the current page is a continuation of a multi-page form.
 * Returns true if:
 * - We have a saved state for this domain
 * - The state is less than 30 minutes old
 * - We're on a different URL path than where we started
 */
export async function isMultiPageContinuation(): Promise<boolean> {
    const state = await loadMultiPageState();
    if (!state) return false;

    const currentUrl = window.location.href;
    const savedUrl = new URL(state.url);
    const currentPath = window.location.pathname;

    // Same domain, different path = likely next page of form
    return savedUrl.hostname === window.location.hostname && savedUrl.pathname !== currentPath;
}
