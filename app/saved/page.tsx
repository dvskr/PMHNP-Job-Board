'use client';

import { useState, useEffect } from 'react';
import JobCard from '@/components/JobCard';
import { Job } from '@prisma/client';
import { Bookmark, Trash2 } from 'lucide-react';
import Link from 'next/link';

export default function SavedJobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    // Read saved jobs from localStorage
    const saved = JSON.parse(localStorage.getItem('savedJobs') || '[]');
    setSavedIds(saved);
    fetchSavedJobs(saved);
  }, []);

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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Saved Jobs</h1>
          <p className="text-gray-600">
            {savedIds.length} job{savedIds.length !== 1 ? 's' : ''} saved
          </p>
        </div>
        {savedIds.length > 0 && (
          <button
            onClick={handleClearAll}
            className="inline-flex items-center gap-2 px-4 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 size={18} />
            Clear all
          </button>
        )}
      </div>

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
            Save jobs you're interested in to view them later
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
    </div>
  );
}

