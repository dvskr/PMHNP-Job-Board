'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { MapPin, Clock, ArrowUpRight, Briefcase, DollarSign } from 'lucide-react';
import { motion } from 'framer-motion';
import { trackJobListView, buildJobItem } from '@/lib/analytics';

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

const fadeUp = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};
const fadeLeft = {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.5 } },
};
const fadeRight = {
    hidden: { opacity: 0, x: 20 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.5 } },
};
const stagger = {
    visible: { transition: { staggerChildren: 0.12 } },
};

const STEPS = [
    { img: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/step-profile.webp', title: 'Build a Profile', desc: 'Create your PMHNP profile with credentials, experience, and preferences in minutes.' },
    { img: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/step-match.webp', title: 'Get Matched', desc: 'Our AI matches you with roles based on your skills, location, and salary goals.' },
    { img: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/step-connect.webp', title: 'Connect Directly', desc: 'Reach hiring managers — no recruiters, no middlemen.' },
    { img: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/step-practice.webp', title: 'Start Practicing', desc: 'Accept your offer and begin your new clinical role.' },
];

const css = `
    .fjs-wrap {
        background: linear-gradient(175deg, #2A0E1E 0%, #3A1228 35%, #220B18 100%);
        position: relative;
        overflow: hidden;
    }
    .fjs-wrap::before {
        content: '';
        position: absolute;
        top: -200px;
        right: -100px;
        width: 500px;
        height: 500px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(220,120,140,0.06) 0%, transparent 70%);
        pointer-events: none;
    }
    .fjs-wrap::after {
        content: '';
        position: absolute;
        bottom: -150px;
        left: -80px;
        width: 400px;
        height: 400px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(180,100,160,0.05) 0%, transparent 70%);
        pointer-events: none;
    }

    /* ── Split layout ── */
    .fjs-split {
        display: flex;
        max-width: 1360px;
        margin: 0 auto;
        gap: 0;
    }
    .fjs-col-left {
        width: 500px;
        flex-shrink: 0;
        padding: 0 48px 80px 56px;
        position: relative;
    }
    .fjs-col-right {
        flex: 1;
        padding: 0 56px 80px 48px;
        border-left: 1px solid rgba(255,255,255,0.05);
    }
    @media (max-width: 1023px) {
        .fjs-split { flex-direction: column; }
        .fjs-col-left { width: 100%; padding: 0 24px 48px; }
        .fjs-col-right { padding: 0 24px 48px; border-left: none; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 48px; }
    }
    @media (max-width: 768px) {
        .fjs-col-left { padding: 0 20px 36px; }
        .fjs-col-right { padding: 0 20px 36px; padding-top: 36px; }
    }
    @media (max-width: 520px) {
        .fjs-col-left { padding: 0 16px 28px; }
        .fjs-col-right { padding: 0 16px 28px; padding-top: 28px; }
    }

    /* ── Vertical spine ── */
    .fjs-spine {
        position: relative;
        padding-left: 32px;
    }
    .fjs-spine::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 2px;
        background: linear-gradient(to bottom, rgba(220,120,140,0.4), rgba(180,100,160,0.2), transparent);
        border-radius: 2px;
    }
    .fjs-spine-node {
        position: relative;
        padding-bottom: 40px;
    }
    .fjs-spine-node:last-child {
        padding-bottom: 0;
    }
    /* Glowing dot on the spine */
    .fjs-spine-node::before {
        content: '';
        position: absolute;
        left: -37px;
        top: 8px;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: linear-gradient(135deg, #e8788c, #c05a7a);
        box-shadow: 0 0 12px rgba(220,120,140,0.5), 0 0 24px rgba(220,120,140,0.2);
    }
    /* Pulse ring */
    .fjs-spine-node::after {
        content: '';
        position: absolute;
        left: -41px;
        top: 4px;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 1px solid rgba(220,120,140,0.3);
        animation: fjsPulse 2s ease-in-out infinite;
    }
    @keyframes fjsPulse {
        0%, 100% { transform: scale(1); opacity: 0.5; }
        50% { transform: scale(1.4); opacity: 0; }
    }

    /* ── Job row hover ── */
    .fjs-job {
        display: flex;
        align-items: center;
        gap: 24px;
        padding: 24px 0;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        text-decoration: none;
        transition: all 0.3s;
    }
    .fjs-job:hover .fjs-num { color: rgba(220,120,140,0.4) !important; }
    .fjs-job:hover .fjs-jtitle { color: #f4c2cc !important; }
    .fjs-job:hover .fjs-circle-cta {
        transform: scale(1.1) !important;
        box-shadow: 0 4px 20px rgba(200,90,120,0.4) !important;
    }
    @media (max-width: 768px) {
        .fjs-job { gap: 16px; padding: 20px 0; }
        .fjs-num { font-size: 28px !important; min-width: 36px !important; }
        .fjs-jtitle { font-size: 18px !important; }
        .fjs-circle-cta { width: 36px !important; height: 36px !important; }
    }
    @media (max-width: 520px) {
        .fjs-num { display: none !important; }
        .fjs-job { gap: 12px; padding: 16px 0; }
        .fjs-jtitle { font-size: 16px !important; }
    }
    @media (max-width: 768px) {
        .fjs-header { padding: 48px 20px 36px !important; }
        .fjs-header h2 { font-size: 28px !important; }
    }
    @media (max-width: 520px) {
        .fjs-header { padding: 40px 16px 28px !important; }
        .fjs-header h2 { font-size: 24px !important; }
    }
`;

export default function FeaturedJobs({ jobs }: FeaturedJobsProps) {
    useEffect(() => {
        if (jobs.length === 0) return;
        trackJobListView(
            jobs.map(j => buildJobItem({ id: j.id, title: j.title, employer: j.employer })),
            'Homepage Featured Jobs',
        );
    }, [jobs]);

    if (jobs.length === 0) return null;

    return (
        <section className="fjs-wrap">
            <style>{css}</style>

            {/* ── Header ── */}
            <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-60px' }}
                variants={stagger}
                style={{ maxWidth: '1360px', margin: '0 auto', padding: '80px 56px 56px', position: 'relative', zIndex: 1 }}
                className="fjs-header"
            >
                <motion.p
                    variants={fadeUp}
                    style={{ fontSize: '13px', fontWeight: 600, color: '#e8788c', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '12px' }}
                >
                    A seamless path to your next role
                </motion.p>
                <motion.h2
                    variants={fadeUp}
                    className="font-lora"
                    style={{ fontSize: '44px', fontWeight: 700, color: '#fff', margin: 0, lineHeight: 1.15 }}
                >
                    How it works
                </motion.h2>
            </motion.div>

            {/* ── SPLIT: Process Left / Jobs Right ── */}
            <div className="fjs-split" style={{ position: 'relative', zIndex: 1 }}>

                {/* ═══ LEFT: Vertical process spine ═══ */}
                <motion.div
                    className="fjs-col-left"
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    variants={stagger}
                >
                    <div className="fjs-spine">
                        {STEPS.map((step, i) => (
                            <motion.div
                                key={i}
                                className="fjs-spine-node"
                                variants={fadeLeft}
                            >
                                {/* Notion-style illustration */}
                                <div style={{
                                    width: 180,
                                    height: 180,
                                    marginBottom: '16px',
                                    borderRadius: '20px',
                                    overflow: 'hidden',
                                }}>
                                    <Image
                                        src={step.img}
                                        alt={step.title}
                                        width={180}
                                        height={180}
                                        style={{ objectFit: 'cover', borderRadius: '20px' }}
                                        loading="lazy"
                                        placeholder="blur"
                                        blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTgwIiBoZWlnaHQ9IjE4MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTgwIiBoZWlnaHQ9IjE4MCIgZmlsbD0iIzNhMTIyOCIvPjwvc3ZnPg=="
                                    />
                                </div>

                                <h4 style={{ fontSize: '18px', fontWeight: 700, color: '#f8e8ec', margin: '0 0 6px' }}>
                                    {step.title}
                                </h4>
                                <p style={{ fontSize: '13px', color: 'rgba(248,232,236,0.4)', margin: 0, lineHeight: 1.55 }}>
                                    {step.desc}
                                </p>
                            </motion.div>
                        ))}
                    </div>

                    {/* CTA */}
                    <motion.div variants={fadeLeft} style={{ marginTop: '32px', paddingLeft: '32px' }}>
                        <Link
                            href="/register"
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '13px 32px',
                                fontSize: '13px',
                                fontWeight: 700,
                                color: '#fff',
                                textTransform: 'uppercase',
                                letterSpacing: '0.08em',
                                background: 'linear-gradient(135deg, #c05a7a, #e8788c)',
                                borderRadius: '12px',
                                boxShadow: '0 4px 20px rgba(200,90,120,0.3)',
                                textDecoration: 'none',
                                transition: 'transform 0.3s, box-shadow 0.3s',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'translateY(-3px)';
                                e.currentTarget.style.boxShadow = '0 8px 32px rgba(200,90,120,0.45)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = '0 4px 20px rgba(200,90,120,0.3)';
                            }}
                        >
                            Join Now <ArrowUpRight size={15} />
                        </Link>
                    </motion.div>
                </motion.div>

                {/* ═══ RIGHT: Featured jobs ═══ */}
                <motion.div
                    className="fjs-col-right"
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    variants={stagger}
                >
                    <motion.div variants={fadeRight} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <p style={{ fontSize: '13px', fontWeight: 600, color: '#e8788c', textTransform: 'uppercase', letterSpacing: '0.15em', margin: 0 }}>
                            Latest openings
                        </p>
                        <Link
                            href="/jobs"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '13px', fontWeight: 600, color: 'rgba(248,232,236,0.5)', textDecoration: 'none' }}
                        >
                            View all <ArrowUpRight size={13} />
                        </Link>
                    </motion.div>

                    {jobs.slice(0, 8).map((job, i) => {
                        const href = job.slug ? `/jobs/${job.slug}` : `/jobs/${job.id}`;
                        const postedDate = job.originalPostedAt || job.createdAt;

                        return (
                            <motion.div key={job.id} variants={fadeRight}>
                                <Link href={href} className="fjs-job">
                                    {/* Styled number */}
                                    <span
                                        className="fjs-num font-lora"
                                        style={{
                                            fontSize: '40px',
                                            fontWeight: 800,
                                            color: 'rgba(255,255,255,0.06)',
                                            lineHeight: 1,
                                            minWidth: '48px',
                                            flexShrink: 0,
                                            transition: 'color 0.3s',
                                        }}
                                    >
                                        {String(i + 1).padStart(2, '0')}
                                    </span>

                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        {/* Employer row */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(248,232,236,0.55)', letterSpacing: '0.02em' }}>
                                                {job.employer}
                                            </span>
                                            <span style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>
                                            {job.jobType && (
                                                <>
                                                    <span style={{ fontSize: '13px', color: 'rgba(248,232,236,0.45)' }}>
                                                        {job.jobType}
                                                    </span>
                                                    <span style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>
                                                </>
                                            )}
                                            {/* "New" recency badge removed — relativeTime below already conveys freshness. */}
                                            <span style={{ fontSize: '12px', color: 'rgba(248,232,236,0.35)' }}>
                                                {relativeTime(postedDate)}
                                            </span>
                                        </div>

                                        {/* Big title */}
                                        <h3
                                            className="fjs-jtitle font-lora"
                                            style={{
                                                fontSize: '22px',
                                                fontWeight: 700,
                                                color: '#f8e8ec',
                                                lineHeight: 1.3,
                                                margin: '0 0 8px',
                                                transition: 'color 0.3s',
                                            }}
                                        >
                                            {job.title}
                                        </h3>

                                        {/* Details row */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '14px', color: 'rgba(248,232,236,0.5)' }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                <MapPin size={13} style={{ color: '#e8788c' }} />
                                                {job.location}
                                            </span>
                                            {job.displaySalary && (
                                                <span style={{ fontWeight: 700, color: '#6ee7b7', fontSize: '14px' }}>
                                                    {job.displaySalary}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Circle CTA */}
                                    <div
                                        className="fjs-circle-cta"
                                        style={{
                                            width: 44,
                                            height: 44,
                                            borderRadius: '50%',
                                            background: 'linear-gradient(135deg, #c05a7a, #e8788c)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0,
                                            alignSelf: 'center',
                                            transition: 'transform 0.3s, box-shadow 0.3s',
                                            boxShadow: '0 2px 12px rgba(200,90,120,0.2)',
                                        }}
                                    >
                                        <ArrowUpRight size={18} style={{ color: '#fff' }} />
                                    </div>
                                </Link>
                            </motion.div>
                        );
                    })}
                </motion.div>
            </div>
        </section>
    );
}
