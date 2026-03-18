'use client';

import { useState, useEffect } from 'react';
import { X, Send, Loader2, CheckCircle, AlertCircle, Mail } from 'lucide-react';

interface ComposeMessageModalProps {
    recipientId: string;
    recipientName: string;
    /** Pre-fill the job context (from applicants tab) */
    jobId?: string;
    jobTitle?: string;
    onClose: () => void;
    onSent?: () => void;
}

export default function ComposeMessageModal({
    recipientId,
    recipientName,
    jobId: initialJobId,
    jobTitle: initialJobTitle,
    onClose,
    onSent,
}: ComposeMessageModalProps) {
    const [subject, setSubject] = useState(
        initialJobTitle ? `Regarding: ${initialJobTitle}` : ''
    );
    const [body, setBody] = useState('');
    const [sending, setSending] = useState(false);
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [inmailUsage, setInmailUsage] = useState<{ used: number; limit: number | null; unlimited: boolean } | null>(null);

    // Fetch InMail usage on mount
    useEffect(() => {
        fetch('/api/employer/usage')
            .then(r => r.ok ? r.json() : null)
            .then(d => {
                if (d?.usage?.inmails) setInmailUsage(d.usage.inmails);
            })
            .catch(() => {});
    }, []);

    const inmailLimitReached = inmailUsage && !inmailUsage.unlimited && inmailUsage.limit !== null && inmailUsage.used >= inmailUsage.limit;
    const inmailRemaining = inmailUsage && !inmailUsage.unlimited && inmailUsage.limit !== null ? inmailUsage.limit - inmailUsage.used : null;

    const handleSend = async () => {
        if (!subject.trim() || !body.trim()) return;

        setSending(true);
        setStatus('idle');
        setErrorMsg('');

        try {
            const res = await fetch('/api/employer/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipientId,
                    subject: subject.trim(),
                    body: body.trim(),
                    ...(initialJobId && { jobId: initialJobId }),
                }),
            });

            if (!res.ok) {
                const text = await res.text();
                let msg = 'Failed to send message';
                try { msg = JSON.parse(text).error || msg; } catch { /* */ }
                setErrorMsg(msg);
                setStatus('error');
                return;
            }

            setStatus('success');
            setTimeout(() => {
                onSent?.();
                onClose();
            }, 1500);
        } catch {
            setErrorMsg('Network error. Please try again.');
            setStatus('error');
        } finally {
            setSending(false);
        }
    };

    const canSend = subject.trim().length > 0 && body.trim().length > 0 && !sending && !inmailLimitReached;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div
                className="w-full max-w-lg rounded-2xl shadow-2xl animate-fade-in-up"
                style={{ backgroundColor: 'var(--bg-secondary)' }}
            >
                {/* Header */}
                <div
                    className="flex items-center justify-between px-6 py-4"
                    style={{ borderBottom: '1px solid var(--border-color)' }}
                >
                    <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                        New Message
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg transition-colors hover:bg-gray-100"
                        style={{ color: 'var(--text-tertiary)' }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5 space-y-4">
                    {/* To */}
                    <div>
                        <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                            To
                        </label>
                        <div
                            className="px-3 py-2.5 rounded-lg text-sm font-medium"
                            style={{
                                backgroundColor: 'var(--bg-tertiary)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--border-color)',
                            }}
                        >
                            {recipientName}
                        </div>
                    </div>

                    {/* Job Context Badge */}
                    {initialJobTitle && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-medium px-2.5 py-1 rounded-full" style={{
                                backgroundColor: 'rgba(45,212,191,0.1)',
                                color: '#2DD4BF',
                                border: '1px solid rgba(45,212,191,0.2)',
                            }}>
                                Re: {initialJobTitle}
                            </span>
                        </div>
                    )}

                    {/* InMail Usage Indicator */}
                    {inmailUsage && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{
                            backgroundColor: inmailLimitReached ? 'rgba(239,68,68,0.08)' : 'rgba(96,165,250,0.08)',
                            border: `1px solid ${inmailLimitReached ? 'rgba(239,68,68,0.2)' : 'rgba(96,165,250,0.15)'}`,
                        }}>
                            <Mail size={14} style={{ color: inmailLimitReached ? '#EF4444' : '#60A5FA' }} />
                            <span className="text-xs font-medium" style={{ color: inmailLimitReached ? '#EF4444' : '#60A5FA' }}>
                                {inmailLimitReached
                                    ? 'InMail limit reached — upgrade for unlimited'
                                    : inmailUsage.unlimited
                                        ? 'Unlimited InMails (Premium)'
                                        : `${inmailRemaining} InMail${inmailRemaining !== 1 ? 's' : ''} remaining`
                                }
                            </span>
                        </div>
                    )}

                    {/* Subject */}
                    <div>
                        <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                            Subject
                        </label>
                        <input
                            type="text"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            placeholder="Enter subject..."
                            className="w-full px-3 py-2.5 rounded-lg text-sm"
                            style={{
                                backgroundColor: 'var(--bg-primary)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--border-color)',
                                outline: 'none',
                            }}
                        />
                    </div>

                    {/* Body */}
                    <div>
                        <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                            Message
                        </label>
                        <textarea
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            placeholder="Write your message..."
                            rows={6}
                            className="w-full px-3 py-2.5 rounded-lg text-sm resize-none"
                            style={{
                                backgroundColor: 'var(--bg-primary)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--border-color)',
                                outline: 'none',
                                lineHeight: 1.7,
                            }}
                        />
                        <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                            {body.length}/2000 characters
                        </p>
                    </div>

                    {/* Status Feedback */}
                    {status === 'success' && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(16,185,129,0.1)' }}>
                            <CheckCircle size={16} style={{ color: '#10B981' }} />
                            <span className="text-sm font-medium" style={{ color: '#10B981' }}>
                                Message sent successfully! The candidate will also receive an email notification.
                            </span>
                        </div>
                    )}
                    {status === 'error' && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(239,68,68,0.1)' }}>
                            <AlertCircle size={16} style={{ color: '#EF4444' }} />
                            <span className="text-sm font-medium" style={{ color: '#EF4444' }}>
                                {errorMsg}
                            </span>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div
                    className="flex items-center justify-end gap-3 px-6 py-4"
                    style={{ borderTop: '1px solid var(--border-color)' }}
                >
                    <button
                        onClick={onClose}
                        className="px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                        style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSend}
                        disabled={!canSend}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                            background: canSend
                                ? 'linear-gradient(135deg, #14B8A6, #0D9488)'
                                : 'var(--bg-tertiary)',
                        }}
                    >
                        {sending ? (
                            <><Loader2 size={16} className="animate-spin" /> Sending...</>
                        ) : (
                            <><Send size={16} /> Send Message</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
