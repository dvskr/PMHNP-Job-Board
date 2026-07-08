'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, CheckCircle, CalendarClock, PauseCircle, Loader2 } from 'lucide-react';

interface AlertInfo {
    token: string;
    keyword?: string | null;
    location?: string | null;
    mode?: string | null;
    jobType?: string | null;
    minSalary?: number | null;
    maxSalary?: number | null;
    frequency?: string | null;
    isActive?: boolean;
}

// Human-readable criteria summary (mirrors the manage page's format).
function buildCriteriaSummary(alert: AlertInfo): string {
    const parts: string[] = [];
    if (alert.keyword) parts.push(`"${alert.keyword}"`);
    if (alert.mode) parts.push(alert.mode);
    if (alert.jobType) parts.push(alert.jobType);
    if (alert.location) parts.push(`in ${alert.location}`);
    if (alert.minSalary) parts.push(`$${Math.round(alert.minSalary / 1000)}k+`);
    return parts.length > 0 ? parts.join(' · ') : 'All PMHNP jobs';
}

function UnsubscribeContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const token = searchParams.get('token');

    const [status, setStatus] = useState<'loading' | 'confirm' | 'success' | 'updated' | 'error'>('confirm');
    const [message, setMessage] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [downgradeLoading, setDowngradeLoading] = useState<'weekly' | 'pause' | null>(null);
    const [alertInfo, setAlertInfo] = useState<AlertInfo | null>(null);

    // Validate token on mount + fetch this alert's criteria so the user can
    // see exactly which alert the link refers to. A failed lookup is not
    // fatal — the delete/keep options still work without the summary.
    useEffect(() => {
        if (!token) {
            setStatus('error');
            setMessage('Invalid unsubscribe link. No token provided.');
            return;
        }
        let cancelled = false;
        fetch(`/api/job-alerts?token=${encodeURIComponent(token)}`)
            .then(r => (r.ok ? r.json() : null))
            .then(data => {
                if (cancelled || !data?.success || !Array.isArray(data.alerts)) return;
                const match = (data.alerts as AlertInfo[]).find(a => a.token === token);
                if (match) setAlertInfo(match);
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [token]);

    const handleUnsubscribe = async () => {
        if (!token) return;

        setIsDeleting(true);

        try {
            const response = await fetch(`/api/job-alerts?token=${token}`, {
                method: 'DELETE',
            });

            const data = await response.json();

            if (response.ok && data.success) {
                setStatus('success');
                setMessage('Your job alert has been deleted successfully.');
            } else {
                setStatus('error');
                setMessage(data.error || 'Failed to delete alert. It may have already been removed.');
            }
        } catch {
            setStatus('error');
            setMessage('Network error. Please try again.');
        } finally {
            setIsDeleting(false);
        }
    };

    // Lighter-touch alternatives to deleting: switch to a weekly digest or
    // pause the alert. Both reuse the existing PATCH endpoint the manage
    // page calls.
    const handleDowngrade = async (action: 'weekly' | 'pause') => {
        if (!token) return;

        setDowngradeLoading(action);

        try {
            const response = await fetch(`/api/job-alerts/${encodeURIComponent(token)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(action === 'weekly' ? { frequency: 'weekly' } : { isActive: false }),
            });

            const data = await response.json();

            if (response.ok && data.success) {
                setStatus('updated');
                setMessage(action === 'weekly'
                    ? 'Your alert now sends one weekly digest instead of daily emails.'
                    : 'Your alert is paused. It will not send any emails until you turn it back on.');
            } else {
                setStatus('error');
                setMessage(data.error || 'Failed to update the alert. Please try again.');
            }
        } catch {
            setStatus('error');
            setMessage('Network error. Please try again.');
        } finally {
            setDowngradeLoading(null);
        }
    };

    if (status === 'loading') {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="flex items-center gap-3">
                    <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
                    <span className="text-gray-600">Loading...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-200 p-8">
                {status === 'confirm' && token && (
                    <>
                        <div className="flex items-center justify-center mb-6">
                            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
                                <AlertTriangle className="h-8 w-8 text-amber-600" />
                            </div>
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900 text-center mb-3">
                            Unsubscribe from Job Alerts
                        </h1>
                        <p className="text-gray-600 text-center mb-4">
                            You can delete this job alert, or keep it with fewer emails.
                        </p>
                        {alertInfo && (
                            <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 mb-6">
                                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-1">
                                    This alert
                                </p>
                                <p className="text-sm font-medium text-slate-800">
                                    {buildCriteriaSummary(alertInfo)}
                                    {alertInfo.frequency ? ` · ${alertInfo.frequency} digest` : ''}
                                </p>
                            </div>
                        )}
                        <div className="space-y-3">
                            {alertInfo?.frequency !== 'weekly' && (
                                <button
                                    onClick={() => handleDowngrade('weekly')}
                                    disabled={downgradeLoading !== null || isDeleting}
                                    className="w-full px-4 py-3 bg-teal-50 text-teal-800 border border-teal-200 rounded-lg font-medium hover:bg-teal-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {downgradeLoading === 'weekly' ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Updating...
                                        </>
                                    ) : (
                                        <>
                                            <CalendarClock className="h-4 w-4" />
                                            Switch to a weekly digest
                                        </>
                                    )}
                                </button>
                            )}
                            {alertInfo?.isActive !== false && (
                                <button
                                    onClick={() => handleDowngrade('pause')}
                                    disabled={downgradeLoading !== null || isDeleting}
                                    className="w-full px-4 py-3 bg-teal-50 text-teal-800 border border-teal-200 rounded-lg font-medium hover:bg-teal-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {downgradeLoading === 'pause' ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Updating...
                                        </>
                                    ) : (
                                        <>
                                            <PauseCircle className="h-4 w-4" />
                                            Pause this alert
                                        </>
                                    )}
                                </button>
                            )}
                            <button
                                onClick={handleUnsubscribe}
                                disabled={isDeleting || downgradeLoading !== null}
                                className="w-full px-4 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isDeleting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Deleting...
                                    </>
                                ) : (
                                    'Delete My Alert'
                                )}
                            </button>
                            <button
                                onClick={() => router.back()}
                                className="w-full px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </>
                )}

                {status === 'success' && (
                    <>
                        <div className="flex items-center justify-center mb-6">
                            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                                <CheckCircle className="h-8 w-8 text-green-600" />
                            </div>
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900 text-center mb-3">
                            Successfully Unsubscribed
                        </h1>
                        <p className="text-gray-600 text-center mb-6">
                            {message}
                        </p>
                        <Link
                            href="/job-alerts"
                            className="block w-full px-4 py-3 bg-teal-600 text-white rounded-lg font-medium text-center hover:bg-teal-700 transition-colors"
                        >
                            Create New Alert
                        </Link>
                    </>
                )}

                {status === 'updated' && (
                    <>
                        <div className="flex items-center justify-center mb-6">
                            <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center">
                                <CheckCircle className="h-8 w-8 text-teal-600" />
                            </div>
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900 text-center mb-3">
                            Alert Updated
                        </h1>
                        <p className="text-gray-600 text-center mb-6">
                            {message}
                        </p>
                        <Link
                            href={token ? `/job-alerts/manage?token=${encodeURIComponent(token)}` : '/job-alerts/manage'}
                            className="block w-full px-4 py-3 bg-teal-600 text-white rounded-lg font-medium text-center hover:bg-teal-700 transition-colors"
                        >
                            Manage My Alerts
                        </Link>
                    </>
                )}

                {status === 'error' && (
                    <>
                        <div className="flex items-center justify-center mb-6">
                            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                                <AlertTriangle className="h-8 w-8 text-red-600" />
                            </div>
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900 text-center mb-3">
                            Something Went Wrong
                        </h1>
                        <p className="text-gray-600 text-center mb-6">
                            {message}
                        </p>
                        <Link
                            href="/jobs"
                            className="block w-full px-4 py-3 bg-teal-600 text-white rounded-lg font-medium text-center hover:bg-teal-700 transition-colors"
                        >
                            Browse Jobs
                        </Link>
                    </>
                )}
            </div>
        </div>
    );
}

function LoadingFallback() {
    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <div className="flex items-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
                <span className="text-gray-600">Loading...</span>
            </div>
        </div>
    );
}

export default function UnsubscribePage() {
    return (
        <Suspense fallback={<LoadingFallback />}>
            <UnsubscribeContent />
        </Suspense>
    );
}
