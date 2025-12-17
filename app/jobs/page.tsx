'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import JobCard from '@/components/JobCard';
import JobFilters from '@/components/JobFilters';
import CreateAlertForm from '@/components/CreateAlertForm';
import JobsListSkeleton from '@/components/JobsListSkeleton';
import AnimatedContainer from '@/components/ui/AnimatedContainer';
import { Job } from '@prisma/client';

interface FilterState {
  search?: string;
  location?: string;
  jobType?: string;
  mode?: string;
  minSalary?: number;
  maxSalary?: number;
}

interface CategoryCounts {
  byMode: Record<string, number>;
  byJobType: Record<string, number>;
  byState: Record<string, number>;
  special: {
    highPaying: number;
    newThisWeek: number;
  };
}

interface QuickFilter {
  label: string;
  filterKey: string;
  filterValue: string | number;
  count: number;
}

function JobsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    location: '',
    jobType: '',
    mode: '',
    minSalary: undefined,
    maxSalary: undefined,
  });
  const [quickFilters, setQuickFilters] = useState<QuickFilter[]>([]);
  
  const JOBS_PER_PAGE = 20;
  const totalPages = Math.ceil(total / JOBS_PER_PAGE);

  const fetchJobs = useCallback(async (currentFilters: FilterState, page: number = 1) => {
    try {
      setLoading(true);
      setError(null);
      
      // Build query string from filters
      const params = new URLSearchParams();
      params.set('page', page.toString());
      Object.entries(currentFilters).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          params.set(key, value.toString());
        }
      });
      
      const url = `/api/jobs?${params.toString()}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch jobs');
      }
      const data: { jobs: Job[]; total: number } = await response.json();
      setJobs(data.jobs);
      setTotal(data.total);
      
      // Scroll to top when page changes
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch category counts for quick filters
  useEffect(() => {
    async function fetchCategories() {
      try {
        const response = await fetch('/api/jobs/categories');
        if (!response.ok) return;
        const data: CategoryCounts = await response.json();

        const chips: QuickFilter[] = [];

        if (data.byMode['Remote']) {
          chips.push({ label: 'Remote', filterKey: 'mode', filterValue: 'Remote', count: data.byMode['Remote'] });
        }
        if (data.byJobType['Full-Time']) {
          chips.push({ label: 'Full-Time', filterKey: 'jobType', filterValue: 'Full-Time', count: data.byJobType['Full-Time'] });
        }
        if (data.special.newThisWeek > 0) {
          chips.push({ label: 'New This Week', filterKey: 'posted', filterValue: 'week', count: data.special.newThisWeek });
        }
        if (data.special.highPaying > 0) {
          chips.push({ label: 'High Paying', filterKey: 'minSalary', filterValue: 150000, count: data.special.highPaying });
        }

        setQuickFilters(chips);
      } catch (error) {
        console.error('Error fetching categories:', error);
      }
    }

    fetchCategories();
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
    const page = parseInt(searchParams.get('page') || '1');
    setFilters(newFilters);
    setCurrentPage(page);
    fetchJobs(newFilters, page);
  }, [searchParams, fetchJobs]);

  const handleFilterChange = useCallback((newFilters: FilterState) => {
    setFilters(newFilters);
    setCurrentPage(1); // Reset to page 1 when filters change
    
    // Build query string
    const params = new URLSearchParams();
    params.set('page', '1');
    Object.entries(newFilters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params.set(key, value.toString());
      }
    });
    
    // Update URL
    router.push(`/jobs?${params.toString()}`);
    
    // Re-fetch jobs with new filters
    fetchJobs(newFilters, 1);
  }, [router, fetchJobs]);
  
  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    
    setCurrentPage(newPage);
    
    // Build query string with new page
    const params = new URLSearchParams();
    params.set('page', newPage.toString());
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params.set(key, value.toString());
      }
    });
    
    // Update URL
    router.push(`/jobs?${params.toString()}`);
    
    // Fetch jobs for new page
    fetchJobs(filters, newPage);
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

  // Check if a quick filter is active
  const isQuickFilterActive = (qf: QuickFilter): boolean => {
    if (qf.filterKey === 'mode') return filters.mode === qf.filterValue;
    if (qf.filterKey === 'jobType') return filters.jobType === qf.filterValue;
    if (qf.filterKey === 'minSalary') return filters.minSalary === qf.filterValue;
    if (qf.filterKey === 'posted') return searchParams.get('posted') === qf.filterValue;
    return false;
  };

  // Handle quick filter click (only one at a time)
  const handleQuickFilterClick = (qf: QuickFilter) => {
    const isActive = isQuickFilterActive(qf);
    const params = new URLSearchParams(searchParams.toString());

    if (isActive) {
      // Remove this filter
      params.delete(qf.filterKey);
    } else {
      // Remove all quick filter keys first
      quickFilters.forEach(filter => params.delete(filter.filterKey));
      
      // Add only this filter
      params.set(qf.filterKey, qf.filterValue.toString());
    }

    router.push(`/jobs?${params.toString()}`);
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
          {/* Quick Filter Chips */}
          {quickFilters.length > 0 && (
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
              {quickFilters.map((qf) => {
                const isActive = isQuickFilterActive(qf);
                return (
                  <button
                    key={qf.label}
                    onClick={() => handleQuickFilterClick(qf)}
                    className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <span>{qf.label}</span>
                    <span className={`text-xs ${isActive ? 'text-blue-200' : 'text-gray-500'}`}>
                      ({qf.count})
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Results Count */}
          {!loading && !error && (
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm text-gray-500">
                Showing {Math.min((currentPage - 1) * JOBS_PER_PAGE + 1, total)}-{Math.min(currentPage * JOBS_PER_PAGE, total)} of {total} job{total !== 1 ? 's' : ''}
              </p>
              {totalPages > 1 && (
                <p className="text-sm text-gray-500">
                  Page {currentPage} of {totalPages}
                </p>
              )}
            </div>
          )}

          {/* Loading State */}
          {loading && <JobsListSkeleton count={9} />}

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
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                {jobs.map((job, index) => (
                  <div key={job.id} className="h-full">
                    <AnimatedContainer
                      animation="fade-in-up"
                      delay={Math.min(index * 50, 600)}
                    >
                      <JobCard job={job} />
                    </AnimatedContainer>
                  </div>
                ))}
              </div>
              
              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="mt-8 flex justify-center items-center gap-2">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  
                  <div className="flex gap-1">
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 7) {
                        pageNum = i + 1;
                      } else if (currentPage <= 4) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 3) {
                        pageNum = totalPages - 6 + i;
                      } else {
                        pageNum = currentPage - 3 + i;
                      }
                      
                      return (
                        <button
                          key={pageNum}
                          onClick={() => handlePageChange(pageNum)}
                          className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                            currentPage === pageNum
                              ? 'bg-blue-600 text-white'
                              : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Alert Modal */}
      {isAlertModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 animate-fade-in"
            onClick={() => setIsAlertModalOpen(false)}
          />
          
          {/* Modal */}
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative w-full max-w-md transform rounded-2xl bg-white p-6 shadow-xl animate-scale-in">
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

function LoadingFallback() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JobsListSkeleton count={9} />
    </div>
  );
}

export default function JobsPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <JobsContent />
    </Suspense>
  );
}
