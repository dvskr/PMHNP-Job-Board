'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

const STORAGE_KEY = 'savedJobs';
const API_PATH = '/api/saved-jobs';
const FRESH_MS = 30_000;

interface SavedJobsMap {
  [jobId: string]: string; // ISO date string
}

interface UseSavedJobsReturn {
  savedJobs: string[];
  isSaved: (jobId: string) => boolean;
  saveJob: (jobId: string) => void;
  removeJob: (jobId: string) => void;
  clearAll: () => void;
  savedAt: (jobId: string) => Date | null;
}

function getStoredSavedJobs(): SavedJobsMap {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        const converted: SavedJobsMap = {};
        parsed.forEach((id: string) => {
          converted[id] = new Date().toISOString();
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(converted));
        return converted;
      }
      return parsed as SavedJobsMap;
    }
  } catch (error) {
    console.error('Error reading saved jobs from localStorage:', error);
  }
  return {};
}

function setStoredSavedJobs(savedJobs: SavedJobsMap): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedJobs));
  } catch (error) {
    console.error('Error saving saved jobs to localStorage:', error);
  }
}

/**
 * Module-level shared state. The previous version fired one `GET /api/saved-jobs`
 * per hook instance — every JobCard's bookmark icon, every saved-jobs page mount,
 * every dropdown — so a list page with N cards produced N+1 fetches. The 401s
 * for anonymous users were correct but loud in logs and wasted server CPU.
 *
 * We now keep a single in-memory state with:
 *   - `lastSyncAt` so reads within 30s reuse the cache instead of re-fetching
 *   - `inflight` so simultaneous mounts await one shared promise
 *   - `subscribers` so an update from any hook instance broadcasts to the rest
 *
 * For the typical anonymous browse session this collapses N fetches per page
 * load down to exactly one (which 401s, after which we never re-fetch unless
 * a mutation invalidates the cache or the tab regains focus).
 */
let cachedMap: SavedJobsMap | null = null;
let lastSyncAt = 0;
let isAuth = false;
let migrated = false;
let inflight: Promise<void> | null = null;
const subscribers = new Set<() => void>();

function notify() {
  for (const cb of subscribers) cb();
}

function applyMap(next: SavedJobsMap, persistLocal = true) {
  cachedMap = next;
  if (persistLocal) setStoredSavedJobs(next);
  notify();
}

/**
 * Heuristic: anonymous visitors have no Supabase auth cookie, so the GET
 * is guaranteed to 401. Skip it to keep the browser console clean.
 */
function hasLikelyAuthCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return /(?:^|;\s*)sb-[^=]+-auth-token=/.test(document.cookie);
}

async function syncFromServer(force = false): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!hasLikelyAuthCookie()) {
    isAuth = false;
    return;
  }
  const now = Date.now();
  if (!force && now - lastSyncAt < FRESH_MS && lastSyncAt > 0) return;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch(API_PATH, { credentials: 'include' });
      lastSyncAt = Date.now();
      if (res.status === 401) {
        isAuth = false;
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as { savedJobs?: Array<{ jobId: string; savedAt: string }> };
      const serverMap: SavedJobsMap = Object.fromEntries(
        (data.savedJobs ?? []).map((r) => [r.jobId, r.savedAt]),
      );
      isAuth = true;

      // First-time migration: push localStorage-only entries to the server
      // so authenticated users don't lose history accumulated while anonymous.
      if (!migrated) {
        migrated = true;
        const local = getStoredSavedJobs();
        const localOnly = Object.keys(local).filter((id) => !(id in serverMap));
        if (localOnly.length > 0) {
          await Promise.allSettled(
            localOnly.map((jobId) =>
              fetch(API_PATH, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ jobId }),
              }),
            ),
          );
          const merged: SavedJobsMap = { ...serverMap };
          for (const id of localOnly) if (!(id in merged)) merged[id] = local[id];
          applyMap(merged);
          return;
        }
      }
      applyMap(serverMap);
    } catch {
      // Network down / parse error — stay on whatever the local cache holds.
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * Hook return contract is unchanged from the localStorage-only version so
 * existing callers don't break. Internally it's auth-aware (server when
 * authenticated, localStorage when not) and request-deduped at the module
 * level — N hook instances on the same page share one fetch.
 */
export default function useSavedJobs(): UseSavedJobsReturn {
  // Hydrate the module cache from localStorage on the first call across the page.
  if (cachedMap === null && typeof window !== 'undefined') {
    cachedMap = getStoredSavedJobs();
  }

  const [, bump] = useState(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    const onChange = () => {
      if (isMountedRef.current) bump((n) => n + 1);
    };
    subscribers.add(onChange);

    // Trigger one shared sync (deduped at the module level).
    syncFromServer();

    // Cross-tab via storage event — primarily useful for anonymous users.
    function onStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return;
      try {
        const newValue = event.newValue ? JSON.parse(event.newValue) : {};
        const map: SavedJobsMap = Array.isArray(newValue)
          ? Object.fromEntries(newValue.map((id: string) => [id, new Date().toISOString()]))
          : (newValue as SavedJobsMap);
        applyMap(map, false); // already in localStorage from the originating tab
      } catch (error) {
        console.error('Error parsing storage event:', error);
      }
    }
    window.addEventListener('storage', onStorage);

    // Refresh on tab focus, but only when authenticated and only past freshness window.
    function onVisibility() {
      if (document.visibilityState === 'visible' && isAuth) {
        syncFromServer();
      }
    }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      isMountedRef.current = false;
      subscribers.delete(onChange);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const savedJobs = useMemo(() => Object.keys(cachedMap ?? {}), [cachedMap]);

  const isSaved = useCallback((jobId: string): boolean => {
    return jobId in (cachedMap ?? {});
  }, []);

  const saveJob = useCallback((jobId: string): void => {
    const current = cachedMap ?? {};
    if (jobId in current) return;
    applyMap({ ...current, [jobId]: new Date().toISOString() });
    if (isAuth) {
      fetch(API_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ jobId }),
      }).catch(() => {});
    }
  }, []);

  const removeJob = useCallback((jobId: string): void => {
    const current = cachedMap ?? {};
    if (!(jobId in current)) return;
    const next = { ...current };
    delete next[jobId];
    applyMap(next);
    if (isAuth) {
      fetch(API_PATH, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ jobId }),
      }).catch(() => {});
    }
  }, []);

  const clearAll = useCallback((): void => {
    const ids = Object.keys(cachedMap ?? {});
    applyMap({});
    if (isAuth && ids.length > 0) {
      Promise.allSettled(
        ids.map((jobId) =>
          fetch(API_PATH, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ jobId }),
          }),
        ),
      ).catch(() => {});
    }
  }, []);

  const savedAt = useCallback((jobId: string): Date | null => {
    const dateString = (cachedMap ?? {})[jobId];
    if (!dateString) return null;
    try { return new Date(dateString); } catch { return null; }
  }, []);

  return { savedJobs, isSaved, saveJob, removeJob, clearAll, savedAt };
}
