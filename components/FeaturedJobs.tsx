'use client';

import Link from 'next/link';
import { MapPin, ArrowRight, Clock, Sparkles, Briefcase } from 'lucide-react';
import { motion } from 'framer-motion';
import Badge from '@/components/ui/Badge';

interface FeaturedJob {
    id: string;
    slug: string | null;
    title: string;
    employer: string;
    location: string;
    jobType: string | null;
    displaySalary: string | null;
    createdAt: string;
    originalPostedAt?: string | null;
}

interface FeaturedJobsProps {
    jobs: FeaturedJob[];
}

function relativeTime(s: string): string {
    const ms = Date.now() - new Date(s).getTime();
    const m = Math.floor(ms / 60000), h = Math.floor(ms / 3600000), d = Math.floor(ms / 86400000);
    if (m < 1) return 'Just now';
    if (m < 60) return `${m}m ago`;
    if (h < 24) return `${h}h ago`;
    if (d < 30) return `${d}d ago`;
    return `${Math.floor(d / 30)}mo ago`;
}

function isNew(s: string): boolean {
    return Date.now() - new Date(s).getTime() < 48 * 3600000;
}

/* ── Framer Motion variants ── */
const sectionFade = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.5 } },
};
const headerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] } },
};
const listContainer = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
};
const rowSlide = {
    hidden: { opacity: 0, x: -24 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] } },
};
const ctaPop = {
    hidden: { opacity: 0, scale: 0.9, y: 16 },
    visible: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24, delay: 0.4 } },
};

const css = `
    .fj-row {
        position: relative;
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 22px 28px;
        text-decoration: none;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .fj-row::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: 12px;
        opacity: 0;
        background: var(--bg-tertiary);
        transition: opacity 0.3s;
        pointer-events: none;
        z-index: -1;
    }
    .fj-row:hover::before { opacity: 1; }
    .fj-row:hover { transform: translateX(3px); }
    .fj-row .fj-arrow {
        opacity: 0;
        transform: translateX(-8px);
        transition: all 0.3s;
    }
    .fj-row:hover .fj-arrow {
        opacity: 1;
        transform: translateX(0);
    }
    .fj-row:hover .fj-title {
        color: var(--color-primary) !important;
    }
    .fj-row:hover .fj-icon {
        background: var(--bg-tertiary) !important;
        border-color: var(--color-primary) !important;
    }
    .fj-cta-btn:hover {
        transform: translateY(-2px) scale(1.03);
        box-shadow: 0 6px 30px rgba(13,148,136,0.35), 0 0 60px rgba(13,148,136,0.1) !important;
    }
    @media (max-width: 640px) {
        .fj-row {
            padding: 16px 16px !important;
            gap: 12px !important;
        }
        .fj-row .fj-arrow {
            display: none !important;
        }
        .fj-row .fj-title {
            white-space: normal !important;
            overflow: visible !important;
            text-overflow: unset !important;
        }
        .fj-section {
            padding: 48px 0 56px !important;
        }
        .fj-heading {
            font-size: 24px !important;
        }
    }
`;

