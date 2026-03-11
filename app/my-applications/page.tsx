'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Briefcase, Clock, ChevronRight, AlertCircle, Loader2, Trash2 } from 'lucide-react';

interface Application {
    id: string;
    appliedAt: string;
    status: string;
    coverLetter: string | null;
    resumeUrl: string | null;
    withdrawnAt: string | null;
    job: {
        id: string;
        title: string;
        slug: string | null;
        employer: string;
        location: string;
        jobType: string | null;
        mode: string | null;
        displaySalary: string | null;
        isPublished: boolean;
    };
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    applied: { label: 'Applied', color: '#6B7280', bg: '#F3F4F6' },
    screening: { label: 'Screening', color: '#D97706', bg: '#FEF3C7' },
    interview: { label: 'Interview', color: '#2563EB', bg: '#DBEAFE' },
    offered: { label: 'Offered', color: '#7C3AED', bg: '#EDE9FE' },
    hired: { label: 'Hired', color: '#059669', bg: '#D1FAE5' },
    rejected: { label: 'Not Selected', color: '#DC2626', bg: '#FEE2E2' },
    withdrawn: { label: 'Withdrawn', color: '#9CA3AF', bg: '#F3F4F6' },
};

function formatDate(date: string) {
    return new Date(date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

export default function MyApplicationsPage() {
    const [applications, setApplications] = useState<Application[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [withdrawing, setWithdrawing] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/applications')
            .then(r => {
                if (!r.ok) throw new Error('Failed to load');
                return r.json();
            })
            .then(data => setApplications(data))
            .catch(() => setError('Please sign in to view your applications.'))
            .finally(() => setLoading(false));
    }, []);

    const handleWithdraw = async (applicationId: string, jobId: string) => {
        if (!confirm('Are you sure you want to withdraw this application? Your personal data will be removed.')) return;
        setWithdrawing(applicationId);
        try {
            const res = await fetch('/api/applications/withdraw', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId }),
            });
            if (res.ok) {
                setApplications(prev =>
                    prev.map(a => a.id === applicationId
                        ? { ...a, status: 'withdrawn', withdrawnAt: new Date().toISOString() }
                        : a
                    )
                );
            }
        } catch {
            // Silently fail
        } finally {
            setWithdrawing(null);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
                <Loader2 size={32} className="animate-spin" style={{ color: '#0d9488' }} />
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen py-16 px-4" style={{ backgroundColor: 'var(--bg-primary)' }}>
                <div className="max-w-2xl mx-auto text-center">
                    <AlertCircle size={48} className="mx-auto mb-4" style={{ color: '#ef4444' }} />
                    <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                        Sign in required
                    </h1>
                    <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>{error}</p>
                    <Link
                        href="/login?redirectTo=/my-applications"
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white transition-all"
                        style={{ background: 'linear-gradient(135deg, #0d9488, #0f766e)' }}
                    >
                        Sign In
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: 'var(--bg-primary)' }}>
            <div className="max-w-3xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                        My Applications
                    </h1>
                    <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>
                        Track and manage your job applications
                    </p>
                </div>

                {/* Empty State */}
                {applications.length === 0 && (
                    <div
                        className="rounded-2xl p-12 text-center"
                        style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
                    >
                        <Briefcase size={48} className="mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
                        <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                            No applications yet
                        </h2>
                        <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
                            Find your next PMHNP role and apply today
                        </p>
                        <Link
                            href="/jobs"
                            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white transition-all"
                            style={{ background: 'linear-gradient(135deg, #0d9488, #0f766e)' }}
                        >
                            Browse Jobs
                        </Link>
                    </div>
                )}

                {/* Applications List */}
                {applications.length > 0 && (
                    <div className="space-y-3">
                        {applications.map(app => {
                            const status = STATUS_CONFIG[app.status] || STATUS_CONFIG.applied;
                            const isWithdrawn = app.status === 'withdrawn';
                            const jobUrl = app.job.slug ? `/jobs/${app.job.slug}` : `/jobs/${app.job.id}`;

                            return (
                                <div
                                    key={app.id}
                                    className="rounded-xl p-5 transition-shadow hover:shadow-md"
                                    style={{
                                        backgroundColor: 'var(--bg-secondary)',
                                        border: '1px solid var(--border-color)',
                                        opacity: isWithdrawn ? 0.6 : 1,
                                    }}
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            {/* Job Title */}
                                            <Link
                                                href={app.job.isPublished ? jobUrl : '#'}
                                                className="group"
                                            >
                                                <h3
                                                    className="text-base font-bold group-hover:text-teal-600 transition-colors truncate"
                                                    style={{ color: 'var(--text-primary)' }}
                                                >
                                                    {app.job.title}
                                                </h3>
                                            </Link>

                                            {/* Employer & Location */}
                                            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                                                {app.job.employer} · {app.job.location}
                                            </p>

                                            {/* Meta */}
                                            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                                <span className="inline-flex items-center gap-1">
                                                    <Clock size={12} />
                                                    Applied {formatDate(app.appliedAt)}
                                                </span>
                                                {app.job.displaySalary && (
                                                    <span>{app.job.displaySalary}</span>
                                                )}
                                                {app.job.mode && (
                                                    <span>{app.job.mode}</span>
                                                )}
                                                {app.coverLetter && (
                                                    <span>Cover letter ✓</span>
                                                )}
                                                {app.resumeUrl && (
                                                    <span>Resume ✓</span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Right: Status + Actions */}
                                        <div className="flex flex-col items-end gap-2 flex-shrink-0">
                                            {/* Status Badge */}
                                            <span
                                                className="text-xs font-semibold px-2.5 py-1 rounded-full"
                                                style={{ color: status.color, backgroundColor: status.bg }}
                                            >
                                                {status.label}
                                            </span>

                                            {/* Actions */}
                                            <div className="flex items-center gap-2">
                                                {!isWithdrawn && (
                                                    <button
                                                        onClick={() => handleWithdraw(app.id, app.job.id)}
                                                        disabled={withdrawing === app.id}
                                                        className="text-xs px-2 py-1 rounded-lg transition-colors hover:bg-red-50"
                                                        style={{ color: '#DC2626' }}
                                                        title="Withdraw application"
                                                    >
                                                        {withdrawing === app.id ? (
                                                            <Loader2 size={12} className="animate-spin" />
                                                        ) : (
                                                            <Trash2 size={12} />
                                                        )}
                                                    </button>
                                                )}
                                                {app.job.isPublished && (
                                                    <Link
                                                        href={jobUrl}
                                                        className="text-xs px-2 py-1 rounded-lg transition-colors"
                                                        style={{ color: '#0d9488' }}
                                                        title="View job"
                                                    >
                                                        <ChevronRight size={14} />
                                                    </Link>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Summary */}
                {applications.length > 0 && (
                    <p className="text-center text-xs mt-8" style={{ color: 'var(--text-tertiary)' }}>
                        {applications.length} application{applications.length !== 1 ? 's' : ''} ·
                        {' '}{applications.filter(a => a.status === 'interview').length} in interview ·
                        {' '}{applications.filter(a => a.status === 'offered' || a.status === 'hired').length} offers
                    </p>
                )}
            </div>
        </div>
    );
}
