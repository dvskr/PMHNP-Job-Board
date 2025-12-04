'use client';

import { useState, useEffect } from 'react';

interface Stats {
  totalJobs: number;
  totalSubscribers: number;
  totalCompanies: number;
}

export default function StatsSection() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/stats');
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const formatNumber = (num: number): string => {
    return num.toLocaleString();
  };

  return (
    <section className="py-16 px-4 bg-white">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          {/* Total Jobs */}
          <div>
            {loading ? (
              <div className="h-10 w-24 bg-gray-200 rounded animate-pulse mx-auto mb-2"></div>
            ) : (
              <div className="text-4xl font-bold text-blue-600 mb-2">
                {stats ? formatNumber(stats.totalJobs) : '0'}+
              </div>
            )}
            <div className="text-gray-600">Active Jobs</div>
          </div>

          {/* Total Subscribers */}
          <div>
            {loading ? (
              <div className="h-10 w-24 bg-gray-200 rounded animate-pulse mx-auto mb-2"></div>
            ) : (
              <div className="text-4xl font-bold text-blue-600 mb-2">
                {stats ? formatNumber(stats.totalSubscribers) : '0'}+
              </div>
            )}
            <div className="text-gray-600">PMHNPs Subscribed</div>
          </div>

          {/* Total Companies */}
          <div>
            {loading ? (
              <div className="h-10 w-24 bg-gray-200 rounded animate-pulse mx-auto mb-2"></div>
            ) : (
              <div className="text-4xl font-bold text-blue-600 mb-2">
                {stats ? formatNumber(stats.totalCompanies) : '0'}+
              </div>
            )}
            <div className="text-gray-600">Companies Hiring</div>
          </div>
        </div>
      </div>
    </section>
  );
}

