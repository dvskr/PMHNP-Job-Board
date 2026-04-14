'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

/**
 * "Post a Job — First 2 Free" CTA banner
 * Standalone section for the homepage between WhyUs and Testimonials.
 * Theme-aware — works in both dark and light mode.
 */
export default function PostJobCTA() {
    return (
        <section style={{ padding: '48px 0' }}>
            <div style={{ maxWidth: '800px', margin: '0 auto', padding: '0 20px' }}>
                <Link
                    href="/post-job"
                    className="post-job-cta-block block rounded-2xl p-8 sm:p-10 text-center transition-all duration-300"
                    style={{
                        backgroundColor: '#F0FDFA',
                        borderRadius: '24px',
                        border: '1px solid rgba(0,0,0,0.06)',
                        boxShadow: '8px 8px 18px rgba(0,0,0,0.06), -4px -4px 10px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.6)',
                        textDecoration: 'none',
                        position: 'relative',
                        overflow: 'hidden',
                    }}
                >
                    {/* Subtle glow effect */}
                    <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                            background: 'radial-gradient(ellipse at 50% 0%, rgba(45,212,191,0.08) 0%, transparent 60%)',
                        }}
                    />

                    <div className="relative z-10">
                        <span className="text-xs font-bold tracking-widest uppercase" style={{ color: '#2DD4BF' }}>
                            For Employers
                        </span>

                        <h3 className="text-2xl sm:text-3xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                            Post a Job — First 2 Free
                        </h3>

                        <p className="text-sm mb-6" style={{ color: 'var(--text-muted)', maxWidth: '400px', margin: '0 auto 24px' }}>
                            Reach thousands of qualified PMHNPs. No credit card required for your first listing.
                        </p>

                        <span
                            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white transition-all"
                            style={{
                                backgroundColor: '#0D9488',
                                borderRadius: '16px',
                                border: '1px solid rgba(0,0,0,0.08)',
                                boxShadow: '4px 4px 10px rgba(13,148,136,0.25), -2px -2px 6px rgba(255,255,255,0.15), inset 1px 1px 2px rgba(255,255,255,0.2)',
                            }}
                        >
                            Post Your First Job Free <ArrowRight size={16} />
                        </span>
                    </div>
                </Link>
            </div>

            <style>{`
                :root {
                    --postjob-cta-bg: #F0FDFA;
                    --postjob-cta-border: rgba(0,0,0,0.06);
                }
                .post-job-cta-block:hover {
                    transform: translateY(-3px);
                    box-shadow: 10px 10px 22px rgba(0,0,0,0.08), -5px -5px 12px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.6) !important;
                }
            `}</style>
        </section>
    );
}
