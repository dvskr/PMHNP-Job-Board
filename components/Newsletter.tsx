'use client';

import { useState, FormEvent } from 'react';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export default function Newsletter() {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        const trimmed = email.trim();
        if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
            setStatus('error');
            setErrorMsg('Please enter a valid email address');
            return;
        }

        setStatus('loading');
        try {
            const res = await fetch('/api/job-alerts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: trimmed, frequency: 'weekly' }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setStatus('success');
                setEmail('');
            } else {
                setStatus('error');
                setErrorMsg(data.error || 'Something went wrong. Try again.');
            }
        } catch {
            setStatus('error');
            setErrorMsg('Network error. Please try again.');
        }
    };

    return (
        <section style={{
            background: 'linear-gradient(135deg, rgba(232,108,44,0.06), rgba(45,212,191,0.06))',
            padding: '56px 0',
        }}>
            <div style={{ maxWidth: '600px', margin: '0 auto', padding: '0 20px', textAlign: 'center' }}>

                {/* Headline */}
                <h2 style={{
                    fontSize: '24px', fontWeight: 700,
                    color: 'var(--text-primary)', margin: '0 0 8px',
                }}>
                    Get New PMHNP Jobs in Your Inbox
                </h2>

                {/* Subtitle */}
                <p style={{
                    fontSize: '14px', color: 'var(--text-muted)',
                    margin: '0 0 28px', lineHeight: 1.6,
                }}>
                    Join 500+ PMHNPs who get weekly job alerts. No spam, unsubscribe anytime.
                </p>

                {status === 'success' ? (
                    /* Success state */
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: '8px', padding: '14px 20px',
                        backgroundColor: 'rgba(34,197,94,0.08)', borderRadius: '12px',
                        border: '1px solid rgba(34,197,94,0.2)',
                    }}>
                        <CheckCircle size={18} style={{ color: '#22c55e' }} />
                        <span style={{ fontSize: '14px', fontWeight: 600, color: '#22c55e' }}>
                            You&apos;re in! Check your email for confirmation.
                        </span>
                    </div>
                ) : (
                    <>
                        {/* Form */}
                        <form onSubmit={handleSubmit} style={{
                            display: 'flex', gap: '0',
                            maxWidth: '480px', margin: '0 auto 16px',
                            borderRadius: '14px', overflow: 'hidden',
                            border: '1px solid var(--border-color)',
                            backgroundColor: 'var(--bg-primary)',
                        }}>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => { setEmail(e.target.value); if (status === 'error') setStatus('idle'); }}
                                placeholder="you@example.com"
                                className="hero-input"
                                style={{
                                    flex: 1, padding: '14px 18px',
                                    fontSize: '15px',
                                    backgroundColor: 'transparent',
                                    border: 'none', outline: 'none',
                                    color: 'var(--text-primary)',
                                    minWidth: 0,
                                }}
                            />
                            <button
                                type="submit"
                                disabled={status === 'loading'}
                                style={{
                                    padding: '14px 24px',
                                    fontSize: '14px', fontWeight: 700,
                                    color: '#fff', border: 'none',
                                    background: 'linear-gradient(135deg, #E86C2C, #d4622a)',
                                    cursor: status === 'loading' ? 'not-allowed' : 'pointer',
                                    opacity: status === 'loading' ? 0.7 : 1,
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    whiteSpace: 'nowrap',
                                    transition: 'opacity 0.2s',
                                }}
                            >
                                {status === 'loading' ? (
                                    <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Sending...</>
                                ) : (
                                    'Subscribe'
                                )}
                            </button>
                        </form>

                        {/* Error */}
                        {status === 'error' && (
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                gap: '6px', marginBottom: '12px',
                                fontSize: '13px', color: '#ef4444',
                            }}>
                                <AlertCircle size={14} />
                                {errorMsg}
                            </div>
                        )}

                        {/* Trust indicators */}
                        <div style={{
                            display: 'flex', justifyContent: 'center',
                            gap: '16px', flexWrap: 'wrap',
                            fontSize: '12px', color: 'var(--text-muted)',
                        }}>
                            <span>✓ Free forever</span>
                            <span>✓ No spam</span>
                            <span>✓ Unsubscribe anytime</span>
                        </div>
                    </>
                )}
            </div>
        </section>
    );
}