export default function FeaturedJobs({ jobs }: FeaturedJobsProps) {
    if (jobs.length === 0) return null;

    return (
        <motion.section
            className="fj-section"
            style={{
                backgroundColor: 'var(--bg-secondary)',
                padding: '72px 0 88px',
                position: 'relative',
                overflow: 'hidden',
            }}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.1 }}
            variants={sectionFade}
        >
            <style>{css}</style>

            <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 16px', position: 'relative', zIndex: 1 }}>
                {/* Header */}
                <motion.div
                    style={{ textAlign: 'center', marginBottom: '48px' }}
                    variants={headerVariants}
                >
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        padding: '6px 16px', borderRadius: '999px', fontSize: '11px',
                        fontWeight: 700, letterSpacing: '0.14em',
                        backgroundColor: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--color-primary)',
                        marginBottom: '16px',
                    }}>
                        <Sparkles size={12} />
                        UPDATED DAILY
                    </span>
                    <h2 className="fj-heading" style={{
                        fontSize: '32px', fontWeight: 800, letterSpacing: '-0.02em',
                        color: 'var(--text-primary)', margin: '16px 0 8px',
                    }}>
                        From Our Top Employers
                    </h2>
                    <p style={{ fontSize: '15px', color: 'var(--text-secondary)', margin: 0 }}>
                        Latest psychiatric NP openings added daily
                    </p>
                </motion.div>

                {/* List container */}
                <motion.div
                    style={{
                        backgroundColor: 'var(--bg-primary)',
                        borderRadius: '20px',
                        border: '1px solid var(--border-color)',
                        overflow: 'hidden',
                    }}
                    variants={listContainer}
                >
                    {jobs.map((job, idx) => {
                        const href = job.slug ? `/jobs/${job.slug}` : `/jobs/${job.id}`;
                        const postedDate = job.originalPostedAt || job.createdAt;
                        const fresh = isNew(postedDate);

                        return (
                            <motion.div key={job.id} variants={rowSlide}>
                                <Link
                                    href={href}
                                    className="fj-row"
                                    style={{
                                        borderBottom: idx < jobs.length - 1 ? '1px solid var(--border-color)' : 'none',
                                    }}
                                >
                                    {/* Icon */}
                                    <div
                                        className="fj-icon"
                                        style={{
                                            width: '44px', height: '44px', borderRadius: '14px',
                                            backgroundColor: 'var(--bg-tertiary)',
                                            border: '1px solid var(--border-color)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            flexShrink: 0,
                                            transition: 'all 0.3s',
                                        }}
                                    >
                                        <Briefcase size={18} style={{ color: 'var(--color-primary)', opacity: 0.8 }} />
                                    </div>

                                    {/* Main content */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        {/* Company + badges */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px', flexWrap: 'wrap' }}>
                                            <span style={{
                                                fontSize: '11px', fontWeight: 700,
                                                textTransform: 'uppercase', letterSpacing: '0.12em',
                                                color: 'var(--text-tertiary)',
                                            }}>
                                                {job.employer}
                                            </span>
                                            {job.jobType && <Badge variant="primary" size="sm">{job.jobType}</Badge>}
                                            {fresh && (
                                                <span style={{
                                                    fontSize: '10px', fontWeight: 700, padding: '2px 10px',
                                                    borderRadius: '8px',
                                                    background: 'linear-gradient(135deg, #10b981, #059669)',
                                                    color: '#fff',
                                                }}>
                                                    NEW
                                                </span>
                                            )}
                                        </div>

                                        {/* Title */}
                                        <div className="fj-title" style={{
                                            fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)',
                                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                            marginBottom: '7px',
                                            transition: 'color 0.3s',
                                        }}>
                                            {job.title}
                                        </div>

                                        {/* Meta row */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                                                <MapPin size={13} style={{ color: 'var(--color-primary)' }} />
                                                {job.location}
                                            </span>
                                            {job.displaySalary && (
                                                <span style={{
                                                    fontSize: '13px', fontWeight: 700,
                                                    color: 'var(--salary-color, #1d4ed8)',
                                                }}>
                                                    {job.displaySalary}
                                                </span>
                                            )}
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                                <Clock size={11} />
                                                {relativeTime(job.originalPostedAt || job.createdAt)}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Arrow */}
                                    <div className="fj-arrow" style={{
                                        flexShrink: 0,
                                        width: '32px', height: '32px', borderRadius: '10px',
                                        backgroundColor: 'var(--bg-tertiary)',
                                        border: '1px solid var(--border-color)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <ArrowRight size={16} style={{ color: 'var(--color-primary)' }} />
                                    </div>
                                </Link>
                            </motion.div>
                        );
                    })}
                </motion.div>

                {/* CTA — Solid gradient button */}
                <motion.div
                    style={{ textAlign: 'center', marginTop: '48px' }}
                    variants={ctaPop}
                >
                    <Link
                        href="/jobs"
                        className="fj-cta-btn"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '8px',
                            padding: '14px 36px', borderRadius: '14px',
                            fontSize: '14px', fontWeight: 700, color: '#fff',
                            background: 'linear-gradient(135deg, #0d9488, #059669)',
                            textDecoration: 'none',
                            boxShadow: '0 4px 20px rgba(13,148,136,0.3), 0 0 40px rgba(13,148,136,0.08)',
                            transition: 'all 0.3s',
                        }}
                    >
                        Browse All Jobs
                        <ArrowRight size={16} />
                    </Link>
                </motion.div>
            </div>
        </motion.section>
    );
}
