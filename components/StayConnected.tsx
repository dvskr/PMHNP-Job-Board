'use client';

import { useState, useEffect, useRef, useCallback, FormEvent } from 'react';
import {
    BarChart3, TrendingUp, MapPin, Download, Loader2,
    CheckCircle, AlertCircle, Bell, ArrowRight, Mail,
    DollarSign, Briefcase, Globe,
} from 'lucide-react';

/* ─── Hooks ─── */
function useForm(endpoint: string, body: Record<string, string>) {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [err, setErr] = useState('');

    const submit = async (e: FormEvent, extraBody?: Record<string, unknown>) => {
        e.preventDefault();
        setErr('');
        if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setErr('Please enter a valid email'); setStatus('error'); return;
        }
        setStatus('loading');
        try {
            const res = await fetch(endpoint, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, ...body, ...extraBody }),
            });
            const data = await res.json();
            if (res.ok && data.success) { setStatus('success'); setEmail(''); }
            else { setErr(data.error || 'Something went wrong.'); setStatus('error'); }
        } catch { setErr('Network error.'); setStatus('error'); }
    };
    return { email, setEmail, status, setStatus, err, submit };
}

/* ─── Animated counter ─── */
function AnimatedNumber({ target, prefix = '', suffix = '' }: { target: number; prefix?: string; suffix?: string }) {
    const [val, setVal] = useState(0);
    const ref = useRef<HTMLSpanElement>(null);
    const started = useRef(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const obs = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting && !started.current) {
                started.current = true;
                const duration = 1400;
                const start = performance.now();
                const step = (now: number) => {
                    const t = Math.min((now - start) / duration, 1);
                    const ease = 1 - Math.pow(1 - t, 3);
                    setVal(Math.round(ease * target));
                    if (t < 1) requestAnimationFrame(step);
                };
                requestAnimationFrame(step);
            }
        }, { threshold: 0.5 });
        obs.observe(el);
        return () => obs.disconnect();
    }, [target]);

    return <span ref={ref}>{prefix}{val.toLocaleString()}{suffix}</span>;
}

/* ─── Fake notification cards ─── */
const fakeAlerts = [
    { role: 'Remote PMHNP – Telehealth', company: 'Cerebral Health', salary: '$155K', icon: Globe, delay: 0 },
    { role: 'Travel PMHNP – 13 Weeks', company: 'Aya Healthcare', salary: '$2,800/wk', icon: Briefcase, delay: 100 },
    { role: 'New Grad PMHNP – Outpatient', company: 'Mindful Care', salary: '$130K', icon: Mail, delay: 200 },
];

