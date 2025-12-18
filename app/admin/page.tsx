'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Briefcase, Target, TrendingUp, ArrowRight } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalJobs: 0,
    publishedJobs: 0,
    featuredJobs: 0,
    totalLeads: 0,
    prospects: 0,
    converted: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      // Fetch job stats
      const jobsRes = await fetch('/api/jobs?limit=1000');
      const jobsData = await jobsRes.json();
      
      // Fetch outreach stats
      const outreachRes = await fetch('/api/outreach');
      const outreachData = await outreachRes.json();

      if (jobsData.success) {
        const jobs = jobsData.jobs || [];
        setStats(prev => ({
          ...prev,
          totalJobs: jobs.length,
          publishedJobs: jobs.filter((j: any) => j.isPublished).length,
          featuredJobs: jobs.filter((j: any) => j.isFeatured).length,
        }));
      }

      if (outreachData.success) {
        const leads = outreachData.data || [];
        setStats(prev => ({
          ...prev,
          totalLeads: leads.length,
          prospects: leads.filter((l: any) => l.status === 'prospect').length,
          converted: leads.filter((l: any) => l.status === 'converted').length,
        }));
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
        <p className="text-gray-600">Welcome to your PMHNP Jobs admin panel</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {/* Jobs Stats */}
        <Card padding="lg" variant="bordered" className="bg-gradient-to-br from-blue-50 to-white">
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Briefcase className="text-blue-600" size={24} />
            </div>
            <span className="text-xs text-gray-500">Jobs</span>
          </div>
          <div className="mb-1">
            <div className="text-3xl font-bold text-gray-900">{stats.totalJobs}</div>
            <div className="text-sm text-gray-600">Total Jobs</div>
          </div>
          <div className="flex gap-4 text-sm mt-3 pt-3 border-t border-gray-200">
            <div>
              <div className="font-semibold text-gray-900">{stats.publishedJobs}</div>
              <div className="text-xs text-gray-500">Published</div>
            </div>
            <div>
              <div className="font-semibold text-gray-900">{stats.featuredJobs}</div>
              <div className="text-xs text-gray-500">Featured</div>
            </div>
          </div>
        </Card>

        {/* Employer Outreach Stats */}
        <Card padding="lg" variant="bordered" className="bg-gradient-to-br from-purple-50 to-white">
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 bg-purple-100 rounded-lg">
              <Target className="text-purple-600" size={24} />
            </div>
            <span className="text-xs text-gray-500">Outreach</span>
          </div>
          <div className="mb-1">
            <div className="text-3xl font-bold text-gray-900">{stats.totalLeads}</div>
            <div className="text-sm text-gray-600">Total Leads</div>
          </div>
          <div className="flex gap-4 text-sm mt-3 pt-3 border-t border-gray-200">
            <div>
              <div className="font-semibold text-gray-900">{stats.prospects}</div>
              <div className="text-xs text-gray-500">Prospects</div>
            </div>
            <div>
              <div className="font-semibold text-green-600">{stats.converted}</div>
              <div className="text-xs text-gray-500">Converted</div>
            </div>
          </div>
        </Card>

        {/* Conversion Rate */}
        <Card padding="lg" variant="bordered" className="bg-gradient-to-br from-green-50 to-white">
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 bg-green-100 rounded-lg">
              <TrendingUp className="text-green-600" size={24} />
            </div>
            <span className="text-xs text-gray-500">Performance</span>
          </div>
          <div className="mb-1">
            <div className="text-3xl font-bold text-gray-900">
              {stats.totalLeads > 0 
                ? Math.round((stats.converted / stats.totalLeads) * 100)
                : 0}%
            </div>
            <div className="text-sm text-gray-600">Conversion Rate</div>
          </div>
          <div className="text-sm mt-3 pt-3 border-t border-gray-200">
            <div className="flex items-center gap-2 text-green-600">
              <TrendingUp size={16} />
              <span>Lead to Customer</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Jobs Management */}
        <Card padding="lg" variant="bordered">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Briefcase className="text-blue-600" size={20} />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Jobs Management</h2>
          </div>
          <p className="text-gray-600 mb-4">
            Manage job postings, approve submissions, and update job statuses.
          </p>
          <Link href="/admin/jobs">
            <Button variant="outline" size="md" className="w-full justify-between">
              Go to Jobs
              <ArrowRight size={18} />
            </Button>
          </Link>
        </Card>

        {/* Employer Outreach */}
        <Card padding="lg" variant="bordered">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Target className="text-purple-600" size={20} />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Employer Outreach</h2>
          </div>
          <p className="text-gray-600 mb-4">
            Track leads, send outreach emails, and manage your employer pipeline.
          </p>
          <Link href="/admin/outreach">
            <Button variant="outline" size="md" className="w-full justify-between">
              Go to Outreach
              <ArrowRight size={18} />
            </Button>
          </Link>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card padding="lg" variant="bordered" className="mt-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Stats</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-900">{stats.publishedJobs}</div>
            <div className="text-sm text-gray-600">Active Jobs</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-900">{stats.featuredJobs}</div>
            <div className="text-sm text-gray-600">Featured</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-900">{stats.prospects}</div>
            <div className="text-sm text-gray-600">New Prospects</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">{stats.converted}</div>
            <div className="text-sm text-gray-600">Customers</div>
          </div>
        </div>
      </Card>
    </div>
  );
}

