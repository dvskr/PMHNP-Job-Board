'use client';

import { useState, useEffect } from 'react';
import { Search, X, SlidersHorizontal } from 'lucide-react';
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

export default function JobFilters({ currentFilters, onFilterChange }: JobFiltersProps) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [tempFilters, setTempFilters] = useState<FilterState>(currentFilters);

  // Update temp filters when drawer opens
  useEffect(() => {
    if (isMobileOpen) {
      setTempFilters(currentFilters);
    }
  }, [isMobileOpen, currentFilters]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMobileOpen]);

  // Count active filters
  const activeFilterCount = Object.keys(currentFilters).filter(
    key => currentFilters[key as keyof FilterState] !== undefined && currentFilters[key as keyof FilterState] !== ''
  ).length;

  const handleInputChange = (key: keyof FilterState, value: string | number | undefined) => {
    const newFilters = { ...currentFilters };
    if (value === '' || value === undefined) {
      delete newFilters[key];
    } else {
      (newFilters as any)[key] = value;
    }
    onFilterChange(newFilters);
  };

  const handleTempInputChange = (key: keyof FilterState, value: string | number | undefined) => {
    const newFilters = { ...tempFilters };
    if (value === '' || value === undefined) {
      delete newFilters[key];
    } else {
      (newFilters as any)[key] = value;
    }
    setTempFilters(newFilters);
  };

  const handleApplyFilters = () => {
    onFilterChange(tempFilters);
    setIsMobileOpen(false);
  };

  const handleClearAll = () => {
    onFilterChange({});
  };

  const handleClearAllMobile = () => {
    setTempFilters({});
  };

  const FilterContent = ({ isMobile = false }: { isMobile?: boolean }) => {
    const filters = isMobile ? tempFilters : currentFilters;
    const handleChange = isMobile ? handleTempInputChange : handleInputChange;

    return (
      <div className="space-y-6">
        {/* Search Input */}
        <div>
          <label htmlFor={isMobile ? "search-mobile" : "search"} className="block font-medium text-sm text-gray-700 mb-2">
            Search
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              id={isMobile ? "search-mobile" : "search"}
              placeholder="Job title, company..."
              value={filters.search || ''}
              onChange={(e) => handleChange('search', e.target.value)}
              className="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-base"
            />
          </div>
        </div>

        {/* Location Input */}
        <div>
          <label htmlFor={isMobile ? "location-mobile" : "location"} className="block font-medium text-sm text-gray-700 mb-2">
            Location
          </label>
          <input
            type="text"
            id={isMobile ? "location-mobile" : "location"}
            placeholder="Remote, New York, etc."
            value={filters.location || ''}
            onChange={(e) => handleChange('location', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-base"
          />
        </div>

        {/* Work Mode Radio Buttons */}
        <div>
          <label className="block font-medium text-sm text-gray-700 mb-3">
            Work Mode
          </label>
          <div className="space-y-3">
            {workModes.map((mode) => (
              <label key={mode} className="flex items-center cursor-pointer touch-manipulation py-1">
                <input
                  type="radio"
                  name={isMobile ? "mode-mobile" : "mode"}
                  value={mode}
                  checked={filters.mode === mode}
                  onChange={(e) => handleChange('mode', e.target.value)}
                  className="w-5 h-5 text-primary-600 border-gray-300 focus:ring-primary-500"
                />
                <span className="ml-3 text-base text-gray-700">{mode}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Job Type Radio Buttons */}
        <div>
          <label className="block font-medium text-sm text-gray-700 mb-3">
            Job Type
          </label>
          <div className="space-y-3">
            {jobTypes.map((type) => (
              <label key={type} className="flex items-center cursor-pointer touch-manipulation py-1">
                <input
                  type="radio"
                  name={isMobile ? "jobType-mobile" : "jobType"}
                  value={type}
                  checked={filters.jobType === type}
                  onChange={(e) => handleChange('jobType', e.target.value)}
                  className="w-5 h-5 text-primary-600 border-gray-300 focus:ring-primary-500"
                />
                <span className="ml-3 text-base text-gray-700">{type}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Salary Range */}
        <div>
          <label className="block font-medium text-sm text-gray-700 mb-2">
            Salary Range
          </label>
          <div className="flex gap-3">
            <input
              type="number"
              placeholder="Min $"
              value={filters.minSalary || ''}
              onChange={(e) => handleChange('minSalary', e.target.value ? parseInt(e.target.value) : undefined)}
              className="w-1/2 border border-gray-300 rounded-lg px-3 py-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-base"
            />
            <input
              type="number"
              placeholder="Max $"
              value={filters.maxSalary || ''}
              onChange={(e) => handleChange('maxSalary', e.target.value ? parseInt(e.target.value) : undefined)}
              className="w-1/2 border border-gray-300 rounded-lg px-3 py-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-base"
            />
          </div>
        </div>

        {/* Clear All Button (Desktop only) */}
        {!isMobile && (
          <button
            onClick={handleClearAll}
            className="w-full bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors font-medium text-sm"
          >
            Clear all filters
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Mobile Filter Toggle Button */}
      <button
        onClick={() => setIsMobileOpen(true)}
        className="lg:hidden fixed bottom-4 right-4 z-40 bg-primary-600 text-white px-5 py-3 rounded-full shadow-lg hover:bg-primary-700 transition-all duration-200 hover:scale-105 active:scale-95 flex items-center gap-2 font-medium touch-manipulation"
        style={{ minHeight: '48px' }}
      >
        <SlidersHorizontal size={20} />
        <span>
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-1 bg-white text-primary-600 px-2 py-0.5 rounded-full text-xs font-bold">
              {activeFilterCount}
            </span>
          )}
        </span>
      </button>

      {/* Mobile Drawer */}
      {isMobileOpen && (
        <>
          {/* Backdrop Overlay */}
          <div 
            className="lg:hidden fixed inset-0 bg-black/60 z-50 animate-fade-in"
            onClick={() => setIsMobileOpen(false)}
            aria-hidden="true"
          />
          
          {/* Slide-over Panel */}
          <div className="lg:hidden fixed inset-y-0 right-0 z-50 w-full sm:w-96 bg-white shadow-2xl animate-slide-in-right flex flex-col">
            {/* Drawer Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 shrink-0">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="text-primary-600" size={20} />
                <h2 className="text-lg font-bold text-gray-900">Filters</h2>
                {activeFilterCount > 0 && (
                  <span className="bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full text-xs font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </div>
              <button
                onClick={() => setIsMobileOpen(false)}
                className="text-gray-500 hover:text-gray-700 transition-colors p-2 -mr-2 touch-manipulation"
                style={{ minWidth: '44px', minHeight: '44px' }}
                aria-label="Close filters"
              >
                <X size={24} />
              </button>
            </div>

            {/* Drawer Content - Scrollable */}
            <div className="flex-1 overflow-y-auto p-4">
              <FilterContent isMobile={true} />
            </div>

            {/* Drawer Footer - Fixed */}
            <div className="border-t border-gray-200 p-4 bg-white shrink-0 space-y-2">
              <Button 
                variant="primary" 
                size="lg" 
                className="w-full"
                onClick={handleApplyFilters}
              >
                Apply Filters
                {Object.keys(tempFilters).length > 0 && (
                  <span className="ml-1">
                    ({Object.keys(tempFilters).filter(key => tempFilters[key as keyof FilterState]).length})
                  </span>
                )}
              </Button>
              <Button 
                variant="outline" 
                size="md" 
                className="w-full"
                onClick={handleClearAllMobile}
              >
                Clear All
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 flex-shrink-0">
        <div className="sticky top-20 bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-6">Filters</h2>
          <FilterContent isMobile={false} />
        </div>
      </aside>
    </>
  );
}

