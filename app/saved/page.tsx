'use client';

import { useState, useEffect, useRef } from 'react';
import JobCard from '@/components/JobCard';
import { Job } from '@prisma/client';
import { Bookmark, Trash2, FileCheck } from 'lucide-react';
import Link from 'next/link';
import useAppliedJobs from '@/lib/hooks/useAppliedJobs';

type TabType = 'saved' | 'applied';

export default function SavedJobsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('saved');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Applied jobs hook
  const { appliedJobs, getAppliedDate } = useAppliedJobs();
  const [appliedJobsData, setAppliedJobsData] = useState<Job[]>([]);
  const [appliedLoading, setAppliedLoading] = useState(false);
  const [appliedError, setAppliedError] = useState<string | null>(null);
  const [appliedInitialized, setAppliedInitialized] = useState(false);
  const lastFetchedIds = useRef<string>('');

  const fetchSavedJobs = async (ids: string[]) => {
    if (ids.length === 0) {
      setJobs([]);
      setLoading(false);
      return;
    }

    try {
      // Fetch all jobs and filter by saved IDs
      const response = await fetch('/api/jobs');
      if (!response.ok) {
        throw new Error('Failed to fetch jobs');
      }
      const data: { jobs: Job[]; total: number } = await response.json();
      
      // Filter to only saved jobs
      const savedJobs = data.jobs.filter((job) => ids.includes(job.id));
      setJobs(savedJobs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const fetchAppliedJobs = async (ids: string[]) => {
    if (ids.length === 0) {
      setAppliedJobsData([]);
      setAppliedLoading(false);
      return;
    }

    setAppliedLoading(true);
    setAppliedError(null);

    try {
      // Fetch all jobs and filter by applied IDs
      const response = await fetch('/api/jobs');
      if (!response.ok) {
        throw new Error('Failed to fetch jobs');
      }
      const data: { jobs: Job[]; total: number } = await response.json();
      
      // Filter to only applied jobs
      const appliedJobsList = data.jobs.filter((job) => ids.includes(job.id));
      setAppliedJobsData(appliedJobsList);
    } catch (err) {
      setAppliedError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setAppliedLoading(false);
    }
  };

  useEffect(() => {
    // Read saved jobs from localStorage
    const saved = JSON.parse(localStorage.getItem('savedJobs') || '[]');
    setSavedIds(saved);
    fetchSavedJobs(saved);
  }, []);

  // Fetch applied jobs when tab changes or appliedJobs changes
  useEffect(() => {
    // Create a stable key from the applied job IDs
    const idsKey = appliedJobs.sort().join(',');
    
    // Only fetch if we're on the applied tab and IDs have actually changed
    if (activeTab === 'applied') {
      if (appliedJobs.length > 0) {
        // Only fetch if IDs changed since last fetch
        if (idsKey !== lastFetchedIds.current) {
          lastFetchedIds.current = idsKey;
          fetchAppliedJobs(appliedJobs);
        }
      } else if (!appliedInitialized) {
        // First render with empty array - wait a bit for localStorage to load
        setAppliedLoading(true);
        const timer = setTimeout(() => {
          setAppliedInitialized(true);
          setAppliedLoading(false);
        }, 100);
        return () => clearTimeout(timer);
      } else {
        setAppliedJobsData([]);
        setAppliedLoading(false);
      }
    }
  }, [activeTab, appliedJobs, appliedInitialized]);

  const formatAppliedDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleClearAll = () => {
    localStorage.removeItem('savedJobs');
    setSavedIds([]);
    setJobs([]);
  };

  const handleRemoveJob = (jobId: string) => {
    const updatedIds = savedIds.filter((id) => id !== jobId);
    localStorage.setItem('savedJobs', JSON.stringify(updatedIds));
    setSavedIds(updatedIds);
    setJobs(jobs.filter((job) => job.id !== jobId));
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-3xl md:text-4xl font-bold mb-2">My Jobs</h1>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-8">
        <nav className="flex gap-8">
          <button
            onClick={() => setActiveTab('saved')}
            className={`pb-4 px-1 text-sm font-medium transition-colors relative ${
              activeTab === 'saved'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="flex items-center gap-2">
              <Bookmark size={18} />
              Saved
              {savedIds.length > 0 && (
                <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                  {savedIds.length}
                </span>
              )}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('applied')}
            className={`pb-4 px-1 text-sm font-medium transition-colors relative ${
              activeTab === 'applied'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="flex items-center gap-2">
              <FileCheck size={18} />
              Applied
              {appliedJobs.length > 0 && (
                <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                  {appliedJobs.length}
                </span>
              )}
            </span>
          </button>
        </nav>
      </div>

      {/* Saved Tab Content */}
      {activeTab === 'saved' && (
        <>
          {/* Header with Clear All */}
          {savedIds.length > 0 && (
            <div className="flex items-center justify-between mb-6">
              <p className="text-gray-600">
                {savedIds.length} job{savedIds.length !== 1 ? 's' : ''} saved
              </p>
              <button
                onClick={handleClearAll}
                className="inline-flex items-center gap-2 px-4 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 size={18} />
                Clear all
              </button>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                <p className="text-gray-600">Loading saved jobs...</p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-600">{error}</p>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && jobs.length === 0 && (
            <div className="text-center py-16">
              <Bookmark className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">No saved jobs yet</h2>
              <p className="text-gray-600 mb-6">
                Save jobs you&apos;re interested in to view them later
              </p>
              <Link
                href="/jobs"
                className="inline-block bg-blue-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-600 transition-colors"
              >
                Browse Jobs
              </Link>
            </div>
          )}

          {/* Jobs Grid */}
          {!loading && !error && jobs.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {jobs.map((job) => (
                <div key={job.id} className="relative">
                  <JobCard job={job} />
                  <button
                    onClick={() => handleRemoveJob(job.id)}
                    className="absolute top-4 right-4 p-2 bg-white rounded-full shadow-md hover:bg-red-50 hover:text-red-600 transition-colors"
                    title="Remove from saved"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Applied Tab Content */}
      {activeTab === 'applied' && (
        <>
          {/* Header */}
          {appliedJobs.length > 0 && (
            <div className="mb-6">
              <p className="text-gray-600">
                {appliedJobs.length} application{appliedJobs.length !== 1 ? 's' : ''} tracked
              </p>
            </div>
          )}

          {/* Loading State */}
          {appliedLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                <p className="text-gray-600">Loading applied jobs...</p>
              </div>
            </div>
          )}

          {/* Error State */}
          {appliedError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-600">{appliedError}</p>
            </div>
          )}

          {/* Empty State */}
          {!appliedLoading && !appliedError && appliedJobs.length === 0 && (
            <div className="text-center py-16">
              <FileCheck className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">No applications tracked yet</h2>
              <p className="text-gray-600 mb-6">
                When you apply to jobs, they&apos;ll appear here
              </p>
              <Link
                href="/jobs"
                className="inline-block bg-blue-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-600 transition-colors"
              >
                Browse Jobs
              </Link>
            </div>
          )}

          {/* Jobs Grid */}
          {!appliedLoading && !appliedError && appliedJobsData.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {appliedJobsData.map((job) => {
                const appliedDate = getAppliedDate(job.id);
                return (
                  <div key={job.id} className="flex flex-col">
                    <JobCard job={job} />
                    {appliedDate && (
                      <p className="text-sm text-gray-500 mt-2 ml-1">
                        Applied on {formatAppliedDate(appliedDate)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

