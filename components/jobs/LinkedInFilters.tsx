'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { X, ChevronDown, ChevronUp, Search, MapPin } from 'lucide-react';
import { FilterState, FilterCounts, DEFAULT_FILTERS } from '@/types/filters';
import { filtersToParams, parseFiltersFromParams } from '@/lib/filters';

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
        fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '10px',
        backgroundColor: count === 0 ? 'var(--bg-tertiary)' : 'var(--bg-tertiary)',
        color: count === 0 ? 'var(--text-tertiary)' : 'var(--color-primary)',
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

  return (
    <div style={{ borderBottom: '1px solid var(--border-color)', padding: '14px 0' }}>
      <button
        onClick={() => setExpanded(!expanded)}
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
          <ChevronUp style={{ width: '16px', height: '16px', color: 'var(--text-muted, var(--text-tertiary))' }} />
        ) : (
          <ChevronDown style={{ width: '16px', height: '16px', color: 'var(--text-muted, var(--text-tertiary))' }} />
        )}
      </button>
      {expanded && <div style={{ marginTop: '8px' }}>{children}</div>}
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

  // Fetch filter counts
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

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  // Toggle array-based filter (workMode, jobType, specialty)
  const toggleArrayFilter = (key: 'workMode' | 'jobType' | 'specialty', value: string) => {
    const newFilters = { ...filters };
    const arr = [...newFilters[key]];
    const idx = arr.indexOf(value);
    if (idx >= 0) arr.splice(idx, 1);
    else arr.push(value);
    newFilters[key] = arr;
    router.push(`/jobs?${filtersToParams(newFilters).toString()}`, { scroll: false });
  };

  // Set single-value filter
  const setSingleFilter = (key: keyof FilterState, value: string | number | null) => {
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
  };

  // Handle location submit
  const handleLocationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newFilters = { ...filters, location: locationInput || undefined };
    router.push(`/jobs?${filtersToParams(newFilters as FilterState).toString()}`, { scroll: false });
  };

  // Count active filters
  const activeFilterCount =
    filters.workMode.length +
    filters.jobType.length +
    (filters.search ? 1 : 0) +
    (filters.location ? 1 : 0) +
    (filters.salaryMin ? 1 : 0) +
    (filters.postedWithin ? 1 : 0);

  // Get active filter pills
  const getActiveFilters = () => {
    const pills: { key: string; label: string; onRemove: () => void }[] = [];

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
    if (filters.salaryMin) {
      pills.push({
        key: 'salary',
        label: `$${(filters.salaryMin / 1000).toFixed(0)}k+`,
        onRemove: () => setSingleFilter('salaryMin', null),
      });
    }
    if (filters.postedWithin) {
      const labels: Record<string, string> = { '24h': 'Past 24h', '7d': 'Past week', '30d': 'Past month' };
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
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: '16px',
          border: '1px solid var(--border-color)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 20px 14px',
          borderBottom: '1px solid var(--border-color)',
          flexShrink: 0,
          backgroundColor: 'var(--bg-tertiary)',
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
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--color-primary)', fontSize: '11px', fontWeight: 600,
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
          borderBottom: '1px solid var(--border-color)',
          flexShrink: 0,
          backgroundColor: 'var(--bg-secondary)',
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
                <Search style={{
                  position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                  width: '15px', height: '15px', color: 'var(--text-tertiary)',
                }} />
                <input
                  type="text"
                  placeholder="Job title, company..."
                  value={searchInput}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchInput(e.target.value)}
                  className="li-filter-input"
                  style={{
                    width: '100%', paddingLeft: '36px', paddingRight: '14px',
                    paddingTop: '9px', paddingBottom: '9px',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '10px', fontSize: '13px',
                    color: 'var(--text-primary)',
                    outline: 'none', transition: 'border-color 0.2s',
                  }}
                />
              </div>
            </form>

            {/* Location */}
            <form onSubmit={handleLocationSubmit} style={{ marginBottom: '8px' }}>
              <div style={{ position: 'relative' }}>
                <MapPin style={{
                  position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                  width: '15px', height: '15px', color: 'var(--text-tertiary)',
                }} />
                <input
                  type="text"
                  placeholder="City, state, or 'Remote'"
                  value={locationInput}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocationInput(e.target.value)}
                  className="li-filter-input"
                  style={{
                    width: '100%', paddingLeft: '36px', paddingRight: '14px',
                    paddingTop: '9px', paddingBottom: '9px',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '10px', fontSize: '13px',
                    color: 'var(--text-primary)',
                    outline: 'none', transition: 'border-color 0.2s',
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
              <CheckboxFilter
                label="New Grad"
                count={counts?.specialty?.['New Grad'] || 0}
                checked={filters.specialty?.includes('New Grad') || false}
                onChange={() => toggleArrayFilter('specialty', 'New Grad')}
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
