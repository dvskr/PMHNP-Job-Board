import type { AuthState, ProfileData, ExtensionSettings, UsageData } from './types';
import { STORAGE_KEYS, CACHE_TTL, USAGE_CACHE_TTL, DEFAULT_SETTINGS } from './constants';

// ─── Auth Storage ───

export async function getStoredAuth(): Promise<AuthState> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.AUTH);
    const auth = result[STORAGE_KEYS.AUTH] as AuthState | undefined;
    if (!auth) {
        return { isLoggedIn: false, user: null, token: null, expiresAt: null };
    }
    // Check expiry
    if (auth.expiresAt && new Date(auth.expiresAt) < new Date()) {
        await clearAuth();
        return { isLoggedIn: false, user: null, token: null, expiresAt: null };
    }
    return auth;
}

export async function setStoredAuth(auth: AuthState): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEYS.AUTH]: auth });
}

export async function clearAuth(): Promise<void> {
    await chrome.storage.local.remove([STORAGE_KEYS.AUTH]);
}

// ─── Profile Storage ───

export async function getCachedProfile(): Promise<{ data: ProfileData; cachedAt: number } | null> {
    const result = await chrome.storage.local.get([STORAGE_KEYS.PROFILE, STORAGE_KEYS.PROFILE_CACHED_AT]);
    const data = result[STORAGE_KEYS.PROFILE] as ProfileData | undefined;
    const cachedAt = result[STORAGE_KEYS.PROFILE_CACHED_AT] as number | undefined;
    if (!data || !cachedAt) return null;
    return { data, cachedAt };
}

export async function setCachedProfile(data: ProfileData): Promise<void> {
    await chrome.storage.local.set({
        [STORAGE_KEYS.PROFILE]: data,
        [STORAGE_KEYS.PROFILE_CACHED_AT]: Date.now(),
    });
}

export async function clearCachedProfile(): Promise<void> {
    await chrome.storage.local.remove([STORAGE_KEYS.PROFILE, STORAGE_KEYS.PROFILE_CACHED_AT]);
}

export async function isCacheStale(): Promise<boolean> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.PROFILE_CACHED_AT);
    const cachedAt = result[STORAGE_KEYS.PROFILE_CACHED_AT] as number | undefined;
    if (!cachedAt) return true;
    return Date.now() - cachedAt > CACHE_TTL;
}

// ─── Usage Storage ───

export async function getCachedUsage(): Promise<UsageData | null> {
    const result = await chrome.storage.local.get([STORAGE_KEYS.USAGE, STORAGE_KEYS.USAGE_CACHED_AT]);
    const data = result[STORAGE_KEYS.USAGE] as UsageData | undefined;
    const cachedAt = result[STORAGE_KEYS.USAGE_CACHED_AT] as number | undefined;
    if (!data || !cachedAt) return null;
    if (Date.now() - cachedAt > USAGE_CACHE_TTL) return null;
    return data;
}

export async function setCachedUsage(data: UsageData): Promise<void> {
    await chrome.storage.local.set({
        [STORAGE_KEYS.USAGE]: data,
        [STORAGE_KEYS.USAGE_CACHED_AT]: Date.now(),
    });
}

// ─── Settings Storage ───

export async function getSettings(): Promise<ExtensionSettings> {
    const result = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
    const stored = result[STORAGE_KEYS.SETTINGS] as Partial<ExtensionSettings> | undefined;
    return { ...DEFAULT_SETTINGS, ...stored };
}

export async function updateSettings(updates: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
    const current = await getSettings();
    const merged = { ...current, ...updates };
    await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: merged });
    return merged;
}

// ─── FAB Position ───

export async function getFABPosition(): Promise<{ x: number; y: number } | null> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.FAB_POSITION);
    return (result[STORAGE_KEYS.FAB_POSITION] as { x: number; y: number }) || null;
}

export async function setFABPosition(pos: { x: number; y: number }): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEYS.FAB_POSITION]: pos });
}

// ─── Autofilled URL Tracking ───

export async function getAutofilledUrls(): Promise<Record<string, string>> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.AUTOFILLED_URLS);
    return (result[STORAGE_KEYS.AUTOFILLED_URLS] as Record<string, string>) || {};
}

export async function recordAutofilledUrl(url: string): Promise<void> {
    const urls = await getAutofilledUrls();
    urls[url] = new Date().toISOString();
    await chrome.storage.local.set({ [STORAGE_KEYS.AUTOFILLED_URLS]: urls });
}

// ─── Dismissed URLs ───

export async function getDismissedUrls(): Promise<string[]> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.DISMISSED_URLS);
    return (result[STORAGE_KEYS.DISMISSED_URLS] as string[]) || [];
}

export async function addDismissedUrl(url: string): Promise<void> {
    const urls = await getDismissedUrls();
    if (!urls.includes(url)) {
        urls.push(url);
        await chrome.storage.local.set({ [STORAGE_KEYS.DISMISSED_URLS]: urls });
    }
}

// ─── Error Log ───

export interface ErrorLogEntry {
    timestamp: string;
    message: string;
    context: string;
    stack?: string;
}

export async function getErrorLog(): Promise<ErrorLogEntry[]> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.ERROR_LOG);
    return (result[STORAGE_KEYS.ERROR_LOG] as ErrorLogEntry[]) || [];
}

export async function appendErrorLog(entry: ErrorLogEntry): Promise<void> {
    const log = await getErrorLog();
    log.push(entry);
    // Keep max 100 entries
    const trimmed = log.slice(-100);
    await chrome.storage.local.set({ [STORAGE_KEYS.ERROR_LOG]: trimmed });
}

export async function clearErrorLog(): Promise<void> {
    await chrome.storage.local.remove(STORAGE_KEYS.ERROR_LOG);
}

// ─── Clear All ───

export async function clearAllData(): Promise<void> {
    await chrome.storage.local.clear();
    await chrome.storage.sync.remove(STORAGE_KEYS.SETTINGS);
}
