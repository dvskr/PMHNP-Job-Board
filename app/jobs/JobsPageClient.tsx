'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { LayoutGrid, List, SlidersHorizontal, ChevronDown } from 'lucide-react';
import JobCard from '@/components/JobCard';
import LinkedInFilters from '@/components/jobs/LinkedInFilters';
import CreateAlertForm from '@/components/CreateAlertForm';
import JobsListSkeleton from '@/components/JobsListSkeleton';
import AnimatedContainer from '@/components/ui/AnimatedContainer';
import MobileFilterDrawer from '@/components/MobileFilterDrawer';
import { Job } from '@/lib/types';
import { FilterState, DEFAULT_FILTERS } from '@/types/filters';
import { parseFiltersFromParams } from '@/lib/filters';
import { useFilterPersistence } from '@/lib/hooks/useFilterPersistence';
import { useViewMode } from '@/lib/hooks/useViewMode';

interface JobsContentProps {
  initialJobs: Job[];
  initialTotal: number;
  initialPage: number;
  initialTotalPages: number;
}

function JobsContent({ initialJobs, initialTotal, initialPage, initialTotalPages }: JobsContentProps) {
  const searchParams = useSearchParams();

  const [jobs, setJobs] = useState<Job[]>(initialJobs);

  useEffect(() => {
    if (jobs.length > 0) {
      console.log('Client Job 0:', {
        title: jobs[0].title,
        originalPostedAt: jobs[0].originalPostedAt,
        type: typeof jobs[0].originalPostedAt
      });
    }
  }, [jobs]);

  const [total, setTotal] = useState(initialTotal);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [currentFilters, setCurrentFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const { viewMode, setViewMode } = useViewMode('grid');
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  const router = useRouter();

  // Read sort from URL params (persists across navigation)
  const urlSort = searchParams.get('sort') || 'best';
  const [sortOption, setSortOption] = useState(urlSort);

  // Persist filter preferences across sessions
  useFilterPersistence();

  const fetchJobs = useCallback(async (filters: FilterState, page: number = 1, sort: string = 'best') => {
    try {
      setLoading(true);
      setError(null);

      // Build query string from filters
      const params = new URLSearchParams();

      // Add pagination
      params.set('page', page.toString());
      params.set('limit', '50'); // Show 50 jobs per page

      // Add sort
      if (sort && sort !== 'best') {
        params.set('sort', sort);
      }

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

    // Skip fetch on initial load - we already have server-rendered data
    if (isInitialLoad) {
      setIsInitialLoad(false);
      return;
    }

    setCurrentPage(1); // Reset to page 1 when filters change
    fetchJobs(filters, 1, sortOption);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]); // Only depend on searchParams, not fetchJobs

  // Handle sort change - persist in URL
  const handleSortChange = (newSort: string) => {
    setSortOption(newSort);
    // Update URL to persist sort
    const params = new URLSearchParams(searchParams.toString());
    if (newSort === 'best') {
      params.delete('sort');
    } else {
      params.set('sort', newSort);
    }
    params.delete('page'); // Reset to page 1
    router.push(`/jobs?${params.toString()}`, { scroll: false });
  };

  // Handle page change
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      fetchJobs(currentFilters, newPage, sortOption);
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
    <>
      <div style={{ maxWidth: '1360px', margin: '0 auto', padding: '0 16px' }}>
        {/* Main Content with Sidebar Layout */}
        <div style={{ display: 'flex', gap: '28px' }}>
          {/* Sidebar Filters - Hidden on mobile by default, visible on desktop */}
          <StickyFilterSidebar>
            <LinkedInFilters />
          </StickyFilterSidebar>

          {/* Job Results */}
          <main style={{ flex: 1, minWidth: 0 }}>
            {/* Mobile Filter Button */}
            <div className="lg:hidden" style={{ marginBottom: '16px' }}>
              <button
                onClick={() => setIsMobileFilterOpen(true)}
                className="jp-mobile-filter-btn"
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  padding: '12px 16px', borderRadius: '12px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.2s',
                }}
              >
                <SlidersHorizontal style={{ width: '18px', height: '18px' }} />
                Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
              </button>
            </div>

            {/* Mobile Filter Drawer */}
            <MobileFilterDrawer
              isOpen={isMobileFilterOpen}
              onClose={() => setIsMobileFilterOpen(false)}
            />

            {/* Create Alert Button (shown when filters are active) */}
            {activeFilterCount > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <button
                  onClick={() => setIsAlertModalOpen(true)}
                  className="jp-alert-btn"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    padding: '8px 16px', borderRadius: '10px',
                    fontSize: '13px', fontWeight: 600,
                    color: '#2DD4BF',
                    backgroundColor: 'rgba(45,212,191,0.08)',
                    border: '1px solid rgba(45,212,191,0.2)',
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                  </svg>
                  Create Alert for This Search
                </button>
              </div>
            )}

            {/* Results Count, Sort, and View Toggle */}
            {!loading && !error && (
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: '20px', flexWrap: 'wrap', gap: '12px',
              }}>
                {/* Left: results count */}
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, fontWeight: 500 }}>
                  {total > 0 ? (
                    <>
                      Showing{' '}
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                        {total.toLocaleString()}
                      </span>
                      {' '}PMHNP job{total !== 1 ? 's' : ''}
                    </>
                  ) : (
                    <>Showing 0 jobs</>
                  )}
                </p>

                {/* Right: sort + view toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {/* Sort Dropdown */}
                  <div style={{ position: 'relative' }}>
                    <select
                      value={sortOption}
                      onChange={(e) => handleSortChange(e.target.value)}
                      className="jp-sort-select"
                      style={{
                        appearance: 'none', WebkitAppearance: 'none',
                        padding: '7px 32px 7px 12px', borderRadius: '8px',
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)', fontSize: '13px', fontWeight: 500,
                        cursor: 'pointer', outline: 'none',
                        transition: 'border-color 0.2s',
                      }}
                    >
                      <option value="best">Best Match</option>
                      <option value="newest">Newest First</option>
                      <option value="salary">Salary: High → Low</option>
                    </select>
                    <ChevronDown style={{
                      position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                      width: '14px', height: '14px', color: 'var(--text-tertiary)',
                      pointerEvents: 'none',
                    }} />
                  </div>

                  {/* View Mode Toggle */}
                  <div style={{
                    display: 'flex', gap: '2px',
                    backgroundColor: 'var(--bg-tertiary)',
                    borderRadius: '8px', padding: '3px',
                  }}>
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`jp-view-btn ${viewMode === 'grid' ? 'jp-view-active' : ''}`}
                      style={{
                        padding: '6px', borderRadius: '6px',
                        background: viewMode === 'grid' ? 'var(--bg-secondary)' : 'transparent',
                        color: viewMode === 'grid' ? '#2DD4BF' : 'var(--text-tertiary)',
                        border: 'none', cursor: 'pointer', display: 'flex',
                        transition: 'all 0.2s',
                        boxShadow: viewMode === 'grid' ? '0 1px 3px var(--shadow-color, rgba(0,0,0,0.08))' : 'none',
                      }}
                      aria-label="Grid view"
                      title="Grid view"
                    >
                      <LayoutGrid size={16} />
                    </button>
                    <button
                      onClick={() => setViewMode('list')}
                      className={`jp-view-btn ${viewMode === 'list' ? 'jp-view-active' : ''}`}
                      style={{
                        padding: '6px', borderRadius: '6px',
                        background: viewMode === 'list' ? 'var(--bg-secondary)' : 'transparent',
                        color: viewMode === 'list' ? '#2DD4BF' : 'var(--text-tertiary)',
                        border: 'none', cursor: 'pointer', display: 'flex',
                        transition: 'all 0.2s',
                        boxShadow: viewMode === 'list' ? '0 1px 3px var(--shadow-color, rgba(0,0,0,0.08))' : 'none',
                      }}
                      aria-label="List view"
                      title="List view"
                    >
                      <List size={16} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Loading State */}
            {loading && <JobsListSkeleton count={9} />}

            {/* Error State */}
            {error && (
              <div style={{
                backgroundColor: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: '12px', padding: '16px', marginBottom: '20px',
              }}>
                <p style={{ color: '#EF4444', fontSize: '14px', margin: 0 }}>{error}</p>
              </div>
            )}

            {/* No Jobs State */}
            {!loading && !error && jobs.length === 0 && (
              <div style={{ textAlign: 'center', padding: '64px 20px' }}>
                <p style={{ fontSize: '18px', color: 'var(--text-secondary)', fontWeight: 600 }}>No jobs found</p>
                {activeFilterCount > 0 && (
                  <p style={{ fontSize: '14px', color: 'var(--text-tertiary)', marginTop: '8px' }}>
                    Try adjusting your filters
                  </p>
                )}
              </div>
            )}

            {/* Jobs Grid/List */}
            {!loading && !error && jobs.length > 0 && (
              <>
                <div style={
                  viewMode === 'grid'
                    ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))', gap: '16px', alignItems: 'start' }
                    : { display: 'flex', flexDirection: 'column' as const, gap: '12px' }
                }>
                  {jobs.map((job: Job, index: number) => (
                    <div key={job.id} style={viewMode === 'grid' ? { height: '100%' } : {}}>
                      <AnimatedContainer
                        animation="fade-in-up"
                        delay={Math.min(index * 50, 600)}
                      >
                        <JobCard job={job} viewMode={viewMode} />
                      </AnimatedContainer>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div style={{
                    marginTop: '40px', paddingTop: '24px',
                    borderTop: '1px solid var(--border-color)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  }}>
                    {/* Previous Button */}
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="jp-page-btn"
                      style={{
                        padding: '8px 16px', fontSize: '13px', fontWeight: 600,
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)', borderRadius: '8px',
                        color: currentPage === 1 ? 'var(--text-tertiary)' : 'var(--text-primary)',
                        cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                        opacity: currentPage === 1 ? 0.5 : 1,
                        transition: 'all 0.2s',
                      }}
                      aria-label="Previous page"
                    >
                      Previous
                    </button>

                    {/* Page Numbers */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {/* First Page */}
                      {currentPage > 3 && (
                        <>
                          <button
                            onClick={() => handlePageChange(1)}
                            className="jp-page-btn"
                            style={{
                              padding: '8px 12px', fontSize: '13px', fontWeight: 600,
                              backgroundColor: 'var(--bg-secondary)',
                              border: '1px solid var(--border-color)', borderRadius: '8px',
                              color: 'var(--text-primary)', cursor: 'pointer',
                              transition: 'all 0.2s',
                            }}
                          >
                            1
                          </button>
                          {currentPage > 4 && (
                            <span style={{ padding: '0 6px', color: 'var(--text-tertiary)', fontSize: '13px' }}>...</span>
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
                            className="jp-page-btn"
                            style={{
                              padding: '8px 12px', fontSize: '13px', fontWeight: 600,
                              borderRadius: '8px', cursor: 'pointer',
                              transition: 'all 0.2s',
                              ...(page === currentPage
                                ? {
                                  backgroundColor: 'var(--color-primary)', color: '#fff',
                                  border: '1px solid var(--color-primary)',
                                }
                                : {
                                  backgroundColor: 'var(--bg-secondary)',
                                  color: 'var(--text-primary)',
                                  border: '1px solid var(--border-color)',
                                }),
                            }}
                          >
                            {page}
                          </button>
                        ))}

                      {/* Last Page */}
                      {currentPage < totalPages - 2 && (
                        <>
                          {currentPage < totalPages - 3 && (
                            <span style={{ padding: '0 6px', color: 'var(--text-tertiary)', fontSize: '13px' }}>...</span>
                          )}
                          <button
                            onClick={() => handlePageChange(totalPages)}
                            className="jp-page-btn"
                            style={{
                              padding: '8px 12px', fontSize: '13px', fontWeight: 600,
                              backgroundColor: 'var(--bg-secondary)',
                              border: '1px solid var(--border-color)', borderRadius: '8px',
                              color: 'var(--text-primary)', cursor: 'pointer',
                              transition: 'all 0.2s',
                            }}
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
                      className="jp-page-btn"
                      style={{
                        padding: '8px 16px', fontSize: '13px', fontWeight: 600,
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)', borderRadius: '8px',
                        color: currentPage === totalPages ? 'var(--text-tertiary)' : 'var(--text-primary)',
                        cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                        opacity: currentPage === totalPages ? 0.5 : 1,
                        transition: 'all 0.2s',
                      }}
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

        {/* Bottom spacing */}
        <div style={{ height: '48px' }} />
      </div>

      {/* Alert Modal */}
      {isAlertModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          {/* Backdrop */}
          <div
            className="fixed inset-0"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={() => setIsAlertModalOpen(false)}
          />

          {/* Modal */}
          <div className="flex min-h-full items-center justify-center p-4">
            <div style={{
              position: 'relative', width: '100%', maxWidth: '440px',
              borderRadius: '18px', padding: '28px',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}>
              {/* Close Button */}
              <button
                onClick={() => setIsAlertModalOpen(false)}
                style={{
                  position: 'absolute', right: '16px', top: '16px',
                  color: 'var(--text-tertiary)', background: 'none', border: 'none',
                  cursor: 'pointer', padding: '4px', transition: 'color 0.2s',
                }}
                aria-label="Close create alert modal"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Modal Header */}
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '20px' }}>
                Create Job Alert
              </h2>

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
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            borderRadius: '10px', padding: '12px 18px',
            backgroundColor: '#059669', color: '#fff',
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
            fontSize: '14px', fontWeight: 600,
          }}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            Alert created!
          </div>
        </div>
      )}

      <style>{`
        .jp-mobile-filter-btn:hover {
          border-color: rgba(45,212,191,0.4) !important;
          color: #2DD4BF !important;
        }
        .jp-alert-btn:hover {
          background-color: rgba(45,212,191,0.14) !important;
          border-color: rgba(45,212,191,0.3) !important;
        }
        .jp-sort-select {
          color: var(--text-primary) !important;
          background-color: var(--bg-secondary) !important;
        }
        .jp-sort-select:focus {
          border-color: #2DD4BF !important;
        }
        .jp-sort-select option {
          background: var(--bg-secondary);
          color: var(--text-primary);
        }
        .jp-view-btn:hover {
          color: #2DD4BF !important;
        }
        .jp-page-btn:hover:not(:disabled) {
          border-color: rgba(45,212,191,0.4) !important;
        }
      `}</style>
    </>
  );
}

