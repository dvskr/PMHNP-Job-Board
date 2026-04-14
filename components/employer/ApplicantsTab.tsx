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
    aiMatchScore: number | null;
    aiMatchReasons: string[];
    aiMissingItems: string[];
    screeningAnswers: { questionId: string; questionText: string; answer: string }[] | null;
    candidate: {
        id: string;
        name: string;
        initials: string;
        avatarUrl: string | null;
        headline: string | null;
        yearsExperience: number | null;
        certifications: string | null;
        licenseStates: string | null;
        specialties: string | null;
        bio: string | null;
        skills: string[];
        education: { degreeType: string; fieldOfStudy: string | null; schoolName: string; graduationDate: string | null }[];
        workExperience: { jobTitle: string; employerName: string; startDate: string | null; endDate: string | null; isCurrent: boolean; practiceSetting: string | null }[];
        certificationRecords: { name: string; body: string | null; expirationDate: string | null }[];
        licenses: { type: string; state: string; status: string }[];
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

/* ═══ Clay Design Tokens ═══ */
const cardBase: React.CSSProperties = {
    background: '#FFFFFF',
    borderRadius: '20px',
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
    transition: 'all 0.2s ease',
};

const clayBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '5px',
    padding: '7px 14px', borderRadius: '12px',
    fontSize: '12px', fontWeight: 600,
    border: '1px solid rgba(255,255,255,0.5)',
    boxShadow: '3px 3px 8px rgba(0,0,0,0.05), -2px -2px 6px rgba(255,255,255,0.7), inset 1px 1px 2px rgba(255,255,255,0.6)',
    cursor: 'pointer', transition: 'all 0.2s ease',
    textDecoration: 'none',
};

const recessedPill: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    padding: '6px 14px', borderRadius: '20px',
    fontSize: '12px', fontWeight: 600,
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.06), inset -1px -1px 2px rgba(255,255,255,0.4)',
    cursor: 'pointer', transition: 'all 0.2s ease',
};

