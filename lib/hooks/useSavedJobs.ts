'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'savedJobs';

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
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      // Handle legacy format (array of IDs) and new format (object with dates)
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        // Convert legacy array format to new object format
        const converted: SavedJobsMap = {};
        parsed.forEach((id: string) => {
          converted[id] = new Date().toISOString();
        });
        // Save in new format
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
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedJobs));
  } catch (error) {
    console.error('Error saving saved jobs to localStorage:', error);
  }
}

export default function useSavedJobs(): UseSavedJobsReturn {
  const [savedJobsMap, setSavedJobsMap] = useState<SavedJobsMap>({});

  // Initialize from localStorage on mount
  useEffect(() => {
    setSavedJobsMap(getStoredSavedJobs());
  }, []);

  // Sync across tabs via storage event
  useEffect(() => {
    function handleStorageChange(event: StorageEvent) {
      if (event.key === STORAGE_KEY) {
        try {
          const newValue = event.newValue ? JSON.parse(event.newValue) : {};
          // Handle both array and object formats
          if (Array.isArray(newValue)) {
            const converted: SavedJobsMap = {};
            newValue.forEach((id: string) => {
              converted[id] = new Date().toISOString();
            });
            setSavedJobsMap(converted);
          } else {
            setSavedJobsMap(newValue);
          }
        } catch (error) {
          console.error('Error parsing storage event:', error);
        }
      }
    }

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Get array of saved job IDs
  const savedJobs = Object.keys(savedJobsMap);

  // Check if a job is saved
  const isSaved = useCallback(
    (jobId: string): boolean => {
      return jobId in savedJobsMap;
    },
    [savedJobsMap]
  );

  // Save a job
  const saveJob = useCallback((jobId: string): void => {
    setSavedJobsMap((prev) => {
      // Don't overwrite if already saved
      if (jobId in prev) {
        return prev;
      }

      const updated = {
        ...prev,
        [jobId]: new Date().toISOString(),
      };

      setStoredSavedJobs(updated);
      return updated;
    });
  }, []);

  // Remove a job from saved list
  const removeJob = useCallback((jobId: string): void => {
    setSavedJobsMap((prev) => {
      if (!(jobId in prev)) {
        return prev;
      }

      const updated = { ...prev };
      delete updated[jobId];

      setStoredSavedJobs(updated);
      return updated;
    });
  }, []);

  // Clear all saved jobs
  const clearAll = useCallback((): void => {
    setSavedJobsMap({});
    setStoredSavedJobs({});
  }, []);

  // Get the date when a job was saved
  const savedAt = useCallback(
    (jobId: string): Date | null => {
      const dateString = savedJobsMap[jobId];
      if (!dateString) {
        return null;
      }

      try {
        return new Date(dateString);
      } catch {
        return null;
      }
    },
    [savedJobsMap]
  );

  return {
    savedJobs,
    isSaved,
    saveJob,
    removeJob,
    clearAll,
    savedAt,
  };
}

