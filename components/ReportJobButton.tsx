'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Flag, X, CheckCircle, AlertCircle, Loader2, LogIn } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

const REPORT_REASONS = [
    { value: 'expired', label: 'Expired / Closed', icon: '⏰' },
    { value: 'wrong_salary', label: 'Wrong salary', icon: '💰' },
    { value: 'scam', label: 'Scam / Spam', icon: '🚫' },
    { value: 'duplicate', label: 'Duplicate', icon: '📋' },
    { value: 'wrong_info', label: 'Wrong info', icon: '📍' },
    { value: 'other', label: 'Other', icon: '❓' },
];

interface ReportJobButtonProps {
    jobId: string;
    jobTitle: string;
}

export default function ReportJobButton({ jobId, jobTitle }: ReportJobButtonProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedReason, setSelectedReason] = useState('');
    const [details, setDetails] = useState('');
    const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

    useEffect(() => {
        const supabase = createClient();
        supabase.auth.getUser().then(({ data: { user } }) => {
            setIsAuthenticated(!!user);
        });
    }, []);

    const handleSubmit = async () => {
        if (!selectedReason) return;

        setStatus('submitting');
        setErrorMsg('');

        try {
            const res = await fetch('/api/jobs/report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId, reason: selectedReason, details: details.trim() || undefined }),
            });

            const data = await res.json();

            if (res.ok && data.success) {
                setStatus('success');
                setTimeout(() => {
                    setIsOpen(false);
                    setStatus('idle');
                    setSelectedReason('');
                    setDetails('');
                }, 2000);
            } else if (res.status === 401) {
                setStatus('error');
                setErrorMsg('Please sign in to report a job.');
            } else {
                setStatus('error');
                setErrorMsg(data.error || 'Failed to submit report');
            }
        } catch {
            setStatus('error');
            setErrorMsg('Network error. Please try again.');
        }
    };

    return (
        <>
            {/* Trigger Button */}
            <button
                onClick={() => setIsOpen(true)}
                className="inline-flex items-center gap-1.5 text-sm transition-colors"
                style={{ color: 'var(--text-tertiary)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
            >
                <Flag size={14} />
                Report this job
            </button>

            {/* Modal via Portal */}
            {isOpen && createPortal(
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 99999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '16px',
                        backgroundColor: 'rgba(0, 0, 0, 0.6)',
                        backdropFilter: 'blur(4px)',
                    }}
                    onClick={(e) => {
                        if (e.target === e.currentTarget && status !== 'submitting') {
                            setIsOpen(false);
                        }
                    }}
                >
                    {/* Compact Modal */}
                    <div
                        style={{
                            width: '100%',
                            maxWidth: '380px',
                            borderRadius: '16px',
                            padding: '20px',
                            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                            backgroundColor: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)',
                            maxHeight: '90vh',
                            overflowY: 'auto',
                        }}
                    >
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Flag size={16} color="#ef4444" />
                                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                                    Report Job
                                </h3>
                            </div>
                            <button
                                onClick={() => status !== 'submitting' && setIsOpen(false)}
                                style={{ padding: '4px', color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Job Title */}
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {jobTitle}
                        </p>

                        {isAuthenticated === false ? (
                            /* Sign In Prompt */
                            <div style={{ textAlign: 'center', padding: '20px 0' }}>
                                <LogIn size={32} style={{ margin: '0 auto 8px', color: 'var(--color-primary)' }} />
                                <p style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)', margin: '0 0 4px' }}>
                                    Sign in to report
                                </p>
                                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 12px' }}>
                                    Please sign in to submit a report.
                                </p>
                                <Link
                                    href="/login"
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                                        padding: '8px 20px', borderRadius: '10px', fontWeight: 600,
                                        fontSize: '13px', color: '#fff', textDecoration: 'none',
                                        background: 'linear-gradient(135deg, #0D9488, #0F766E)',
                                    }}
                                >
                                    <LogIn size={14} />
                                    Sign In
                                </Link>
                            </div>
                        ) : status === 'success' ? (
                            /* Success State */
                            <div style={{ textAlign: 'center', padding: '20px 0' }}>
                                <CheckCircle size={36} style={{ margin: '0 auto 8px', color: '#22c55e' }} />
                                <p style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)', margin: 0 }}>
                                    Report Submitted
                                </p>
                                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                    Thanks for keeping listings clean.
                                </p>
                            </div>
                        ) : (
                            <>
                                {/* Compact Reason Grid - 2 columns */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '12px' }}>
                                    {REPORT_REASONS.map((reason) => (
                                        <button
                                            key={reason.value}
                                            onClick={() => setSelectedReason(reason.value)}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '6px',
                                                padding: '8px 10px', borderRadius: '10px', cursor: 'pointer',
                                                fontSize: '12px', fontWeight: 500, textAlign: 'left',
                                                backgroundColor: selectedReason === reason.value ? 'var(--bg-tertiary)' : 'transparent',
                                                border: `1px solid ${selectedReason === reason.value ? 'var(--color-primary)' : 'var(--border-color)'}`,
                                                color: 'var(--text-primary)',
                                                transition: 'all 0.15s',
                                            }}
                                        >
                                            <span style={{ fontSize: '14px' }}>{reason.icon}</span>
                                            <span>{reason.label}</span>
                                        </button>
                                    ))}
                                </div>

                                {/* Optional Details - only when reason selected */}
                                {selectedReason && (
                                    <textarea
                                        value={details}
                                        onChange={(e) => setDetails(e.target.value)}
                                        placeholder="Details (optional)"
                                        rows={2}
                                        maxLength={500}
                                        style={{
                                            width: '100%', padding: '8px 10px', borderRadius: '8px',
                                            fontSize: '12px', resize: 'none', marginBottom: '10px',
                                            backgroundColor: 'var(--bg-primary)',
                                            border: '1px solid var(--border-color)',
                                            color: 'var(--text-primary)',
                                            outline: 'none',
                                        }}
                                    />
                                )}

                                {/* Error */}
                                {status === 'error' && (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                        marginBottom: '10px', padding: '8px 10px', borderRadius: '8px',
                                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                        border: '1px solid rgba(239, 68, 68, 0.3)',
                                    }}>
                                        <AlertCircle size={14} color="#ef4444" style={{ flexShrink: 0 }} />
                                        <p style={{ fontSize: '12px', color: '#f87171', margin: 0 }}>{errorMsg}</p>
                                    </div>
                                )}

                                {/* Submit */}
                                <button
                                    onClick={handleSubmit}
                                    disabled={!selectedReason || status === 'submitting'}
                                    style={{
                                        width: '100%', padding: '10px', borderRadius: '10px',
                                        fontWeight: 600, fontSize: '13px', border: 'none', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                        backgroundColor: selectedReason ? '#ef4444' : 'var(--bg-tertiary)',
                                        color: selectedReason ? '#ffffff' : 'var(--text-tertiary)',
                                        opacity: (!selectedReason || status === 'submitting') ? 0.5 : 1,
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    {status === 'submitting' ? (
                                        <>
                                            <Loader2 size={14} className="animate-spin" />
                                            Submitting...
                                        </>
                                    ) : (
                                        'Submit Report'
                                    )}
                                </button>
                            </>
                        )}
                    </div>
                </div>
                , document.body)}
        </>
    );
}
