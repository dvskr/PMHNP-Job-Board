'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatDate, getExpiryStatus } from '@/lib/utils';
import { ExternalLink, Edit, RefreshCw, Mail, Loader2, Shield } from 'lucide-react';
import { config } from '@/lib/config';
import ApplicantsTab from '@/components/employer/ApplicantsTab';
import AnalyticsTab from '@/components/employer/AnalyticsTab';
import SavedCandidatesTab from '@/components/employer/SavedCandidatesTab';

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
    /** If provided, the user accessed via token link (not logged in). Shows signup banner & invoice links use this token. */
    dashboardToken?: string;
}

export default function EmployerDashboardClient({ employerEmail, employerName, jobs, dashboardToken }: EmployerDashboardClientProps) {
    const isTokenAccess = !!dashboardToken;

    const [renewingJobId, setRenewingJobId] = useState<string | null>(null);
    const [upgradingJobId, setUpgradingJobId] = useState<string | null>(null);
    const [showRenewModal, setShowRenewModal] = useState(false);
    const [selectedJob, setSelectedJob] = useState<Job | null>(null);
    const [showSignupBanner, setShowSignupBanner] = useState(isTokenAccess);
    const [activeTab, setActiveTab] = useState<'jobs' | 'applicants' | 'analytics' | 'saved'>('jobs');

    // Newsletter (only for logged-in users)
    const [newsletterOptIn, setNewsletterOptIn] = useState(false);
    const [newsletterLoading, setNewsletterLoading] = useState(false);
    const [newsletterChecked, setNewsletterChecked] = useState(false);

    useEffect(() => {
        if (isTokenAccess) return; // Skip newsletter for token access
        fetch('/api/newsletter/status?' + new URLSearchParams({ email: employerEmail }))
            .then(r => r.json())
            .then(d => { setNewsletterOptIn(d.optIn ?? false); setNewsletterChecked(true); })
            .catch(() => setNewsletterChecked(true));
    }, [employerEmail, isTokenAccess]);

    const handleNewsletterToggle = async () => {
        setNewsletterLoading(true);
        const newState = !newsletterOptIn;
        setNewsletterOptIn(newState);
        try {
            await fetch('/api/newsletter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: employerEmail, optIn: newState, source: 'employer_newsletter' }),
            });
        } catch {
            setNewsletterOptIn(!newState);
        } finally {
            setNewsletterLoading(false);
        }
    };

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

            if (result.url) {
                window.location.href = result.url;
            } else if (result.success && result.free) {
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

            if (result.url) {
                window.location.href = result.url;
            } else if (result.success && result.free) {
                window.location.reload();
            }
        } catch (err) {
            console.error('Upgrade checkout error:', err);
            alert(err instanceof Error ? err.message : 'Failed to start upgrade process');
            setUpgradingJobId(null);
        }
    };

    // Build the job link — prefer slug for session access, fallback to id for token access
    const getJobHref = (job: Job) => {
        if (job.isPublished && job.slug) return `/jobs/${job.slug}`;
        if (job.isPublished) return `/jobs/${job.id}`;
        return '#';
    };

    return (
        <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--bg-primary)' }}>
            <div className="max-w-6xl mx-auto">
                {/* Sign Up Banner — token-access only */}
                {showSignupBanner && isTokenAccess && (
                    <div className="bg-teal-50 border-l-4 border-teal-400 p-4 mb-8 relative rounded-r-md">
                        <button
                            onClick={() => setShowSignupBanner(false)}
                            className="absolute top-2 right-2 text-teal-400 hover:text-teal-600"
                        >
                            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                        </button>
                        <div className="flex items-center justify-between flex-wrap gap-4 pr-6">
                            <div className="flex items-center">
                                <div className="flex-shrink-0">
                                    <svg className="h-5 w-5 text-teal-400" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                    </svg>
                                </div>
                                <div className="ml-3">
                                    <p className="text-sm text-teal-700">
                                        Create an account for easier access to your dashboard in the future.
                                    </p>
                                </div>
                            </div>
                            <Link
                                href="/signup?role=employer"
                                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500"
                            >
                                Sign Up
                            </Link>
                        </div>
                    </div>
                )}

                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>Employer Dashboard</h1>
                        <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>
                            {employerName}{isTokenAccess ? ` · ${employerEmail}` : ''}
                        </p>
                    </div>
                    <Link
                        href="/post-job"
                        className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition-colors"
                    >
                        Post a New Job
                    </Link>
                </div>

                {/* Talent Pool CTA — session access only */}
                {!isTokenAccess && (
                    <Link
                        href="/employer/candidates"
                        className="block rounded-lg shadow-sm p-6 mb-6 transition-all hover:shadow-md group"
                        style={{
                            backgroundColor: 'var(--bg-secondary)',
                            border: '1px solid rgba(45,212,191,0.2)',
                            background: 'linear-gradient(135deg, rgba(45,212,191,0.05), rgba(20,184,166,0.02))',
                            textDecoration: 'none',
                        }}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div
                                    style={{
                                        width: '40px',
                                        height: '40px',
                                        borderRadius: '12px',
                                        background: 'linear-gradient(135deg, #2DD4BF, #14B8A6)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '18px',
                                    }}
                                >
                                    👥
                                </div>
                                <div>
                                    <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
                                        Browse PMHNP Talent Pool
                                    </h3>
                                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                        Search qualified candidates open to new opportunities
                                    </p>
                                </div>
                            </div>
                            <span
                                className="text-sm font-semibold group-hover:translate-x-1 transition-transform"
                                style={{ color: '#2DD4BF' }}
                            >
                                Browse →
                            </span>
                        </div>
                    </Link>
                )}

                {/* Tab Navigation — session access only */}
                {!isTokenAccess && (
                    <div className="flex gap-1 mb-6 p-1 rounded-lg overflow-x-auto" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                        {(['jobs', 'applicants', 'analytics', 'saved'] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${activeTab === tab ? 'shadow-sm' : 'hover:opacity-80'}`}
                                style={{
                                    backgroundColor: activeTab === tab ? 'var(--bg-secondary)' : 'transparent',
                                    color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-tertiary)',
                                }}
                            >
                                {tab === 'jobs' ? `My Jobs (${jobs.length})` : tab === 'saved' ? '★ Saved' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                            </button>
                        ))}
                    </div>
                )}

                {/* Applicants Tab Content */}
                {activeTab === 'applicants' && !isTokenAccess && (
                    <ApplicantsTab />
                )}

                {/* Analytics Tab Content */}
                {activeTab === 'analytics' && !isTokenAccess && (
                    <AnalyticsTab />
                )}

                {/* Messages — now linked to unified inbox */}
                {!isTokenAccess && (
                    <Link
                        href="/messages"
                        className="block rounded-lg shadow-sm p-6 mb-6 transition-all hover:shadow-md group"
                        style={{
                            backgroundColor: 'var(--bg-secondary)',
                            border: '1px solid rgba(45,212,191,0.2)',
                            background: 'linear-gradient(135deg, rgba(45,212,191,0.05), rgba(20,184,166,0.02))',
                            textDecoration: 'none',
                        }}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div style={{
                                    width: '40px', height: '40px', borderRadius: '12px',
                                    background: 'linear-gradient(135deg, #2DD4BF, #14B8A6)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '18px',
                                }}>
                                    <Mail size={20} color="#fff" />
                                </div>
                                <div>
                                    <div className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Messages</div>
                                    <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>View and reply to candidate conversations</div>
                                </div>
                            </div>
                            <span className="text-sm font-medium group-hover:translate-x-1 transition-transform" style={{ color: '#2DD4BF' }}>Open Inbox →</span>
                        </div>
                    </Link>
                )}

                {/* Saved Candidates Tab Content */}
                {activeTab === 'saved' && !isTokenAccess && (
                    <SavedCandidatesTab />
                )}

                {/* Jobs Tab Content */}
                {(activeTab === 'jobs' || isTokenAccess) && (
                    <>
                        {/* Empty State */}
                        {jobs.length === 0 && (
                            <div className="rounded-lg shadow-sm p-12 text-center" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                                    <svg className="h-8 w-8" style={{ color: 'var(--color-primary)' }} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />
                                    </svg>
                                </div>
                                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>No jobs posted yet</h3>
                                <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>Get started by posting your first PMHNP job listing</p>
                                <Link
                                    href="/post-job"
                                    className="inline-block bg-teal-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-teal-700 transition-colors"
                                >
                                    Post Your First Job
                                </Link>
                            </div>
                        )}

                        {/* Jobs List */}
                        {jobs.length > 0 && (
                            <div className="space-y-4">
                                {jobs.map((job: Job) => (
                                    <div key={job.id} className="rounded-lg shadow-sm p-6 transition-shadow hover:shadow-md" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                                            {/* Job Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <Link
                                                        href={getJobHref(job)}
                                                        className={`text-lg font-semibold flex items-center gap-2 group ${job.isPublished ? 'hover:text-teal-600' : ''}`}
                                                        style={{ color: 'var(--text-primary)' }}
                                                    >
                                                        {job.title}
                                                        {job.isPublished && (
                                                            <ExternalLink size={16} className="text-gray-400 group-hover:text-teal-600" />
                                                        )}
                                                    </Link>
                                                    {getStatusBadge(job)}
                                                    {job.isFeatured && (
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800">
                                                            Featured
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Stats */}
                                                <div className="flex flex-wrap items-center gap-4 text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
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

                                                {/* Dates + Invoice */}
                                                <div className="flex flex-wrap items-center gap-4 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                                    <span>Posted {formatDate(job.createdAt)}</span>
                                                    {job.expiresAt && (
                                                        <span className={isExpiringSoon(job) ? 'text-orange-600 font-medium' : ''}>
                                                            {isExpired(job) ? 'Expired' : 'Expires'} {formatDate(job.expiresAt)}
                                                            {isExpiringSoon(job) && ' ⚠️'}
                                                        </span>
                                                    )}
                                                    {config.isPaidPostingEnabled && job.paymentStatus === 'paid' && dashboardToken && (
                                                        <a
                                                            href={`/api/employer/invoice?jobId=${job.id}&token=${dashboardToken}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-teal-600 hover:text-teal-800 hover:underline"
                                                        >
                                                            Download Invoice
                                                        </a>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex items-center gap-2 mt-4 lg:mt-0">
                                                <Link
                                                    href={`/jobs/edit/${job.editToken}`}
                                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors"
                                                    style={{ color: 'var(--text-primary)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)' }}
                                                >
                                                    <Edit size={16} />
                                                    Edit
                                                </Link>
                                                {!job.isFeatured && job.isPublished && !isExpired(job) && (
                                                    <button
                                                        onClick={() => handleUpgradeClick(job)}
                                                        disabled={upgradingJobId === job.id}
                                                        className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-600 to-purple-600 text-white rounded-lg font-medium hover:from-teal-700 hover:to-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        <Shield size={16} />
                                                        {upgradingJobId === job.id ? 'Processing...' : (config.isPaidPostingEnabled ? 'Upgrade - $100' : 'Upgrade - Free')}
                                                    </button>
                                                )}
                                                {shouldShowRenew(job) && (
                                                    <button
                                                        onClick={() => handleRenewClick(job)}
                                                        disabled={renewingJobId === job.id}
                                                        className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        <RefreshCw size={16} className={renewingJobId === job.id ? 'animate-spin' : ''} />
                                                        {renewingJobId === job.id ? 'Processing...' : (config.isPaidPostingEnabled ? 'Renew - $199' : 'Renew - Free')}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Newsletter Opt-in — session access only */}
                        {!isTokenAccess && newsletterChecked && (
                            <div
                                className="mt-8 rounded-lg p-6 flex items-center justify-between gap-4 flex-wrap"
                                style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
                            >
                                <div className="flex items-center gap-4">
                                    <div
                                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                                        style={{ background: 'rgba(20,184,166,0.1)' }}
                                    >
                                        <Mail size={20} style={{ color: '#14B8A6' }} />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                                            Employer Newsletter
                                        </h3>
                                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                            Get hiring tips, salary benchmarks & PMHNP market insights
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleNewsletterToggle}
                                    disabled={newsletterLoading}
                                    style={{
                                        position: 'relative',
                                        width: '44px', height: '24px',
                                        borderRadius: '12px',
                                        background: newsletterOptIn ? '#14B8A6' : 'var(--bg-tertiary)',
                                        border: '1px solid',
                                        borderColor: newsletterOptIn ? '#14B8A6' : 'var(--border-color)',
                                        cursor: 'pointer', transition: 'all 0.2s',
                                        flexShrink: 0,
                                    }}
                                >
                                    <div style={{
                                        position: 'absolute', top: '2px', left: newsletterOptIn ? '22px' : '2px',
                                        width: '18px', height: '18px', borderRadius: '50%',
                                        background: '#fff',
                                        transition: 'all 0.2s',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                                    }} />
                                </button>
                            </div>
                        )}

                        {/* Footer */}
                        <div className="mt-12 pt-6 flex justify-between items-center text-sm" style={{ borderTop: '1px solid var(--border-color)', color: 'var(--text-tertiary)' }}>
                            <div>
                                &copy; {new Date().getFullYear()} PMHNP Hiring.
                            </div>
                            <div>
                                <Link href="/contact" className="hover:text-gray-900 mr-4">Contact Support</Link>
                                {!isTokenAccess && (
                                    <form action="/auth/signout" method="post" className="inline-block">
                                        <button type="submit" className="text-red-600 hover:text-red-800 font-medium">
                                            Sign Out
                                        </button>
                                    </form>
                                )}
                            </div>
                        </div>
                    </>
                )}

                {/* Renewal Modal */}
                {showRenewModal && selectedJob && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                        <div className="rounded-lg shadow-xl max-w-md w-full p-6 animate-fade-in-up" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                            <div className="mb-4">
                                <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Renew Job Posting</h3>
                                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{selectedJob.title}</p>
                            </div>

                            <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
                                {config.isPaidPostingEnabled
                                    ? 'Choose how you\'d like to renew your listing:'
                                    : 'Choose your renewal option (free during launch period):'}
                            </p>

                            <div className="space-y-3 mb-6">
                                {/* Standard Option */}
                                <button
                                    onClick={() => handleRenewCheckout('standard')}
                                    className="w-full text-left border-2 border-gray-300 rounded-lg p-4 hover:border-teal-500 hover:bg-teal-50 transition-all group"
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="font-semibold text-gray-900 group-hover:text-teal-700">Standard Renewal</span>
                                        <span className="text-2xl font-bold text-gray-900 group-hover:text-teal-700">
                                            {config.isPaidPostingEnabled ? '$199' : 'FREE'}
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
                                    className="w-full text-left border-2 border-teal-500 bg-teal-50 rounded-lg p-4 hover:bg-teal-100 transition-all group relative"
                                >
                                    <div className="absolute top-2 right-2">
                                        <span className="bg-teal-600 text-white text-xs font-bold px-2 py-1 rounded">
                                            RECOMMENDED
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="font-semibold text-teal-900">Featured Renewal</span>
                                        <span className="text-2xl font-bold text-teal-900">
                                            {config.isPaidPostingEnabled ? '$299' : 'FREE'}
                                        </span>
                                    </div>
                                    <ul className="text-sm text-teal-800 space-y-1">
                                        <li>✓ 60 days of visibility</li>
                                        <li>✓ <strong>Top placement</strong></li>
                                        <li>✓ <strong>2x more visibility</strong></li>
                                        <li>✓ <strong>Candidate database access</strong></li>
                                    </ul>
                                </button>
                            </div>

                            {/* Cancel Button */}
                            <button
                                onClick={() => {
                                    setShowRenewModal(false);
                                    setSelectedJob(null);
                                }}
                                className="w-full px-4 py-2 rounded-lg font-medium transition-colors"
                                style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
