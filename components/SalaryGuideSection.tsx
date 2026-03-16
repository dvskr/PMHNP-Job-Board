'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { TrendingUp, CheckCircle, Download, Loader2, Sparkles, BarChart3, MapPin, DollarSign } from 'lucide-react';

export default function SalaryGuideSection() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
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
    const id = 'sg-styles';
    if (document.getElementById(id)) return;
    const s = document.createElement('style');
    s.id = id;
    s.textContent = `
      .sg-fade { opacity:0; transform:translateY(20px);
        transition: opacity 0.6s cubic-bezier(.16,1,.3,1), transform 0.6s cubic-bezier(.16,1,.3,1); }
      .sg-fade.sg-vis { opacity:1; transform:translateY(0); }
      .sg-input:focus {
        border-color: rgba(45,212,191,0.5) !important;
        box-shadow: 0 0 0 3px rgba(45,212,191,0.08) !important;
      }
      .sg-submit { transition: transform .2s, box-shadow .2s, filter .2s; }
      .sg-submit:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 6px 20px rgba(45,212,191,0.25);
        filter: brightness(1.05);
      }
      .sg-mockup {
        transition: transform 0.6s cubic-bezier(.16,1,.3,1);
      }
      .sg-mockup:hover {
        transform: perspective(800px) rotateY(-4deg) rotateX(2deg) scale(1.02) !important;
      }
    `;
    document.head.appendChild(s);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setErrorMessage('');
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMessage('Please enter a valid email');
      setStatus('error');
      return;
    }
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'salary-guide' }),
      });
      const data = await res.json();
      if (res.ok && data.success) { setStatus('success'); setEmail(''); }
      else { setErrorMessage(data.error || 'Something went wrong.'); setStatus('error'); }
    } catch { setErrorMessage('Network error.'); setStatus('error'); }
  };

  // Mock guide "pages" for the visual
  const mockPages = [
    { icon: BarChart3, title: 'Pay by State', value: '$115K – $185K' },
    { icon: MapPin, title: 'Top Markets', value: 'CA, NY, TX, FL' },
    { icon: TrendingUp, title: 'YoY Growth', value: '+12% avg' },
  ];

  return (
    <section ref={sectionRef} style={{ backgroundColor: 'var(--bg-primary)', padding: '80px 0' }}>
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '0 20px' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1.1fr',
          gap: '56px', alignItems: 'center',
        }}>
          {/* Left — 3D Guide Mockup */}
          <div
            className={`sg-fade sg-mockup ${visible ? 'sg-vis' : ''}`}
            style={{
              transform: 'perspective(800px) rotateY(-6deg) rotateX(2deg)',
              transformStyle: 'preserve-3d',
            }}
          >
            {/* Guide "cover" */}
            <div style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '20px',
              overflow: 'hidden',
              boxShadow: '24px 24px 64px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.03)',
            }}>
              {/* Header bar */}
              <div style={{
                padding: '24px 28px 20px',
                borderBottom: '1px solid var(--border-color)',
                background: 'linear-gradient(135deg, rgba(45,212,191,0.06), transparent)',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  marginBottom: '8px',
                }}>
                  <Sparkles size={14} style={{ color: '#2dd4bf' }} />
                  <span style={{
                    fontSize: '10px', fontWeight: 700, color: '#2dd4bf',
                    textTransform: 'uppercase', letterSpacing: '0.1em',
                  }}>
                    2026 Edition
                  </span>
                </div>
                <h3 style={{
                  fontSize: '20px', fontWeight: 800,
                  color: 'var(--text-primary)', margin: 0, lineHeight: 1.3,
                }}>
                  PMHNP Salary Guide
                </h3>
                <p style={{
                  fontSize: '12px', color: 'var(--text-muted)',
                  margin: '4px 0 0',
                }}>
                  Comprehensive compensation data across 50 states
                </p>
              </div>

              {/* Mock data rows */}
              <div style={{ padding: '4px 0' }}>
                {mockPages.map((p, i) => {
                  const Icon = p.icon;
                  return (
                    <div
                      key={p.title}
                      className={`sg-fade ${visible ? 'sg-vis' : ''}`}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '14px',
                        padding: '16px 28px',
                        borderBottom: i < mockPages.length - 1 ? '1px solid var(--border-color)' : 'none',
                        transitionDelay: `${(i + 2) * 100}ms`,
                      }}
                    >
                      <div style={{
                        width: '36px', height: '36px', borderRadius: '10px',
                        background: 'rgba(45,212,191,0.08)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        <Icon size={16} style={{ color: '#2dd4bf' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontSize: '12px', color: 'var(--text-muted)',
                          fontWeight: 600, textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}>
                          {p.title}
                        </div>
                        <div style={{
                          fontSize: '16px', fontWeight: 700,
                          color: 'var(--text-primary)', marginTop: '2px',
                        }}>
                          {p.value}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bottom shimmer bar */}
              <div style={{
                height: '4px',
                background: 'linear-gradient(90deg, #2dd4bf, #E86C2C, #2dd4bf)',
                backgroundSize: '200% auto',
              }} />
            </div>
          </div>

          {/* Right — CTA + Form */}
          <div className={`sg-fade ${visible ? 'sg-vis' : ''}`} style={{ transitionDelay: '150ms' }}>
            <p style={{
              fontSize: '12px', fontWeight: 700, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: '#2dd4bf', margin: '0 0 12px',
            }}>
              Free Download
            </p>

            <h2 style={{
              fontSize: '32px', fontWeight: 800,
              color: 'var(--text-primary)',
              margin: '0 0 14px', lineHeight: 1.2,
            }}>
              Know Your Worth
            </h2>

            <p style={{
              fontSize: '16px', color: 'var(--text-secondary)',
              margin: '0 0 8px', lineHeight: 1.7,
            }}>
              Get the data you need to negotiate with confidence.
            </p>
            <p style={{
              fontSize: '14px', color: 'var(--text-muted)',
              margin: '0 0 32px', lineHeight: 1.6,
            }}>
              State-by-state salary ranges, remote vs in-person comparisons,
              and negotiation strategies from hiring managers.
            </p>

            {status === 'success' ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '16px 20px', borderRadius: '14px',
                background: 'rgba(34,197,94,0.08)',
                border: '1px solid rgba(34,197,94,0.2)',
              }}>
                <CheckCircle size={20} style={{ color: '#22c55e' }} />
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#22c55e' }}>
                    Check your email!
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    The guide is on its way.
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Inline email + button */}
                <div style={{
                  display: 'flex', gap: '8px',
                  borderRadius: '14px',
                }}>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    required
                    className="sg-input"
                    style={{
                      flex: 1, padding: '14px 16px',
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '14px', fontSize: '14px',
                      color: 'var(--text-primary)',
                      outline: 'none', minWidth: 0,
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                    }}
                    disabled={status === 'loading'}
                  />
                  <button
                    type="submit"
                    disabled={status === 'loading'}
                    className="sg-submit"
                    style={{
                      padding: '14px 24px',
                      background: 'linear-gradient(135deg, #0D9488, #2DD4BF)',
                      color: '#fff', fontSize: '14px', fontWeight: 700,
                      border: 'none', borderRadius: '14px',
                      cursor: status === 'loading' ? 'not-allowed' : 'pointer',
                      opacity: status === 'loading' ? 0.7 : 1,
                      display: 'flex', alignItems: 'center', gap: '6px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {status === 'loading' ? (
                      <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    ) : (
                      <><Download size={15} /> Get Guide</>
                    )}
                  </button>
                </div>

                {status === 'error' && (
                  <p style={{ fontSize: '13px', color: '#ef4444', margin: 0 }}>{errorMessage}</p>
                )}

                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>
                  Free · No spam · Also includes weekly job alerts
                </p>
              </form>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 750px) {
          section > div > div {
            grid-template-columns: 1fr !important;
            gap: 36px !important;
          }
          .sg-mockup {
            transform: perspective(800px) rotateY(0deg) rotateX(0deg) !important;
            max-width: 380px;
            margin: 0 auto;
          }
        }
      `}</style>
    </section>
  );
}
