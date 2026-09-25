'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
// F2: localStorage shape + persistence live in the shared module so this hook
// and SaveJobButton can never write incompatible serializations to the same key.
import {
  read as getStoredSavedJobs,
  _write as setStoredSavedJobs,
  SAVED_JOBS_KEY,
  type SavedJobsMap,
} from '@/lib/saved-jobs';
import { hasLikelyAuthCookie } from '@/lib/auth-cookie';

const STORAGE_KEY = SAVED_JOBS_KEY;
const API_PATH = '/api/saved-jobs';
const FRESH_MS = 30_000;

interface UseSavedJobsReturn {
  savedJobs: string[];
  isSaved: (jobId: string) => boolean;
  saveJob: (jobId: string) => void;
  removeJob: (jobId: string) => void;
  clearAll: () => void;
  savedAt: (jobId: string) => Date | null;
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

/**
 * Drop every trace of the signed-in user's saved jobs from this browser.
 *
 * Sign-out used to leave `savedJobs` in localStorage and `migrated` true in
 * this module. When the NEXT account signed in on the same device, the first
 * sync saw migrated=false on a fresh page load, read the previous user's
 * leftover map, treated their ids as "local only", and POSTed them into the
 * new account. Call this from the sign-out handler, before the session goes
 * away, so B never inherits A's list.
 */
export function resetSavedJobsForSignOut(): void {
  cachedMap = {};
  lastSyncAt = 0;
  isAuth = false;
  migrated = false;
  inflight = null;
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      // Private mode / quota: the in-memory cache is already cleared, but a
      // stale on-disk copy would survive the next reload, so say so.
      console.error('useSavedJobs: could not clear saved jobs from localStorage', error);
    }
  }
  notify();
}

/**
 * Undo an optimistic mutation the server refused.
 *
 * These calls used to end in `.catch(() => {})`. The bookmark stayed filled
 * in, localStorage recorded it, and then the next sync (tab focus, or past the
 * 30s freshness window) replaced the whole local map with the server's, so the
 * job silently disappeared with no explanation. Rolling back at the point of
 * failure keeps the UI honest about what the server actually holds.
 */
function rollback(restore: SavedJobsMap): void {
  console.error('useSavedJobs: server rejected the change, restoring previous state');
  applyMap(restore);
}

function applyMap(next: SavedJobsMap, persistLocal = true) {
  cachedMap = next;
  if (persistLocal) setStoredSavedJobs(next);
  notify();
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
      if (!res.ok) {
        // Not "no saved jobs" and not "not signed in": an actual server-side
        // failure. Leave isAuth as it was, log it, and clear the freshness
        // stamp so the next mount retries instead of caching the failure.
        console.error(`useSavedJobs: GET ${API_PATH} failed with ${res.status}`);
        lastSyncAt = 0;
        return;
      }
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
    } catch (error) {
      // Network down / parse error — stay on whatever the local cache holds,
      // but never silently: a sync that never succeeds is why a save can look
      // applied locally and be absent from the account.
      console.error('useSavedJobs: sync failed, keeping the local cache', error);
      lastSyncAt = 0;
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
      })
        .then((res) => {
          if (!res.ok) throw new Error(`POST ${API_PATH} returned ${res.status}`);
        })
        .catch(() => rollback(current));
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
      })
        .then((res) => {
          if (!res.ok) throw new Error(`DELETE ${API_PATH} returned ${res.status}`);
        })
        .catch(() => rollback(current));
    }
  }, []);

  const clearAll = useCallback((): void => {
    const snapshot = cachedMap ?? {};
    const ids = Object.keys(snapshot);
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
      ).then((results) => {
        const failed = results.filter(
          (r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok),
        ).length;
        if (failed > 0) {
          // Partial clears leave the account and this browser disagreeing, and
          // the next sync will bring the survivors back. Restore the full list
          // so what is on screen is what the server still holds.
          console.error(`useSavedJobs: ${failed} of ${ids.length} deletes failed during clearAll`);
          rollback(snapshot);
        }
      });
    }
  }, []);

  const savedAt = useCallback((jobId: string): Date | null => {
    const dateString = (cachedMap ?? {})[jobId];
    if (!dateString) return null;
    try { return new Date(dateString); } catch { return null; }
  }, []);

  return { savedJobs, isSaved, saveJob, removeJob, clearAll, savedAt };
}
