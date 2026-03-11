'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ChevronDown, User, Clock, FileText, X, Mail, Download, Eye, EyeOff, CheckSquare, Square } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import ComposeMessageModal from './ComposeMessageModal';

const STATUSES = [
    { value: 'applied', label: 'Applied', color: '#6B7280', bg: '#F3F4F6' },
    { value: 'screening', label: 'Screening', color: '#D97706', bg: '#FEF3C7' },
    { value: 'interview', label: 'Interview', color: '#2563EB', bg: '#DBEAFE' },
    { value: 'offered', label: 'Offered', color: '#7C3AED', bg: '#EDE9FE' },
    { value: 'hired', label: 'Hired', color: '#059669', bg: '#D1FAE5' },
    { value: 'rejected', label: 'Rejected', color: '#DC2626', bg: '#FEE2E2' },
    { value: 'withdrawn', label: 'Withdrawn', color: '#9CA3AF', bg: '#F3F4F6' },
] as const;

interface Applicant {
    id: string;
    status: string;
    notes: string | null;
    coverLetter: string | null;
    coverLetterUrl: string | null;
    resumeUrl: string | null;
    appliedAt: string;
    statusUpdatedAt: string | null;
    candidate: {
        id: string;
        name: string;
        initials: string;
        avatarUrl: string | null;
        headline: string | null;
        yearsExperience: number | null;
        certifications: string | null;
        licenseStates: string | null;
    };
    job: {
        id: string;
        title: string;
        isFeatured: boolean;
    };
}

interface JobOption {
    id: string;
    title: string;
}

