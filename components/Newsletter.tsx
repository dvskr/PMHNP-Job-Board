'use client';

import { useState, useEffect, useRef, useCallback, FormEvent } from 'react';
import { CheckCircle, AlertCircle, Loader2, Bell, Zap } from 'lucide-react';

export default function Newsletter() {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const sectionRef = useRef<HTMLElement>(null);
    const [visible, setVisible] = useState(false);

    const onIntersect = useCallback((entries: IntersectionObserverEntry[]) => {
        if (entries[0].isIntersecting) setVisible(true);
    }, []);

    useEffect(() => {
        const el = sectionRef.current;
        if (!el) return;
        const obs = new IntersectionObserver(onIntersect, { threshold: 0.15 });
        obs.observe(el);
        return () => obs.disconnect();
    }, [onIntersect]);

    useEffect(() => {
        const id = 'nl-styles';
        if (document.getElementById(id)) return;
        const s = document.createElement('style');
        s.id = id;
        s.textContent = `
            .nl-fade { opacity:0; transform:translateY(16px);
              transition: opacity .5s cubic-bezier(.16,1,.3,1), transform .5s cubic-bezier(.16,1,.3,1); }
            .nl-fade.nl-vis { opacity:1; transform:translateY(0); }
            .nl-email:focus {
                border-color: rgba(232,108,44,0.5) !important;
                box-shadow: 0 0 0 3px rgba(232,108,44,0.08) !important;
            }
            .nl-sub { transition: transform .2s, box-shadow .2s, filter .2s; }
            .nl-sub:hover:not(:disabled) {
                transform: translateY(-1px);
                box-shadow: 0 6px 20px rgba(232,108,44,0.25);
                filter: brightness(1.05);
            }
        `;
        document.head.appendChild(s);
    }, []);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        const trimmed = email.trim();
        if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
            setStatus('error');
            setErrorMsg('Please enter a valid email');
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
            if (res.ok && data.success) { setStatus('success'); setEmail(''); }
            else { setStatus('error'); setErrorMsg(data.error || 'Something went wrong.'); }
        } catch { setStatus('error'); setErrorMsg('Network error.'); }
    };

    return (
        <section
            ref={sectionRef}
            style={{
                padding: '0 20px',
                marginTop: '-20px',
                marginBottom: '60px',
            }}
        >
            <div
                className={`nl-fade ${visible ? 'nl-vis' : ''}`}
                style={{
                    maxWidth: '960px', margin: '0 auto',
                    borderRadius: '20px',
                    padding: '1px',
                    background: 'linear-gradient(135deg, rgba(232,108,44,0.25), var(--border-color) 40%, rgba(232,108,44,0.1))',
                }}
            >
                <div style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderRadius: '19px',
                    padding: '36px 40px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '32px',
                    position: 'relative',
                    overflow: 'hidden',
                }}>
                    {/* Ambient dot */}
                    <div style={{
                        position: 'absolute', right: '-40px', top: '-40px',
                        width: '200px', height: '200px', borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(232,108,44,0.04), transparent 70%)',
                        pointerEvents: 'none',
                    }} />

                    {/* Icon */}
                    <div style={{
                        width: '52px', height: '52px', borderRadius: '16px',
                        background: 'linear-gradient(135deg, rgba(232,108,44,0.12), rgba(232,108,44,0.04))',
                        border: '1px solid rgba(232,108,44,0.15)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                    }}>
                        <Zap size={22} style={{ color: '#E86C2C' }} />
                    </div>

                    {/* Text */}
                    <div style={{ flex: '0 1 auto', minWidth: '180px' }}>
                        <h3 style={{
                            fontSize: '18px', fontWeight: 800,
                            color: 'var(--text-primary)', margin: '0 0 4px',
                        }}>
                            Weekly PMHNP Alerts
                        </h3>
                        <p style={{
                            fontSize: '13px', color: 'var(--text-muted)',
                            margin: 0, whiteSpace: 'nowrap',
                        }}>
                            Curated roles · 500+ subscribers · Free forever
                        </p>
                    </div>

                    {/* Form / Success — right aligned */}
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
                        {status === 'success' ? (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                padding: '12px 20px', borderRadius: '14px',
                                background: 'rgba(34,197,94,0.08)',
                                border: '1px solid rgba(34,197,94,0.2)',
                            }}>
                                <CheckCircle size={16} style={{ color: '#22c55e' }} />
                                <span style={{ fontSize: '14px', fontWeight: 600, color: '#22c55e' }}>
                                    You&apos;re subscribed!
                                </span>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                width: '100%', maxWidth: '380px',
                            }}>
                                <div style={{ flex: 1, position: 'relative' }}>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => {
                                            setEmail(e.target.value);
                                            if (status === 'error') setStatus('idle');
                                        }}
                                        placeholder="you@example.com"
                                        required
                                        className="nl-email"
                                        style={{
                                            width: '100%', padding: '12px 16px',
                                            backgroundColor: 'var(--bg-primary)',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '12px', fontSize: '14px',
                                            color: 'var(--text-primary)',
                                            outline: 'none', minWidth: 0,
                                            transition: 'border-color 0.2s, box-shadow 0.2s',
                                        }}
                                        disabled={status === 'loading'}
                                    />
                                    {status === 'error' && (
                                        <div style={{
                                            position: 'absolute', top: '100%', left: 0,
                                            display: 'flex', alignItems: 'center', gap: '4px',
                                            fontSize: '11px', color: '#ef4444',
                                            marginTop: '4px', whiteSpace: 'nowrap',
                                        }}>
                                            <AlertCircle size={11} /> {errorMsg}
                                        </div>
                                    )}
                                </div>
                                <button
                                    type="submit"
                                    disabled={status === 'loading'}
                                    className="nl-sub"
                                    style={{
                                        padding: '12px 22px',
                                        background: 'linear-gradient(135deg, #E86C2C, #d4622a)',
                                        color: '#fff', fontSize: '14px', fontWeight: 700,
                                        border: 'none', borderRadius: '12px',
                                        cursor: status === 'loading' ? 'not-allowed' : 'pointer',
                                        opacity: status === 'loading' ? 0.7 : 1,
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                        whiteSpace: 'nowrap', flexShrink: 0,
                                    }}
                                >
                                    {status === 'loading' ? (
                                        <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                                    ) : (
                                        <><Bell size={15} /> Subscribe</>
                                    )}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            </div>

            {/* Responsive */}
            <style>{`
                @media (max-width: 700px) {
                    section > div > div {
                        flex-direction: column !important;
                        align-items: flex-start !important;
                        gap: 20px !important;
                        padding: 28px 24px !important;
                    }
                    section > div > div > div:last-child {
                        width: 100% !important;
                    }
                    section > div > div > div:last-child form {
                        max-width: 100% !important;
                    }
                }
            `}</style>
        </section>
    );
}
