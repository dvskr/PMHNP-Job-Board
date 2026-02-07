'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDate, getExpiryStatus } from '@/lib/utils';
import { ExternalLink, Edit, RefreshCw } from 'lucide-react';
import { config } from '@/lib/config';

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
    slug: string | null;
}

interface EmployerDashboardClientProps {
    employerEmail: string;
    employerName: string;
    jobs: Job[];
}

export default function EmployerDashboardClient({ employerEmail, employerName, jobs }: EmployerDashboardClientProps) {
    const [renewingJobId, setRenewingJobId] = useState<string | null>(null);
    const [upgradingJobId, setUpgradingJobId] = useState<string | null>(null);
    const [showRenewModal, setShowRenewModal] = useState(false);
    const [selectedJob, setSelectedJob] = useState<Job | null>(null);

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

    const shouldShowRenew = (job: Job): boolean => {
        return isExpired(job) || isExpiringSoon(job);
    };

    const handleRenewClick = (job: Job) => {
        setSelectedJob(job);
        setShowRenewModal(true);
    };

    const handleRenewCheckout = async (tier: 'standard' | 'featured') => {
        if (!selectedJob) return;

        setRenewingJobId(selectedJob.id);
        setShowRenewModal(false);

        try {
            const response = await fetch('/api/create-renewal-checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jobId: selectedJob.id,
                    editToken: selectedJob.editToken,
                    tier,
                }),
            });

            const result = await response.json();

            if (!response.ok || result.error) {
                throw new Error(result.error || 'Failed to create checkout');
            }

            // Redirect to Stripe checkout
            if (result.url) {
                window.location.href = result.url;
            } else if (result.success && result.free) {
                // Free renewal success - refresh page to show new status
                window.location.reload();
            }
        } catch (err) {
            console.error('Renewal checkout error:', err);
            alert(err instanceof Error ? err.message : 'Failed to start renewal process');
            setRenewingJobId(null);
        }
    };

    const handleUpgradeClick = async (job: Job) => {
        setUpgradingJobId(job.id);

        try {
            const response = await fetch('/api/create-upgrade-checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jobId: job.id,
                    editToken: job.editToken,
                }),
            });

            const result = await response.json();

            if (!response.ok || result.error) {
                throw new Error(result.error || 'Failed to create checkout');
            }

            // Redirect to Stripe checkout
            if (result.url) {
                window.location.href = result.url;
            } else if (result.success && result.free) {
                // Free upgrade success - refresh page
                window.location.reload();
            }
        } catch (err) {
            console.error('Upgrade checkout error:', err);
            alert(err instanceof Error ? err.message : 'Failed to start upgrade process');
            setUpgradingJobId(null);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Employer Dashboard</h1>
                        <p className="text-gray-600 mt-1">{employerName}</p>
                    </div>
                    <Link
                        href="/post-job"
                        className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                    >
                        Post a New Job
                    </Link>
                </div>

                {/* Empty State */}
                {jobs.length === 0 && (
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
                            <svg className="h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
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
                {jobs.length > 0 && (
                    <div className="space-y-4">
                        {jobs.map((job: Job) => (
                            <div key={job.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 transition-shadow hover:shadow-md">
                                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                                    {/* Job Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 mb-2">
                                            <Link
                                                href={job.isPublished && job.slug ? `/jobs/${job.slug}` : '#'}
                                                className={`text-lg font-semibold text-gray-900 flex items-center gap-2 group ${job.isPublished && job.slug ? 'hover:text-blue-600' : ''}`}
                                            >
                                                {job.title}
                                                {job.isPublished && job.slug && (
                                                    <ExternalLink size={16} className="text-gray-400 group-hover:text-blue-600" />
                                                )}
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
                                            <span className="flex items-center gap-1" title="Views">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                </svg>
                                                {job.viewCount} views
                                            </span>
                                            <span className="flex items-center gap-1" title="Apply Clicks">
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
                                    <div className="flex items-center gap-2 mt-4 lg:mt-0">
                                        <Link
                                            href={`/jobs/edit/${job.editToken}`}
                                            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                                        >
                                            <Edit size={16} />
                                            Edit
                                        </Link>
                                        {!job.isFeatured && job.isPublished && !isExpired(job) && (
                                            <button
                                                onClick={() => handleUpgradeClick(job)}
                                                disabled={upgradingJobId === job.id}
                                                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {upgradingJobId === job.id ? 'Processing...' : 'Upgrade'}
                                            </button>
                                        )}
                                        {shouldShowRenew(job) && (
                                            <button
                                                onClick={() => handleRenewClick(job)}
                                                disabled={renewingJobId === job.id}
                                                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <RefreshCw size={16} className={renewingJobId === job.id ? 'animate-spin' : ''} />
                                                {renewingJobId === job.id ? 'Processing...' : 'Renew'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Footer */}
                <div className="mt-12 border-t border-gray-200 pt-6 flex justify-between items-center text-sm text-gray-500">
                    <div>
                        &copy; {new Date().getFullYear()} PMHNP Hiring.
                    </div>
                    <div>
                        <Link href="/contact" className="hover:text-gray-900 mr-4">Contact Support</Link>
                        <form action="/auth/signout" method="post" className="inline-block">
                            <button type="submit" className="text-red-600 hover:text-red-800 font-medium">
                                Sign Out
                            </button>
                        </form>
                    </div>
                </div>
            </div>

            {/* Renewal Modal */}
            {showRenewModal && selectedJob && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 animate-fade-in-up">
                        <div className="mb-4">
                            <h3 className="text-xl font-bold text-gray-900 mb-2">Renew Job Posting</h3>
                            <p className="text-sm text-gray-600">{selectedJob.title}</p>
                        </div>

                        <p className="text-gray-700 mb-6">
                            {config.isPaidPostingEnabled
                                ? 'Choose how you\'d like to renew your listing:'
                                : 'Choose your renewal option (free during launch period):'}
                        </p>

                        <div className="space-y-3 mb-6">
                            {/* Standard Option */}
                            <button
                                onClick={() => handleRenewCheckout('standard')}
                                className="w-full text-left border-2 border-gray-300 rounded-lg p-4 hover:border-blue-500 hover:bg-blue-50 transition-all group"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className="font-semibold text-gray-900 group-hover:text-blue-700">Standard Renewal</span>
                                    <span className="text-2xl font-bold text-gray-900 group-hover:text-blue-700">
                                        {config.isPaidPostingEnabled ? '$99' : 'FREE'}
                                    </span>
                                </div>
                                <ul className="text-sm text-gray-600 space-y-1">
                                    <li>✓ 30 days of visibility</li>
                                    <li>✓ Standard placement</li>
                                </ul>
                            </button>

                            {/* Featured Option */}
                            <button
                                onClick={() => handleRenewCheckout('featured')}
                                className="w-full text-left border-2 border-blue-500 bg-blue-50 rounded-lg p-4 hover:bg-blue-100 transition-all group relative"
                            >
                                <div className="absolute top-2 right-2">
                                    <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded">
                                        RECOMMENDED
                                    </span>
                                </div>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="font-semibold text-blue-900">Featured Renewal</span>
                                    <span className="text-2xl font-bold text-blue-900">
                                        {config.isPaidPostingEnabled ? '$199' : 'FREE'}
                                    </span>
                                </div>
                                <ul className="text-sm text-blue-800 space-y-1">
                                    <li>✓ 60 days of visibility</li>
                                    <li>✓ <strong>Top placement</strong></li>
                                </ul>
                            </button>
                        </div>

                        {/* Cancel Button */}
                        <button
                            onClick={() => {
                                setShowRenewModal(false);
                                setSelectedJob(null);
                            }}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