const selectBase: React.CSSProperties = {
    ...clayBtn,
    padding: '8px 14px',
    background: '#FFFFFF',
    color: '#374151',
    appearance: 'auto' as const,
    WebkitAppearance: 'auto' as const,
};

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
    const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name' | 'status' | 'aiScore'>('newest');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkUpdating, setBulkUpdating] = useState(false);
    const [expandedInsights, setExpandedInsights] = useState<string | null>(null);
    const [expandedScreening, setExpandedScreening] = useState<string | null>(null);
    const [expandedProfile, setExpandedProfile] = useState<string | null>(null);

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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0' }}>
                <div style={{
                    width: '32px', height: '32px', borderRadius: '50%',
                    border: '3px solid #E5E7EB', borderTopColor: '#0D9488',
                    animation: 'spin 0.8s linear infinite',
                }} />
            </div>
        );
    }

    return (
        <>
            <div>
                {/* Pipeline Summary — Clay Recessed Pills */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
                    {STATUSES.map(s => (
                        <button
                            key={s.value}
                            onClick={() => setStatusFilter(statusFilter === s.value ? 'all' : s.value)}
                            className="app-pipeline-pill"
                            style={{
                                ...recessedPill,
                                backgroundColor: statusFilter === s.value ? s.color : s.bg,
                                color: statusFilter === s.value ? '#fff' : s.color,
                                opacity: statusCounts[s.value] === 0 ? 0.5 : 1,
                                boxShadow: statusFilter === s.value
                                    ? `3px 3px 8px rgba(0,0,0,0.1), inset 2px 2px 4px rgba(0,0,0,0.15), inset -1px -1px 2px rgba(255,255,255,0.2)`
                                    : recessedPill.boxShadow,
                            }}
                        >
                            {s.label}
                            <span style={{ fontWeight: 800 }}>{statusCounts[s.value]}</span>
                        </button>
                    ))}
                </div>

                {/* Filters & Sorting — Clay Controls */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
                    {jobs.length > 1 && (
                        <select
                            value={jobFilter}
                            onChange={(e) => setJobFilter(e.target.value)}
                            style={selectBase}
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
                        style={selectBase}
                    >
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                        <option value="aiScore">AI Score (Highest)</option>
                        <option value="name">Name A-Z</option>
                        <option value="status">By Status</option>
                    </select>

                    {/* Export CSV button */}
                    {applicants.length > 0 && (
                        <button
                            onClick={handleExportCsv}
                            style={{ ...clayBtn, background: '#FFFFFF', color: '#374151' }}
                        >
                            <Download size={13} /> Export CSV
                        </button>
                    )}
                </div>

                {/* Bulk Actions Bar */}
                {selectedIds.size > 0 && (
                    <div style={{
                        ...cardBase, padding: '12px 16px', marginBottom: '16px',
                        display: 'flex', alignItems: 'center', gap: '12px',
                        background: '#F0FDFA', border: '1px solid #99F6E4',
                    }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488' }}>{selectedIds.size} selected</span>
                        <select
                            onChange={(e) => { if (e.target.value) handleBulkStatusChange(e.target.value); e.target.value = ''; }}
                            disabled={bulkUpdating}
                            style={{ ...selectBase, fontSize: '12px', padding: '6px 10px' }}
                            defaultValue=""
                        >
                            <option value="" disabled>Change status to...</option>
                            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                        <button onClick={() => setSelectedIds(new Set())} style={{ fontSize: '12px', color: '#8A9BA6', background: 'none', border: 'none', cursor: 'pointer' }}>Clear</button>
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
                            case 'aiScore':
                                return (b.aiMatchScore ?? -1) - (a.aiMatchScore ?? -1);
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
                    <div style={{
                        ...cardBase, padding: '48px 24px', textAlign: 'center',
                    }}>
                        <User size={36} style={{ color: '#B0BEC5', margin: '0 auto 12px' }} />
                        <p style={{ fontSize: '16px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', margin: '0 0 4px' }}>
                            No applicants {statusFilter !== 'all' ? `with status "${getStatusInfo(statusFilter).label}"` : 'yet'}
                        </p>
                        <p style={{ fontSize: '13px', color: '#8A9BA6', margin: 0 }}>
                            Applicants will appear here when candidates apply to your jobs.
                        </p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {/* Select All */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 8px' }}>
                            <button onClick={toggleSelectAll} style={{ padding: '2px', color: '#8A9BA6', background: 'none', border: 'none', cursor: 'pointer' }}>
                                {selectedIds.size === applicants.length && applicants.length > 0 ? <CheckSquare size={16} /> : <Square size={16} />}
                            </button>
                            <span style={{ fontSize: '12px', color: '#8A9BA6' }}>Select all</span>
                        </div>
                        {applicants.map(app => {
                            const statusInfo = getStatusInfo(app.status);
                            return (
                                <div
                                    key={app.id}
                                    className="app-card"
                                    style={{
                                        ...cardBase,
                                        padding: '20px',
                                        border: selectedIds.has(app.id) ? '1.5px solid #0D9488' : '1px solid rgba(0,0,0,0.06)',
                                    }}
                                >
                                    {/* Row 1: Candidate info + Actions */}
                                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '16px' }}>
                                        {/* Candidate Info */}
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flex: 1, minWidth: 0 }}>
                                            {/* Select Checkbox */}
                                            <button
                                                onClick={() => toggleSelect(app.id)}
                                                style={{ flexShrink: 0, marginTop: '4px', color: selectedIds.has(app.id) ? '#0D9488' : '#B0BEC5', background: 'none', border: 'none', cursor: 'pointer' }}
                                            >
                                                {selectedIds.has(app.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                                            </button>
                                            {/* Avatar — Clay Pebble */}
                                            <div
                                                style={{
                                                    flexShrink: 0, width: '40px', height: '40px', borderRadius: '14px',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: '14px', fontWeight: 700, color: '#fff',
                                                    background: app.candidate.avatarUrl
                                                        ? `url(${app.candidate.avatarUrl}) center/cover`
                                                        : 'linear-gradient(145deg, #0D9488, #10B981)',
                                                    border: '1px solid rgba(255,255,255,0.3)',
                                                    boxShadow: '3px 3px 8px rgba(13,148,136,0.15), -1px -1px 4px rgba(255,255,255,0.5), inset 1px 1px 2px rgba(255,255,255,0.2)',
                                                }}
                                            >
                                                {!app.candidate.avatarUrl && app.candidate.initials}
                                            </div>

                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                                                    <Link
                                                        href={`/employer/candidates/${app.candidate.id}`}
                                                        className="app-name-link"
                                                        style={{ fontSize: '15px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', textDecoration: 'none' }}
                                                    >
                                                        {app.candidate.name}
                                                    </Link>
                                                    <span style={{
                                                        ...recessedPill, padding: '3px 10px', fontSize: '11px',
                                                        backgroundColor: statusInfo.bg, color: statusInfo.color,
                                                    }}>
                                                        {statusInfo.label}
                                                    </span>
                                                    {app.aiMatchScore !== null && (
                                                        <span style={{
                                                            ...recessedPill, padding: '3px 10px', fontSize: '11px', fontWeight: 700,
                                                            backgroundColor:
                                                                app.aiMatchScore >= 80 ? '#D1FAE5' :
                                                                app.aiMatchScore >= 50 ? '#FEF3C7' : '#FEE2E2',
                                                            color:
                                                                app.aiMatchScore >= 80 ? '#059669' :
                                                                app.aiMatchScore >= 50 ? '#D97706' : '#DC2626',
                                                        }}>
                                                            {app.aiMatchScore >= 80 ? '🟢' : app.aiMatchScore >= 50 ? '🟡' : '🔴'} {app.aiMatchScore}% match
                                                        </span>
                                                    )}
                                                </div>

                                                {app.candidate.headline && (
                                                    <p style={{ fontSize: '13px', color: '#6B7F8A', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {app.candidate.headline}
                                                    </p>
                                                )}

                                                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#8A9BA6' }}>
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
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
                                                    <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                                                        <input
                                                            type="text"
                                                            value={notesValue}
                                                            onChange={(e) => setNotesValue(e.target.value)}
                                                            placeholder="Add private notes..."
                                                            style={{
                                                                flex: 1, padding: '8px 12px', borderRadius: '12px',
                                                                fontSize: '13px', color: '#1A2E35',
                                                                background: '#F5F6F8',
                                                                border: '1px solid rgba(0,0,0,0.06)',
                                                                boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.05), inset -1px -1px 2px rgba(255,255,255,0.5)',
                                                            }}
                                                            autoFocus
                                                        />
                                                        <button
                                                            onClick={() => handleSaveNotes(app.id)}
                                                            style={{
                                                                ...clayBtn, background: 'linear-gradient(145deg, #0D9488, #10B981)',
                                                                color: '#fff', border: 'none',
                                                                boxShadow: '3px 3px 8px rgba(13,148,136,0.2), inset 0 1px 0 rgba(255,255,255,0.15)',
                                                            }}
                                                        >
                                                            Save
                                                        </button>
                                                        <button onClick={() => setEditingNotes(null)} style={{ ...clayBtn, background: '#F5F6F8', color: '#8A9BA6', padding: '6px 8px' }}>
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => { setEditingNotes(app.id); setNotesValue(app.notes || ''); }}
                                                        className="app-notes-btn"
                                                        style={{
                                                            marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px',
                                                            fontSize: '12px', color: app.notes ? '#6B7F8A' : '#B0BEC5',
                                                            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                                                        }}
                                                    >
                                                        <FileText size={12} />
                                                        {app.notes || 'Add notes'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Actions — stays pinned right */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                            {/* Message Button — featured posts only */}
                                            {app.job.isFeatured && (
                                                <button
                                                    onClick={() => setMessagingApplicant(app)}
                                                    title={`Message ${app.candidate.name}`}
                                                    className="app-msg-btn"
                                                    style={{
                                                        ...clayBtn, padding: '8px', background: '#F0FDFA', color: '#0D9488',
                                                    }}
                                                >
                                                    <Mail size={16} />
                                                </button>
                                            )}

                                            {/* Status Dropdown — Clay */}
                                            <div style={{ position: 'relative' }}>
                                                <select
                                                    value={app.status}
                                                    onChange={(e) => handleStatusChange(app.id, e.target.value)}
                                                    style={{
                                                        ...recessedPill, padding: '8px 30px 8px 12px',
                                                        backgroundColor: statusInfo.bg, color: statusInfo.color,
                                                        appearance: 'none' as const, WebkitAppearance: 'none' as const,
                                                        cursor: 'pointer', fontWeight: 600,
                                                    }}
                                                >
                                                    {STATUSES.map(s => (
                                                        <option key={s.value} value={s.value}>{s.label}</option>
                                                    ))}
                                                </select>
                                                <ChevronDown
                                                    size={13}
                                                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: statusInfo.color }}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Row 2: Resume & Cover Letter buttons */}
                                    {(app.resumeUrl || app.coverLetter || app.coverLetterUrl) && (
                                        <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid rgba(0,0,0,0.05)', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                            {app.resumeUrl && (
                                                <a
                                                    href={app.resumeUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="app-action-btn"
                                                    style={{ ...clayBtn, background: '#F0FDFA', color: '#0D9488', border: '1px solid #CCFBF1' }}
                                                >
                                                    <Download size={12} /> View Resume
                                                </a>
                                            )}
                                            {app.coverLetter && (
                                                <button
                                                    onClick={() => setExpandedCoverLetter(expandedCoverLetter === app.id ? null : app.id)}
                                                    className="app-action-btn"
                                                    style={{ ...clayBtn, background: '#EEF2FF', color: '#4F46E5', border: '1px solid #C7D2FE' }}
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
                                                    className="app-action-btn"
                                                    style={{ ...clayBtn, background: '#EEF2FF', color: '#4F46E5', border: '1px solid #C7D2FE' }}
                                                >
                                                    <Download size={12} /> Cover Letter PDF
                                                </a>
                                            )}
                                        </div>
                                    )}

                                    {/* Row 3: Expanded Cover Letter */}
                                    {expandedCoverLetter === app.id && app.coverLetter && (
                                        <div style={{
                                            marginTop: '12px', padding: '14px 16px', borderRadius: '14px',
                                            fontSize: '13px', color: '#4A5568', lineHeight: 1.6,
                                            whiteSpace: 'pre-wrap',
                                            background: '#F5F6F8',
                                            border: '1px solid rgba(0,0,0,0.05)',
                                            boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.04), inset -1px -1px 2px rgba(255,255,255,0.5)',
                                            maxHeight: '200px', overflowY: 'auto',
                                        }}>
                                            {app.coverLetter}
                                        </div>
                                    )}

                                    {/* Row 4: AI Insights */}
                                    {(app.aiMatchReasons?.length > 0 || app.aiMissingItems?.length > 0) && (
                                        <>
                                            <button
                                                onClick={() => setExpandedInsights(expandedInsights === app.id ? null : app.id)}
                                                className="app-expand-btn"
                                                style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: '#7C3AED', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                            >
                                                <ChevronDown size={12} style={{ transition: 'transform 0.2s', transform: expandedInsights === app.id ? 'rotate(180deg)' : 'none' }} />
                                                {expandedInsights === app.id ? 'Hide' : 'View'} AI Insights
                                            </button>
                                            {expandedInsights === app.id && (
                                                <div style={{
                                                    marginTop: '8px', padding: '14px', borderRadius: '14px',
                                                    background: '#FAF5FF', border: '1px solid #E9D5FF',
                                                    boxShadow: 'inset 1px 1px 2px rgba(124,58,237,0.04)',
                                                    display: 'flex', flexDirection: 'column', gap: '10px',
                                                }}>
                                                    {app.aiMatchReasons.length > 0 && (
                                                        <div>
                                                            <p style={{ fontSize: '12px', fontWeight: 700, color: '#059669', margin: '0 0 4px' }}>✅ Strengths</p>
                                                            {app.aiMatchReasons.map((r, i) => (
                                                                <p key={i} style={{ fontSize: '12px', color: '#4A5568', margin: '0 0 2px', paddingLeft: '16px' }}>• {r}</p>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {app.aiMissingItems.length > 0 && (
                                                        <div>
                                                            <p style={{ fontSize: '12px', fontWeight: 700, color: '#D97706', margin: '0 0 4px' }}>⚠️ Gaps</p>
                                                            {app.aiMissingItems.map((m, i) => (
                                                                <p key={i} style={{ fontSize: '12px', color: '#4A5568', margin: '0 0 2px', paddingLeft: '16px' }}>• {m}</p>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    )}

                                    {/* Row 5: Screening Answers */}
                                    {app.screeningAnswers && Array.isArray(app.screeningAnswers) && app.screeningAnswers.length > 0 && (
                                        <>
                                            <button
                                                onClick={() => setExpandedScreening(expandedScreening === app.id ? null : app.id)}
                                                className="app-expand-btn"
                                                style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: '#EA580C', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                            >
                                                <ChevronDown size={12} style={{ transition: 'transform 0.2s', transform: expandedScreening === app.id ? 'rotate(180deg)' : 'none' }} />
                                                {expandedScreening === app.id ? 'Hide' : 'View'} Screening Answers ({app.screeningAnswers.length})
                                            </button>
                                            {expandedScreening === app.id && (
                                                <div style={{
                                                    marginTop: '8px', padding: '14px', borderRadius: '14px',
                                                    background: '#FFF7ED', border: '1px solid #FED7AA',
                                                    boxShadow: 'inset 1px 1px 2px rgba(234,88,12,0.04)',
                                                    display: 'flex', flexDirection: 'column', gap: '10px',
                                                }}>
                                                    {(app.screeningAnswers as { questionText: string; answer: string }[]).map((sa, i) => (
                                                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                                            <span style={{ fontSize: '12px', fontWeight: 600, color: '#8A9BA6', flexShrink: 0 }}>Q:</span>
                                                            <div>
                                                                <p style={{ fontSize: '12px', color: '#6B7F8A', margin: 0 }}>{sa.questionText}</p>
                                                                <p style={{ fontSize: '12px', fontWeight: 700, color: '#1A2E35', margin: '2px 0 0' }}>→ {sa.answer || '(no answer)'}</p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}

                                    {/* Row 6: Profile Details */}
                                    {(app.candidate.education?.length > 0 || app.candidate.workExperience?.length > 0 || app.candidate.certificationRecords?.length > 0 || app.candidate.licenses?.length > 0 || app.candidate.specialties || app.candidate.skills?.length > 0) && (
                                        <>
                                            <button
                                                onClick={() => setExpandedProfile(expandedProfile === app.id ? null : app.id)}
                                                className="app-expand-btn"
                                                style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: '#0D9488', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                            >
                                                <ChevronDown size={12} style={{ transition: 'transform 0.2s', transform: expandedProfile === app.id ? 'rotate(180deg)' : 'none' }} />
                                                {expandedProfile === app.id ? 'Hide' : 'View'} Profile Details
                                            </button>
                                            {expandedProfile === app.id && (
                                                <div style={{
                                                    marginTop: '8px', padding: '14px', borderRadius: '14px',
                                                    background: '#F5F6F8', border: '1px solid rgba(0,0,0,0.05)',
                                                    boxShadow: 'inset 1px 1px 2px rgba(0,0,0,0.03)',
                                                    display: 'flex', flexDirection: 'column', gap: '12px',
                                                }}>
                                                    {/* Specialties & Skills */}
                                                    {(app.candidate.specialties || app.candidate.skills?.length > 0) && (
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                            {app.candidate.specialties && app.candidate.specialties.split(',').map((s, i) => (
                                                                <span key={`s-${i}`} style={{ ...recessedPill, padding: '3px 10px', fontSize: '11px', background: '#FAF5FF', color: '#7C3AED' }}>{s.trim()}</span>
                                                            ))}
                                                            {app.candidate.skills?.map((s, i) => (
                                                                <span key={`sk-${i}`} style={{ ...recessedPill, padding: '3px 10px', fontSize: '11px', background: '#F5F6F8', color: '#6B7F8A' }}>{s}</span>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* Education */}
                                                    {app.candidate.education?.length > 0 && (
                                                        <div>
                                                            <p style={{ fontSize: '12px', fontWeight: 700, color: '#1A2E35', margin: '0 0 4px' }}>📚 Education</p>
                                                            {app.candidate.education.map((edu, i) => (
                                                                <p key={i} style={{ fontSize: '12px', color: '#6B7F8A', margin: '0 0 2px', paddingLeft: '16px' }}>
                                                                    {edu.degreeType}{edu.fieldOfStudy ? ` in ${edu.fieldOfStudy}` : ''} — {edu.schoolName}
                                                                    {edu.graduationDate && ` (${new Date(edu.graduationDate).getFullYear()})`}
                                                                </p>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* Work Experience */}
                                                    {app.candidate.workExperience?.length > 0 && (
                                                        <div>
                                                            <p style={{ fontSize: '12px', fontWeight: 700, color: '#1A2E35', margin: '0 0 4px' }}>💼 Experience</p>
                                                            {app.candidate.workExperience.map((exp, i) => (
                                                                <p key={i} style={{ fontSize: '12px', color: '#6B7F8A', margin: '0 0 2px', paddingLeft: '16px' }}>
                                                                    {exp.jobTitle} at {exp.employerName}
                                                                    {exp.startDate && ` (${new Date(exp.startDate).getFullYear()} - ${exp.isCurrent ? 'Present' : exp.endDate ? new Date(exp.endDate).getFullYear() : '?'})`}
                                                                    {exp.practiceSetting && ` · ${exp.practiceSetting}`}
                                                                </p>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* Certifications */}
                                                    {app.candidate.certificationRecords?.length > 0 && (
                                                        <div>
                                                            <p style={{ fontSize: '12px', fontWeight: 700, color: '#1A2E35', margin: '0 0 4px' }}>🏅 Certifications</p>
                                                            {app.candidate.certificationRecords.map((cert, i) => (
                                                                <p key={i} style={{ fontSize: '12px', color: '#6B7F8A', margin: '0 0 2px', paddingLeft: '16px' }}>
                                                                    {cert.name}{cert.body ? ` (${cert.body})` : ''}
                                                                    {cert.expirationDate && ` · Exp: ${new Date(cert.expirationDate).toLocaleDateString()}`}
                                                                </p>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* Licenses */}
                                                    {app.candidate.licenses?.length > 0 && (
                                                        <div>
                                                            <p style={{ fontSize: '12px', fontWeight: 700, color: '#1A2E35', margin: '0 0 4px' }}>🔑 Licenses</p>
                                                            {app.candidate.licenses.map((lic, i) => (
                                                                <p key={i} style={{ fontSize: '12px', color: '#6B7F8A', margin: '0 0 2px', paddingLeft: '16px' }}>
                                                                    {lic.type} — {lic.state} ({lic.status})
                                                                </p>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )
                }
            </div>

            {/* Hover Styles */}
            <style>{`
                .app-card:hover {
                    box-shadow: 8px 8px 20px rgba(0,0,0,0.08), -4px -4px 12px rgba(255,255,255,0.9), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02) !important;
                    transform: translateY(-1px);
                }
                .app-name-link:hover { color: #0D9488 !important; }
                .app-notes-btn:hover { color: #0D9488 !important; }
                .app-pipeline-pill:hover { transform: translateY(-1px); }
                .app-action-btn:hover {
                    transform: translateY(-1px);
                    box-shadow: 4px 4px 10px rgba(0,0,0,0.07), -3px -3px 8px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6) !important;
                }
                .app-msg-btn:hover { transform: translateY(-1px); }
                .app-expand-btn:hover { opacity: 0.8; }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>

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
