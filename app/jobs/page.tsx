'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import JobCard from '@/components/JobCard';
import LinkedInFilters from '@/components/jobs/LinkedInFilters';
import CreateAlertForm from '@/components/CreateAlertForm';
import JobsListSkeleton from '@/components/JobsListSkeleton';
import AnimatedContainer from '@/components/ui/AnimatedContainer';
import { Job } from '@/lib/types';
import { FilterState, DEFAULT_FILTERS } from '@/types/filters';
import { parseFiltersFromParams } from '@/lib/filters';

function JobsContent() {
  const searchParams = useSearchParams();
  
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [currentFilters, setCurrentFilters] = useState<FilterState>(DEFAULT_FILTERS);

  const fetchJobs = useCallback(async (filters: FilterState, page: number = 1) => {
    try {
      setLoading(true);
      setError(null);
      
      // Build query string from filters
      const params = new URLSearchParams();
      
      // Add pagination
      params.set('page', page.toString());
      params.set('limit', '50'); // Show 50 jobs per page
      
      // Add search
      if (filters.search) {
        params.set('q', filters.search);
      }
      
      // Add location
      if (filters.location) {
        params.set('location', filters.location);
      }
      
      // Add work modes (multi-select)
      filters.workMode.forEach((mode: string) => {
        params.append('workMode', mode);
      });
      
      // Add job types (multi-select)
      filters.jobType.forEach((type: string) => {
        params.append('jobType', type);
      });
      
      // Add salary
      if (filters.salaryMin) {
        params.set('salaryMin', filters.salaryMin.toString());
      }
      
      // Add posted within
      if (filters.postedWithin) {
        params.set('postedWithin', filters.postedWithin);
      }
      
      const url = `/api/jobs?${params.toString()}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch jobs');
      }
      const data: { jobs: Job[]; total: number; totalPages: number; page: number } = await response.json();
      setJobs(data.jobs);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setCurrentPage(data.page);
      
      // Scroll to top when results change - use requestAnimationFrame to avoid forced reflow
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch jobs when filters change
  useEffect(() => {
    const filters = parseFiltersFromParams(new URLSearchParams(searchParams.toString()));
    setCurrentFilters(filters);
    setCurrentPage(1); // Reset to page 1 when filters change
    fetchJobs(filters, 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]); // Only depend on searchParams, not fetchJobs

  // Handle page change
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      fetchJobs(currentFilters, newPage);
    }
  };

  // Count active filters (including search)
  const activeFilterCount = 
    currentFilters.workMode.length +
    currentFilters.jobType.length +
    (currentFilters.salaryMin ? 1 : 0) +
    (currentFilters.postedWithin ? 1 : 0) +
    (currentFilters.location ? 1 : 0) +
    (currentFilters.search ? 1 : 0);

  // Handle alert creation success
  const handleAlertSuccess = () => {
    setIsAlertModalOpen(false);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  // Build initial filters for alert form
  const alertFilters = {
    keyword: currentFilters.search || undefined,
    location: currentFilters.location || undefined,
    mode: currentFilters.workMode.length > 0 ? currentFilters.workMode[0] : undefined,
    jobType: currentFilters.jobType.length > 0 ? currentFilters.jobType[0] : undefined,
    minSalary: currentFilters.salaryMin || undefined,
    maxSalary: undefined,
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Main Content with LinkedIn-Style Layout */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar Filters */}
        <aside className="w-full lg:w-80 flex-shrink-0">
          <LinkedInFilters />
        </aside>
        
        {/* Job Results */}
        <main className="flex-1">
          {/* Create Alert Button (shown when filters are active) */}
          {activeFilterCount > 0 && (
            <div className="mb-6">
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
          {/* Results Count */}
          {!loading && !error && (
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm text-gray-500">
                {total > 0 ? (
                  <>
                    Showing {((currentPage - 1) * 50) + 1}-{Math.min(currentPage * 50, total)} of {total.toLocaleString()} job{total !== 1 ? 's' : ''}
                  </>
                ) : (
                  <>Showing {total} jobs</>
                )}
              </p>
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
                {jobs.map((job: Job, index: number) => (
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

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-2">
                  {/* Previous Button */}
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    aria-label="Previous page"
                  >
                    Previous
                  </button>

                  {/* Page Numbers */}
                  <div className="flex items-center gap-1">
                    {/* First Page */}
                    {currentPage > 3 && (
                      <>
                        <button
                          onClick={() => handlePageChange(1)}
                          className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          1
                        </button>
                        {currentPage > 4 && (
                          <span className="px-2 text-gray-500">...</span>
                        )}
                      </>
                    )}

                    {/* Pages around current */}
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(page => {
                        const distance = Math.abs(page - currentPage);
                        return distance <= 2 || page === 1 || page === totalPages;
                      })
                      .filter(page => page !== 1 && page !== totalPages)
                      .map(page => (
                        <button
                          key={page}
                          onClick={() => handlePageChange(page)}
                          className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                            page === currentPage
                              ? 'bg-blue-600 text-white'
                              : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {page}
                        </button>
                      ))}

                    {/* Last Page */}
                    {currentPage < totalPages - 2 && (
                      <>
                        {currentPage < totalPages - 3 && (
                          <span className="px-2 text-gray-500">...</span>
                        )}
                        <button
                          onClick={() => handlePageChange(totalPages)}
                          className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          {totalPages}
                        </button>
                      </>
                    )}
                  </div>

                  {/* Next Button */}
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    aria-label="Next page"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </main>
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
                aria-label="Close create alert modal"
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
