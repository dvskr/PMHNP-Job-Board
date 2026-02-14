'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

const features = [
    {
        num: '01',
        color: '#E86C2C',
        title: '100% PMHNP Roles',
        desc: 'Every listing is verified for relevance. No physician assistant roles, no general NP positions, no irrelevant noise.',
        stat: '10,000+',
        statLabel: 'verified listings',
    },
    {
        num: '02',
        color: '#2dd4bf',
        title: 'Updated Daily',
        desc: 'We aggregate from 500+ healthcare employers, ATS feeds, and job boards — refreshed every 24 hours.',
        stat: '3,000+',
        statLabel: 'sources monitored',
    },
    {
        num: '03',
        color: '#22c55e',
        title: 'Salary Transparency',
        desc: 'See compensation upfront. We surface salary data whenever available so you skip the guesswork.',
        stat: '73%',
        statLabel: 'show salary',
    },
];

export default function WhyUs() {
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
        const id = 'wu-styles';
        if (document.getElementById(id)) return;
        const s = document.createElement('style');
        s.id = id;
        s.textContent = `
      .wu-item {
        opacity: 0;
        transform: translateY(24px);
        transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1),
                    transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .wu-item.wu-visible {
        opacity: 1;
        transform: translateY(0);
      }
      .wu-line {
        height: 0;
        transition: height 0.8s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .wu-line.wu-visible {
        height: 100%;
      }
      .wu-stat {
        font-variant-numeric: tabular-nums;
      }
      @media (max-width: 640px) {
        .wu-item {
          grid-template-columns: 1fr !important;
          gap: 16px !important;
          padding: 24px 0 !important;
        }
        .wu-item > div:first-child,
        .wu-item > div:nth-child(2) {
          display: none !important;
        }
      }
    `;
        document.head.appendChild(s);
    }, []);

    return (
        <section
            ref={sectionRef}
            style={{ backgroundColor: 'var(--bg-primary)', padding: '80px 0' }}
        >
            <div style={{ maxWidth: '860px', margin: '0 auto', padding: '0 20px' }}>
                {/* Header — centered */}
                <div style={{ marginBottom: '56px', textAlign: 'center' }}>
                    <h2 style={{
                        fontSize: '28px', fontWeight: 700,
                        color: 'var(--text-primary)', margin: '0 0 8px',
                    }}>
                        Why PMHNPs Choose Us
                    </h2>
                    <p style={{
                        fontSize: '15px', color: 'var(--text-muted)', margin: 0,
                    }}>
                        Built exclusively for Psychiatric Mental Health Nurse Practitioners — not a generic job board
                    </p>
                </div>

                {/* Feature rows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                    {features.map((f, idx) => (
                        <div
                            key={f.num}
                            className={`wu-item ${visible ? 'wu-visible' : ''}`}
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '64px 3px 1fr auto',
                                gap: '0 24px',
                                alignItems: 'start',
                                padding: '32px 0',
                                borderBottom: idx < features.length - 1 ? '1px solid var(--border-color)' : 'none',
                                transitionDelay: `${idx * 150}ms`,
                            }}
                        >
                            {/* Number */}
                            <div style={{
                                fontSize: '36px', fontWeight: 800, lineHeight: 1,
                                background: `linear-gradient(135deg, ${f.color}, ${f.color}88)`,
                                WebkitBackgroundClip: 'text',
                                backgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                textAlign: 'right',
                                paddingTop: '4px',
                            }}>
                                {f.num}
                            </div>

                            {/* Accent line */}
                            <div style={{ position: 'relative', alignSelf: 'stretch' }}>
                                <div
                                    className={`wu-line ${visible ? 'wu-visible' : ''}`}
                                    style={{
                                        width: '3px', borderRadius: '2px',
                                        backgroundColor: f.color,
                                        transitionDelay: `${idx * 150 + 200}ms`,
                                    }}
                                />
                            </div>

                            {/* Text */}
                            <div style={{ paddingTop: '2px' }}>
                                <h3 style={{
                                    fontSize: '18px', fontWeight: 700,
                                    color: 'var(--text-primary)', margin: '0 0 8px',
                                }}>
                                    {f.title}
                                </h3>
                                <p style={{
                                    fontSize: '14px', lineHeight: 1.7,
                                    color: 'var(--text-secondary)', margin: 0,
                                    maxWidth: '420px',
                                }}>
                                    {f.desc}
                                </p>
                            </div>

                            {/* Stat */}
                            <div style={{
                                textAlign: 'right', paddingTop: '2px',
                                display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
                            }}>
                                <span className="wu-stat" style={{
                                    fontSize: '28px', fontWeight: 800,
                                    color: f.color, lineHeight: 1,
                                }}>
                                    {f.stat}
                                </span>
                                <span style={{
                                    fontSize: '11px', fontWeight: 600,
                                    textTransform: 'uppercase', letterSpacing: '0.1em',
                                    color: 'var(--text-muted)', marginTop: '4px',
                                }}>
                                    {f.statLabel}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
