'use client';

import Link from 'next/link';
import { ArrowRight, Users, Globe, Zap, Shield, BarChart3 } from 'lucide-react';

const benefits = [
    { icon: Users, text: '5,200+ active candidates' },
    { icon: Globe, text: '50 states covered' },
    { icon: Zap, text: 'Posted in minutes' },
    { icon: Shield, text: 'Verified PMHNP audience' },
];

const employerOptions = [
    {
        title: 'Post a Job',
        desc: 'Reach thousands of qualified PMHNPs instantly',
        href: '/post-job',
        cta: 'Post Free',
        primary: true,
    },
    {
        title: 'Employer Dashboard',
        desc: 'Manage listings, track views and applications',
        href: '/employer/login',
        cta: 'Login',
        primary: false,
    },
    {
        title: 'Why PMHNP Hiring?',
        desc: 'See how we compare to generic job boards',
        href: '/for-employers',
        cta: 'Learn More',
        primary: false,
    },
];

export default function EmployerCTA() {
    return (
        <section style={{
            backgroundColor: 'var(--bg-primary)',
            padding: '64px 0',
            borderTop: '1px solid var(--border-color)',
        }}>
            <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 20px' }}>

                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '36px' }}>
                    <h2 style={{
                        fontSize: '28px', fontWeight: 700,
                        color: 'var(--text-primary)', margin: '0 0 8px',
                    }}>
                        Hiring PMHNPs?
                    </h2>
                    <p style={{
                        fontSize: '15px', color: 'var(--text-muted)',
                        margin: '0 0 24px', maxWidth: '420px', marginLeft: 'auto', marginRight: 'auto',
                    }}>
                        The only job board built exclusively for Psychiatric Mental Health Nurse Practitioners
                    </p>

                    {/* Benefit pills */}
                    <div style={{
                        display: 'flex', justifyContent: 'center',
                        gap: '12px', flexWrap: 'wrap',
                    }}>
                        {benefits.map((b) => {
                            const Icon = b.icon;
                            return (
                                <div key={b.text} style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '6px 14px', borderRadius: '20px',
                                    backgroundColor: 'rgba(232,108,44,0.06)',
                                    border: '1px solid rgba(232,108,44,0.12)',
                                }}>
                                    <Icon size={13} style={{ color: '#E86C2C' }} />
                                    <span style={{
                                        fontSize: '12px', fontWeight: 500,
                                        color: 'var(--text-secondary)',
                                    }}>
                                        {b.text}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 3 option cards */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '16px',
                }}>
                    {employerOptions.map((opt) => (
                        <Link
                            key={opt.href + opt.title}
                            href={opt.href}
                            className="employer-cta-card"
                            style={{
                                display: 'flex', flexDirection: 'column',
                                padding: '28px 24px',
                                borderRadius: '14px',
                                border: '1px solid var(--border-color)',
                                backgroundColor: 'var(--bg-secondary)',
                                textDecoration: 'none',
                                transition: 'all 0.25s',
                            }}
                        >
                            <h3 style={{
                                fontSize: '16px', fontWeight: 700,
                                color: 'var(--text-primary)', margin: '0 0 6px',
                            }}>
                                {opt.title}
                            </h3>
                            <p style={{
                                fontSize: '13px', color: 'var(--text-muted)',
                                margin: '0 0 20px', lineHeight: 1.5, flex: 1,
                            }}>
                                {opt.desc}
                            </p>
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: '6px',
                                fontSize: '13px', fontWeight: 700,
                                color: opt.primary ? '#E86C2C' : 'var(--text-secondary)',
                            }}>
                                {opt.cta} <ArrowRight size={14} />
                            </span>
                        </Link>
                    ))}
                </div>
            </div>

            {/* Responsive */}
            <style>{`
        .employer-cta-card:hover {
          border-color: rgba(232,108,44,0.3) !important;
          transform: translateY(-3px);
        }
        @media (max-width: 700px) {
          section > div > div:last-child {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
        </section>
    );
}
