'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface JobAlert {
  id: string;
  token: string;
  email: string;
  name: string | null;
  keyword: string | null;
  location: string | null;
  mode: string | null;
  jobType: string | null;
  minSalary: number | null;
  maxSalary: number | null;
  frequency: string;
  isActive: boolean;
  lastSentAt: string | null;
  createdAt: string;
}

function buildCriteriaSummary(alert: JobAlert): string {
  const parts: string[] = [];

  if (alert.keyword) parts.push(`"${alert.keyword}"`);
  if (alert.mode) parts.push(alert.mode);
  if (alert.jobType) parts.push(alert.jobType);
  if (alert.location) parts.push(`in ${alert.location}`);
  if (alert.minSalary || alert.maxSalary) {
    if (alert.minSalary && alert.maxSalary) {
      parts.push(`$${(alert.minSalary / 1000).toFixed(0)}k-$${(alert.maxSalary / 1000).toFixed(0)}k`);
    } else if (alert.minSalary) {
      parts.push(`$${(alert.minSalary / 1000).toFixed(0)}k+`);
    } else if (alert.maxSalary) {
      parts.push(`up to $${(alert.maxSalary / 1000).toFixed(0)}k`);
    }
  }

  return parts.length > 0 ? parts.join(' · ') : 'All PMHNP jobs';
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function ManageAlertsContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const email = searchParams.get('email');

  const [alerts, setAlerts] = useState<JobAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAlerts() {
      try {
        setLoading(true);
        setError(null);

        let response;
        if (token) {
          response = await fetch(`/api/job-alerts?token=${encodeURIComponent(token)}`);
        } else if (email) {
          response = await fetch(`/api/job-alerts/by-email?email=${encodeURIComponent(email)}`);
        } else {
          setError('No token or email provided');
          setLoading(false);
          return;
        }

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Failed to fetch alerts');
        }

        // Handle single alert vs multiple alerts
        if (data.alert) {
          setAlerts([data.alert]);
        } else if (data.alerts) {
          setAlerts(data.alerts);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      } finally {
        setLoading(false);
      }
    }

    fetchAlerts();
  }, [token, email]);

  const handleToggleActive = async (alert: JobAlert) => {
    setActionLoading(alert.id);
    try {
      const response = await fetch(`/api/job-alerts/${alert.token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !alert.isActive }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update alert');
      }

      setAlerts((prev: JobAlert[]) =>
        prev.map((a: JobAlert) => (a.id === alert.id ? { ...a, isActive: !a.isActive } : a))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update alert');
    } finally {
      setActionLoading(null);
    }
  };

  const handleChangeFrequency = async (alert: JobAlert, newFrequency: string) => {
    setActionLoading(alert.id);
    try {
      const response = await fetch(`/api/job-alerts/${alert.token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frequency: newFrequency }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update alert');
      }

      setAlerts((prev: JobAlert[]) =>
        prev.map((a: JobAlert) => (a.id === alert.id ? { ...a, frequency: newFrequency } : a))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update alert');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (alert: JobAlert) => {
    setActionLoading(alert.id);
    try {
      const response = await fetch(`/api/job-alerts?token=${encodeURIComponent(alert.token)}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete alert');
      }

      setAlerts((prev: JobAlert[]) => prev.filter((a: JobAlert) => a.id !== alert.id));
      setDeleteConfirm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete alert');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)', minHeight: 'calc(100vh - 4rem)' }}>
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
          <p style={{ color: 'var(--text-secondary)' }}>Loading alerts...</p>
        </div>
      </div>
    );
  }

  if (error && alerts.length === 0) {
    return (
      <div className="flex items-center justify-center p-4" style={{ backgroundColor: 'var(--bg-primary)', minHeight: 'calc(100vh - 4rem)' }}>
        <div className="max-w-md w-full rounded-xl shadow-sm p-8 text-center" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Alert Not Found</h2>
          <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>{error}</p>
          <Link
            href="/jobs"
            className="inline-flex items-center justify-center px-4 py-2 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition-colors"
          >
            Browse Jobs
          </Link>
        </div>
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="flex items-center justify-center p-4" style={{ backgroundColor: 'var(--bg-primary)', minHeight: 'calc(100vh - 4rem)' }}>
        <div className="max-w-md w-full rounded-xl shadow-sm p-8 text-center" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
            <svg className="h-6 w-6" style={{ color: 'var(--text-tertiary)' }} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>No Alerts Found</h2>
          <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>You don&apos;t have any job alerts set up yet.</p>
          <Link
            href="/jobs"
            className="inline-flex items-center justify-center px-4 py-2 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition-colors"
          >
            Create Your First Alert
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-12 px-4" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Manage Job Alerts</h1>
          {email && (
            <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>Alerts for {email}</p>
          )}
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Alerts List */}
        <div className="space-y-4">
          {alerts.map((alert: JobAlert) => (
            <div
              key={alert.id}
              className={`rounded-xl shadow-sm transition-all ${alert.isActive ? '' : 'opacity-60'}`}
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
            >
              <div className="p-5">
                {/* Alert Header */}
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex-1 min-w-0">
                    {alert.name && (
                      <h3 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{alert.name}</h3>
                    )}
                    <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                      {buildCriteriaSummary(alert)}
                    </p>
                  </div>

                  {/* Status Badge */}
                  <span
                    className={`flex-shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${alert.isActive
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'text-slate-600'
                      }`}
                    style={!alert.isActive ? { backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' } : {}}
                  >
                    {alert.isActive ? 'Active' : 'Paused'}
                  </span>
                </div>

                {/* Alert Details */}
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm mb-5" style={{ color: 'var(--text-tertiary)' }}>
                  <span className="flex items-center gap-1.5">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {alert.frequency === 'daily' ? 'Daily' : 'Weekly'} digest
                  </span>
                  <span className="flex items-center gap-1.5">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                    </svg>
                    Created {formatDate(alert.createdAt)}
                  </span>
                  {alert.lastSentAt && (
                    <span className="flex items-center gap-1.5">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                      </svg>
                      Last sent {formatDate(alert.lastSentAt)}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-3 pt-4" style={{ borderTop: '1px solid var(--border-color)' }}>
                  {/* Frequency Select */}
                  <div className="flex items-center gap-2">
                    <label htmlFor={`frequency-${alert.id}`} className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Frequency:
                    </label>
                    <select
                      id={`frequency-${alert.id}`}
                      value={alert.frequency}
                      onChange={(e) => handleChangeFrequency(alert, e.target.value)}
                      disabled={actionLoading === alert.id}
                      className="text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 disabled:opacity-50"
                      style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
                    >
                      <option value="weekly">Weekly</option>
                      <option value="daily">Daily</option>
                    </select>
                  </div>

                  <div className="flex-1" />

                  {/* Pause/Resume Button */}
                  <button
                    onClick={() => handleToggleActive(alert)}
                    disabled={actionLoading === alert.id}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${alert.isActive
                      ? 'text-amber-700 bg-amber-50 hover:bg-amber-100'
                      : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                      }`}
                  >
                    {actionLoading === alert.id ? (
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : alert.isActive ? (
                      <>
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
                        </svg>
                        Pause
                      </>
                    ) : (
                      <>
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                        </svg>
                        Resume
                      </>
                    )}
                  </button>

                  {/* Delete Button */}
                  {deleteConfirm === alert.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Delete?</span>
                      <button
                        onClick={() => handleDelete(alert)}
                        disabled={actionLoading === alert.id}
                        className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                      >
                        {actionLoading === alert.id ? 'Deleting...' : 'Yes'}
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        disabled={actionLoading === alert.id}
                        className="px-3 py-1.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                        style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-tertiary)' }}
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(alert.id)}
                      disabled={actionLoading === alert.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <Link
            href="/jobs"
            className="text-sm font-medium hover:opacity-80"
            style={{ color: 'var(--color-primary)' }}
          >
            ← Back to Jobs
          </Link>
        </div>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)', minHeight: 'calc(100vh - 4rem)' }}>
      <div className="flex items-center gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
        <p style={{ color: 'var(--text-secondary)' }}>Loading alerts...</p>
      </div>
    </div>
  );
}

export default function ManageAlertsPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ManageAlertsContent />
    </Suspense>
  );
}
