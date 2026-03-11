'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

/**
 * B10: "Post a Job — First One Free" CTA banner
 * Standalone section for the homepage between WhyUs and Testimonials.
 */
export default function PostJobCTA() {
    return (
        <section style={{ padding: '48px 0' }}>
            <div style={{ maxWidth: '800px', margin: '0 auto', padding: '0 20px' }}>
                <Link
                    href="/post-job"
                    className="post-job-cta-block block rounded-2xl p-8 sm:p-10 text-center transition-all duration-300"
                    style={{
                        background: 'linear-gradient(135deg, #060E18 0%, #0c1929 50%, #060E18 100%)',
                        border: '1px solid rgba(45,212,191,0.15)',
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

                        <h3 className="text-2xl sm:text-3xl font-bold text-white mb-3">
                            Post a Job — First One Free
                        </h3>

                        <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.6)', maxWidth: '400px', margin: '0 auto 24px' }}>
                            Reach thousands of qualified PMHNPs. No credit card required for your first listing.
                        </p>

                        <span
                            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white transition-all"
                            style={{
                                background: 'linear-gradient(135deg, #2DD4BF, #0D9488)',
                                boxShadow: '0 4px 15px rgba(45,212,191,0.3)',
                            }}
                        >
                            Post Your First Job Free <ArrowRight size={16} />
                        </span>
                    </div>
                </Link>
            </div>

            <style>{`
                .post-job-cta-block:hover {
                    transform: translateY(-3px);
                    border-color: rgba(45,212,191,0.3) !important;
                    box-shadow: 0 10px 40px rgba(45,212,191,0.1);
                }
            `}</style>
        </section>
    );
}
