'use client';

import { useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';

interface ViewedJob {
  slug: string;
  viewedAt: number;
}

const STORAGE_KEY = 'pmhnp_viewed_jobs';
const MAX_VIEWED = 100; // Keep last 100 viewed jobs
const EXPIRY_DAYS = 7;

/**
 * Hook to track which jobs a user has viewed.
 * Stores in localStorage with 7-day expiry per job.
 */
export function useViewedJobs() {
  const [viewedJobs, setViewedJobs, isHydrated] = useLocalStorage<ViewedJob[]>(
    STORAGE_KEY,
    [],
    { expiryDays: 30 } // Container expiry (individual jobs have their own expiry)
  );

  const markAsViewed = useCallback((slug: string) => {
    const now = Date.now();
    const expiryTime = EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    setViewedJobs((prev) => {
      // Filter out expired jobs and the current job (to update its timestamp)
      const filtered = prev
        .filter((job) => now - job.viewedAt < expiryTime && job.slug !== slug)
        .slice(0, MAX_VIEWED - 1);

      // Add the job at the beginning (most recently viewed)
      return [{ slug, viewedAt: now }, ...filtered];
    });
  }, [setViewedJobs]);

  const isViewed = useCallback((slug: string): boolean => {
    if (!isHydrated) return false;
    
    const now = Date.now();
    const expiryTime = EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    
    return viewedJobs.some(
      (job) => job.slug === slug && now - job.viewedAt < expiryTime
    );
  }, [viewedJobs, isHydrated]);

  const getViewedCount = useCallback((): number => {
    const now = Date.now();
    const expiryTime = EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    return viewedJobs.filter((job) => now - job.viewedAt < expiryTime).length;
  }, [viewedJobs]);

  const clearViewedJobs = useCallback(() => {
    setViewedJobs([]);
  }, [setViewedJobs]);

  return {
    viewedJobs,
    markAsViewed,
    isViewed,
    getViewedCount,
    clearViewedJobs,
    isHydrated,
  };
}
