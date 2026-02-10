'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export default function EmployerCTA() {
    return (
        <section style={{ backgroundColor: 'var(--bg-primary)', padding: '48px 0' }}>
            <div style={{ maxWidth: '860px', margin: '0 auto', padding: '0 20px' }}>
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    flexWrap: 'wrap', gap: '24px',
                    padding: '32px 36px',
                    borderRadius: '16px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-secondary)',
                }}>
                    {/* Left: copy */}
                    <div style={{ flex: '1 1 300px' }}>
                        <h3 style={{
                            fontSize: '22px', fontWeight: 700,
                            color: 'var(--text-primary)', margin: '0 0 6px',
                        }}>
                            Hiring PMHNPs?
                        </h3>
                        <p style={{
                            fontSize: '14px', color: 'var(--text-secondary)',
                            margin: '0 0 14px', lineHeight: 1.6,
                        }}>
                            Post your positions to reach thousands of qualified Psychiatric Mental Health Nurse Practitioners.
                        </p>
                        {/* Stats */}
                        <div style={{
                            display: 'flex', gap: '16px', flexWrap: 'wrap',
                            fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)',
                        }}>
                            <span>5,200+ active candidates</span>
                            <span style={{ opacity: 0.3 }}>|</span>
                            <span>50 states covered</span>
                            <span style={{ opacity: 0.3 }}>|</span>
                            <span>Posted in minutes</span>
                        </div>
                    </div>

                    {/* Right: CTA button */}
                    <Link
                        href="/post-job"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '8px',
                            padding: '14px 28px', borderRadius: '12px',
                            fontSize: '15px', fontWeight: 700, color: '#fff',
                            background: 'linear-gradient(135deg, #E86C2C, #d4622a)',
                            textDecoration: 'none',
                            whiteSpace: 'nowrap',
                            transition: 'all 0.25s',
                            boxShadow: '0 2px 12px rgba(232,108,44,0.2)',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 6px 24px rgba(232,108,44,0.35)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 2px 12px rgba(232,108,44,0.2)';
                        }}
                    >
                        Post a Job — Free
                        <ArrowRight size={16} />
                    </Link>
                </div>
            </div>
        </section>
    );
}
