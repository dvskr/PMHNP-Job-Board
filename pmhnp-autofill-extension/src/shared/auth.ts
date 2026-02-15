import type { AuthState, ExtensionTokenResponse } from './types';
import { API_BASE_URL, AUTH_EXTENSION_TOKEN_ENDPOINT, LOGIN_URL, EXTENSION_CONNECTED_PATH } from './constants';
import { getStoredAuth, setStoredAuth, clearAuth, clearCachedProfile } from './storage';

export async function initiateLogin(): Promise<void> {
    const tab = await chrome.tabs.create({ url: LOGIN_URL });
    if (!tab.id) return;

    // Listen for the tab to navigate to dashboard (login success)
    return new Promise<void>((resolve) => {
        const listener = async (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
            if (tabId !== tab.id || !changeInfo.url) return;
            if (changeInfo.url.includes(EXTENSION_CONNECTED_PATH)) {
                chrome.tabs.onUpdated.removeListener(listener);
                chrome.tabs.onRemoved.removeListener(removeListener);

                // Execute the token fetch INSIDE the page context where cookies exist
                try {
                    const results = await chrome.scripting.executeScript({
                        target: { tabId },
                        func: (apiUrl: string, endpoint: string) => {
                            return fetch(`${apiUrl}${endpoint}`, {
                                method: 'GET',
                                credentials: 'include',
                                headers: { 'Content-Type': 'application/json' },
                            }).then(r => {
                                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                                return r.json();
                            });
                        },
                        args: [API_BASE_URL, AUTH_EXTENSION_TOKEN_ENDPOINT],
                    });

                    const data = results?.[0]?.result;
                    if (data?.token) {
                        const authState: AuthState = {
                            isLoggedIn: true,
                            user: {
                                userId: data.userId,
                                email: data.email,
                                firstName: data.firstName,
                            },
                            token: data.token,
                            expiresAt: data.expiresAt,
                        };
                        await setStoredAuth(authState);
                    }
                } catch (err) {
                    console.error('[PMHNP] Failed to get extension token:', err);
                }

                // Close the login tab
                if (tab.id) chrome.tabs.remove(tab.id).catch(() => { });
                resolve();
            }
        };

        // Also listen for tab close (user closed without logging in)
        const removeListener = (tabId: number) => {
            if (tabId === tab.id) {
                chrome.tabs.onRemoved.removeListener(removeListener);
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }
        };

        chrome.tabs.onUpdated.addListener(listener);
        chrome.tabs.onRemoved.addListener(removeListener);
    });
}

export async function getExtensionToken(): Promise<AuthState> {
    try {
        const response = await fetch(`${API_BASE_URL}${AUTH_EXTENSION_TOKEN_ENDPOINT}`, {
            method: 'GET',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
            throw new Error(`Extension token request failed: ${response.status}`);
        }

        const data = (await response.json()) as ExtensionTokenResponse;

        const authState: AuthState = {
            isLoggedIn: true,
            user: {
                userId: data.userId,
                email: data.email,
                firstName: data.firstName,
            },
            token: data.token,
            expiresAt: data.expiresAt,
        };

        await setStoredAuth(authState);
        return authState;
    } catch (err) {
        console.error('[PMHNP] getExtensionToken failed:', err);
        return { isLoggedIn: false, user: null, token: null, expiresAt: null };
    }
}

export async function getAuthState(): Promise<AuthState> {
    return getStoredAuth();
}

export async function logout(): Promise<void> {
    await clearAuth();
    await clearCachedProfile();
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
    const auth = await getStoredAuth();
    if (!auth.isLoggedIn || !auth.token) {
        throw new Error('Not authenticated');
    }

    // Check if token is expiring soon (within 5 minutes)
    if (auth.expiresAt) {
        const expiresAt = new Date(auth.expiresAt).getTime();
        const fiveMinutes = 5 * 60 * 1000;
        if (expiresAt - Date.now() < fiveMinutes) {
            // Attempt silent refresh
            try {
                const refreshed = await getExtensionToken();
                if (refreshed.isLoggedIn && refreshed.token) {
                    return { Authorization: `Bearer ${refreshed.token}` };
                }
            } catch {
                // If refresh fails and token is actually expired, throw
                if (expiresAt < Date.now()) {
                    await logout();
                    throw new Error('Session expired — please log in again');
                }
            }
        }
    }

    return { Authorization: `Bearer ${auth.token}` };
}

export async function refreshTokenIfNeeded(): Promise<void> {
    const auth = await getStoredAuth();
    if (!auth.isLoggedIn) return;

    if (auth.expiresAt) {
        const expiresAt = new Date(auth.expiresAt).getTime();
        const thirtyMinutes = 30 * 60 * 1000;
        if (expiresAt - Date.now() < thirtyMinutes) {
            try {
                await getExtensionToken();
            } catch (err) {
                console.warn('[PMHNP] Token refresh failed:', err);
            }
        }
    }
}
