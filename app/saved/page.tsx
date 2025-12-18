'use client';

import { useState, useEffect, useRef } from 'react';
import JobCard from '@/components/JobCard';
import JobsListSkeleton from '@/components/JobsListSkeleton';
import { Job } from '@/lib/types';
import { Bookmark, Trash2, FileCheck } from 'lucide-react';
import Link from 'next/link';
import useAppliedJobs from '@/lib/hooks/useAppliedJobs';

type TabType = 'saved' | 'applied';
type SortOption = 'recent' | 'salary' | 'title';

export default function SavedJobsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('saved');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('recent');

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
      const savedJobs = data.jobs.filter((job: Job) => ids.includes(job.id));
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
      const appliedJobsList = data.jobs.filter((job: Job) => ids.includes(job.id));
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

  const handleRemoveJob = (jobId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const updatedIds = savedIds.filter((id: string) => id !== jobId);
    localStorage.setItem('savedJobs', JSON.stringify(updatedIds));
    setSavedIds(updatedIds);
    setJobs(jobs.filter((job: Job) => job.id !== jobId));
  };

  // Sort jobs based on selected option
  const getSortedJobs = (jobsToSort: Job[]): Job[] => {
    const sorted = [...jobsToSort];
    switch (sortBy) {
      case 'salary':
        return sorted.sort((a: Job, b: Job) => (b.maxSalary || b.minSalary || 0) - (a.maxSalary || a.minSalary || 0));
      case 'title':
        return sorted.sort((a: Job, b: Job) => a.title.localeCompare(b.title));
      case 'recent':
      default:
        // Keep original order (order saved)
        return sorted;
    }
  };

  const sortedJobs = getSortedJobs(jobs);

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
          {/* Header with Sort and Clear All */}
          {savedIds.length > 0 && (
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">
                Saved Jobs ({savedIds.length})
              </h2>
              <div className="flex items-center gap-4">
                {/* Sort Dropdown */}
                <div className="flex items-center gap-2">
                  <label htmlFor="sort-saved" className="text-sm text-gray-500">
                    Sort by:
                  </label>
                  <select
                    id="sort-saved"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="recent">Recently Saved</option>
                    <option value="salary">Highest Salary</option>
                    <option value="title">Job Title A-Z</option>
                  </select>
                </div>
                {/* Clear All Button */}
                <button
                  onClick={handleClearAll}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={16} />
                  Clear all
                </button>
              </div>
            </div>
          )}

          {/* Loading State */}
          {loading && <JobsListSkeleton count={3} />}

          {/* Error State */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-600">{error}</p>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && jobs.length === 0 && (
            <div className="text-center py-16">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
                <Bookmark className="w-10 h-10 text-gray-400" strokeWidth={1.5} />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">No saved jobs yet</h2>
              <p className="text-gray-500 mb-8 max-w-sm mx-auto">
                Click the bookmark icon on any job to save it here for easy access later
              </p>
              <Link
                href="/jobs"
                className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
              >
                Browse Jobs
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            </div>
          )}

          {/* Jobs Grid */}
          {!loading && !error && sortedJobs.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sortedJobs.map((job: Job) => (
                <div key={job.id} className="relative group">
                  <JobCard job={job} />
                  <button
                    onClick={(e) => handleRemoveJob(job.id, e)}
                    className="absolute top-3 right-3 p-1.5 bg-white/90 backdrop-blur-sm rounded-full shadow-sm opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 transition-all text-gray-400"
                    title="Remove from saved"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
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
          {appliedLoading && <JobsListSkeleton count={3} />}

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
              {appliedJobsData.map((job: Job) => {
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