function LoadingFallback() {
  return (
    <div style={{ maxWidth: '1360px', margin: '0 auto', padding: '32px 16px' }}>
      <JobsListSkeleton count={9} />
    </div>
  );
}

/**
 * StickyFilterSidebar — JS-based fixed sidebar that stays pinned while scrolling.
 * Dynamically shrinks when the footer enters the viewport to avoid overlap.
 */
function StickyFilterSidebar({ children }: { children: React.ReactNode }) {
  const placeholderRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [leftPx, setLeftPx] = useState(0);
  const [maxH, setMaxH] = useState('calc(100vh - 120px)');

  const SIDEBAR_TOP = 110; // px from top of viewport
  const FOOTER_GAP = 24;   // px gap between sidebar bottom and footer top

  useEffect(() => {
    const measure = () => {
      if (placeholderRef.current) {
        const rect = placeholderRef.current.getBoundingClientRect();
        setLeftPx(rect.left + window.scrollX);
        setReady(true);
      }
    };

    const adjustForFooter = () => {
      const footer = document.querySelector('footer');
      if (!footer) {
        setMaxH('calc(100vh - 120px)');
        return;
      }
      const footerTop = footer.getBoundingClientRect().top;
      const viewportH = window.innerHeight;

      if (footerTop < viewportH) {
        // Footer is visible — shrink sidebar to stop above it
        const available = footerTop - SIDEBAR_TOP - FOOTER_GAP;
        setMaxH(`${Math.max(available, 200)}px`);
      } else {
        setMaxH('calc(100vh - 120px)');
      }
    };

    const onScrollOrResize = () => {
      measure();
      adjustForFooter();
    };

    // Wait for layout to fully settle after hydration
    requestAnimationFrame(() => {
      requestAnimationFrame(onScrollOrResize);
    });

    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, []);

  return (
    <>
      {/* Placeholder that reserves space in the flex layout */}
      <div
        ref={placeholderRef}
        className="hidden lg:block"
        style={{ width: '300px', flexShrink: 0 }}
      />
      {/* Fixed panel that stays pinned — always rendered, hidden until measured */}
      <div
        ref={sidebarRef}
        className="hidden lg:block"
        style={{
          position: 'fixed',
          top: '110px',
          left: `${leftPx}px`,
          width: '300px',
          maxHeight: maxH,
          overflowY: 'auto',
          zIndex: 10,
          scrollbarWidth: 'none',
          visibility: ready ? 'visible' : 'hidden',
          transition: 'max-height 0.15s ease-out',
        }}
      >
        {children}
      </div>
    </>
  );
}

export default function JobsPageClient({ initialJobs, initialTotal, initialPage, initialTotalPages }: JobsContentProps) {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <JobsContent
        initialJobs={initialJobs}
        initialTotal={initialTotal}
        initialPage={initialPage}
        initialTotalPages={initialTotalPages}
      />
    </Suspense>
  );
}
