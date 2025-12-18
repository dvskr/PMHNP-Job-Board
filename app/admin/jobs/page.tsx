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

interface SourcePerformance {
  source: string;
  totalJobs: number;
  jobsLast7Days: number;
  jobsLast30Days: number;
  avgQualityScore: number;
  totalViews: number;
  totalApplyClicks: number;
  clickThroughRate: number;
  duplicateRate: number;
  costPerJob: number | null;
}

interface ClickAnalytics {
  summary: {
    totalClicks: number;
    uniqueJobs: number;
    avgClicksPerJob: number;
  };
  bySource: Array<{
    source: string;
    clicks: number;
    jobs: number;
    avgPerJob: number;
  }>;
  byDay: Array<{
    date: string;
    clicks: number;
  }>;
  topJobs: Array<{
    jobId: string;
    title: string;
    employer: string;
    clicks: number;
  }>;
}

export default function AdminJobsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [sourceAnalytics, setSourceAnalytics] = useState<SourcePerformance[] | null>(null);
  const [clickAnalytics, setClickAnalytics] = useState<ClickAnalytics | null>(null);
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

  const fetchSourceAnalytics = async () => {
    try {
      const response = await fetch('/api/analytics/sources');
      
      if (!response.ok) {
        console.error('Failed to fetch source analytics');
        return;
      }
      
      const data = await response.json();
      setSourceAnalytics(data.sources || []);
    } catch (err) {
      console.error('Error fetching source analytics:', err);
    }
  };

  const fetchClickAnalytics = async () => {
    try {
      const response = await fetch('/api/analytics/clicks?days=30');
      
      if (!response.ok) {
        console.error('Failed to fetch click analytics');
        return;
      }
      
      const data = await response.json();
      setClickAnalytics(data);
    } catch (err) {
      console.error('Error fetching click analytics:', err);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchSourceAnalytics();
    fetchClickAnalytics();
    // Auto-refresh every 60 seconds
    const interval = setInterval(() => {
      fetchStats();
      fetchSourceAnalytics();
      fetchClickAnalytics();
    }, 60000);
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
    ? Math.round(Object.values(stats.jobsByDay).reduce((a: number, b: number) => a + b, 0) / Object.keys(stats.jobsByDay).length)
    : 0;

  const totalBySource = Object.values(stats.bySource).reduce((a: number, b: number) => a + b, 0);

  const sortedDays = Object.entries(stats.jobsByDay).sort(([a]: [string, number], [b]: [string, number]) => a.localeCompare(b));
  const trend = sortedDays.length >= 2
    ? (sortedDays[sortedDays.length - 1]?.[1] ?? 0) > (sortedDays[sortedDays.length - 2]?.[1] ?? 0)
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

      {/* Top Sources Summary */}
      {sourceAnalytics && sourceAnalytics.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg shadow p-6 border border-blue-200">
            <h3 className="text-sm font-medium text-blue-700 mb-3">🏆 Best for Volume</h3>
            {(() => {
              const bestVolume = [...sourceAnalytics].sort((a: SourcePerformance, b: SourcePerformance) => b.totalJobs - a.totalJobs)[0];
              if (!bestVolume) return <p className="text-sm text-gray-500">No data</p>;
              return (
                <>
                  <p className="text-2xl font-bold text-blue-900 capitalize">{bestVolume.source}</p>
                  <p className="text-sm text-blue-600 mt-1">{bestVolume.totalJobs.toLocaleString()} active jobs</p>
                </>
              );
            })()}
          </div>
          
          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg shadow p-6 border border-green-200">
            <h3 className="text-sm font-medium text-green-700 mb-3">⭐ Best for Quality</h3>
            {(() => {
              const bestQuality = [...sourceAnalytics].sort((a: SourcePerformance, b: SourcePerformance) => b.avgQualityScore - a.avgQualityScore)[0];
              if (!bestQuality) return <p className="text-sm text-gray-500">No data</p>;
              return (
                <>
                  <p className="text-2xl font-bold text-green-900 capitalize">{bestQuality.source}</p>
                  <p className="text-sm text-green-600 mt-1">{(bestQuality.avgQualityScore * 100).toFixed(0)}% quality score</p>
                </>
              );
            })()}
          </div>
          
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg shadow p-6 border border-purple-200">
            <h3 className="text-sm font-medium text-purple-700 mb-3">🎯 Best for Clicks</h3>
            {(() => {
              const bestClicks = [...sourceAnalytics].sort((a: SourcePerformance, b: SourcePerformance) => b.clickThroughRate - a.clickThroughRate)[0];
              if (!bestClicks) return <p className="text-sm text-gray-500">No data</p>;
              return (
                <>
                  <p className="text-2xl font-bold text-purple-900 capitalize">{bestClicks.source}</p>
                  <p className="text-sm text-purple-600 mt-1">{(bestClicks.clickThroughRate * 100).toFixed(1)}% CTR</p>
                </>
              );
            })()}
          </div>
        </div>
      )}

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
                  .sort(([, a]: [string, number], [, b]: [string, number]) => b - a)
                  .map(([source, count]: [string, number]) => (
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
              sortedDays.map(([date, count]: [string, number]) => (
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
                {stats.topEmployers.map((employer: { employer: string; count: number }, index: number) => (
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

      {/* Source Performance */}
      {sourceAnalytics && sourceAnalytics.length > 0 && (
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Source Performance</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Source
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Active Jobs
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      7-Day Adds
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Quality
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Views
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Clicks
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      CTR
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Dup Rate
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sourceAnalytics.map((source: SourcePerformance, index: number) => {
                    // Performance scoring for color coding
                    const qualityScore = source.avgQualityScore * 100;
                    const ctr = source.clickThroughRate * 100;
                    const dupRate = source.duplicateRate * 100;
                    
                    // Color coding logic
                    const getQualityColor = (score: number) => {
                      if (score >= 75) return 'text-green-700 bg-green-50';
                      if (score >= 50) return 'text-yellow-700 bg-yellow-50';
                      return 'text-red-700 bg-red-50';
                    };
                    
                    const getCtrColor = (rate: number) => {
                      if (rate >= 5) return 'text-green-700 bg-green-50';
                      if (rate >= 2) return 'text-yellow-700 bg-yellow-50';
                      return 'text-gray-700 bg-gray-50';
                    };
                    
                    const getDupColor = (rate: number) => {
                      if (rate >= 50) return 'text-red-700 bg-red-50';
                      if (rate >= 30) return 'text-yellow-700 bg-yellow-50';
                      return 'text-green-700 bg-green-50';
                    };
                    
                    return (
                      <tr key={source.source} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 capitalize">
                          {source.source}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-right text-gray-900 font-semibold">
                          {source.totalJobs.toLocaleString()}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-right text-gray-600">
                          {source.jobsLast7Days.toLocaleString()}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-right">
                          <span className={`px-2 py-1 rounded-full font-medium ${getQualityColor(qualityScore)}`}>
                            {qualityScore.toFixed(0)}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-right text-gray-600">
                          {source.totalViews.toLocaleString()}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-right text-gray-600">
                          {source.totalApplyClicks.toLocaleString()}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-right">
                          <span className={`px-2 py-1 rounded-full font-medium ${getCtrColor(ctr)}`}>
                            {ctr.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-right">
                          <span className={`px-2 py-1 rounded-full font-medium ${getDupColor(dupRate)}`}>
                            {dupRate.toFixed(0)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-500">
              <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full bg-green-200"></span>
                <span>Good performance</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full bg-yellow-200"></span>
                <span>Average performance</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full bg-red-200"></span>
                <span>Needs improvement</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Apply Click Analytics */}
      {clickAnalytics && (
        <div className="space-y-8 mb-8">
          <div className="bg-white rounded-lg shadow">
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Apply Click Analytics (Last 30 Days)</h2>
              
              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
                <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg shadow p-6 border border-indigo-200">
                  <h3 className="text-sm font-medium text-indigo-700 mb-2">Total Clicks</h3>
                  <p className="text-3xl font-bold text-indigo-900">{clickAnalytics.summary.totalClicks.toLocaleString()}</p>
                  <p className="text-xs text-indigo-600 mt-1">{clickAnalytics.summary.uniqueJobs} unique jobs</p>
                </div>
                
                <div className="bg-gradient-to-br from-teal-50 to-teal-100 rounded-lg shadow p-6 border border-teal-200">
                  <h3 className="text-sm font-medium text-teal-700 mb-2">Avg Clicks per Job</h3>
                  <p className="text-3xl font-bold text-teal-900">{clickAnalytics.summary.avgClicksPerJob.toFixed(2)}</p>
                  <p className="text-xs text-teal-600 mt-1">Engagement rate</p>
                </div>
                
                <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg shadow p-6 border border-amber-200">
                  <h3 className="text-sm font-medium text-amber-700 mb-2">Best Converting Source</h3>
                  {(() => {
                    const best = clickAnalytics.bySource.length > 0 ? clickAnalytics.bySource[0] : null;
                    return best ? (
                      <>
                        <p className="text-3xl font-bold text-amber-900 capitalize">{best.source}</p>
                        <p className="text-xs text-amber-600 mt-1">{best.clicks} clicks ({best.avgPerJob.toFixed(2)} per job)</p>
                      </>
                    ) : (
                      <p className="text-sm text-amber-600">No data</p>
                    );
                  })()}
                </div>
              </div>

              {/* Clicks by Source */}
              {clickAnalytics.bySource.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Clicks by Source</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Source
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Total Clicks
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Jobs Clicked
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Avg per Job
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Performance
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {clickAnalytics.bySource.map((sourceData: { source: string; clicks: number; jobs: number; avgPerJob: number }, index: number) => {
                          const performance = sourceData.avgPerJob;
                          const getPerformanceColor = () => {
                            if (performance >= 0.5) return 'text-green-700 bg-green-50';
                            if (performance >= 0.3) return 'text-yellow-700 bg-yellow-50';
                            return 'text-red-700 bg-red-50';
                          };
                          
                          return (
                            <tr key={sourceData.source} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 capitalize">
                                {sourceData.source}
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm text-right text-gray-900 font-semibold">
                                {sourceData.clicks.toLocaleString()}
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm text-right text-gray-600">
                                {sourceData.jobs.toLocaleString()}
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm text-right text-gray-600">
                                {sourceData.avgPerJob.toFixed(2)}
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap text-sm text-right">
                                <span className={`px-2 py-1 rounded-full font-medium ${getPerformanceColor()}`}>
                                  {performance >= 0.5 ? '🔥 Hot' : performance >= 0.3 ? '👍 Good' : '📊 Low'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Top 10 Most Clicked Jobs */}
              {clickAnalytics.topJobs.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Top 10 Most Clicked Jobs</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Rank
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Job Title
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Employer
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Clicks
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {clickAnalytics.topJobs.map((job: { jobId: string; title: string; employer: string; clicks: number }, index: number) => (
                          <tr key={job.jobId} className={index < 3 ? 'bg-yellow-50' : index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                              <span className={`font-bold ${index === 0 ? 'text-yellow-600' : index === 1 ? 'text-gray-500' : index === 2 ? 'text-amber-600' : ''}`}>
                                #{index + 1}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-sm font-medium text-gray-900">
                              {job.title}
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-600">
                              {job.employer}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-right">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                                {job.clicks} clicks
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
                {Object.keys(stats.bySource).map((source: string) => (
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

