'use client';

import { useLocalStorage } from './useLocalStorage';

type ViewMode = 'grid' | 'list';

const STORAGE_KEY = 'pmhnp_view_mode';

/**
 * Hook to persist user's preferred view mode (grid/list).
 * Persists forever (no expiry).
 */
export function useViewMode(defaultMode: ViewMode = 'grid') {
  const [viewMode, setViewMode, isHydrated] = useLocalStorage<ViewMode>(
    STORAGE_KEY,
    defaultMode
  );

  return {
    viewMode: isHydrated ? viewMode : defaultMode,
    setViewMode,
    isHydrated,
  };
}
