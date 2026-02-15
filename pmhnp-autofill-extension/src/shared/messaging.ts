import type { ExtensionMessage, ApplicationPageInfo, ProfileData, ProfileReadiness, AuthState } from './types';

// ─── Send message to background service worker ───

export async function sendToBackground<T = unknown>(message: ExtensionMessage): Promise<T> {
    try {
        const response = await chrome.runtime.sendMessage(message);
        if (response?.error) {
            throw new Error(response.error);
        }
        return response as T;
    } catch (err) {
        console.error(`[PMHNP] Message to background failed (${message.type}):`, err);
        throw err;
    }
}

// ─── Send message to content script in active tab ───

export async function sendToActiveTab<T = unknown>(message: ExtensionMessage): Promise<T> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab found');

    try {
        const response = await chrome.tabs.sendMessage(tab.id, message);
        if (response?.error) throw new Error(response.error);
        return response as T;
    } catch (err) {
        console.error(`[PMHNP] Message to content script failed (${message.type}):`, err);
        throw err;
    }
}

/**
 * Send IS_APPLICATION_PAGE to ALL frames in the active tab, return the best result
 * (the frame with the most detected fields). This handles ATS platforms like
 * SmartRecruiters that render forms inside iframes.
 */
export async function checkApplicationPageAllFrames(): Promise<ApplicationPageInfo> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab found');

    // Get all frames in the tab
    const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });
    if (!frames || frames.length === 0) throw new Error('No frames found');

    console.log(`[PMHNP] Checking ${frames.length} frames for application fields...`);

    let bestResult: ApplicationPageInfo = { isApplication: false, atsName: null, fieldCount: 0 };
    let bestFrameId = 0;

    // Query each frame
    const results = await Promise.allSettled(
        frames.map(async (frame) => {
            try {
                const response = await chrome.tabs.sendMessage(tab.id!, { type: 'IS_APPLICATION_PAGE' }, { frameId: frame.frameId });
                return { frameId: frame.frameId, url: frame.url, response: response as ApplicationPageInfo };
            } catch {
                return null;
            }
        })
    );

    for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
            const { frameId, url, response } = result.value;
            console.log(`[PMHNP] Frame ${frameId} (${url}): isApp=${response.isApplication}, fields=${response.fieldCount}`);
            if (response.fieldCount > bestResult.fieldCount) {
                bestResult = response;
                bestFrameId = frameId;
            }
        }
    }

    console.log(`[PMHNP] Best frame: ${bestFrameId} with ${bestResult.fieldCount} fields, isApplication=${bestResult.isApplication}`);

    // Store the best frameId for later autofill
    if (bestResult.fieldCount > 0) {
        await chrome.storage.local.set({ _autofillFrameId: bestFrameId, _autofillTabId: tab.id });
    }

    return bestResult;
}

// ─── Typed helper functions (popup → background) ───

export function requestLogin(): Promise<void> {
    return sendToBackground({ type: 'LOGIN' });
}

export function requestLogout(): Promise<void> {
    return sendToBackground({ type: 'LOGOUT' });
}

export function getAuthState(): Promise<AuthState> {
    return sendToBackground<AuthState>({ type: 'GET_AUTH_STATE' });
}

export function getProfile(): Promise<ProfileData> {
    return sendToBackground<ProfileData>({ type: 'GET_PROFILE' });
}

export function refreshProfile(): Promise<ProfileData> {
    return sendToBackground<ProfileData>({ type: 'REFRESH_PROFILE' });
}

export function getProfileReadiness(): Promise<ProfileReadiness> {
    return sendToBackground<ProfileReadiness>({ type: 'GET_PROFILE_READINESS' });
}

// ─── Typed helper functions (popup → content script) ───

export function checkApplicationPage(): Promise<ApplicationPageInfo> {
    return checkApplicationPageAllFrames();
}

export async function triggerAutofill(): Promise<void> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab found');

    // Try to get the stored frameId for the application form
    const stored = await chrome.storage.local.get(['_autofillFrameId', '_autofillTabId']);
    const frameId = stored._autofillTabId === tab.id ? (stored._autofillFrameId ?? 0) : 0;

    console.log(`[PMHNP] Triggering autofill on tab ${tab.id}, frame ${frameId}`);
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'START_AUTOFILL' }, { frameId });
    if (response?.error) throw new Error(response.error);
}
