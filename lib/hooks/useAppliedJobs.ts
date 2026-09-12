'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

const STORAGE_KEY = 'appliedJobs';
const API_PATH = '/api/applications';
const FRESH_MS = 30_000;

interface AppliedJobsMap {
  [jobId: string]: string; // ISO date string
}

interface UseAppliedJobsReturn {
  appliedJobs: string[];
  isApplied: (jobId: string) => boolean;
  /** True once the client has read localStorage; false during SSR and the first render. */
  isHydrated: boolean;
  /** True for rows the candidate actually submitted in-platform (never prunable). */
  isSubmitted: (jobId: string) => boolean;
  markApplied: (jobId: string, sourceUrl?: string) => void;
  removeApplied: (jobId: string) => void;
  clearAll: () => void;
  getAppliedDate: (jobId: string) => Date | null;
}

function getStoredAppliedJobs(): AppliedJobsMap {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored) as AppliedJobsMap;
  } catch (error) {
    console.error('Error reading applied jobs from localStorage:', error);
  }
  return {};
}

function setStoredAppliedJobs(appliedJobs: AppliedJobsMap): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appliedJobs));
  } catch (error) {
    console.error('Error saving applied jobs to localStorage:', error);
  }
}

/**
 * Module-level shared state — see useSavedJobs.ts for the full rationale.
 * Short version: every ApplyButton mounting fired its own GET, so a job
 * detail page or list with multiple visible apply UIs produced a flurry of
 * 401s for anonymous users. This collapses N fetches per page into one.
 */
let cachedMap: AppliedJobsMap | null = null;
let lastSyncAt = 0;
let isAuth = false;
let migrated = false;
let inflight: Promise<void> | null = null;
const subscribers = new Set<() => void>();

/**
 * Job ids whose server row is a real in-platform submission (apply-direct
 * writes sourceUrl='platform' + consentGiven). Those rows carry the cover
 * letter, resume pointer and consent record the employer reads, so the
 * history-pruning actions must leave them alone: DELETE /api/applications
 * answers 409 for them, and clearing a local view must not try to erase a
 * submitted application at all.
 */
const submittedIds = new Set<string>();

function notify() {
  for (const cb of subscribers) cb();
}

/**
 * Seed the module cache from localStorage. Deliberately NOT called during
 * render: the server has no localStorage, so a render-phase read made the
 * first client render disagree with the SSR markup and React threw the whole
 * subtree away (hydration error #418/#425, visible badge flash on /jobs).
 * Callers run it from an effect or an event handler only.
 */
function ensureCache(): AppliedJobsMap {
  if (cachedMap === null) cachedMap = getStoredAppliedJobs();
  return cachedMap;
}

function applyMap(next: AppliedJobsMap, persistLocal = true) {
  cachedMap = next;
  if (persistLocal) setStoredAppliedJobs(next);
  notify();
}

/**
 * Heuristic: if no Supabase auth cookie is present we are anonymous, and
 * `GET /api/applications` will return 401 -- which the browser logs to the
 * console even though we handle it. Skipping the call entirely keeps the
 * console clean on every anonymous page view.
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
      // GET /api/applications returns a flat array of JobApplication rows.
      const rows = (await res.json()) as Array<{
        jobId: string;
        appliedAt: string;
        sourceUrl?: string | null;
        consentGiven?: boolean;
      }>;
      const serverMap: AppliedJobsMap = Object.fromEntries(
        rows.map((r) => [r.jobId, r.appliedAt]),
      );
      submittedIds.clear();
      for (const r of rows) {
        if (r.sourceUrl === 'platform' || r.consentGiven === true) submittedIds.add(r.jobId);
      }
      isAuth = true;

      if (!migrated) {
        migrated = true;
        const local = getStoredAppliedJobs();
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
          const merged: AppliedJobsMap = { ...serverMap };
          for (const id of localOnly) if (!(id in merged)) merged[id] = local[id];
          applyMap(merged);
          return;
        }
      }
      applyMap(serverMap);
    } catch {
      // Network down — stay on the local cache.
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * Auth-aware + request-deduped at the module level so N components mounting
 * on the same page share one fetch. Nothing here touches localStorage during
 * render, so the first client render always matches the server's.
 */
export default function useAppliedJobs(): UseAppliedJobsReturn {
  const [, bump] = useState(0);
  const [isHydrated, setIsHydrated] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    const onChange = () => {
      if (isMountedRef.current) bump((n) => n + 1);
    };
    subscribers.add(onChange);

    // Read localStorage only now that we are past hydration. Flipping
    // isHydrated re-renders this instance, swapping the SSR-matching
    // "nothing applied" first paint for the stored state.
    ensureCache();
    setIsHydrated(true);

    syncFromServer();

    function onStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return;
      try {
        const newValue = event.newValue ? JSON.parse(event.newValue) : {};
        applyMap(newValue as AppliedJobsMap, false);
      } catch (error) {
        console.error('Error parsing storage event:', error);
      }
    }
    window.addEventListener('storage', onStorage);

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

  const appliedJobs = useMemo(() => Object.keys(cachedMap ?? {}), [cachedMap]);

  const isApplied = useCallback((jobId: string): boolean => {
    return jobId in (cachedMap ?? {});
  }, []);

  const isSubmitted = useCallback((jobId: string): boolean => {
    return submittedIds.has(jobId);
  }, []);

  const markApplied = useCallback((jobId: string, sourceUrl?: string): void => {
    const current = ensureCache();
    if (jobId in current) return;
    applyMap({ ...current, [jobId]: new Date().toISOString() });
    if (isAuth) {
      fetch(API_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ jobId, sourceUrl }),
      }).catch(() => {});
    }
  }, []);

  const removeApplied = useCallback((jobId: string): void => {
    const current = ensureCache();
    if (!(jobId in current)) return;
    // A submitted application is not history the candidate can prune: the
    // server refuses the delete (409), so dropping it locally would only
    // hide the row until the next sync restored it.
    if (submittedIds.has(jobId)) return;
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
    const current = ensureCache();
    // Submitted applications survive "clear history" on both sides: they stay
    // in the map and no DELETE is issued for them.
    const ids = Object.keys(current).filter((id) => !submittedIds.has(id));
    const kept: AppliedJobsMap = {};
    for (const id of Object.keys(current)) {
      if (submittedIds.has(id)) kept[id] = current[id];
    }
    applyMap(kept);
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

  const getAppliedDate = useCallback((jobId: string): Date | null => {
    const dateString = (cachedMap ?? {})[jobId];
    if (!dateString) return null;
    try { return new Date(dateString); } catch { return null; }
  }, []);

  return {
    appliedJobs,
    isApplied,
    isHydrated,
    isSubmitted,
    markApplied,
    removeApplied,
    clearAll,
    getAppliedDate,
  };
}
