'use client';

import { useState } from 'react';
import { Search, X } from 'lucide-react';

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

  const handleInputChange = (key: keyof FilterState, value: string | number | undefined) => {
    const newFilters = { ...currentFilters };
    if (value === '' || value === undefined) {
      delete newFilters[key];
    } else {
      (newFilters as any)[key] = value;
    }
    onFilterChange(newFilters);
  };

  const handleClearAll = () => {
    onFilterChange({});
  };

  const FilterContent = () => (
    <div className="space-y-6">
      {/* Search Input */}
      <div>
        <label htmlFor="search" className="block font-medium text-sm text-gray-700 mb-2">
          Search
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            id="search"
            placeholder="Job title, company..."
            value={currentFilters.search || ''}
            onChange={(e) => handleInputChange('search', e.target.value)}
            className="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Location Input */}
      <div>
        <label htmlFor="location" className="block font-medium text-sm text-gray-700 mb-2">
          Location
        </label>
        <input
          type="text"
          id="location"
          placeholder="Remote, New York, etc."
          value={currentFilters.location || ''}
          onChange={(e) => handleInputChange('location', e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Work Mode Radio Buttons */}
      <div>
        <label className="block font-medium text-sm text-gray-700 mb-2">
          Work Mode
        </label>
        <div className="space-y-2">
          {workModes.map((mode) => (
            <label key={mode} className="flex items-center cursor-pointer">
              <input
                type="radio"
                name="mode"
                value={mode}
                checked={currentFilters.mode === mode}
                onChange={(e) => handleInputChange('mode', e.target.value)}
                className="w-4 h-4 text-blue-500 border-gray-300 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-600">{mode}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Job Type Radio Buttons */}
      <div>
        <label className="block font-medium text-sm text-gray-700 mb-2">
          Job Type
        </label>
        <div className="space-y-2">
          {jobTypes.map((type) => (
            <label key={type} className="flex items-center cursor-pointer">
              <input
                type="radio"
                name="jobType"
                value={type}
                checked={currentFilters.jobType === type}
                onChange={(e) => handleInputChange('jobType', e.target.value)}
                className="w-4 h-4 text-blue-500 border-gray-300 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-600">{type}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Salary Range */}
      <div>
        <label className="block font-medium text-sm text-gray-700 mb-2">
          Salary Range
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="Min $"
            value={currentFilters.minSalary || ''}
            onChange={(e) => handleInputChange('minSalary', e.target.value ? parseInt(e.target.value) : undefined)}
            className="w-1/2 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <input
            type="number"
            placeholder="Max $"
            value={currentFilters.maxSalary || ''}
            onChange={(e) => handleInputChange('maxSalary', e.target.value ? parseInt(e.target.value) : undefined)}
            className="w-1/2 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Clear All Button */}
      <button
        onClick={handleClearAll}
        className="w-full bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors font-medium text-sm"
      >
        Clear all filters
      </button>
    </div>
  );

  return (
    <>
      {/* Mobile Filter Toggle Button */}
      <button
        onClick={() => setIsMobileOpen(true)}
        className="md:hidden fixed bottom-4 right-4 z-40 bg-blue-500 text-white px-4 py-3 rounded-full shadow-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
      >
        <Search size={20} />
        Filters
      </button>

      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-50"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Mobile Slide-over Panel */}
      <div
        className={`md:hidden fixed inset-y-0 left-0 z-50 w-80 max-w-full bg-white shadow-xl transform transition-transform duration-300 ease-in-out ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Filters</h2>
          <button
            onClick={() => setIsMobileOpen(false)}
            className="text-gray-500 hover:text-gray-700"
          >
            <X size={24} />
          </button>
        </div>
        <div className="p-4 overflow-y-auto h-full pb-24">
          <FilterContent />
        </div>
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden md:block w-64 flex-shrink-0">
        <div className="sticky top-20 bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-6">Filters</h2>
          <FilterContent />
        </div>
      </aside>
    </>
  );
}

