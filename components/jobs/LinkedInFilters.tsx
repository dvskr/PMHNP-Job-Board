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
    <label className={`flex items-center justify-between py-2 px-1 rounded cursor-pointer hover:bg-gray-50 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm text-gray-700">{label}</span>
      </div>
      <span className={`text-xs px-2 py-0.5 rounded-full ${
        count === 0 ? 'bg-gray-100 text-gray-400' : 'bg-gray-100 text-gray-600'
      }`}>
        {count.toLocaleString()}
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
    <div className="border-b border-gray-200 py-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        )}
      </button>
      {expanded && <div className="mt-3">{children}</div>}
    </div>
  );
}

interface LinkedInFiltersProps {
  onFilterChange?: (filters: FilterState) => void;
}

export default function LinkedInFilters({ onFilterChange }: LinkedInFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [filters, setFilters] = useState<FilterState>(() => 
    parseFiltersFromParams(new URLSearchParams(searchParams.toString()))
  );
  const [counts, setCounts] = useState<FilterCounts | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(filters.search);
  const [locationInput, setLocationInput] = useState(filters.location || '');

  // Fetch filter counts
  const fetchCounts = useCallback(async (currentFilters: FilterState) => {
    try {
      const response = await fetch('/api/jobs/filter-counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentFilters),
      });
      const data: FilterCounts = await response.json();
      setCounts(data);
    } catch (error) {
      console.error('Failed to fetch filter counts:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Update URL and fetch counts when filters change
  useEffect(() => {
    const params = filtersToParams(filters);
    const newUrl = params.toString() ? `/jobs?${params.toString()}` : '/jobs';
    router.push(newUrl, { scroll: false });
    fetchCounts(filters);
    onFilterChange?.(filters);
  }, [filters, router, fetchCounts, onFilterChange]);

  // Toggle array-based filter (workMode, jobType)
  const toggleArrayFilter = (key: 'workMode' | 'jobType', value: string) => {
    setFilters((prev: FilterState) => ({
      ...prev,
      [key]: prev[key].includes(value)
        ? prev[key].filter((v: string) => v !== value)
        : [...prev[key], value],
    }));
  };

  // Set single-value filter
  const setSingleFilter = (key: keyof FilterState, value: string | number | null) => {
    setFilters((prev: FilterState) => ({ ...prev, [key]: value }));
  };

  // Clear all filters
  const clearAllFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setSearchInput('');
    setLocationInput('');
  };

  // Handle search submit
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSingleFilter('search', searchInput);
  };

  // Handle location submit
  const handleLocationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSingleFilter('location', locationInput || null);
  };

  // Count active filters
  const activeFilterCount = 
    filters.workMode.length +
    filters.jobType.length +
    (filters.salaryMin ? 1 : 0) +
    (filters.postedWithin ? 1 : 0) +
    (filters.location ? 1 : 0);

  // Get active filter pills
  const getActiveFilters = () => {
    const pills: Array<{ key: string; label: string; onRemove: () => void }> = [];
    
    filters.workMode.forEach((wm: string) => {
      pills.push({
        key: `workMode-${wm}`,
        label: wm === 'onsite' ? 'On-site' : wm.charAt(0).toUpperCase() + wm.slice(1),
        onRemove: () => toggleArrayFilter('workMode', wm),
      });
    });
    
    filters.jobType.forEach((jt: string) => {
      pills.push({
        key: `jobType-${jt}`,
        label: jt,
        onRemove: () => toggleArrayFilter('jobType', jt),
      });
    });
    
    if (filters.salaryMin) {
      pills.push({
        key: 'salary',
        label: `$${(filters.salaryMin / 1000).toFixed(0)}k+`,
        onRemove: () => setSingleFilter('salaryMin', null),
      });
    }
    
    if (filters.postedWithin) {
      const labels: Record<string, string> = {
        '24h': 'Past 24 hours',
        '7d': 'Past week',
        '30d': 'Past month',
      };
      pills.push({
        key: 'postedWithin',
        label: labels[filters.postedWithin] || filters.postedWithin,
        onRemove: () => setSingleFilter('postedWithin', null),
      });
    }
    
    if (filters.location) {
      pills.push({
        key: 'location',
        label: filters.location,
        onRemove: () => {
          setSingleFilter('location', null);
          setLocationInput('');
        },
      });
    }
    
    return pills;
  };

  return (
    <div className="bg-white rounded-lg border-2 border-blue-500 shadow-lg lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden">
      {/* Header - Fixed at top */}
      <div className="p-4 border-b border-gray-200 flex-shrink-0 bg-gradient-to-r from-blue-50 to-purple-50">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900">Filters</h2>
          {activeFilterCount > 0 && (
            <button
              onClick={clearAllFilters}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              Clear all ({activeFilterCount})
            </button>
          )}
        </div>

        {/* Active Filter Pills */}
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap gap-2">
            {getActiveFilters().map((pill: { key: string; label: string; onRemove: () => void }) => (
              <span
                key={pill.key}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full"
              >
                {pill.label}
                <button
                  onClick={pill.onRemove}
                  className="hover:bg-blue-100 rounded-full p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Results Count - Fixed */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex-shrink-0">
        <p className="text-sm text-gray-600">
          <span className="font-semibold text-gray-900">
            {isLoading ? '...' : counts?.total.toLocaleString()}
          </span>
          {' '}jobs found
        </p>
      </div>

      {/* Scrollable Filter Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Job title, company..."
              value={searchInput}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </form>

        {/* Location */}
        <form onSubmit={handleLocationSubmit} className="mb-4">
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="City, state, or 'Remote'"
              value={locationInput}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocationInput(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </form>

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
        </FilterSection>

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

        {/* Salary */}
        <FilterSection title="Salary" defaultExpanded={false}>
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
  );
}

