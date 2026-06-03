/**
 * lib/saved-jobs.ts — single source of truth for saved-jobs localStorage state.
 *
 * F2 fix: SaveJobButton used to store a bare string[] under 'savedJobs' while
 * useSavedJobs stored a { [jobId]: isoDate } map under the SAME key. Saving from
 * the job-detail page overwrote the hook's map with a one-element array (and vice
 * versa), corrupting the saved list. Both consumers now go through these helpers
 * so the on-disk shape is always the canonical map.
 *
 * Shape: { [jobId: string]: isoDateString }  (the richer format the hook already
 * used). Legacy array values are migrated on read and re-persisted.
 */

export const SAVED_JOBS_KEY = 'savedJobs';

export interface SavedJobsMap {
  [jobId: string]: string; // ISO date string
}

/** Persist the canonical map. Underscore-prefixed: internal seam for useSavedJobs. */
export function _write(map: SavedJobsMap): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SAVED_JOBS_KEY, JSON.stringify(map));
  } catch {
    // QuotaExceededError / private-mode — silently ignore.
  }
}

/**
 * Read and normalise localStorage. Handles: absent key → {}, legacy array →
 * migrate+re-persist as map, corrupt/scalar JSON → {}.
 */
export function read(): SavedJobsMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SAVED_JOBS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const migrated: SavedJobsMap = Object.fromEntries(
        parsed
          .filter((id): id is string => typeof id === 'string')
          .map((id) => [id, new Date().toISOString()]),
      );
      _write(migrated);
      return migrated;
    }
    if (parsed !== null && typeof parsed === 'object') {
      return parsed as SavedJobsMap;
    }
    return {};
  } catch {
    return {};
  }
}

export function isSaved(id: string): boolean {
  return id in read();
}

export function add(id: string): SavedJobsMap {
  const current = read();
  if (id in current) return current; // idempotent
  const next: SavedJobsMap = { ...current, [id]: new Date().toISOString() };
  _write(next);
  return next;
}

export function remove(id: string): SavedJobsMap {
  const current = read();
  if (!(id in current)) return current; // idempotent
  const next: SavedJobsMap = { ...current };
  delete next[id];
  _write(next);
  return next;
}

export function toggle(id: string): SavedJobsMap {
  return isSaved(id) ? remove(id) : add(id);
}
