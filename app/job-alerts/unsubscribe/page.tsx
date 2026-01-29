'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';

function UnsubscribeContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const token = searchParams.get('token');

    const [status, setStatus] = useState<'loading' | 'confirm' | 'success' | 'error'>('confirm');
    const [message, setMessage] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    // Validate token on mount
    useEffect(() => {
        if (!token) {
            setStatus('error');
            setMessage('Invalid unsubscribe link. No token provided.');
        }
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

    if (status === 'loading') {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="flex items-center gap-3">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
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
                        <p className="text-gray-600 text-center mb-6">
                            Are you sure you want to delete this job alert? You&apos;ll no longer receive notifications for matching jobs.
                        </p>
                        <div className="space-y-3">
                            <button
                                onClick={handleUnsubscribe}
                                disabled={isDeleting}
                                className="w-full px-4 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isDeleting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Deleting...
                                    </>
                                ) : (
                                    'Yes, Delete My Alert'
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
                            className="block w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium text-center hover:bg-blue-700 transition-colors"
                        >
                            Create New Alert
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
                            className="block w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium text-center hover:bg-blue-700 transition-colors"
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
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
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
