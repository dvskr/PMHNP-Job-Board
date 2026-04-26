'use client';

import { useState, useEffect } from 'react';
import EmailSignupForm from '@/components/EmailSignupForm';
import { TrendingUp, MapPin, Building2, Briefcase } from 'lucide-react';

interface SalaryByState {
  state: string;
  avgSalary: number;
  jobCount: number;
}

interface SalaryByMode {
  mode: string;
  avgSalary: number;
  jobCount: number;
}

interface TopEmployer {
  employer: string;
  minSalary: number;
  maxSalary: number;
  avgSalary: number;
  location: string;
  jobCount: number;
}

interface SalaryStats {
  overallAverage: number;
  totalJobsWithSalary: number;
  salaryByState: SalaryByState[];
  salaryByMode: SalaryByMode[];
  topEmployers: TopEmployer[];
}

export default function SalaryGuidePage() {
  const [stats, setStats] = useState<SalaryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/salary-stats');
        if (!response.ok) {
          throw new Error('Failed to fetch salary data');
        }
        const data = await response.json();
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const formatSalary = (amount: number): string => {
    return '$' + amount.toLocaleString();
  };

  const formatSalaryRange = (min: number, max: number): string => {
    if (min === max) {
      return formatSalary(min);
    }
    return `${formatSalary(min)} - ${formatSalary(max)}`;
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Page Header */}
      <div className="mb-12">
        <h1 className="text-3xl md:text-4xl font-bold mb-4">
          PMHNP Salary Guide 2024
        </h1>
        <p className="text-gray-600 text-lg">
          Comprehensive salary data for psychiatric mental health nurse practitioners based on current job listings.
        </p>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <p className="text-gray-600">Loading salary data...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-600">{error}</p>
        </div>
      )}

      {/* Stats Content */}
      {!loading && !error && stats && (
        <>
          {/* Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center gap-3 mb-2">
                <TrendingUp className="text-blue-500" size={24} />
                <h3 className="text-gray-600 font-medium">Average Salary</h3>
              </div>
              <p className="text-3xl font-bold text-gray-900">
                {formatSalary(stats.overallAverage)}
              </p>
              <p className="text-sm text-gray-500 mt-1">per year</p>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center gap-3 mb-2">
                <Briefcase className="text-blue-500" size={24} />
                <h3 className="text-gray-600 font-medium">Jobs with Salary</h3>
              </div>
              <p className="text-3xl font-bold text-gray-900">
                {stats.totalJobsWithSalary.toLocaleString()}
              </p>
              <p className="text-sm text-gray-500 mt-1">listings analyzed</p>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center gap-3 mb-2">
                <MapPin className="text-blue-500" size={24} />
                <h3 className="text-gray-600 font-medium">States Covered</h3>
              </div>
              <p className="text-3xl font-bold text-gray-900">
                {stats.salaryByState.length}
              </p>
              <p className="text-sm text-gray-500 mt-1">with salary data</p>
            </div>
          </div>

          {/* Salary by State */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <MapPin className="text-blue-500" size={24} />
              Average PMHNP Salary by State
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Rank</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">State</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Average Salary</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Job Count</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.salaryByState.map((item, index) => (
                    <tr 
                      key={item.state} 
                      className={`border-b border-gray-100 ${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}
                    >
                      <td className="py-3 px-4 text-gray-600">{index + 1}</td>
                      <td className="py-3 px-4 font-medium text-gray-900">{item.state}</td>
                      <td className="py-3 px-4 text-green-600 font-semibold">
                        {formatSalary(item.avgSalary)}
                      </td>
                      <td className="py-3 px-4 text-gray-600">{item.jobCount} jobs</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {stats.salaryByState.length === 0 && (
              <p className="text-gray-500 text-center py-4">No state salary data available</p>
            )}
          </div>

          {/* Remote vs In-Person */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <Building2 className="text-blue-500" size={24} />
              Remote vs In-Person Salary Comparison
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Work Mode</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Average Salary</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Job Count</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.salaryByMode.map((item, index) => (
                    <tr 
                      key={item.mode} 
                      className={`border-b border-gray-100 ${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}
                    >
                      <td className="py-3 px-4 font-medium text-gray-900">{item.mode}</td>
                      <td className="py-3 px-4 text-green-600 font-semibold">
                        {formatSalary(item.avgSalary)}
                      </td>
                      <td className="py-3 px-4 text-gray-600">{item.jobCount} jobs</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {stats.salaryByMode.length === 0 && (
              <p className="text-gray-500 text-center py-4">No work mode salary data available</p>
            )}
          </div>

          {/* Top Paying Employers */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-12">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <TrendingUp className="text-blue-500" size={24} />
              Top Paying Employers
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Rank</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Employer</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Salary Range</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Location</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.topEmployers.map((item, index) => (
                    <tr 
                      key={item.employer} 
                      className={`border-b border-gray-100 ${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}
                    >
                      <td className="py-3 px-4 text-gray-600">{index + 1}</td>
                      <td className="py-3 px-4 font-medium text-gray-900">{item.employer}</td>
                      <td className="py-3 px-4 text-green-600 font-semibold">
                        {formatSalaryRange(item.minSalary, item.maxSalary)}
                      </td>
                      <td className="py-3 px-4 text-gray-600">{item.location}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {stats.topEmployers.length === 0 && (
              <p className="text-gray-500 text-center py-4">No employer salary data available</p>
            )}
          </div>

          {/* Disclaimer */}
          <div className="bg-gray-50 rounded-lg p-4 mb-12 text-sm text-gray-600">
            <p>
              <strong>Note:</strong> Salary data is based on job listings on PMHNP Jobs and may not represent 
              all positions in the market. Actual salaries may vary based on experience, credentials, 
              and specific employer requirements.
            </p>
          </div>
        </>
      )}

      {/* Email Signup Section */}
      <section className="bg-blue-50 rounded-lg p-8">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Get Salary Insights & Job Alerts
          </h2>
          <p className="text-gray-600 mb-6">
            Stay updated on PMHNP salary trends and new job opportunities
          </p>
          <EmailSignupForm source="salary_guide" />
        </div>
      </section>
    </div>
  );
}

// Metadata export (for server component, but we'll use generateMetadata in layout or separate file)
// Since this is a client component, metadata should be in a separate file or layout

