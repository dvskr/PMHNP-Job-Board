'use client';

import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { Search, X, SlidersHorizontal, MapPin, ChevronDown, ChevronUp } from 'lucide-react';
import Button from '@/components/ui/Button';

interface FilterState {
  search?: string;
  location?: string;
  jobType?: string;
  mode?: string;
  minSalary?: number;
  maxSalary?: number;
}

interface JobFiltersProps {
  currentFilters: FilterState;
  onFilterChange: (filters: FilterState) => void;
}

const workModes = ['Remote', 'Hybrid', 'In-Person'];
const jobTypes = ['Full-Time', 'Part-Time', 'Contract', 'Per Diem'];

/* ── shared styles (CSS-var-based for dark mode) ── */
const sectionLabel: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)',
  cursor: 'pointer', padding: '4px 0', userSelect: 'none',
};
const inputBox: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: '10px',
  border: '1.5px solid var(--border-color)', background: 'var(--bg-primary)',
  color: 'var(--text-primary)', fontSize: '14px', outline: 'none',
  transition: 'border-color 0.2s',
};
const radioLabel: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '10px',
  cursor: 'pointer', padding: '4px 0', fontSize: '14px',
  color: 'var(--text-primary)', fontWeight: 500,
};

function JobFiltersComponent({ currentFilters, onFilterChange }: JobFiltersProps) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [tempFilters, setTempFilters] = useState<FilterState>(currentFilters);
  const [searchInput, setSearchInput] = useState(currentFilters.search || '');
  const [locationInput, setLocationInput] = useState(currentFilters.location || '');
  const debounceTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const isInitialMount = useRef(true);

  // Collapsible sections
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    search: true, location: true, datePosted: true, jobType: true, mode: true, salary: false,
  });
  const toggleSection = (key: string) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  useEffect(() => {
    if (isInitialMount.current) { isInitialMount.current = false; return; }
    const timer = setTimeout(() => {
      if (currentFilters.search !== searchInput) setSearchInput(currentFilters.search || '');
      if (currentFilters.location !== locationInput) setLocationInput(currentFilters.location || '');
    }, 0);
    return () => clearTimeout(timer);
  }, [currentFilters.search, currentFilters.location, searchInput, locationInput]);

  useEffect(() => {
    if (isMobileOpen) {
      const timer = setTimeout(() => setTempFilters(currentFilters), 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isMobileOpen, currentFilters]);

  useEffect(() => {
    document.body.style.overflow = isMobileOpen ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isMobileOpen]);

  const activeFilterCount = Object.keys(currentFilters).filter(
    (key) => currentFilters[key as keyof FilterState] !== undefined && currentFilters[key as keyof FilterState] !== ''
  ).length;

  const handleDebouncedInputChange = useCallback((key: keyof FilterState, value: string) => {
    if (key === 'search') setSearchInput(value);
    else if (key === 'location') setLocationInput(value);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      const newFilters = { ...currentFilters };
      if (value === '') delete (newFilters as Record<string, unknown>)[key];
      else (newFilters as Record<string, unknown>)[key] = value;
      onFilterChange(newFilters);
    }, 500);
  }, [currentFilters, onFilterChange]);

  const handleInputChange = useCallback((key: keyof FilterState, value: string | number | undefined) => {
    const newFilters = { ...currentFilters };
    if (value === '' || value === undefined) delete (newFilters as Record<string, unknown>)[key];
    else (newFilters as Record<string, unknown>)[key] = value;
    onFilterChange(newFilters);
  }, [currentFilters, onFilterChange]);

  const handleTempInputChange = useCallback((key: keyof FilterState, value: string | number | undefined) => {
    const newFilters = { ...tempFilters };
    if (value === '' || value === undefined) delete (newFilters as Record<string, unknown>)[key];
    else (newFilters as Record<string, unknown>)[key] = value;
    setTempFilters(newFilters);
  }, [tempFilters]);

  const handleApplyFilters = () => { onFilterChange(tempFilters); setIsMobileOpen(false); };
  const handleClearAll = useCallback(() => { onFilterChange({}); }, [onFilterChange]);
  const handleClearAllMobile = () => { setTempFilters({}); };

  const renderFilterContent = useCallback((isMobile: boolean) => {
    const filters = isMobile ? tempFilters : currentFilters;
    const handleTextChange = isMobile ? handleTempInputChange : handleDebouncedInputChange;
    const handleChange = isMobile ? handleTempInputChange : handleInputChange;
    const searchValue = isMobile ? (filters.search || '') : searchInput;
    const locationValue = isMobile ? (filters.location || '') : locationInput;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* ── Search ── */}
        <div>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input
              type="text"
              placeholder="Job title, company..."
              value={searchValue}
              onChange={(e) => handleTextChange('search', e.target.value)}
              style={{ ...inputBox, paddingLeft: '36px' }}
            />
          </div>
        </div>

        {/* ── Location ── */}
        <div>
          <div style={{ position: 'relative' }}>
            <MapPin size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input
              type="text"
              placeholder="City, state, or 'Remote'"
              value={locationValue}
              onChange={(e) => handleTextChange('location', e.target.value)}
              style={{ ...inputBox, paddingLeft: '36px' }}
            />
          </div>
        </div>

        {/* ── Job Type ── */}
        <div>
          <div style={sectionLabel} onClick={() => toggleSection('jobType')}>
            <span>Job Type</span>
            {openSections.jobType ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
          {openSections.jobType && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
              {jobTypes.map((type) => (
                <label key={type} style={radioLabel}>
                  <input
                    type="radio"
                    name={isMobile ? 'jobType-mobile' : 'jobType'}
                    value={type}
                    checked={filters.jobType === type}
                    onChange={(e) => handleChange('jobType', e.target.value)}
                    style={{ accentColor: '#2DD4BF', width: '16px', height: '16px' }}
                  />
                  {type}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* ── Work Mode ── */}
        <div>
          <div style={sectionLabel} onClick={() => toggleSection('mode')}>
            <span>Work Mode</span>
            {openSections.mode ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
          {openSections.mode && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
              {workModes.map((mode) => (
                <label key={mode} style={radioLabel}>
                  <input
                    type="radio"
                    name={isMobile ? 'mode-mobile' : 'mode'}
                    value={mode}
                    checked={filters.mode === mode}
                    onChange={(e) => handleChange('mode', e.target.value)}
                    style={{ accentColor: '#2DD4BF', width: '16px', height: '16px' }}
                  />
                  {mode}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* ── Salary ── */}
        <div>
          <div style={sectionLabel} onClick={() => toggleSection('salary')}>
            <span>Salary Range</span>
            {openSections.salary ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
          {openSections.salary && (
            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <input
                type="number"
                placeholder="Min $"
                value={filters.minSalary || ''}
                onChange={(e) => handleChange('minSalary', e.target.value ? parseInt(e.target.value) : undefined)}
                style={{ ...inputBox, flex: 1 }}
              />
              <input
                type="number"
                placeholder="Max $"
                value={filters.maxSalary || ''}
                onChange={(e) => handleChange('maxSalary', e.target.value ? parseInt(e.target.value) : undefined)}
                style={{ ...inputBox, flex: 1 }}
              />
            </div>
          )}
        </div>

        {/* ── Clear All (Desktop only) ── */}
        {!isMobile && (
          <button
            onClick={handleClearAll}
            style={{
              width: '100%', padding: '8px', borderRadius: '10px',
              background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.2s',
            }}
          >
            Clear all filters
          </button>
        )}
      </div>
    );
  }, [tempFilters, currentFilters, searchInput, locationInput, openSections, handleTempInputChange, handleDebouncedInputChange, handleInputChange, handleClearAll]);

  return (
    <>
      {/* Mobile Filter Toggle Button */}
      <button
        onClick={() => setIsMobileOpen(true)}
        className="lg:hidden fixed z-40"
        style={{
          bottom: '16px', right: '16px',
          background: 'linear-gradient(135deg, #2DD4BF, #14B8A6)',
          color: '#fff', padding: '12px 22px', borderRadius: '50px',
          boxShadow: '0 4px 16px rgba(45,212,191,0.3)',
          display: 'flex', alignItems: 'center', gap: '8px',
          fontWeight: 600, fontSize: '14px', border: 'none', cursor: 'pointer',
          minHeight: '48px',
        }}
      >
        <SlidersHorizontal size={18} />
        Filters
        {activeFilterCount > 0 && (
          <span style={{
            background: '#fff', color: '#14B8A6',
            padding: '1px 8px', borderRadius: '20px',
            fontSize: '12px', fontWeight: 700,
          }}>
            {activeFilterCount}
          </span>
        )}
      </button>

      {/* Mobile Drawer */}
      {isMobileOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-50"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}
            onClick={() => setIsMobileOpen(false)}
          />
          <div
            className="lg:hidden fixed inset-y-0 right-0 z-50 w-full sm:w-96 flex flex-col"
            style={{
              background: 'var(--bg-secondary)',
              boxShadow: '-4px 0 20px rgba(0,0,0,0.3)',
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px', borderBottom: '1px solid var(--border-color)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <SlidersHorizontal size={20} style={{ color: '#2DD4BF' }} />
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Filters</h2>
                {activeFilterCount > 0 && (
                  <span style={{
                    background: 'rgba(45,212,191,0.15)', color: '#2DD4BF',
                    padding: '2px 8px', borderRadius: '12px',
                    fontSize: '12px', fontWeight: 700,
                  }}>
                    {activeFilterCount}
                  </span>
                )}
              </div>
              <button
                onClick={() => setIsMobileOpen(false)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-tertiary)', padding: '8px',
                  minWidth: '44px', minHeight: '44px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={22} />
              </button>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
              {renderFilterContent(true)}
            </div>

            {/* Footer */}
            <div style={{
              borderTop: '1px solid var(--border-color)',
              padding: '16px', background: 'var(--bg-secondary)',
              display: 'flex', flexDirection: 'column', gap: '8px',
            }}>
              <Button variant="primary" size="lg" className="w-full" onClick={handleApplyFilters}>
                Apply Filters
                {Object.keys(tempFilters).length > 0 && (
                  <span className="ml-1">
                    ({Object.keys(tempFilters).filter((k) => tempFilters[k as keyof FilterState]).length})
                  </span>
                )}
              </Button>
              <Button variant="outline" size="md" className="w-full" onClick={handleClearAllMobile}>
                Clear All
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 flex-shrink-0">
        <div style={{
          position: 'sticky', top: '80px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '16px',
          padding: '24px',
        }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '20px' }}>
            Filters
          </h2>
          {renderFilterContent(false)}
        </div>
      </aside>
    </>
  );
}

export default memo(JobFiltersComponent, (prevProps, nextProps) => {
  return JSON.stringify(prevProps.currentFilters) === JSON.stringify(nextProps.currentFilters);
});