export default function ApplicantsTab() {
    const [applicants, setApplicants] = useState<Applicant[]>([]);
    const [jobs, setJobs] = useState<JobOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('all');
    const [jobFilter, setJobFilter] = useState('all');
    const [editingNotes, setEditingNotes] = useState<string | null>(null);
    const [notesValue, setNotesValue] = useState('');
    const [messagingApplicant, setMessagingApplicant] = useState<Applicant | null>(null);
    const [expandedCoverLetter, setExpandedCoverLetter] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name' | 'status'>('newest');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkUpdating, setBulkUpdating] = useState(false);

    const fetchApplicants = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (statusFilter !== 'all') params.set('status', statusFilter);
            if (jobFilter !== 'all') params.set('jobId', jobFilter);

            const res = await fetch(`/api/employer/applicants?${params}`);
            if (!res.ok) { setApplicants([]); setJobs([]); return; }
            const text = await res.text();
            if (!text) { setApplicants([]); setJobs([]); return; }
            const data = JSON.parse(text);
            setApplicants(data.applicants || []);
            setJobs(data.jobs || []);
        } catch (err) {
            console.error('Error fetching applicants:', err);
            setApplicants([]);
            setJobs([]);
        } finally {
            setLoading(false);
        }
    }, [statusFilter, jobFilter]);

    useEffect(() => {
        fetchApplicants();
    }, [fetchApplicants]);

    const handleStatusChange = async (applicationId: string, newStatus: string) => {
        try {
            const res = await fetch('/api/employer/applicants', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ applicationId, status: newStatus }),
            });

            if (res.ok) {
                setApplicants(prev =>
                    prev.map(a => a.id === applicationId
                        ? { ...a, status: newStatus, statusUpdatedAt: new Date().toISOString() }
                        : a
                    )
                );
            }
        } catch (err) {
            console.error('Error updating status:', err);
        }
    };

    const handleSaveNotes = async (applicationId: string) => {
        try {
            const res = await fetch('/api/employer/applicants', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ applicationId, notes: notesValue }),
            });

            if (res.ok) {
                setApplicants(prev =>
                    prev.map(a => a.id === applicationId
                        ? { ...a, notes: notesValue }
                        : a
                    )
                );
                setEditingNotes(null);
            }
        } catch (err) {
            console.error('Error saving notes:', err);
        }
    };

    const getStatusInfo = (status: string) => {
        return STATUSES.find(s => s.value === status) || STATUSES[0];
    };

    // Bulk status change
    const handleBulkStatusChange = async (newStatus: string) => {
        if (selectedIds.size === 0) return;
        setBulkUpdating(true);
        try {
            await Promise.all(
                Array.from(selectedIds).map(id => handleStatusChange(id, newStatus))
            );
            setSelectedIds(new Set());
        } finally {
            setBulkUpdating(false);
        }
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === applicants.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(applicants.map(a => a.id)));
        }
    };

    // CSV export
    const handleExportCsv = () => {
        const rows = applicants.map(app => ({
            Name: app.candidate.name,
            Job: app.job.title,
            Status: getStatusInfo(app.status).label,
            'Applied Date': new Date(app.appliedAt).toLocaleDateString(),
            'Cover Letter': app.coverLetter?.replace(/[\n\r]+/g, ' ') || '',
            'Has Resume': app.resumeUrl ? 'Yes' : 'No',
            'Has Cover Letter PDF': app.coverLetterUrl ? 'Yes' : 'No',
        }));
        const headers = Object.keys(rows[0] || {});
        const csv = [
            headers.join(','),
            ...rows.map(r => headers.map(h => `"${(r as Record<string, string>)[h] || ''}"`).join(','))
        ].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `applicants-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Group applicants by status for summary
    const statusCounts = STATUSES.reduce((acc, s) => {
        acc[s.value] = applicants.filter(a => a.status === s.value).length;
        return acc;
    }, {} as Record<string, number>);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
            </div>
        );
    }

    return (
        <>
            <div>
                {/* Pipeline Summary */}
                <div className="flex flex-wrap gap-2 mb-6">
                    {STATUSES.map(s => (
                        <button
                            key={s.value}
                            onClick={() => setStatusFilter(statusFilter === s.value ? 'all' : s.value)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all"
                            style={{
                                backgroundColor: statusFilter === s.value ? s.color : s.bg,
                                color: statusFilter === s.value ? '#fff' : s.color,
                                border: `1.5px solid ${s.color}`,
                                opacity: statusCounts[s.value] === 0 ? 0.5 : 1,
                            }}
                        >
                            {s.label}
                            <span className="font-bold">{statusCounts[s.value]}</span>
                        </button>
                    ))}
                </div>

                {/* Filters & Sorting */}
                <div className="flex flex-wrap gap-3 mb-4">
                    {jobs.length > 1 && (
                        <select
                            value={jobFilter}
                            onChange={(e) => setJobFilter(e.target.value)}
                            className="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                            style={{
                                backgroundColor: 'var(--bg-tertiary)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--border-color)',
                            }}
                        >
                            <option value="all">All Jobs</option>
                            {jobs.map(j => (
                                <option key={j.id} value={j.id}>{j.title}</option>
                            ))}
                        </select>
                    )}
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                        className="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                        style={{
                            backgroundColor: 'var(--bg-tertiary)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-color)',
                        }}
                    >
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                        <option value="name">Name A-Z</option>
                        <option value="status">By Status</option>
                    </select>

                    {/* Export CSV button */}
                    {applicants.length > 0 && (
                        <button
                            onClick={handleExportCsv}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                            style={{
                                backgroundColor: 'var(--bg-tertiary)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--border-color)',
                            }}
                        >
                            <Download size={14} /> Export CSV
                        </button>
                    )}
                </div>

                {/* Bulk Actions Bar */}
                {selectedIds.size > 0 && (
                    <div className="flex items-center gap-3 mb-4 p-3 rounded-lg" style={{ backgroundColor: 'rgba(20,184,166,0.08)', border: '1px solid rgba(20,184,166,0.3)' }}>
                        <span className="text-sm font-medium" style={{ color: '#14B8A6' }}>{selectedIds.size} selected</span>
                        <select
                            onChange={(e) => { if (e.target.value) handleBulkStatusChange(e.target.value); e.target.value = ''; }}
                            disabled={bulkUpdating}
                            className="px-3 py-1.5 rounded-lg text-sm font-medium"
                            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
                            defaultValue=""
                        >
                            <option value="" disabled>Change status to...</option>
                            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                        <button onClick={() => setSelectedIds(new Set())} className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Clear</button>
                    </div>
                )}

                {/* Sort applicants */}
                {(() => {
                    const sorted = [...applicants].sort((a, b) => {
                        switch (sortBy) {
                            case 'oldest':
                                return new Date(a.appliedAt).getTime() - new Date(b.appliedAt).getTime();
                            case 'name':
                                return a.candidate.name.localeCompare(b.candidate.name);
                            case 'status': {
                                const statusOrder: string[] = STATUSES.map(s => s.value);
                                return statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status);
                            }
                            default: // newest
                                return new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime();
                        }
                    });
                    // Re-assign for the list below
                    applicants.splice(0, applicants.length, ...sorted);
                    return null;
                })()}

                {/* Applicants List */}
                {applicants.length === 0 ? (
                    <div className="text-center py-12 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                        <User size={40} className="mx-auto mb-3" style={{ color: 'var(--text-tertiary)' }} />
                        <p className="text-lg font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                            No applicants {statusFilter !== 'all' ? `with status "${getStatusInfo(statusFilter).label}"` : 'yet'}
                        </p>
                        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                            Applicants will appear here when candidates apply to your jobs.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {/* Select All */}
                        <div className="flex items-center gap-2 px-2 pb-1">
                            <button onClick={toggleSelectAll} className="p-0.5" style={{ color: 'var(--text-tertiary)' }}>
                                {selectedIds.size === applicants.length && applicants.length > 0 ? <CheckSquare size={16} /> : <Square size={16} />}
                            </button>
                            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Select all</span>
                        </div>
                        {applicants.map(app => {
                            const statusInfo = getStatusInfo(app.status);
                            return (
                                <div
                                    key={app.id}
                                    className="rounded-lg p-5 transition-shadow hover:shadow-md"
                                    style={{
                                        backgroundColor: 'var(--bg-secondary)',
                                        border: selectedIds.has(app.id) ? '1.5px solid #14B8A6' : '1px solid var(--border-color)',
                                    }}
                                >
                                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                                        {/* Candidate Info */}
                                        <div className="flex items-start gap-3 flex-1 min-w-0">
                                            {/* Select Checkbox */}
                                            <button
                                                onClick={() => toggleSelect(app.id)}
                                                className="flex-shrink-0 mt-1"
                                                style={{ color: selectedIds.has(app.id) ? '#14B8A6' : 'var(--text-tertiary)' }}
                                            >
                                                {selectedIds.has(app.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                                            </button>
                                            {/* Avatar */}
                                            <div
                                                className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                                                style={{
                                                    background: app.candidate.avatarUrl
                                                        ? `url(${app.candidate.avatarUrl}) center/cover`
                                                        : 'linear-gradient(135deg, #2DD4BF, #0D9488)',
                                                    color: '#fff',
                                                }}
                                            >
                                                {!app.candidate.avatarUrl && app.candidate.initials}
                                            </div>

                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                                    <Link
                                                        href={`/employer/candidates/${app.candidate.id}`}
                                                        className="font-semibold hover:text-teal-600 transition-colors"
                                                        style={{ color: 'var(--text-primary)' }}
                                                    >
                                                        {app.candidate.name}
                                                    </Link>
                                                    <span
                                                        className="px-2 py-0.5 rounded-full text-xs font-semibold"
                                                        style={{ backgroundColor: statusInfo.bg, color: statusInfo.color }}
                                                    >
                                                        {statusInfo.label}
                                                    </span>
                                                </div>

                                                {app.candidate.headline && (
                                                    <p className="text-sm mb-1 truncate" style={{ color: 'var(--text-secondary)' }}>
                                                        {app.candidate.headline}
                                                    </p>
                                                )}

                                                <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                                    <span className="flex items-center gap-1">
                                                        <Clock size={12} />
                                                        Applied {formatDate(app.appliedAt)}
                                                    </span>
                                                    <span>for {app.job.title}</span>
                                                    {app.candidate.yearsExperience && (
                                                        <span>{app.candidate.yearsExperience}+ yrs exp</span>
                                                    )}
                                                </div>

                                                {/* Notes */}
                                                {editingNotes === app.id ? (
                                                    <div className="mt-3 flex gap-2">
                                                        <input
                                                            type="text"
                                                            value={notesValue}
                                                            onChange={(e) => setNotesValue(e.target.value)}
                                                            placeholder="Add private notes..."
                                                            className="flex-1 px-3 py-1.5 rounded-lg text-sm"
                                                            style={{
                                                                backgroundColor: 'var(--bg-primary)',
                                                                border: '1px solid var(--border-color)',
                                                                color: 'var(--text-primary)',
                                                            }}
                                                            autoFocus
                                                        />
                                                        <button
                                                            onClick={() => handleSaveNotes(app.id)}
                                                            className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700"
                                                        >
                                                            Save
                                                        </button>
                                                        <button
                                                            onClick={() => setEditingNotes(null)}
                                                            className="p-1.5 rounded-lg hover:bg-gray-100"
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => { setEditingNotes(app.id); setNotesValue(app.notes || ''); }}
                                                        className="mt-2 flex items-center gap-1 text-xs hover:text-teal-600 transition-colors"
                                                        style={{ color: app.notes ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}
                                                    >
                                                        <FileText size={12} />
                                                        {app.notes || 'Add notes'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Resume & Cover Letter Section */}
                                        {(app.resumeUrl || app.coverLetter) && (
                                            <div
                                                className="mt-3 pt-3 flex flex-wrap items-center gap-2"
                                                style={{ borderTop: '1px solid var(--border-color)' }}
                                            >
                                                {app.resumeUrl && (
                                                    <a
                                                        href={app.resumeUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-teal-50"
                                                        style={{
                                                            backgroundColor: 'rgba(13,148,136,0.08)',
                                                            color: '#0d9488',
                                                            border: '1px solid rgba(13,148,136,0.2)',
                                                        }}
                                                    >
                                                        <Download size={12} />
                                                        View Resume
                                                    </a>
                                                )}
                                                {app.coverLetter && (
                                                    <button
                                                        onClick={() => setExpandedCoverLetter(
                                                            expandedCoverLetter === app.id ? null : app.id
                                                        )}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-blue-50"
                                                        style={{
                                                            backgroundColor: 'rgba(37,99,235,0.08)',
                                                            color: '#2563EB',
                                                            border: '1px solid rgba(37,99,235,0.2)',
                                                        }}
                                                    >
                                                        {expandedCoverLetter === app.id ? <EyeOff size={12} /> : <Eye size={12} />}
                                                        {expandedCoverLetter === app.id ? 'Hide' : 'View'} Cover Letter
                                                    </button>
                                                )}
                                                {app.coverLetterUrl && (
                                                    <a
                                                        href={app.coverLetterUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-blue-50"
                                                        style={{
                                                            backgroundColor: 'rgba(37,99,235,0.08)',
                                                            color: '#2563EB',
                                                            border: '1px solid rgba(37,99,235,0.2)',
                                                        }}
                                                    >
                                                        <Download size={12} /> Cover Letter PDF
                                                    </a>
                                                )}
                                            </div>
                                        )}

                                        {/* Expanded Cover Letter */}
                                        {expandedCoverLetter === app.id && app.coverLetter && (
                                            <div
                                                className="mt-3 p-4 rounded-lg text-sm whitespace-pre-wrap"
                                                style={{
                                                    backgroundColor: 'var(--bg-tertiary)',
                                                    color: 'var(--text-secondary)',
                                                    border: '1px solid var(--border-color)',
                                                    maxHeight: '200px',
                                                    overflowY: 'auto',
                                                    lineHeight: '1.6',
                                                }}
                                            >
                                                {app.coverLetter}
                                            </div>
                                        )}

                                        {/* Actions */}
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            {/* Message Button — featured posts only */}
                                            {app.job.isFeatured && (
                                                <button
                                                    onClick={() => setMessagingApplicant(app)}
                                                    className="p-2 rounded-lg transition-colors hover:bg-teal-50"
                                                    title={`Message ${app.candidate.name}`}
                                                    style={{ color: '#14B8A6' }}
                                                >
                                                    <Mail size={18} />
                                                </button>
                                            )}

                                            {/* Status Dropdown */}
                                            <div className="relative">
                                                <select
                                                    value={app.status}
                                                    onChange={(e) => handleStatusChange(app.id, e.target.value)}
                                                    className="appearance-none pl-3 pr-8 py-2 rounded-lg text-sm font-medium cursor-pointer"
                                                    style={{
                                                        backgroundColor: statusInfo.bg,
                                                        color: statusInfo.color,
                                                        border: `1.5px solid ${statusInfo.color}`,
                                                    }}
                                                >
                                                    {STATUSES.map(s => (
                                                        <option key={s.value} value={s.value}>{s.label}</option>
                                                    ))}
                                                </select>
                                                <ChevronDown
                                                    size={14}
                                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                                                    style={{ color: statusInfo.color }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )
                }
            </div>

            {/* Compose Message Modal */}
            {messagingApplicant && (
                <ComposeMessageModal
                    recipientId={messagingApplicant.candidate.id}
                    recipientName={messagingApplicant.candidate.name}
                    jobId={messagingApplicant.job.id}
                    jobTitle={messagingApplicant.job.title}
                    onClose={() => setMessagingApplicant(null)}
                    onSent={() => setMessagingApplicant(null)}
                />
            )}
        </>
    );
}
