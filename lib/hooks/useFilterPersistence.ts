'use client';

/**
 * Hook to persist filter preferences across sessions.
 * Currently disabled to debug infinite loop issue.
 */
export function useFilterPersistence() {
  // Disabled - just return empty object
  return {
    clearSavedFilters: () => {},
  };
}
