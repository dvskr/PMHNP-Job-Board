'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

function UnsubscribeContent() {
    const searchParams = useSearchParams();
    const token = searchParams.get('token');

    const [loading, setLoading] = useState(true);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resubscribed, setResubscribed] = useState(false);
    const [resubscribing, setResubscribing] = useState(false);
    const [resubscribeError, setResubscribeError] = useState<string | null>(null);

    useEffect(() => {
        const unsubscribe = async () => {
            // If no token, show error immediately
            if (!token) {
                setLoading(false);
                setError('No unsubscribe token provided');
                return;
            }

            try {
                setLoading(true);
                const response = await fetch(`/api/email/unsubscribe?token=${encodeURIComponent(token)}`);
                const data = await response.json();

                if (response.ok && data.success) {
                    setSuccess(true);
                    setError(null);
                } else {
                    setSuccess(false);
                    setError(data.error || 'This unsubscribe link may be invalid or expired.');
                }
            } catch (err) {
                setSuccess(false);
                setError('An unexpected error occurred. Please try again later.');
            } finally {
                setLoading(false);
            }
        };

        unsubscribe();
    }, [token]);

    const handleResubscribe = async (e: React.MouseEvent) => {
        e.preventDefault();

        if (!token) return;

        setResubscribing(true);
        setResubscribeError(null);

        try {
            // Try the preferences API first
            const response = await fetch('/api/email/preferences', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, isSubscribed: true }),
            });

            const data = await response.json();

            if (response.ok && data.success) {
                setResubscribed(true);
                setSuccess(false);
            } else {
                setResubscribeError(data.error || 'Failed to resubscribe. Please try again.');
            }
        } catch (err) {
            setResubscribeError('An unexpected error occurred. Please try again later.');
        } finally {
            setResubscribing(false);
        }
    };

    return (
        <div className="min-h-screen bg-white flex items-center justify-center px-4">
            <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
                {/* Logo */}
                <div className="text-center mb-6">
                    <h1 className="text-2xl font-bold text-gray-900">PMHNP Hiring</h1>
                </div>

                {/* Loading State */}
                {loading && (
                    <div className="text-center">
                        <div className="flex justify-center mb-4">
                            <Loader2 className="w-16 h-16 text-teal-600 animate-spin" />
                        </div>
                        <h2 className="text-xl font-semibold text-gray-900 mb-2">
                            Processing your request...
                        </h2>
                        <p className="text-gray-600">Please wait a moment</p>
                    </div>
                )}

                {/* Resubscribed State */}
                {!loading && resubscribed && (
                    <div className="text-center">
                        <div className="flex justify-center mb-4">
                            <CheckCircle className="w-16 h-16 text-green-500" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-3">
                            Welcome back!
                        </h2>
                        <p className="text-gray-700 mb-6">
                            You've been resubscribed to PMHNP Hiring emails.
                        </p>

                        <Link href="/">
                            <button className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors shadow-md hover:shadow-lg">
                                Return to Homepage
                            </button>
                        </Link>
                    </div>
                )}

                {/* Success State */}
                {!loading && success && !resubscribed && (
                    <div className="text-center">
                        <div className="flex justify-center mb-4">
                            <CheckCircle className="w-16 h-16 text-green-500" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-3">
                            You've been unsubscribed
                        </h2>
                        <p className="text-gray-700 mb-2">
                            You will no longer receive emails from PMHNP Hiring.
                        </p>
                        <p className="text-gray-600 mb-6">
                            We're sorry to see you go.
                        </p>

                        <Link href="/">
                            <button className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors mb-4 shadow-md hover:shadow-lg">
                                Return to Homepage
                            </button>
                        </Link>

                        <button
                            onClick={handleResubscribe}
                            disabled={resubscribing}
                            className="text-sm text-teal-600 hover:text-teal-700 hover:underline disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1 mx-auto"
                        >
                            {resubscribing ? (
                                <>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    <span>Processing...</span>
                                </>
                            ) : (
                                'Changed your mind? Resubscribe'
                            )}
                        </button>

                        {resubscribeError && (
                            <p className="text-xs text-red-600 mt-2">{resubscribeError}</p>
                        )}
                    </div>
                )}

                {/* Error State */}
                {!loading && error && (
                    <div className="text-center">
                        <div className="flex justify-center mb-4">
                            <XCircle className="w-16 h-16 text-red-500" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-3">
                            Something went wrong
                        </h2>
                        <p className="text-gray-700 mb-6">
                            {error}
                        </p>

                        <Link href="/">
                            <button className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors mb-4 shadow-md hover:shadow-lg">
                                Return to Homepage
                            </button>
                        </Link>

                        <a
                            href="mailto:support@pmhnphiring.com"
                            className="text-sm text-teal-600 hover:text-teal-700 hover:underline"
                        >
                            Contact support
                        </a>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function UnsubscribePage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-white flex items-center justify-center">
                <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
                    <Loader2 className="w-16 h-16 text-teal-600 animate-spin mx-auto mb-4" />
                    <p className="text-gray-600">Loading...</p>
                </div>
            </div>
        }>
            <UnsubscribeContent />
        </Suspense>
    );
}
