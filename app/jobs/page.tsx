'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import JobCard from '@/components/JobCard';
import JobFilters from '@/components/JobFilters';
import CreateAlertForm from '@/components/CreateAlertForm';
import { Job } from '@prisma/client';

interface FilterState {
  search?: string;
  location?: string;
  jobType?: string;
  mode?: string;
  minSalary?: number;
  maxSalary?: number;
}

export default function JobsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    location: '',
    jobType: '',
    mode: '',
    minSalary: undefined,
    maxSalary: undefined,
  });

  const fetchJobs = useCallback(async (currentFilters: FilterState) => {
    try {
      setLoading(true);
      setError(null);
      
      // Build query string from filters
      const params = new URLSearchParams();
      Object.entries(currentFilters).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          params.set(key, value.toString());
        }
      });
      
      const queryString = params.toString();
      const url = queryString ? `/api/jobs?${queryString}` : '/api/jobs';
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch jobs');
      }
      const data: { jobs: Job[]; total: number } = await response.json();
      setJobs(data.jobs);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  // Read URL params on mount and when they change
  useEffect(() => {
    const newFilters: FilterState = {
      search: searchParams.get('search') || '',
      location: searchParams.get('location') || '',
      jobType: searchParams.get('jobType') || '',
      mode: searchParams.get('mode') || '',
      minSalary: searchParams.get('minSalary') ? parseInt(searchParams.get('minSalary')!) : undefined,
      maxSalary: searchParams.get('maxSalary') ? parseInt(searchParams.get('maxSalary')!) : undefined,
    };
    setFilters(newFilters);
    fetchJobs(newFilters);
  }, [searchParams, fetchJobs]);

  const handleFilterChange = (newFilters: FilterState) => {
    setFilters(newFilters);
    
    // Build query string
    const params = new URLSearchParams();
    Object.entries(newFilters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params.set(key, value.toString());
      }
    });
    
    // Update URL
    const queryString = params.toString();
    router.push(queryString ? `/jobs?${queryString}` : '/jobs');
    
    // Re-fetch jobs with new filters
    fetchJobs(newFilters);
  };

  // Count active filters
  const activeFilterCount = Object.values(filters).filter(
    (value) => value !== undefined && value !== ''
  ).length;

  // Handle alert creation success
  const handleAlertSuccess = () => {
    setIsAlertModalOpen(false);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  // Build initial filters for alert form
  const alertFilters = {
    keyword: filters.search || undefined,
    location: filters.location || undefined,
    mode: filters.mode || undefined,
    jobType: filters.jobType || undefined,
    minSalary: filters.minSalary,
    maxSalary: filters.maxSalary,
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Active Filters Badge & Create Alert Button */}
      {activeFilterCount > 0 && (
        <div className="mb-6 flex items-center gap-4">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-700">
            {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active
          </span>
          <button
            onClick={() => setIsAlertModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 bg-white border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
              />
            </svg>
            Create Alert for This Search
          </button>
        </div>
      )}

      {/* Main Content with Filters */}
      <div className="flex gap-8">
        {/* Filters Sidebar */}
        <JobFilters
          currentFilters={filters}
          onFilterChange={handleFilterChange}
        />

        {/* Jobs Content */}
        <div className="flex-1">
          {/* Results Count */}
          {!loading && !error && (
            <p className="text-sm text-gray-500 mb-4">
              {total} job{total !== 1 ? 's' : ''} found
            </p>
          )}

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                <p className="text-gray-600">Loading jobs...</p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-600">{error}</p>
            </div>
          )}

          {/* No Jobs State */}
          {!loading && !error && jobs.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-600 text-lg">No jobs found</p>
              {activeFilterCount > 0 && (
                <p className="text-gray-500 text-sm mt-2">
                  Try adjusting your filters
                </p>
              )}
            </div>
          )}

          {/* Jobs Grid */}
          {!loading && !error && jobs.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {jobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Alert Modal */}
      {isAlertModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 transition-opacity"
            onClick={() => setIsAlertModalOpen(false)}
          />
          
          {/* Modal */}
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative w-full max-w-md transform rounded-2xl bg-white p-6 shadow-xl transition-all">
              {/* Close Button */}
              <button
                onClick={() => setIsAlertModalOpen(false)}
                className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Modal Header */}
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Create Job Alert</h2>
              
              {/* Alert Form */}
              <CreateAlertForm
                initialFilters={alertFilters}
                onSuccess={handleAlertSuccess}
              />
            </div>
          </div>
        </div>
      )}

      {/* Success Toast */}
      {showToast && (
        <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-white shadow-lg">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            <span className="font-medium">Alert created!</span>
          </div>
        </div>
      )}
    </div>
  );
}
