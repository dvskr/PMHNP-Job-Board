'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { X, ChevronDown, ChevronUp, Search, MapPin } from 'lucide-react';
import { FilterState, FilterCounts, DEFAULT_FILTERS } from '@/types/filters';
import { filtersToParams, parseFiltersFromParams } from '@/lib/filters';
import { trackSearch, trackFilterChange } from '@/lib/analytics';

interface CheckboxFilterProps {
  label: string;
  count: number;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}

function CheckboxFilter({ label, count, checked, onChange, disabled }: CheckboxFilterProps) {
  return (
    <label
      className={`li-filter-row ${disabled ? 'li-filter-disabled' : ''}`}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 6px', borderRadius: '8px', cursor: 'pointer',
        transition: 'background 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="li-checkbox"
          style={{
            width: '16px', height: '16px', borderRadius: '4px',
            accentColor: 'var(--color-primary)',
          }}
        />
        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{label}</span>
      </div>
      <span style={{
        fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '12px',
        backgroundColor: count === 0 ? '#F3F4F6' : '#CCFBF1',
        color: count === 0 ? '#9CA3AF' : '#0F766E',
        boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.7), 1px 1px 2px rgba(0,0,0,0.03)',
      }}>
        {(count || 0).toLocaleString()}
      </span>
    </label>
  );
}

