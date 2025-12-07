'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { formatDate, getExpiryStatus } from '@/lib/utils';
import { ExternalLink, Edit, RefreshCw } from 'lucide-react';

interface Job {
  id: string;
  title: string;
  isPublished: boolean;
  isFeatured: boolean;
  viewCount: number;
  applyClickCount: number;
  createdAt: string;
  expiresAt: string | null;
  editToken: string;
  paymentStatus: string;
}

interface DashboardData {
  employerEmail: string;
  employerName: string;
  jobs: Job[];
}

export default function EmployerDashboardPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const response = await fetch(`/api/employer/dashboard?token=${token}`);
        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to load dashboard');
        }

        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      } finally {
        setLoading(false);
      }
    }

    fetchDashboard();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Invalid or Expired Dashboard Link</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <p className="text-sm text-gray-500 mb-4">
            Need help? Contact us at{' '}
            <a href="mailto:support@pmhnpjobs.com" className="text-blue-600 hover:underline">
              support@pmhnpjobs.com
            </a>
          </p>
          <Link
            href="/"
            className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Go to Homepage
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const getStatusBadge = (job: Job) => {
    if (!job.isPublished) {
      return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Paused</span>;
    }

    if (job.expiresAt) {
      const expiry = getExpiryStatus(new Date(job.expiresAt));
      if (expiry.isExpired) {
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Expired</span>;
      }
    }

    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Live</span>;
  };

  const isExpired = (job: Job): boolean => {
    if (!job.expiresAt) return false;
    return new Date(job.expiresAt) < new Date();
  };

  const isExpiringSoon = (job: Job): boolean => {
    if (!job.expiresAt) return false;
    const expiry = getExpiryStatus(new Date(job.expiresAt));
    return expiry.isUrgent;
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Your Job Listings</h1>
          <p className="text-gray-600">{data.employerName} · {data.employerEmail}</p>
        </div>

        {/* Empty State */}
        {data.jobs.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
              <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No jobs posted yet</h3>
            <p className="text-gray-600 mb-6">Get started by posting your first PMHNP job listing</p>
            <Link
              href="/post-job"
              className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Post Your First Job
            </Link>
          </div>
        )}

        {/* Jobs List */}
        {data.jobs.length > 0 && (
          <div className="space-y-4">
            {data.jobs.map((job) => (
              <div key={job.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  {/* Job Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <Link
                        href={`/jobs/${job.id}`}
                        className="text-lg font-semibold text-gray-900 hover:text-blue-600 flex items-center gap-2 group"
                      >
                        {job.title}
                        <ExternalLink size={16} className="text-gray-400 group-hover:text-blue-600" />
                      </Link>
                      {getStatusBadge(job)}
                      {job.isFeatured && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Featured
                        </span>
                      )}
                    </div>

                    {/* Stats */}
                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-2">
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {job.viewCount} views
                      </span>
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" />
                        </svg>
                        {job.applyClickCount} clicks
                      </span>
                    </div>

                    {/* Dates */}
                    <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
                      <span>Posted {formatDate(job.createdAt)}</span>
                      {job.expiresAt && (
                        <span className={isExpiringSoon(job) ? 'text-orange-600 font-medium' : ''}>
                          {isExpired(job) ? 'Expired' : 'Expires'} {formatDate(job.expiresAt)}
                          {isExpiringSoon(job) && ' ⚠️'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/jobs/edit/${job.editToken}`}
                      className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                    >
                      <Edit size={16} />
                      Edit
                    </Link>
                    {(isExpired(job) || isExpiringSoon(job)) && (
                      <button
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                        title="Renew listing (coming soon)"
                      >
                        <RefreshCw size={16} />
                        Renew
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500">
          Need help?{' '}
          <a href="mailto:support@pmhnpjobs.com" className="text-blue-600 hover:underline">
            Contact support@pmhnpjobs.com
          </a>
        </div>
      </div>
    </div>
  );
}

