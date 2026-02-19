'use client';

import Link from 'next/link';
import {
    Wifi, Monitor, Plane, GraduationCap,
    Clock, MapPin, DollarSign, Search, ArrowUpRight,
} from 'lucide-react';
import { motion } from 'framer-motion';

const categories = [
    {
        label: 'Remote Jobs', href: '/jobs/remote', icon: Wifi,
        color: '#E86C2C', tag: 'Most Popular',
        desc: 'Work from anywhere in the US', span: 2,
    },
    {
        label: 'Telehealth', href: '/jobs/telehealth', icon: Monitor,
        color: '#2dd4bf', tag: null,
        desc: 'Virtual patient care roles', span: 1,
    },
    {
        label: 'Travel', href: '/jobs/travel', icon: Plane,
        color: '#818cf8', tag: null,
        desc: 'Short-term travel assignments', span: 1,
    },
    {
        label: 'New Grad', href: '/jobs/new-grad', icon: GraduationCap,
        color: '#f472b6', tag: null,
        desc: 'Entry-level friendly', span: 1,
    },
    {
        label: 'Per Diem', href: '/jobs/per-diem', icon: Clock,
        color: '#fbbf24', tag: null,
        desc: 'Flexible scheduling', span: 1,
    },
    {
        label: 'Salary Guide', href: '/salary-guide', icon: DollarSign,
        color: '#22c55e', tag: 'Free',
        desc: '2026 compensation data', span: 2,
    },
    {
        label: 'By Location', href: '/jobs/locations', icon: MapPin,
        color: '#34d399', tag: null,
        desc: 'Find jobs near you', span: 1,
    },
    {
        label: 'All Jobs', href: '/jobs', icon: Search,
        color: '#60a5fa', tag: null,
        desc: 'Browse everything', span: 1,
    },
];

/* ── Framer Motion variants ── */
const gridContainer = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.06, delayChildren: 0.15 } },
};
const cardVariant = {
    hidden: { opacity: 0, y: 24, scale: 0.97 },
    visible: {
        opacity: 1, y: 0, scale: 1,
        transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
    },
};
const headerVariant = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] } },
};

const css = `
    @media (max-width: 700px) {
        .eo-bento-grid { grid-template-columns: 1fr 1fr !important; }
        .eo-bento-grid > div { grid-column: span 1 !important; }
    }
    @media (max-width: 440px) {
        .eo-bento-grid { grid-template-columns: 1fr !important; }
    }
    .eo-card {
        display: flex;
        align-items: center;
        gap: 14px;
        text-decoration: none;
        padding: 20px;
        border-radius: 14px;
        border: 1px solid var(--border-color);
        background: transparent;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .eo-card:hover {
        border-color: rgba(45, 212, 191, 0.3);
        background: rgba(45, 212, 191, 0.03);
        transform: translateY(-3px);
    }
    .eo-card:hover .eo-arrow {
        opacity: 1;
        color: #2dd4bf;
    }
`;

export default function ExploreOpportunities() {
    return (
        <section style={{ backgroundColor: 'var(--bg-primary)', padding: '72px 0' }}>
            <style>{css}</style>
            <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 20px' }}>
                {/* Header */}
                <motion.div
                    style={{ marginBottom: '40px' }}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, amount: 0.3 }}
                    variants={headerVariant}
                >
                    <h2 style={{
                        fontSize: '28px', fontWeight: 700, letterSpacing: '-0.02em',
                        color: 'var(--text-primary)', margin: '0 0 6px',
                    }}>
                        Explore Opportunities
                    </h2>
                    <p style={{ fontSize: '15px', color: 'var(--text-muted)', margin: 0 }}>
                        Browse curated categories built for psychiatric NPs
                    </p>
                </motion.div>

                {/* Bento grid */}
                <motion.div
                    className="eo-bento-grid"
                    style={{
                        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px',
                    }}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, amount: 0.1 }}
                    variants={gridContainer}
                >
                    {categories.map((cat) => {
                        const Icon = cat.icon;
                        return (
                            <motion.div
                                key={cat.href}
                                variants={cardVariant}
                                whileHover={{
                                    y: -3,
                                    transition: { type: 'spring', stiffness: 400, damping: 25 },
                                }}
                                style={{ gridColumn: `span ${cat.span}` }}
                            >
                                <Link href={cat.href} className="eo-card">
                                    {/* Icon */}
                                    <div
                                        style={{
                                            width: '40px', height: '40px', borderRadius: '10px',
                                            background: `${cat.color}12`,
                                            border: `1px solid ${cat.color}20`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            flexShrink: 0,
                                        }}
                                    >
                                        <Icon size={18} style={{ color: cat.color }} />
                                    </div>

                                    {/* Text */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                                            <span style={{
                                                fontSize: '14px', fontWeight: 600,
                                                color: 'var(--text-primary)',
                                            }}>
                                                {cat.label}
                                            </span>
                                            {cat.tag && (
                                                <span style={{
                                                    fontSize: '10px', fontWeight: 600,
                                                    textTransform: 'uppercase', letterSpacing: '0.04em',
                                                    padding: '2px 8px', borderRadius: '6px',
                                                    color: cat.color,
                                                    backgroundColor: `${cat.color}12`,
                                                }}>
                                                    {cat.tag}
                                                </span>
                                            )}
                                        </div>
                                        <p style={{
                                            fontSize: '12px', color: 'var(--text-muted)',
                                            margin: 0, lineHeight: 1.4,
                                        }}>
                                            {cat.desc}
                                        </p>
                                    </div>

                                    {/* Arrow */}
                                    <ArrowUpRight
                                        className="eo-arrow"
                                        size={16}
                                        style={{
                                            color: 'var(--text-muted)',
                                            opacity: 0.4,
                                            flexShrink: 0,
                                            transition: 'all 0.3s',
                                        }}
                                    />
                                </Link>
                            </motion.div>
                        );
                    })}
                </motion.div>
            </div>
        </section>
    );
}
