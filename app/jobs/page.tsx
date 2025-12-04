'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import JobCard from '@/components/JobCard';
import JobFilters from '@/components/JobFilters';
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Active Filters Badge */}
      {activeFilterCount > 0 && (
        <div className="mb-6">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-700">
            {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active
          </span>
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
    </div>
  );
}
