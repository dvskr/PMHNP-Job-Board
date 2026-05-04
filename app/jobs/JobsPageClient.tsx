'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { LayoutGrid, List, SlidersHorizontal, ChevronDown, Briefcase, Search, Sparkles } from 'lucide-react';
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

  // `total` was previously displayed in the "Showing X PMHNP jobs" header
  // (replaced by the AI Search bar). Kept as setter-only so future surfaces
  // (analytics, breadcrumbs, sticky toast) can pick it up without re-wiring fetchJobs.
  const [, setTotal] = useState(initialTotal);
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

  // ── AI / Smart Search (inline; does NOT navigate away) ─────────────
  // Submits to /api/jobs/search/semantic and replaces the rendered job list
  // with the ranked semantic results. The user's filter state stays intact —
  // a "Clear AI matches" link reverts to the normal browse view.
  // (Type AiHit = Job + aiMatchPercent — server returns Job-shaped rows.)
  type AiHit = Job & { aiMatchPercent: number };
  const [aiQuery, setAiQuery] = useState('');
  const [aiResults, setAiResults] = useState<AiHit[] | null>(null);
  const [aiSubmittedQuery, setAiSubmittedQuery] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDegraded, setAiDegraded] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleAiSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const q = aiQuery.trim();
    if (q.length < 2) return;
    setAiLoading(true);
    setAiError(null);
    setAiSubmittedQuery(q);
    try {
      const params = new URLSearchParams({ q, k: '24' });
      const res = await fetch(`/api/jobs/search/semantic?${params.toString()}`);
      if (res.status === 404) {
        // Flag off — degrade gracefully, surface a small inline message.
        setAiError('AI search is not enabled yet.');
        setAiResults(null);
        return;
      }
      if (!res.ok) {
        setAiError(`Search failed (${res.status}). Try again or use filters below.`);
        setAiResults(null);
        return;
      }
      const data = (await res.json()) as { jobs: AiHit[]; degraded: boolean };
      setAiResults(data.jobs);
      setAiDegraded(!!data.degraded);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Search failed');
      setAiResults(null);
    } finally {
      setAiLoading(false);
    }
  }, [aiQuery]);

  const clearAiSearch = useCallback(() => {
    setAiResults(null);
    setAiQuery('');
    setAiSubmittedQuery('');
    setAiError(null);
    setAiDegraded(false);
  }, []);

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

      // Add precise city + state (from metro/city page CTAs)
      if (filters.cityExact) {
        params.set('cityExact', filters.cityExact);
      }
      if (filters.stateCode) {
        params.set('stateCode', filters.stateCode);
      }

      // Add work modes (multi-select)
      filters.workMode.forEach((mode: string) => {
        params.append('workMode', mode);
      });

      // Add job types (multi-select)
      filters.jobType.forEach((type: string) => {
        params.append('jobType', type);
      });

      // Add specialty (multi-select)
      if (filters.specialty) {
        filters.specialty.forEach((spec: string) => {
          params.append('specialty', spec);
        });
      }

      // Add experience level (multi-select)
      if (filters.experienceLevel) {
        filters.experienceLevel.forEach((el: string) => {
          params.append('experienceLevel', el);
        });
      }

      // Add salary
      if (filters.salaryMin) {
        params.set('salaryMin', filters.salaryMin.toString());
      }

      // Add posted within
      if (filters.postedWithin) {
        params.set('postedWithin', filters.postedWithin);
      }

      // Add category (enterprise filter — same as category pages)
      if (filters.category) {
        params.set('category', filters.category);
      }

      const url = `/api/jobs?${params.toString()}`;

      const response = await fetch(url);
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Failed to fetch jobs (${response.status}): ${errorText}`);
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
      console.error('[fetchJobs] Error:', err);
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
    (currentFilters.cityExact ? 1 : 0) +
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
      <div style={{ maxWidth: '1360px', margin: '0 auto', padding: '24px 16px 0' }}>

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
                  padding: '12px 16px', borderRadius: '16px',
                  backgroundColor: '#EDF2EE',
                  border: '1px solid rgba(255,255,255,0.5)',
                  color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.2s',
                  boxShadow: '5px 5px 12px rgba(0,0,0,0.08), -3px -3px 8px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.6), inset -1px -1px 2px rgba(0,0,0,0.03)',
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
                    padding: '10px 20px', borderRadius: '16px',
                    fontSize: '13px', fontWeight: 600,
                    color: '#0F766E',
                    backgroundColor: '#B2F5EA',
                    border: '1px solid rgba(255,255,255,0.5)',
                    cursor: 'pointer', transition: 'all 0.2s',
                    boxShadow: '5px 5px 12px rgba(13,148,136,0.12), -3px -3px 8px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.6), inset -1px -1px 2px rgba(0,0,0,0.03)',
                  }}
                >
                  {/* Bell icon pebble */}
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 26, height: 26, borderRadius: 9,
                    backgroundColor: '#CCFBF1',
                    boxShadow: 'inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.04), 2px 2px 4px rgba(0,0,0,0.06)',
                    border: '1px solid rgba(255,255,255,0.6)',
                  }}>
                    <svg width="13" height="13" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="#0D9488">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                    </svg>
                  </span>
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
                {/*
                  AI Search bar — exact clone of the homepage hero search bar
                  (components/HomepageHero.tsx). Same wrapper class, same
                  borderRadius/shadow/backdrop, same `#0D9488` CTA. Single
                  input variant (no location field) and CTA changed to
                  "AI Search" with a Sparkles icon. Submit routes to
                  /jobs/search?q=... so the existing semantic page handles it.
                */}
                <form
                  onSubmit={handleAiSearch}
                  style={{ flex: 1, minWidth: 0, maxWidth: '640px' }}
                  role="search"
                  aria-label="AI semantic job search"
                >
                  <div
                    className="hero-search-bar"
                    style={{
                      display: 'flex',
                      alignItems: 'stretch',
                      borderRadius: '20px',
                      overflow: 'hidden',
                      background: 'rgba(255,255,255,0.95)',
                      backdropFilter: 'blur(12px)',
                      border: '1px solid rgba(255,255,255,0.6)',
                      boxShadow: '8px 8px 20px rgba(0,0,0,0.08), -4px -4px 12px rgba(255,255,255,0.9), inset 2px 2px 5px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.02)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 18px', flex: 1, minWidth: 0 }}>
                      <Search size={18} style={{ color: '#9ca3af', flexShrink: 0 }} />
                      <input
                        type="text"
                        placeholder='Try "telehealth child psych in CA"'
                        value={aiQuery}
                        onChange={(e) => setAiQuery(e.target.value)}
                        autoComplete="off"
                        aria-label="Describe the role you want"
                        title='Describe a role in your own words — e.g. "telehealth child psychiatry, west coast"'
                        className="hero-search-input"
                        style={{ boxShadow: 'none', outline: 'none', border: 'none', background: 'transparent', width: '100%', fontSize: '0.9rem', color: '#1f2937', textAlign: 'left' }}
                        onFocus={(e) => { e.target.style.boxShadow = 'none'; e.target.style.outline = 'none'; }}
                      />
                    </div>
                    <button
                      type="submit"
                      className="hero-search-btn"
                      disabled={aiQuery.trim().length < 2 || aiLoading}
                      style={{
                        background: '#0D9488',
                        color: 'white',
                        padding: '0 24px',
                        fontSize: '14px',
                        fontWeight: 600,
                        border: 'none',
                        cursor: (aiQuery.trim().length < 2 || aiLoading) ? 'not-allowed' : 'pointer',
                        opacity: (aiQuery.trim().length < 2 || aiLoading) ? 0.55 : 1,
                        flexShrink: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.2s ease',
                        boxShadow: 'inset 2px 2px 4px rgba(255,255,255,0.2), inset -1px -1px 2px rgba(0,0,0,0.08)',
                      }}
                      onMouseEnter={(e) => { if (aiQuery.trim().length >= 2 && !aiLoading) { e.currentTarget.style.background = '#0f766e'; e.currentTarget.style.transform = 'scale(1.02)'; } }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = '#0D9488'; e.currentTarget.style.transform = 'scale(1)'; }}
                    >
                      <Sparkles size={14} aria-hidden="true" />
                      {aiLoading ? 'Searching…' : 'AI Search'}
                    </button>
                  </div>
                </form>

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
                        padding: '8px 32px 8px 14px', borderRadius: '14px',
                        backgroundColor: '#EDF2EE',
                        border: '1px solid rgba(255,255,255,0.5)',
                        color: 'var(--text-primary)', fontSize: '13px', fontWeight: 500,
                        cursor: 'pointer', outline: 'none',
                        transition: 'all 0.2s',
                        boxShadow: '4px 4px 10px rgba(0,0,0,0.06), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)',
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

                  {/* View Mode Toggle — hidden on mobile, grid is default */}
                  <div className="hidden sm:flex" style={{
                    gap: '2px',
                    backgroundColor: '#EDF2EE',
                    borderRadius: '14px', padding: '3px',
                    border: '1px solid rgba(255,255,255,0.5)',
                    boxShadow: '4px 4px 10px rgba(0,0,0,0.06), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)',
                  }}>
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`jp-view-btn ${viewMode === 'grid' ? 'jp-view-active' : ''}`}
                      style={{
                        padding: '6px', borderRadius: '8px',
                        background: viewMode === 'grid' ? '#F7FBF8' : 'transparent',
                        color: viewMode === 'grid' ? '#0D9488' : 'var(--text-tertiary)',
                        border: 'none', cursor: 'pointer', display: 'flex',
                        transition: 'all 0.2s',
                        boxShadow: viewMode === 'grid' ? '2px 2px 4px rgba(0,0,0,0.05), -1px -1px 2px rgba(255,255,255,0.6)' : 'none',
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
                        padding: '6px', borderRadius: '8px',
                        background: viewMode === 'list' ? '#F7FBF8' : 'transparent',
                        color: viewMode === 'list' ? '#0D9488' : 'var(--text-tertiary)',
                        border: 'none', cursor: 'pointer', display: 'flex',
                        transition: 'all 0.2s',
                        boxShadow: viewMode === 'list' ? '2px 2px 4px rgba(0,0,0,0.05), -1px -1px 2px rgba(255,255,255,0.6)' : 'none',
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

            {/* AI Search Banner — clay surface matching the rest of the
                /jobs page (white card, soft outer shadow + inset highlight,
                tinted left edge for status). Error state swaps the accent
                from teal to soft red without breaking the clay aesthetic. */}
            {(aiResults !== null || aiLoading || aiError) && (
              <div style={{
                marginBottom: '16px',
                padding: '14px 18px',
                background: '#FFFFFF',
                borderRadius: '20px',
                border: '1px solid rgba(255,255,255,0.5)',
                borderLeft: `3px solid ${aiError ? '#EF4444' : '#0D9488'}`,
                boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  {/* Clay pebble around the icon — same recipe as the
                      hero/sidebar pebbles elsewhere in the design system. */}
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 28, height: 28, borderRadius: 10,
                    backgroundColor: aiError ? '#FEE2E2' : '#CCFBF1',
                    boxShadow: 'inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.04), 2px 2px 4px rgba(0,0,0,0.06)',
                    border: '1px solid rgba(255,255,255,0.6)',
                    flexShrink: 0,
                  }}>
                    <Sparkles size={14} style={{ color: aiError ? '#EF4444' : '#0D9488' }} />
                  </span>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)' }}>
                    {aiLoading && <>Searching for <strong>&ldquo;{aiSubmittedQuery}&rdquo;</strong>…</>}
                    {!aiLoading && aiError && <span style={{ color: '#B91C1C' }}>{aiError}</span>}
                    {!aiLoading && !aiError && aiResults !== null && (
                      <>
                        Showing <strong>relevant matches</strong> for <strong>&ldquo;{aiSubmittedQuery}&rdquo;</strong>
                        {aiDegraded && <span style={{ color: '#92400e', marginLeft: 6 }}>(degraded — keyword fallback)</span>}
                      </>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={clearAiSearch}
                  className="jp-clay-btn"
                  style={{
                    fontSize: '12px', fontWeight: 600,
                    padding: '8px 14px', borderRadius: '12px',
                    backgroundColor: '#EDF2EE',
                    border: '1px solid rgba(255,255,255,0.5)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer', flexShrink: 0,
                    transition: 'all 0.2s',
                    boxShadow: '4px 4px 10px rgba(0,0,0,0.06), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#E4ECE5'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#EDF2EE'; }}
                >
                  Clear search
                </button>
              </div>
            )}

            {/* Loading State (regular browse fetch — NOT AI) */}
            {loading && !aiResults && <JobsListSkeleton count={9} />}

            {/* Error State (regular browse) */}
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
            {!loading && !error && !aiResults && jobs.length === 0 && (
              <div style={{ textAlign: 'center', padding: '64px 20px' }}>
                <p style={{ fontSize: '18px', color: 'var(--text-secondary)', fontWeight: 600 }}>No jobs found</p>
                {activeFilterCount > 0 && (
                  <p style={{ fontSize: '14px', color: 'var(--text-tertiary)', marginTop: '8px' }}>
                    Try adjusting your filters
                  </p>
                )}
              </div>
            )}

            {/* AI No-Results State */}
            {!aiLoading && !aiError && aiResults !== null && aiResults.length === 0 && (
              <div style={{ textAlign: 'center', padding: '64px 20px' }}>
                <p style={{ fontSize: '18px', color: 'var(--text-secondary)', fontWeight: 600 }}>No semantic matches</p>
                <p style={{ fontSize: '14px', color: 'var(--text-tertiary)', marginTop: '8px' }}>
                  Try a broader query, or clear AI matches to browse normally.
                </p>
              </div>
            )}

            {/* Jobs Grid/List — renders AI results when active, else the normal browse list */}
            {!loading && !error && (aiResults !== null ? aiResults.length > 0 : jobs.length > 0) && (
              <>
                <div style={
                  viewMode === 'grid'
                    ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))', gap: '16px', alignItems: 'start' }
                    : { display: 'flex', flexDirection: 'column' as const, gap: '12px' }
                }>
                  {(aiResults ?? jobs).map((job: Job | AiHit, index: number) => (
                    // Per-card relevance badge intentionally removed — cosine
                    // similarity is too noisy to display as a precise score
                    // and adds visual clutter without informing the click
                    // decision. Ranking order conveys the same signal.
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

                {/* Pagination — hidden in AI mode (semantic returns top-K, not paged) */}
                {totalPages > 1 && aiResults === null && (
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
        @media (max-width: 600px) {
          .jobs-hero-grid { grid-template-columns: 1fr !important; text-align: center; }
          .jobs-hero-grid > div:last-child { display: none; }
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
          backgroundColor: '#F7FBF8',
          borderRadius: '24px',
          border: '1px solid rgba(255,255,255,0.6)',
          boxShadow: '8px 8px 20px rgba(0,0,0,0.08), -4px -4px 12px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.6), inset -1px -1px 2px rgba(0,0,0,0.02)',
          padding: '8px 14px',
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