export default function StayConnected() {
    const sectionRef = useRef<HTMLElement>(null);
    const [visible, setVisible] = useState(false);
    const sg = useForm('/api/newsletter', { source: 'salary-guide' });
    const nl = useForm('/api/job-alerts', { frequency: 'daily' });
    const [sgNewsletter, setSgNewsletter] = useState(true);
    const [nlNewsletter, setNlNewsletter] = useState(true);

    const onIntersect = useCallback((entries: IntersectionObserverEntry[]) => {
        if (entries[0].isIntersecting) setVisible(true);
    }, []);

    useEffect(() => {
        const el = sectionRef.current;
        if (!el) return;
        const obs = new IntersectionObserver(onIntersect, { threshold: 0.08 });
        obs.observe(el);
        return () => obs.disconnect();
    }, [onIntersect]);

    useEffect(() => {
        const id = 'sc-styles';
        if (document.getElementById(id)) return;
        const s = document.createElement('style');
        s.id = id;
        s.textContent = `
      .sc-el { opacity:0; transform:translateY(20px);
        transition: opacity .6s cubic-bezier(.16,1,.3,1), transform .6s cubic-bezier(.16,1,.3,1); }
      .sc-el.sc-vis { opacity:1; transform:translateY(0); }
      .sc-input { transition: border-color .2s, box-shadow .2s; }
      .sc-input:focus {
        border-color: rgba(45,212,191,0.5) !important;
        box-shadow: 0 0 0 3px rgba(45,212,191,0.08) !important;
      }
      .sc-input-o:focus {
        border-color: rgba(232,108,44,0.5) !important;
        box-shadow: 0 0 0 3px rgba(232,108,44,0.08) !important;
      }
      .sc-btn { transition: transform .2s, box-shadow .2s; }
      .sc-btn:hover:not(:disabled) { transform:translateY(-1px); }
      .sc-alert-card { transition: transform .3s cubic-bezier(.16,1,.3,1); }
      .sc-alert-card:hover { transform: translateX(4px) !important; }
      @keyframes scPulse {
        0%, 100% { opacity:.5; }
        50% { opacity:1; }
      }
      @media (max-width: 700px) {
        .sc-grid { grid-template-columns: 1fr !important; }
        .sc-panel { padding: 28px 20px !important; }
      }
    `;
        document.head.appendChild(s);
    }, []);

    return (
        <section ref={sectionRef} style={{
            backgroundColor: 'var(--bg-primary)',
            padding: '80px 0',
            borderTop: '1px solid var(--border-color)',
            borderBottom: '1px solid var(--border-color)',
        }}>
            <div style={{ maxWidth: '1020px', margin: '0 auto', padding: '0 20px' }}>

                {/* Section header */}
                <div
                    className={`sc-el ${visible ? 'sc-vis' : ''}`}
                    style={{ marginBottom: '40px', textAlign: 'center' }}
                >
                    <h2 style={{
                        fontSize: '28px', fontWeight: 700,
                        color: 'var(--text-primary)', margin: '0 0 6px',
                    }}>
                        Stay Connected
                    </h2>
                    <p style={{ fontSize: '15px', color: 'var(--text-muted)', margin: 0 }}>
                        Get salary data and job alerts delivered to your inbox
                    </p>
                </div>

                {/* ═══ Two-panel layout ═══ */}
                <div className="sc-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '20px',
                }}>

                    {/* ════ LEFT: Salary Guide ════ */}
                    <div
                        className={`sc-el sc-panel ${visible ? 'sc-vis' : ''}`}
                        style={{
                            padding: '40px 36px',
                            borderRadius: '16px',
                            border: '1px solid var(--border-color)',
                            backgroundColor: 'var(--bg-secondary)',
                        }}
                    >
                        {/* Eyebrow */}
                        <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            marginBottom: '24px',
                        }}>
                            <DollarSign size={14} style={{ color: '#2dd4bf' }} />
                            <span style={{
                                fontSize: '11px', fontWeight: 700, color: '#2dd4bf',
                                textTransform: 'uppercase', letterSpacing: '0.1em',
                            }}>
                                2026 Salary Guide
                            </span>
                        </div>

                        {/* Animated number */}
                        <div style={{ marginBottom: '8px' }}>
                            <span style={{
                                fontSize: '48px', fontWeight: 800, lineHeight: 1,
                                color: 'var(--text-primary)',
                            }}>
                                $<AnimatedNumber target={145} />K
                            </span>
                        </div>
                        <p style={{
                            fontSize: '14px', color: 'var(--text-muted)',
                            margin: '0 0 24px', fontWeight: 500,
                        }}>
                            Average PMHNP salary across 50 states
                        </p>

                        {/* Mini data pills */}
                        <div style={{
                            display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '32px',
                        }}>
                            {[
                                { icon: BarChart3, text: '$115K – $185K range' },
                                { icon: MapPin, text: 'All 50 states' },
                                { icon: TrendingUp, text: '+12% YoY growth' },
                            ].map((p) => {
                                const Icon = p.icon;
                                return (
                                    <div key={p.text} style={{
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                        padding: '6px 12px', borderRadius: '20px',
                                        backgroundColor: 'rgba(45,212,191,0.06)',
                                        border: '1px solid rgba(45,212,191,0.12)',
                                    }}>
                                        <Icon size={12} style={{ color: '#2dd4bf' }} />
                                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                            {p.text}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Form */}
                        {sg.status === 'success' ? (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                padding: '14px 18px', borderRadius: '14px',
                                background: 'rgba(34,197,94,0.08)',
                                border: '1px solid rgba(34,197,94,0.2)',
                            }}>
                                <CheckCircle size={18} style={{ color: '#22c55e' }} />
                                <span style={{ fontSize: '14px', fontWeight: 600, color: '#22c55e' }}>
                                    Check your email!
                                </span>
                            </div>
                        ) : (
                            <>
                                <form onSubmit={(e) => sg.submit(e, { newsletterOptIn: sgNewsletter })} style={{ display: 'flex', gap: '8px' }}>
                                    <input
                                        type="email" value={sg.email}
                                        onChange={(e) => sg.setEmail(e.target.value)}
                                        placeholder="Enter your email"
                                        required className="sc-input"
                                        style={{
                                            flex: 1, padding: '13px 16px',
                                            backgroundColor: 'var(--bg-primary)',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '12px', fontSize: '14px',
                                            color: 'var(--text-primary)', outline: 'none', minWidth: 0,
                                        }}
                                        disabled={sg.status === 'loading'}
                                    />
                                    <button
                                        type="submit" disabled={sg.status === 'loading'}
                                        className="sc-btn"
                                        style={{
                                            padding: '13px 20px',
                                            backgroundColor: '#2DD4BF',
                                            color: '#0a1628', fontSize: '14px', fontWeight: 700,
                                            border: 'none', borderRadius: '12px',
                                            cursor: sg.status === 'loading' ? 'not-allowed' : 'pointer',
                                            display: 'flex', alignItems: 'center', gap: '6px',
                                            whiteSpace: 'nowrap', flexShrink: 0,
                                        }}
                                    >
                                        {sg.status === 'loading'
                                            ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                                            : <><Download size={15} /> Download</>
                                        }
                                    </button>
                                </form>
                                <label style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                    margin: '10px 0 0', cursor: 'pointer', fontSize: '12px',
                                    color: 'var(--text-secondary)',
                                }}>
                                    <input
                                        type="checkbox" checked={sgNewsletter}
                                        onChange={(e) => setSgNewsletter(e.target.checked)}
                                        style={{ accentColor: '#2DD4BF', width: '14px', height: '14px', cursor: 'pointer' }}
                                    />
                                    Also send me the monthly PMHNP newsletter
                                </label>
                                {sg.status === 'error' && (
                                    <p style={{ fontSize: '12px', color: '#ef4444', margin: '6px 0 0' }}>{sg.err}</p>
                                )}
                                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '8px 0 0', textAlign: 'center' }}>
                                    Free · Includes weekly job alerts
                                </p>
                            </>
                        )}
                    </div>

                    {/* ════ RIGHT: Job Alerts ════ */}
                    <div
                        className={`sc-el sc-panel ${visible ? 'sc-vis' : ''}`}
                        style={{
                            padding: '40px 36px',
                            borderRadius: '16px',
                            border: '1px solid var(--border-color)',
                            backgroundColor: 'var(--bg-secondary)',
                            transitionDelay: '120ms',
                        }}
                    >
                        {/* Eyebrow */}
                        <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            marginBottom: '24px',
                        }}>
                            <Bell size={14} style={{ color: '#E86C2C' }} />
                            <span style={{
                                fontSize: '11px', fontWeight: 700, color: '#E86C2C',
                                textTransform: 'uppercase', letterSpacing: '0.1em',
                            }}>
                                Daily Job Alerts
                            </span>
                            <span style={{
                                width: '6px', height: '6px', borderRadius: '50%',
                                backgroundColor: '#22c55e',
                                animation: 'scPulse 2s ease-in-out infinite',
                                display: 'inline-block',
                            }} />
                        </div>

                        {/* Heading */}
                        <h3 style={{
                            fontSize: '22px', fontWeight: 700,
                            color: 'var(--text-primary)',
                            margin: '0 0 20px', lineHeight: 1.3,
                        }}>
                            Jobs like these,<br />
                            <span style={{ color: '#E86C2C' }}>in your inbox</span>
                        </h3>

                        {/* Preview cards */}
                        <div style={{
                            display: 'flex', flexDirection: 'column', gap: '8px',
                            marginBottom: '28px',
                        }}>
                            {fakeAlerts.map((a) => {
                                const Icon = a.icon;
                                return (
                                    <div
                                        key={a.role}
                                        className={`sc-el sc-alert-card ${visible ? 'sc-vis' : ''}`}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '12px',
                                            padding: '12px 14px',
                                            backgroundColor: 'var(--bg-primary)', borderRadius: '12px',
                                            border: '1px solid var(--border-color)',
                                            transitionDelay: `${200 + a.delay}ms`,
                                        }}
                                    >
                                        <div style={{
                                            width: '32px', height: '32px', borderRadius: '8px',
                                            background: 'rgba(232,108,44,0.08)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            flexShrink: 0,
                                        }}>
                                            <Icon size={14} style={{ color: '#E86C2C' }} />
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                fontSize: '13px', fontWeight: 600,
                                                color: 'var(--text-primary)',
                                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                            }}>
                                                {a.role}
                                            </div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                {a.company}
                                            </div>
                                        </div>
                                        <span style={{
                                            fontSize: '12px', fontWeight: 700,
                                            color: '#2dd4bf', whiteSpace: 'nowrap',
                                        }}>
                                            {a.salary}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Form */}
                        {nl.status === 'success' ? (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                padding: '14px 18px', borderRadius: '14px',
                                background: 'rgba(34,197,94,0.08)',
                                border: '1px solid rgba(34,197,94,0.2)',
                            }}>
                                <CheckCircle size={18} style={{ color: '#22c55e' }} />
                                <span style={{ fontSize: '14px', fontWeight: 600, color: '#22c55e' }}>
                                    You&apos;re subscribed!
                                </span>
                            </div>
                        ) : (
                            <>
                                <form onSubmit={(e) => nl.submit(e, { newsletterOptIn: nlNewsletter })} style={{ display: 'flex', gap: '8px' }}>
                                    <input
                                        type="email" value={nl.email}
                                        onChange={(e) => {
                                            nl.setEmail(e.target.value);
                                            if (nl.status === 'error') nl.setStatus('idle');
                                        }}
                                        placeholder="Enter your email"
                                        required className="sc-input-o"
                                        style={{
                                            flex: 1, padding: '13px 16px',
                                            backgroundColor: 'var(--bg-primary)',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '12px', fontSize: '14px',
                                            color: 'var(--text-primary)', outline: 'none', minWidth: 0,
                                        }}
                                        disabled={nl.status === 'loading'}
                                    />
                                    <button
                                        type="submit" disabled={nl.status === 'loading'}
                                        className="sc-btn"
                                        style={{
                                            padding: '13px 20px',
                                            backgroundColor: '#E86C2C',
                                            color: '#fff', fontSize: '14px', fontWeight: 700,
                                            border: 'none', borderRadius: '12px',
                                            cursor: nl.status === 'loading' ? 'not-allowed' : 'pointer',
                                            display: 'flex', alignItems: 'center', gap: '6px',
                                            whiteSpace: 'nowrap', flexShrink: 0,
                                        }}
                                    >
                                        {nl.status === 'loading'
                                            ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                                            : <><ArrowRight size={15} /> Subscribe</>
                                        }
                                    </button>
                                </form>
                                <label style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                    margin: '10px 0 0', cursor: 'pointer', fontSize: '12px',
                                    color: 'var(--text-secondary)',
                                }}>
                                    <input
                                        type="checkbox" checked={nlNewsletter}
                                        onChange={(e) => setNlNewsletter(e.target.checked)}
                                        style={{ accentColor: '#E86C2C', width: '14px', height: '14px', cursor: 'pointer' }}
                                    />
                                    Also send me the monthly PMHNP newsletter
                                </label>
                                {nl.status === 'error' && (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: '4px',
                                        fontSize: '12px', color: '#ef4444', marginTop: '6px',
                                    }}>
                                        <AlertCircle size={12} /> {nl.err}
                                    </div>
                                )}
                                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '8px 0 0', textAlign: 'center' }}>
                                    500+ PMHNPs subscribed · Free forever
                                </p>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Responsive */}
            <style>{`
        @media (max-width: 750px) {
          section > div > div:last-child {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
        </section>
    );
}
