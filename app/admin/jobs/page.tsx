'use client';

import { useState, useEffect } from 'react';

interface Stats {
  totalActive: number;
  addedLast24h: number;
  bySource: Record<string, number>;
  jobsByDay: Record<string, number>;
  topEmployers: Array<{ employer: string; count: number }>;
  additionalMetrics?: {
    totalJobs: number;
    publishedJobs: number;
    unpublishedJobs: number;
    featuredJobs: number;
    jobTypeDistribution: Record<string, number>;
    modeDistribution: Record<string, number>;
  };
  lastUpdated: string;
}

export default function AdminJobsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<string>('all');

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/admin/stats');
      
      if (!response.ok) {
        throw new Error('Failed to fetch stats');
      }
      
      const data = await response.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchStats, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleTriggerIngestion = async () => {
    try {
      setActionLoading(true);
      setActionResult(null);
      
      const response = await fetch('/api/admin/trigger-ingestion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source: selectedSource === 'all' ? undefined : selectedSource,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Ingestion failed');
      }
      
      const result = await response.json();
      const totalAdded = result.ingestion?.summary?.totalAdded || 0;
      const totalFetched = result.ingestion?.summary?.totalFetched || 0;
      const totalDuplicates = result.ingestion?.summary?.totalDuplicates || 0;
      
      setActionResult(
        `Success! Fetched ${totalFetched} jobs, added ${totalAdded} new, ${totalDuplicates} duplicates`
      );
      
      // Refresh stats after ingestion
      setTimeout(fetchStats, 2000);
    } catch (err) {
      setActionResult(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && !stats) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading statistics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-red-800 font-bold mb-2">Error</h2>
          <p className="text-red-600">{error}</p>
          <button
            onClick={fetchStats}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const avgDailyNew = Object.keys(stats.jobsByDay).length > 0
    ? Math.round(Object.values(stats.jobsByDay).reduce((a, b) => a + b, 0) / Object.keys(stats.jobsByDay).length)
    : 0;

  const totalBySource = Object.values(stats.bySource).reduce((a, b) => a + b, 0);

  const sortedDays = Object.entries(stats.jobsByDay).sort(([a], [b]) => a.localeCompare(b));
  const trend = sortedDays.length >= 2
    ? sortedDays[sortedDays.length - 1][1] > sortedDays[sortedDays.length - 2][1]
    : null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Job Aggregation Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">
              Last updated: {new Date(stats.lastUpdated).toLocaleString()}
            </p>
          </div>
          <button
            onClick={fetchStats}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Active Jobs</h3>
          <p className="text-3xl font-bold text-gray-900">{stats.totalActive}</p>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Added Last 24h</h3>
          <p className="text-3xl font-bold text-green-600">{stats.addedLast24h}</p>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Active Sources</h3>
          <p className="text-3xl font-bold text-blue-600">{Object.keys(stats.bySource).length}</p>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Avg Daily New</h3>
          <p className="text-3xl font-bold text-purple-600">{avgDailyNew}</p>
        </div>
      </div>

      {/* Jobs by Source */}
      <div className="bg-white rounded-lg shadow mb-8">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Jobs by Source</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Source
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Count
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Percentage
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {Object.entries(stats.bySource)
                  .sort(([, a], [, b]) => b - a)
                  .map(([source, count]) => (
                    <tr key={source}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 capitalize">
                        {source}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {count}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {((count / totalBySource) * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                <tr className="bg-gray-50 font-bold">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    Total
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {totalBySource}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    100%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Jobs Added Per Day */}
      <div className="bg-white rounded-lg shadow mb-8">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Jobs Added Per Day (Last 7 Days)
            {trend !== null && (
              <span className="ml-3 text-sm">
                {trend ? (
                  <span className="text-green-600">↑ Trending Up</span>
                ) : (
                  <span className="text-red-600">↓ Trending Down</span>
                )}
              </span>
            )}
          </h2>
          <div className="space-y-3">
            {sortedDays.length > 0 ? (
              sortedDays.map(([date, count]) => (
                <div key={date} className="flex items-center">
                  <div className="w-32 text-sm text-gray-600">{date}</div>
                  <div className="flex-1 flex items-center">
                    <div
                      className="bg-blue-500 h-8 rounded"
                      style={{
                        width: `${(count / Math.max(...Object.values(stats.jobsByDay))) * 100}%`,
                        minWidth: '2rem',
                      }}
                    ></div>
                    <span className="ml-3 text-sm font-medium text-gray-900">{count}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500">No data available</p>
            )}
          </div>
        </div>
      </div>

      {/* Top Employers */}
      <div className="bg-white rounded-lg shadow mb-8">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Top Employers</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rank
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Employer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Job Count
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {stats.topEmployers.map((employer, index) => (
                  <tr key={employer.employer}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      #{index + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {employer.employer}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {employer.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Actions Section */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Actions</h2>
          
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={selectedSource}
                onChange={(e) => setSelectedSource(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Sources</option>
                {Object.keys(stats.bySource).map((source) => (
                  <option key={source} value={source}>
                    {source.charAt(0).toUpperCase() + source.slice(1)}
                  </option>
                ))}
              </select>
              
              <button
                onClick={handleTriggerIngestion}
                disabled={actionLoading}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                {actionLoading ? 'Running...' : 'Trigger Ingestion'}
              </button>
            </div>
            
            {actionResult && (
              <div className={`p-4 rounded-lg ${actionResult.includes('Error') ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>
                {actionResult}
              </div>
            )}
            
            <p className="text-sm text-gray-500">
              ⚠️ Note: Full ingestion can take 40+ seconds. The page will refresh automatically when complete.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