interface FilterSectionProps {
  title: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

function FilterSection({ title, defaultExpanded = true, children }: FilterSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  // SEO Fix H7: stable id ties button (aria-controls) to the panel and lets
  // assistive tech announce the disclosure relationship (WCAG 4.1.2).
  const panelId = `filter-section-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  return (
    <div style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', padding: '14px 0' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-controls={panelId}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', textAlign: 'left', background: 'none', border: 'none',
          cursor: 'pointer', padding: 0,
        }}
      >
        <h3 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
          {title}
        </h3>
        {expanded ? (
          <ChevronUp aria-hidden="true" style={{ width: '16px', height: '16px', color: 'var(--text-muted, var(--text-tertiary))' }} />
        ) : (
          <ChevronDown aria-hidden="true" style={{ width: '16px', height: '16px', color: 'var(--text-muted, var(--text-tertiary))' }} />
        )}
      </button>
      <div id={panelId} role="region" aria-label={title} hidden={!expanded} style={{ marginTop: expanded ? '8px' : 0 }}>
        {children}
      </div>
    </div>
  );
}

// Empty interface removed - not needed

export default function LinkedInFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [counts, setCounts] = useState<FilterCounts | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [locationInput, setLocationInput] = useState('');

  // Sync filters from URL params
  useEffect(() => {
    const parsed = parseFiltersFromParams(new URLSearchParams(searchParams.toString()));
    setFilters(parsed);
    setSearchInput(parsed.search || '');
    setLocationInput(parsed.location || '');
  }, [searchParams]);

  // Fetch filter counts (includes category param for accurate counts)
  const fetchCounts = useCallback(async () => {
    try {
      setIsLoading(true);
      const parsed = parseFiltersFromParams(new URLSearchParams(searchParams.toString()));
      const response = await fetch('/api/jobs/filter-counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      if (response.ok) {
        const data = await response.json();
        setCounts(data);
      }
    } catch (error) {
      console.error('Failed to fetch filter counts:', error);
    } finally {
      setIsLoading(false);
    }
  }, [searchParams]);

  // Defer the filter-count POST off the critical render path. Audit 07
  // M-3: this fired on every page load before any user interaction,
  // racing with hydration on the highest-traffic surface. requestIdleCallback
  // (with setTimeout fallback) lets the initial render finish first;
  // the count badges fill in shortly after with no user-visible delay.
  useEffect(() => {
    type IdleHandle = number;
    const idleApi = (typeof window !== 'undefined' && 'requestIdleCallback' in window)
      ? (window as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => IdleHandle; cancelIdleCallback: (h: IdleHandle) => void })
      : null;
    let handle: number | null = null;
    if (idleApi) {
      handle = idleApi.requestIdleCallback(() => fetchCounts(), { timeout: 2000 });
    } else {
      handle = window.setTimeout(() => fetchCounts(), 250) as unknown as number;
    }
    return () => {
      if (handle == null) return;
      if (idleApi) idleApi.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, [fetchCounts]);

  // Toggle array-based filter (workMode, jobType, specialty)
  const toggleArrayFilter = (key: 'workMode' | 'jobType' | 'specialty' | 'experienceLevel', value: string) => {
    const newFilters = { ...filters };
    const arr = [...newFilters[key]];
    const idx = arr.indexOf(value);
    if (idx >= 0) arr.splice(idx, 1);
    else arr.push(value);
    newFilters[key] = arr;
    router.push(`/jobs?${filtersToParams(newFilters).toString()}`, { scroll: false });
    trackFilterChange(key, arr.join(','));
  };

  // Set single-value filter. Accepts boolean for the newGradFriendly toggle
  // and string/number for everything else.
  const setSingleFilter = (key: keyof FilterState, value: string | number | boolean | null) => {
    const newFilters = { ...filters, [key]: value };
    router.push(`/jobs?${filtersToParams(newFilters).toString()}`, { scroll: false });
  };

  // Clear all filters
  const clearAllFilters = () => {
    setSearchInput('');
    setLocationInput('');
    router.push('/jobs', { scroll: false });
  };

  // Handle search submit
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newFilters = { ...filters, search: searchInput || undefined };
    router.push(`/jobs?${filtersToParams(newFilters as FilterState).toString()}`, { scroll: false });
    if (searchInput) trackSearch(searchInput);
  };

  // Handle location submit
  const handleLocationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newFilters = { ...filters, location: locationInput || undefined };
    router.push(`/jobs?${filtersToParams(newFilters as FilterState).toString()}`, { scroll: false });
  };

  // Count active filters (including category)
  const activeFilterCount =
    filters.workMode.length +
    filters.jobType.length +
    (filters.specialty?.length || 0) +
    (filters.experienceLevel?.length || 0) +
    (filters.newGradFriendly === true ? 1 : 0) +
    (typeof filters.minYearsExperience === 'number' ? 1 : 0) +
    (filters.search ? 1 : 0) +
    (filters.location ? 1 : 0) +
    (filters.salaryMin ? 1 : 0) +
    (filters.postedWithin ? 1 : 0) +
    (filters.category ? 1 : 0);

  // Human-readable category names
  const CATEGORY_LABELS: Record<string, string> = {
    'child-adolescent': 'Child & Adolescent',
    'community-health': 'Community Health',
    'correctional': 'Correctional',
    'new-grad': 'New Grad',
    'outpatient': 'Outpatient',
    'substance-abuse': 'Substance Abuse',
    'travel': 'Travel',
    'senior': 'Senior',
    'telehealth': 'Telehealth',
    'contract': 'Contract',
    'crisis': 'Crisis',
    'entry-level': 'Entry Level',
    'full-time': 'Full-Time',
    'geriatric': 'Geriatric',
    'hospital': 'Hospital',
    'lgbtq': 'LGBTQ+',
    'locum-tenens': 'Locum Tenens',
    'mid-career': 'Mid-Career',
    'part-time': 'Part-Time',
    'per-diem': 'Per Diem',
    'private-practice': 'Private Practice',
  };

  // Get active filter pills
  const getActiveFilters = () => {
    const pills: { key: string; label: string; onRemove: () => void }[] = [];

    // Category pill (shown first, with distinct styling)
    if (filters.category) {
      pills.push({
        key: 'category',
        label: CATEGORY_LABELS[filters.category] || filters.category.replace(/-/g, ' '),
        onRemove: () => setSingleFilter('category', null),
      });
    }
    if (filters.search) {
      pills.push({
        key: 'search',
        label: `"${filters.search}"`,
        onRemove: () => setSingleFilter('search', null),
      });
    }
    if (filters.location) {
      pills.push({
        key: 'location',
        label: filters.location,
        onRemove: () => setSingleFilter('location', null),
      });
    }
    filters.workMode.forEach(mode => {
      pills.push({
        key: `workMode-${mode}`,
        label: mode.charAt(0).toUpperCase() + mode.slice(1),
        onRemove: () => toggleArrayFilter('workMode', mode),
      });
    });
    filters.jobType.forEach(type => {
      pills.push({
        key: `jobType-${type}`,
        label: type,
        onRemove: () => toggleArrayFilter('jobType', type),
      });
    });
    if (filters.specialty) {
      filters.specialty.forEach(spec => {
        pills.push({
          key: `specialty-${spec}`,
          label: spec,
          onRemove: () => toggleArrayFilter('specialty', spec),
        });
      });
    }
    if (filters.experienceLevel) {
      filters.experienceLevel.forEach(el => {
        pills.push({
          key: `experienceLevel-${el}`,
          label: el,
          onRemove: () => toggleArrayFilter('experienceLevel', el),
        });
      });
    }
    if (filters.newGradFriendly === true) {
      pills.push({
        key: 'newGradFriendly',
        label: 'Open to new grads',
        onRemove: () => setSingleFilter('newGradFriendly', null),
      });
    }
    if (typeof filters.minYearsExperience === 'number') {
      pills.push({
        key: 'minYearsExperience',
        label: `${filters.minYearsExperience}+ yrs exp`,
        onRemove: () => setSingleFilter('minYearsExperience', null),
      });
    }
    if (filters.salaryMin) {
      pills.push({
        key: 'salary',
        label: `$${(filters.salaryMin / 1000).toFixed(0)}k+`,
        onRemove: () => setSingleFilter('salaryMin', null),
      });
    }
    if (filters.postedWithin) {
      const labels: Record<string, string> = { '24h': 'Past 24h', '3d': 'Past 3 days', '7d': 'Past week', '30d': 'Past month' };
      pills.push({
        key: 'postedWithin',
        label: labels[filters.postedWithin] || filters.postedWithin,
        onRemove: () => setSingleFilter('postedWithin', null),
      });
    }
    return pills;
  };

  return (
    <>
      <div
        style={{
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 20px 14px',
          borderBottom: '1px solid rgba(0,0,0,0.05)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: activeFilterCount > 0 ? '12px' : '0' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
              Filters
            </h2>
            {activeFilterCount > 0 && (
              <button
                onClick={clearAllFilters}
                style={{
                  fontSize: '12px', color: 'var(--color-primary)', fontWeight: 600,
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: 0,
                }}
              >
                Clear all ({activeFilterCount})
              </button>
            )}
          </div>

          {/* Active Filter Pills */}
          {activeFilterCount > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {getActiveFilters().map((pill) => (
                <span
                  key={pill.key}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    padding: '3px 10px', borderRadius: '20px',
                    backgroundColor: '#CCFBF1',
                    color: '#0F766E', fontSize: '11px', fontWeight: 600,
                    boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.6), 1px 1px 3px rgba(0,0,0,0.04)',
                  }}
                >
                  {pill.label}
                  <button
                    onClick={pill.onRemove}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: '2px', borderRadius: '50%', display: 'flex',
                      color: 'inherit',
                    }}
                    aria-label={`Remove ${pill.label} filter`}
                  >
                    <X style={{ width: '12px', height: '12px' }} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Results Count */}
        <div style={{
          padding: '10px 20px',
          borderBottom: '1px solid rgba(0,0,0,0.05)',
          flexShrink: 0,
        }}>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500, margin: 0 }}>
            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
              {isLoading || !counts ? '...' : counts.total.toLocaleString()}
            </span>
            {' '}jobs found
          </p>
        </div>

        {/* Scrollable Filter Content */}
        <div>
          <div style={{ padding: '12px 20px' }}>
            {/* Search */}
            <form onSubmit={handleSearchSubmit} style={{ marginBottom: '12px' }}>
              <div style={{ position: 'relative' }}>
                <Search aria-hidden="true" style={{
                  position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                  width: '15px', height: '15px', color: 'var(--text-tertiary)',
                }} />
                {/* SEO Fix C4: aria-label gives screen readers a name (WCAG 4.1.2). */}
                <input
                  aria-label="Search by job title or company"
                  type="search"
                  placeholder="Job title, company..."
                  value={searchInput}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchInput(e.target.value)}
                  className="li-filter-input"
                  style={{
                    width: '100%', paddingLeft: '36px', paddingRight: '14px',
                    paddingTop: '9px', paddingBottom: '9px',
                    backgroundColor: '#F1F5F2',
                    border: '1px solid rgba(0,0,0,0.06)',
                    borderRadius: '14px', fontSize: '13px',
                    color: 'var(--text-primary)',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.04), 1px 1px 2px rgba(255,255,255,0.5)',
                  }}
                />
              </div>
            </form>

            {/* Location */}
            <form onSubmit={handleLocationSubmit} style={{ marginBottom: '8px' }}>
              <div style={{ position: 'relative' }}>
                <MapPin aria-hidden="true" style={{
                  position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                  width: '15px', height: '15px', color: 'var(--text-tertiary)',
                }} />
                <input
                  aria-label="Filter by city, state, or remote"
                  type="text"
                  placeholder="City, state, or 'Remote'"
                  value={locationInput}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocationInput(e.target.value)}
                  className="li-filter-input"
                  style={{
                    width: '100%', paddingLeft: '36px', paddingRight: '14px',
                    paddingTop: '9px', paddingBottom: '9px',
                    backgroundColor: '#F1F5F2',
                    border: '1px solid rgba(0,0,0,0.06)',
                    borderRadius: '14px', fontSize: '13px',
                    color: 'var(--text-primary)',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.04), 1px 1px 2px rgba(255,255,255,0.5)',
                  }}
                />
              </div>
            </form>

            {/* Date Posted */}
            <FilterSection title="Date Posted">
              <CheckboxFilter
                label="Past 24 hours"
                count={counts?.postedWithin['24h'] || 0}
                checked={filters.postedWithin === '24h'}
                onChange={() => setSingleFilter('postedWithin', filters.postedWithin === '24h' ? null : '24h')}
              />
              <CheckboxFilter
                label="Past 3 days"
                count={counts?.postedWithin['3d'] || 0}
                checked={filters.postedWithin === '3d'}
                onChange={() => setSingleFilter('postedWithin', filters.postedWithin === '3d' ? null : '3d')}
              />
              <CheckboxFilter
                label="Past week"
                count={counts?.postedWithin['7d'] || 0}
                checked={filters.postedWithin === '7d'}
                onChange={() => setSingleFilter('postedWithin', filters.postedWithin === '7d' ? null : '7d')}
              />
              <CheckboxFilter
                label="Past month"
                count={counts?.postedWithin['30d'] || 0}
                checked={filters.postedWithin === '30d'}
                onChange={() => setSingleFilter('postedWithin', filters.postedWithin === '30d' ? null : '30d')}
              />
            </FilterSection>

            {/* Job Type */}
            <FilterSection title="Job Type">
              <CheckboxFilter
                label="Full-Time"
                count={counts?.jobType['Full-Time'] || 0}
                checked={filters.jobType.includes('Full-Time')}
                onChange={() => toggleArrayFilter('jobType', 'Full-Time')}
              />
              <CheckboxFilter
                label="Part-Time"
                count={counts?.jobType['Part-Time'] || 0}
                checked={filters.jobType.includes('Part-Time')}
                onChange={() => toggleArrayFilter('jobType', 'Part-Time')}
              />
              <CheckboxFilter
                label="Contract"
                count={counts?.jobType['Contract'] || 0}
                checked={filters.jobType.includes('Contract')}
                onChange={() => toggleArrayFilter('jobType', 'Contract')}
              />
              <CheckboxFilter
                label="Per Diem"
                count={counts?.jobType['Per Diem'] || 0}
                checked={filters.jobType.includes('Per Diem')}
                onChange={() => toggleArrayFilter('jobType', 'Per Diem')}
              />
              <CheckboxFilter
                label="Other"
                count={counts?.jobType['Other'] || 0}
                checked={filters.jobType.includes('Other')}
                onChange={() => toggleArrayFilter('jobType', 'Other')}
              />
            </FilterSection>

            {/* Work Mode */}
            <FilterSection title="Work Mode">
              <CheckboxFilter
                label="Remote"
                count={counts?.workMode.remote || 0}
                checked={filters.workMode.includes('remote')}
                onChange={() => toggleArrayFilter('workMode', 'remote')}
              />
              <CheckboxFilter
                label="Hybrid"
                count={counts?.workMode.hybrid || 0}
                checked={filters.workMode.includes('hybrid')}
                onChange={() => toggleArrayFilter('workMode', 'hybrid')}
              />
              <CheckboxFilter
                label="On-site"
                count={counts?.workMode.onsite || 0}
                checked={filters.workMode.includes('onsite')}
                onChange={() => toggleArrayFilter('workMode', 'onsite')}
              />
            </FilterSection>

            {/* Specialty */}
            <FilterSection title="Specialty">
              <CheckboxFilter
                label="Telehealth"
                count={counts?.specialty?.Telehealth || 0}
                checked={filters.specialty?.includes('Telehealth') || false}
                onChange={() => toggleArrayFilter('specialty', 'Telehealth')}
              />
              <CheckboxFilter
                label="Travel / Locum"
                count={counts?.specialty?.Travel || 0}
                checked={filters.specialty?.includes('Travel') || false}
                onChange={() => toggleArrayFilter('specialty', 'Travel')}
              />
            </FilterSection>

            {/* Experience — two DISTINCT questions, kept visually separate so
                their counts don't read as contradictory:
                  • "Open to new grads" is an EMPLOYER signal (does this employer
                    welcome new grads?) — deliberately a small, specific set.
                  • "Your experience" is CANDIDATE-side: pick your years and we
                    show the roles you qualify for, so counts legitimately GROW
                    with experience.
                The old flat list made the 12 → 1,369 jump look broken. The dead
                7+/10+ buckets (identical to 5+; no job requires >5 yrs) are
                removed — see EXPERIENCE_FILTER_BUCKETS in lib/filters.ts. */}
            <FilterSection title="Experience">
              <CheckboxFilter
                label="Open to new grads"
                count={counts?.newGradFriendly || 0}
                checked={filters.newGradFriendly === true}
                onChange={() =>
                  setSingleFilter('newGradFriendly', filters.newGradFriendly === true ? null : true)
                }
              />
              <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', margin: '2px 6px 0', lineHeight: 1.4 }}>
                Employers open to candidates with little or no experience.
              </p>

              <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', margin: '12px 0 8px' }} />

              <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', margin: '0 6px 2px', letterSpacing: '0.01em' }}>
                Your experience
              </p>
              <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', margin: '0 6px 8px', lineHeight: 1.4 }}>
                Pick your years — we&rsquo;ll show the roles you qualify for.
              </p>
              <CheckboxFilter
                label="I have 1+ years"
                count={counts?.minYears?.[1] || 0}
                checked={filters.minYearsExperience === 1}
                onChange={() =>
                  setSingleFilter('minYearsExperience', filters.minYearsExperience === 1 ? null : 1)
                }
              />
              <CheckboxFilter
                label="I have 2+ years"
                count={counts?.minYears?.[2] || 0}
                checked={filters.minYearsExperience === 2}
                onChange={() =>
                  setSingleFilter('minYearsExperience', filters.minYearsExperience === 2 ? null : 2)
                }
              />
              <CheckboxFilter
                label="I have 5+ years"
                count={counts?.minYears?.[5] || 0}
                checked={filters.minYearsExperience === 5}
                onChange={() =>
                  setSingleFilter('minYearsExperience', filters.minYearsExperience === 5 ? null : 5)
                }
              />
            </FilterSection>

            {/* Salary */}
            <FilterSection title="Salary">
              <CheckboxFilter
                label="$100,000+"
                count={counts?.salary.over100k || 0}
                checked={filters.salaryMin === 100000}
                onChange={() => setSingleFilter('salaryMin', filters.salaryMin === 100000 ? null : 100000)}
              />
              <CheckboxFilter
                label="$150,000+"
                count={counts?.salary.over150k || 0}
                checked={filters.salaryMin === 150000}
                onChange={() => setSingleFilter('salaryMin', filters.salaryMin === 150000 ? null : 150000)}
              />
              <CheckboxFilter
                label="$200,000+"
                count={counts?.salary.over200k || 0}
                checked={filters.salaryMin === 200000}
                onChange={() => setSingleFilter('salaryMin', filters.salaryMin === 200000 ? null : 200000)}
              />
            </FilterSection>
          </div>
        </div>
      </div>

      <style>{`
        .li-filter-row:hover {
          background: var(--bg-tertiary) !important;
        }
        .li-filter-disabled {
          opacity: 0.5;
        }
        .li-filter-input::placeholder {
          color: var(--text-tertiary) !important;
        }
        .li-filter-input:focus {
          border-color: var(--color-primary) !important;
          box-shadow: 0 0 0 2px rgba(45,212,191,0.15);
        }
        .li-checkbox:checked {
          accent-color: var(--color-primary);
        }
      `}</style>
    </>
  );
}
