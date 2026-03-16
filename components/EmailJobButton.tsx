'use client';

import { useState } from 'react';
import { Mail, CheckCircle, Loader2, X } from 'lucide-react';

interface EmailJobButtonProps {
    jobId: string;
    jobTitle: string;
    jobUrl: string;
}

export default function EmailJobButton({ jobId, jobTitle, jobUrl }: EmailJobButtonProps) {
    const [showPopup, setShowPopup] = useState(false);
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle');

    const handleSubmit = async () => {
        const trimmed = email.trim();
        if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return;

        setStatus('loading');
        try {
            await fetch('/api/newsletter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: trimmed,
                    source: 'email_job',
                }),
            });
            // Also send job details email (fire-and-forget)
            fetch('/api/email-job', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: trimmed, jobId, jobTitle, jobUrl }),
            }).catch(() => { });
        } catch { /* silent */ }
        setStatus('done');
        setTimeout(() => {
            setShowPopup(false);
            setStatus('idle');
            setEmail('');
        }, 2000);
    };

    return (
        <>
            <button
                onClick={() => setShowPopup(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
                style={{
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border-color)',
                }}
            >
                <Mail size={16} />
                Email me this job
            </button>

            {showPopup && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div
                        className="fixed inset-0 animate-fade-in"
                        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
                        onClick={() => setShowPopup(false)}
                    />
                    <div className="flex min-h-full items-center justify-center p-4">
                        <div
                            className="relative w-full max-w-sm rounded-2xl p-6 shadow-xl animate-scale-in"
                            style={{
                                backgroundColor: 'var(--bg-secondary)',
                                border: '1px solid var(--border-color)',
                            }}
                        >
                            <button
                                onClick={() => setShowPopup(false)}
                                className="absolute right-4 top-4"
                                style={{ color: 'var(--text-muted)' }}
                            >
                                <X size={18} />
                            </button>

                            {status === 'done' ? (
                                <div className="text-center py-2">
                                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(34,197,94,0.15)' }}>
                                        <CheckCircle size={24} style={{ color: '#22C55E' }} />
                                    </div>
                                    <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Sent!</h3>
                                    <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Check your inbox for job details.</p>
                                </div>
                            ) : (
                                <div className="text-center">
                                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(45,212,191,0.15)' }}>
                                        <Mail size={24} style={{ color: '#2DD4BF' }} />
                                    </div>
                                    <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                                        Email this job to yourself
                                    </h3>
                                    <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
                                        We&apos;ll send you the details for <span className="font-medium">{jobTitle}</span>
                                    </p>
                                    <div className="flex gap-2">
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                                            placeholder="you@example.com"
                                            className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                                            style={{
                                                backgroundColor: 'var(--bg-primary)',
                                                border: '1px solid var(--border-color)',
                                                color: 'var(--text-primary)',
                                            }}
                                            autoFocus
                                        />
                                        <button
                                            onClick={handleSubmit}
                                            disabled={status === 'loading'}
                                            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                                            style={{ background: 'linear-gradient(135deg, #2DD4BF, #14B8A6)' }}
                                        >
                                            {status === 'loading' ? <Loader2 size={16} className="animate-spin" /> : 'Send'}
                                        </button>
                                    </div>
                                    <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
                                        You&apos;ll also get job market updates. Unsubscribe anytime.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
