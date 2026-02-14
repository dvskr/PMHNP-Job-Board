'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import JobCard from '@/components/JobCard';
import JobsListSkeleton from '@/components/JobsListSkeleton';
import { Job } from '@/lib/types';
import { Bookmark, Trash2, FileCheck } from 'lucide-react';
import Link from 'next/link';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import useAppliedJobs from '@/lib/hooks/useAppliedJobs';
import useSavedJobs from '@/lib/hooks/useSavedJobs';

type TabType = 'saved' | 'applied';
type SortOption = 'recent' | 'salary' | 'title';

export default function SavedJobsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('saved');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('recent');

  // Saved jobs hook - single source of truth
  const { savedJobs: savedIds, removeJob, clearAll: clearSavedJobs } = useSavedJobs();

  // Applied jobs hook
  const { appliedJobs, getAppliedDate } = useAppliedJobs();
  const [appliedJobsData, setAppliedJobsData] = useState<Job[]>([]);
  const [appliedLoading, setAppliedLoading] = useState(false);
  const [appliedError, setAppliedError] = useState<string | null>(null);
  const [appliedInitialized, setAppliedInitialized] = useState(false);
  const lastFetchedIds = useRef<string>('');

  const fetchSavedJobs = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      setJobs([]);
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`/api/jobs?ids=${ids.join(',')}`);
      if (!response.ok) {
        throw new Error('Failed to fetch jobs');
      }
      const data: { jobs: Job[] } = await response.json();
      setJobs(data.jobs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAppliedJobs = async (ids: string[]) => {
    if (ids.length === 0) {
      setAppliedJobsData([]);
      setAppliedLoading(false);
      return;
    }

    setAppliedLoading(true);
    setAppliedError(null);

    try {
      const response = await fetch(`/api/jobs?ids=${ids.join(',')}`);
      if (!response.ok) {
        throw new Error('Failed to fetch jobs');
      }
      const data: { jobs: Job[] } = await response.json();
      setAppliedJobsData(data.jobs);
    } catch (err) {
      setAppliedError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setAppliedLoading(false);
    }
  };

  useEffect(() => {
    // Fetch saved jobs whenever savedIds changes
    fetchSavedJobs(savedIds);
  }, [savedIds, fetchSavedJobs]);

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
    return undefined;
  }, [activeTab, appliedJobs, appliedInitialized]);

  const formatAppliedDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleClearAll = () => {
    clearSavedJobs();
    setJobs([]);
  };

  const handleClearApplied = () => {
    if (confirm('Are you sure you want to clear your application history? This cannot be undone.')) {
      localStorage.removeItem('appliedJobs');
      setAppliedJobsData([]);
      // Force a page reload to reset the hook state
      window.location.reload();
    }
  };

  const handleRemoveJob = (jobId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    removeJob(jobId);
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
    <>
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://pmhnphiring.com' },
        { name: 'Saved Jobs', url: 'https://pmhnphiring.com/saved' },
      ]} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div style={{ borderBottom: '1px solid var(--border-color)', marginBottom: '32px' }}>
          <nav className="flex gap-8">
            <button
              onClick={() => setActiveTab('saved')}
              style={{
                paddingBottom: '16px', paddingInline: '4px', fontSize: '14px', fontWeight: 500,
                transition: 'color 0.2s', position: 'relative', background: 'none', border: 'none', cursor: 'pointer',
                color: activeTab === 'saved' ? 'var(--color-primary)' : 'var(--text-tertiary)',
                borderBottom: activeTab === 'saved' ? '2px solid var(--color-primary)' : '2px solid transparent',
              }}
            >
              <span className="flex items-center gap-2">
                <Bookmark size={18} />
                Saved
                {savedIds.length > 0 && (
                  <span style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: '12px', padding: '2px 8px', borderRadius: '9999px' }}>
                    {savedIds.length}
                  </span>
                )}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('applied')}
              style={{
                paddingBottom: '16px', paddingInline: '4px', fontSize: '14px', fontWeight: 500,
                transition: 'color 0.2s', position: 'relative', background: 'none', border: 'none', cursor: 'pointer',
                color: activeTab === 'applied' ? 'var(--color-primary)' : 'var(--text-tertiary)',
                borderBottom: activeTab === 'applied' ? '2px solid var(--color-primary)' : '2px solid transparent',
              }}
            >
              <span className="flex items-center gap-2">
                <FileCheck size={18} />
                Applied
                {(activeTab === 'applied' ? appliedJobsData.length : appliedJobs.length) > 0 && (
                  <span style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: '12px', padding: '2px 8px', borderRadius: '9999px' }}>
                    {activeTab === 'applied' ? appliedJobsData.length : appliedJobs.length}
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
                <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Saved Jobs ({savedIds.length})
                </h2>
                <div className="flex items-center gap-4">
                  {/* Sort Dropdown */}
                  <div className="flex items-center gap-2">
                    <label htmlFor="sort-saved" style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>
                      Sort by:
                    </label>
                    <select
                      id="sort-saved"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortOption)}
                      style={{ fontSize: '14px', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '6px 12px', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
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
                <div style={{ margin: '0 auto 24px', display: 'flex', width: '80px', height: '80px', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', backgroundColor: 'var(--bg-tertiary)' }}>
                  <Bookmark style={{ width: '40px', height: '40px', color: 'var(--text-tertiary)' }} strokeWidth={1.5} />
                </div>
                <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>No saved jobs yet</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '32px', maxWidth: '384px', marginInline: 'auto' }}>
                  Click the bookmark icon on any job to save it here for easy access later
                </p>
                <Link
                  href="/jobs"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: 'var(--color-primary)', color: '#fff', padding: '12px 24px', borderRadius: '12px', fontWeight: 600, textDecoration: 'none', transition: 'opacity 0.2s' }}
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
            {appliedJobsData.length > 0 && (
              <div className="flex items-center justify-between mb-6">
                <p style={{ color: 'var(--text-secondary)' }}>
                  {appliedJobsData.length} application{appliedJobsData.length !== 1 ? 's' : ''} tracked
                </p>
                <button
                  onClick={handleClearApplied}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors border border-red-200 hover:border-red-300 font-medium"
                >
                  <Trash2 size={16} />
                  Clear history
                </button>
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
                <FileCheck style={{ width: '64px', height: '64px', color: 'var(--text-tertiary)', margin: '0 auto 16px' }} />
                <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>No applications tracked yet</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
                  When you apply to jobs, they&apos;ll appear here
                </p>
                <Link
                  href="/jobs"
                  style={{ display: 'inline-block', backgroundColor: 'var(--color-primary)', color: '#fff', padding: '12px 24px', borderRadius: '12px', fontWeight: 600, textDecoration: 'none', transition: 'opacity 0.2s' }}
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
                        <p style={{ fontSize: '14px', color: 'var(--text-tertiary)', marginTop: '8px', marginLeft: '4px' }}>
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
    </>
  );
}

