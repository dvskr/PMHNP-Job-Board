'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'appliedJobs';

interface AppliedJobsMap {
  [jobId: string]: string; // ISO date string
}

interface UseAppliedJobsReturn {
  appliedJobs: string[];
  isApplied: (jobId: string) => boolean;
  markApplied: (jobId: string) => void;
  removeApplied: (jobId: string) => void;
  getAppliedDate: (jobId: string) => Date | null;
}

function getStoredAppliedJobs(): AppliedJobsMap {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as AppliedJobsMap;
    }
  } catch (error) {
    console.error('Error reading applied jobs from localStorage:', error);
  }

  return {};
}

function setStoredAppliedJobs(appliedJobs: AppliedJobsMap): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appliedJobs));
  } catch (error) {
    console.error('Error saving applied jobs to localStorage:', error);
  }
}

export default function useAppliedJobs(): UseAppliedJobsReturn {
  const [appliedJobsMap, setAppliedJobsMap] = useState<AppliedJobsMap>({});

  // Initialize from localStorage on mount
  useEffect(() => {
    setAppliedJobsMap(getStoredAppliedJobs());
  }, []);

  // Sync across tabs via storage event
  useEffect(() => {
    function handleStorageChange(event: StorageEvent) {
      if (event.key === STORAGE_KEY) {
        try {
          const newValue = event.newValue ? JSON.parse(event.newValue) : {};
          setAppliedJobsMap(newValue);
        } catch (error) {
          console.error('Error parsing storage event:', error);
        }
      }
    }

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Get array of applied job IDs
  const appliedJobs = Object.keys(appliedJobsMap);

  // Check if a job is applied
  const isApplied = useCallback(
    (jobId: string): boolean => {
      return jobId in appliedJobsMap;
    },
    [appliedJobsMap]
  );

  // Mark a job as applied
  const markApplied = useCallback((jobId: string): void => {
    setAppliedJobsMap((prev) => {
      // Don't overwrite if already applied
      if (jobId in prev) {
        return prev;
      }

      const updated = {
        ...prev,
        [jobId]: new Date().toISOString(),
      };

      setStoredAppliedJobs(updated);
      return updated;
    });
  }, []);

  // Remove a job from applied list
  const removeApplied = useCallback((jobId: string): void => {
    setAppliedJobsMap((prev) => {
      if (!(jobId in prev)) {
        return prev;
      }

      const updated = { ...prev };
      delete updated[jobId];

      setStoredAppliedJobs(updated);
      return updated;
    });
  }, []);

  // Get the date when a job was applied
  const getAppliedDate = useCallback(
    (jobId: string): Date | null => {
      const dateString = appliedJobsMap[jobId];
      if (!dateString) {
        return null;
      }

      try {
        return new Date(dateString);
      } catch {
        return null;
      }
    },
    [appliedJobsMap]
  );

  return {
    appliedJobs,
    isApplied,
    markApplied,
    removeApplied,
    getAppliedDate,
  };
}

