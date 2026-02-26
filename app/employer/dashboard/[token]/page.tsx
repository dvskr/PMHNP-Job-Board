'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import EmployerDashboardClient from '@/components/employer/EmployerDashboardClient';

interface DashboardData {
  employerEmail: string;
  employerName: string;
  jobs: Array<{
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
    slug: string | null;
  }>;
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
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto mb-4"></div>
          <p style={{ color: 'var(--text-secondary)' }}>Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="max-w-md w-full rounded-lg shadow-md p-8 text-center" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Invalid or Expired Dashboard Link</h2>
          <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>{error}</p>
          <p className="text-sm mb-4" style={{ color: 'var(--text-tertiary)' }}>
            Need help? Contact us at{' '}
            <a href="mailto:support@pmhnphiring.com" className="hover:underline" style={{ color: 'var(--color-primary)' }}>
              support@pmhnphiring.com
            </a>
          </p>
          <Link
            href="/"
            className="inline-block bg-teal-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-teal-700 transition-colors"
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

  return (
    <EmployerDashboardClient
      employerEmail={data.employerEmail}
      employerName={data.employerName}
      jobs={data.jobs}
      dashboardToken={token}
    />
  );
}
