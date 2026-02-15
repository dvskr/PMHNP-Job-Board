import { STORAGE_KEYS, CACHE_TTL, USAGE_CACHE_TTL, DEFAULT_SETTINGS } from "/src/shared/constants.ts.js";
export async function getStoredAuth() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.AUTH);
  const auth = result[STORAGE_KEYS.AUTH];
  if (!auth) {
    return { isLoggedIn: false, user: null, token: null, expiresAt: null };
  }
  if (auth.expiresAt && new Date(auth.expiresAt) < /* @__PURE__ */ new Date()) {
    await clearAuth();
    return { isLoggedIn: false, user: null, token: null, expiresAt: null };
  }
  return auth;
}
export async function setStoredAuth(auth) {
  await chrome.storage.local.set({ [STORAGE_KEYS.AUTH]: auth });
}
export async function clearAuth() {
  await chrome.storage.local.remove([STORAGE_KEYS.AUTH]);
}
export async function getCachedProfile() {
  const result = await chrome.storage.local.get([STORAGE_KEYS.PROFILE, STORAGE_KEYS.PROFILE_CACHED_AT]);
  const data = result[STORAGE_KEYS.PROFILE];
  const cachedAt = result[STORAGE_KEYS.PROFILE_CACHED_AT];
  if (!data || !cachedAt) return null;
  return { data, cachedAt };
}
export async function setCachedProfile(data) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.PROFILE]: data,
    [STORAGE_KEYS.PROFILE_CACHED_AT]: Date.now()
  });
}
export async function clearCachedProfile() {
  await chrome.storage.local.remove([STORAGE_KEYS.PROFILE, STORAGE_KEYS.PROFILE_CACHED_AT]);
}
export async function isCacheStale() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.PROFILE_CACHED_AT);
  const cachedAt = result[STORAGE_KEYS.PROFILE_CACHED_AT];
  if (!cachedAt) return true;
  return Date.now() - cachedAt > CACHE_TTL;
}
export async function getCachedUsage() {
  const result = await chrome.storage.local.get([STORAGE_KEYS.USAGE, STORAGE_KEYS.USAGE_CACHED_AT]);
  const data = result[STORAGE_KEYS.USAGE];
  const cachedAt = result[STORAGE_KEYS.USAGE_CACHED_AT];
  if (!data || !cachedAt) return null;
  if (Date.now() - cachedAt > USAGE_CACHE_TTL) return null;
  return data;
}
export async function setCachedUsage(data) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.USAGE]: data,
    [STORAGE_KEYS.USAGE_CACHED_AT]: Date.now()
  });
}
export async function getSettings() {
  const result = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
  const stored = result[STORAGE_KEYS.SETTINGS];
  return { ...DEFAULT_SETTINGS, ...stored };
}
export async function updateSettings(updates) {
  const current = await getSettings();
  const merged = { ...current, ...updates };
  await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: merged });
  return merged;
}
export async function getFABPosition() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.FAB_POSITION);
  return result[STORAGE_KEYS.FAB_POSITION] || null;
}
export async function setFABPosition(pos) {
  await chrome.storage.local.set({ [STORAGE_KEYS.FAB_POSITION]: pos });
}
export async function getAutofilledUrls() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.AUTOFILLED_URLS);
  return result[STORAGE_KEYS.AUTOFILLED_URLS] || {};
}
export async function recordAutofilledUrl(url) {
  const urls = await getAutofilledUrls();
  urls[url] = (/* @__PURE__ */ new Date()).toISOString();
  await chrome.storage.local.set({ [STORAGE_KEYS.AUTOFILLED_URLS]: urls });
}
export async function getDismissedUrls() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.DISMISSED_URLS);
  return result[STORAGE_KEYS.DISMISSED_URLS] || [];
}
export async function addDismissedUrl(url) {
  const urls = await getDismissedUrls();
  if (!urls.includes(url)) {
    urls.push(url);
    await chrome.storage.local.set({ [STORAGE_KEYS.DISMISSED_URLS]: urls });
  }
}
export async function getErrorLog() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.ERROR_LOG);
  return result[STORAGE_KEYS.ERROR_LOG] || [];
}
export async function appendErrorLog(entry) {
  const log = await getErrorLog();
  log.push(entry);
  const trimmed = log.slice(-100);
  await chrome.storage.local.set({ [STORAGE_KEYS.ERROR_LOG]: trimmed });
}
export async function clearErrorLog() {
  await chrome.storage.local.remove(STORAGE_KEYS.ERROR_LOG);
}
export async function clearAllData() {
  await chrome.storage.local.clear();
  await chrome.storage.sync.remove(STORAGE_KEYS.SETTINGS);
}
