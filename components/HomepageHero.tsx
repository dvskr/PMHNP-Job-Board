'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Search, MapPin, Globe, Monitor, Clock, Clock3, GraduationCap, ArrowRight } from 'lucide-react';
import { XLogo, FacebookLogo, InstagramLogo, LinkedinLogo, YoutubeLogo } from '@phosphor-icons/react';
import { motion } from 'framer-motion';

interface HomepageHeroProps {
    jobCountDisplay: string;
}

const quickFilters = [
    { label: 'Remote', query: 'Remote', icon: Globe },
    { label: 'Telehealth', query: 'Telehealth', icon: Monitor },
    { label: 'Full-Time', query: 'Full-Time', icon: Clock },
    { label: 'Part-Time', query: 'Part-Time', icon: Clock3 },
    { label: 'New Grad', query: 'New Grad Friendly', icon: GraduationCap },
];

const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};
const fadeUp = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] } },
};

export default function HomepageHero({ jobCountDisplay }: HomepageHeroProps) {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState('');
    const [locationQuery, setLocationQuery] = useState('');

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        const params = new URLSearchParams();
        if (searchQuery.trim()) params.set('q', searchQuery.trim());
        if (locationQuery.trim()) params.set('location', locationQuery.trim());
        const queryString = params.toString();
        router.push(queryString ? `/jobs?${queryString}` : '/jobs');
    };

    return (
        <section
            style={{
                position: 'relative',
                margin: 0,
                padding: 0,
                marginTop: -80,
                overflow: 'hidden',
                minHeight: '100vh',
            }}
        >
            {/* ── Nurse crowd background — fills viewport, anchored bottom ── */}
            <Image
                src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/hero-nurses.webp"
                alt="Diverse community of PMHNP professionals"
                fill
                priority
                sizes="100vw"
                unoptimized
                style={{
                    objectFit: 'cover',
                    objectPosition: 'center bottom',
                }}
            />

            {/* ── Top fade — cream fades into nurse crowd ── */}
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    background: `linear-gradient(to bottom, 
                        rgba(250,248,243,1) 0%, 
                        rgba(250,248,243,0.98) 25%, 
                        rgba(250,248,243,0.85) 45%, 
                        rgba(250,248,243,0.3) 65%, 
                        transparent 80%
                    )`,
                    pointerEvents: 'none',
                }}
            />

            {/* ── Centered content ── */}
            <motion.div
                variants={container}
                initial="hidden"
                animate="show"
                style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    textAlign: 'center',
                    padding: '70px 24px 40px',
                }}
            >
                {/* ── Eyebrow ── */}
                <motion.p
                    variants={fadeUp}
                    style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.14em',
                        color: '#0D9488',
                        marginBottom: '16px',
                    }}
                >
                    The #1 PMHNP Job Board
                </motion.p>

                {/* ── Headline ── */}
                <motion.h1
                    variants={fadeUp}
                    className="font-heading"
                    style={{
                        fontSize: 'clamp(2.4rem, 5vw, 3.6rem)',
                        fontWeight: 800,
                        lineHeight: 1.1,
                        color: '#1a2332',
                        marginBottom: '16px',
                    }}
                >
                    Find Your Next{' '}
                    <span style={{ color: '#0D9488' }}>PMHNP Role</span>
                </motion.h1>

                {/* ── Subtitle ── */}
                <motion.p
                    variants={fadeUp}
                    style={{
                        fontSize: '17px',
                        lineHeight: 1.6,
                        color: '#5a6577',
                        marginBottom: '32px',
                        maxWidth: '480px',
                    }}
                >
                    {jobCountDisplay} verified positions across all 50 states.
                </motion.p>

                {/* ── Search bar ── */}
                <motion.form
                    variants={fadeUp}
                    onSubmit={handleSubmit}
                    style={{ width: '100%', maxWidth: '580px', marginBottom: '20px' }}
                >
                    <div
                        className="hero-search-bar"
                        style={{
                            display: 'flex',
                            alignItems: 'stretch',
                            borderRadius: '20px',
                            overflow: 'hidden',
                            background: 'rgba(255,255,255,0.95)',
                            backdropFilter: 'blur(12px)',
                            border: '1px solid rgba(255,255,255,0.6)',
                            boxShadow: '8px 8px 20px rgba(0,0,0,0.08), -4px -4px 12px rgba(255,255,255,0.9), inset 2px 2px 5px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.02)',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 18px', flex: 1, minWidth: 0 }}>
                            <Search size={18} style={{ color: '#9ca3af', flexShrink: 0 }} />
                            <input
                                placeholder="Job title or keyword"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                autoComplete="off"
                                className="hero-search-input"
                                style={{ boxShadow: 'none', outline: 'none', border: 'none', background: 'transparent', width: '100%', fontSize: '0.9rem', color: '#1f2937', textAlign: 'left' }}
                                onFocus={(e) => { e.target.style.boxShadow = 'none'; e.target.style.outline = 'none'; }}
                            />
                        </div>
                        <div className="hero-search-divider" style={{ width: '1px', background: '#e5e7eb', flexShrink: 0, margin: '10px 0' }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 18px', flex: 1, minWidth: 0 }}>
                            <MapPin size={18} style={{ color: '#9ca3af', flexShrink: 0 }} />
                            <input
                                placeholder="City or 'Remote'"
                                value={locationQuery}
                                onChange={(e) => setLocationQuery(e.target.value)}
                                autoComplete="off"
                                className="hero-search-input"
                                style={{ boxShadow: 'none', outline: 'none', border: 'none', background: 'transparent', width: '100%', fontSize: '0.9rem', color: '#1f2937', textAlign: 'left' }}
                                onFocus={(e) => { e.target.style.boxShadow = 'none'; e.target.style.outline = 'none'; }}
                            />
                        </div>
                        <button
                            type="submit"
                            className="hero-search-btn"
                            style={{
                                background: '#0D9488',
                                color: 'white',
                                padding: '0 28px',
                                fontSize: '14px',
                                fontWeight: 600,
                                border: 'none',
                                cursor: 'pointer',
                                flexShrink: 0,
                                transition: 'all 0.2s ease',
                                boxShadow: 'inset 2px 2px 4px rgba(255,255,255,0.2), inset -1px -1px 2px rgba(0,0,0,0.08)',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = '#0f766e'; e.currentTarget.style.transform = 'scale(1.02)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = '#0D9488'; e.currentTarget.style.transform = 'scale(1)'; }}
                        >
                            Search
                        </button>
                    </div>
                    <style jsx global>{`
                        @media (max-width: 540px) {
                            .hero-search-bar {
                                flex-direction: column !important;
                                border-radius: 16px !important;
                            }
                            .hero-search-divider {
                                width: 100% !important;
                                height: 1px !important;
                                margin: 0 18px !important;
                            }
                            .hero-search-btn {
                                padding: 14px 28px !important;
                                border-radius: 0 0 16px 16px !important;
                            }
                        }
                    `}</style>
                </motion.form>

                {/* ── Quick filters ── */}
                <motion.div
                    variants={fadeUp}
                    style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '20px' }}
                >
                    {quickFilters.map((filter) => {
                        const Icon = filter.icon;
                        return (
                            <Link
                                key={filter.label}
                                href={`/jobs?q=${encodeURIComponent(filter.query)}`}
                                className="hero-filter-badge"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    padding: '8px 18px',
                                    borderRadius: '24px',
                                    fontSize: '13px',
                                    fontWeight: 500,
                                    background: '#D5F5F1',
                                    color: '#0F766E',
                                    textDecoration: 'none',
                                    border: '1px solid rgba(255,255,255,0.5)',
                                    boxShadow: '4px 4px 10px rgba(13,148,136,0.10), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)',
                                    transition: 'all 0.2s ease',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = '#99F6E4';
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.boxShadow = '6px 6px 14px rgba(13,148,136,0.15), -3px -3px 8px rgba(255,255,255,0.9), inset 2px 2px 5px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = '#D5F5F1';
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = '4px 4px 10px rgba(13,148,136,0.10), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)';
                                }}
                            >
                                <Icon size={14} />
                                {filter.label}
                            </Link>
                        );
                    })}
                    <Link
                        href="/jobs"
                        className="hero-filter-badge"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '8px 20px',
                            borderRadius: '24px',
                            fontSize: '13px',
                            fontWeight: 600,
                            background: '#B2F5EA',
                            color: '#0F766E',
                            textDecoration: 'none',
                            border: '1px solid rgba(255,255,255,0.5)',
                            boxShadow: '5px 5px 12px rgba(13,148,136,0.12), -3px -3px 8px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)',
                            transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#5EEAD4';
                            e.currentTarget.style.color = '#064E3B';
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '7px 7px 16px rgba(13,148,136,0.18), -4px -4px 10px rgba(255,255,255,0.9), inset 2px 2px 5px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#B2F5EA';
                            e.currentTarget.style.color = '#0F766E';
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '5px 5px 12px rgba(13,148,136,0.12), -3px -3px 8px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)';
                        }}
                    >
                        Browse all <ArrowRight size={14} />
                    </Link>
                </motion.div>

                {/* ── Clay CTA buttons ── */}
                <motion.div
                    variants={fadeUp}
                    className="hero-cta-row"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}
                >
                    <Link
                        href="/jobs"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '14px 32px',
                            fontSize: '15px',
                            fontWeight: 600,
                            color: 'rgba(15,23,42,0.8)',
                            textDecoration: 'none',
                            background: 'linear-gradient(145deg, #5eead4cc, #5eead488)',
                            borderRadius: '54% 46% 62% 38% / 49% 55% 45% 51%',
                            boxShadow: 'inset 4px 4px 8px rgba(255,255,255,0.5), inset -3px -3px 6px rgba(0,0,0,0.06), 0 6px 18px rgba(0,0,0,0.1)',
                            transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-3px) scale(1.06)';
                            e.currentTarget.style.boxShadow = 'inset 4px 4px 8px rgba(255,255,255,0.5), inset -3px -3px 6px rgba(0,0,0,0.06), 0 12px 28px rgba(0,0,0,0.15)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0) scale(1)';
                            e.currentTarget.style.boxShadow = 'inset 4px 4px 8px rgba(255,255,255,0.5), inset -3px -3px 6px rgba(0,0,0,0.06), 0 6px 18px rgba(0,0,0,0.1)';
                        }}
                    >
                        Browse Jobs →
                    </Link>
                    <Link
                        href="/post-job"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '14px 32px',
                            fontSize: '15px',
                            fontWeight: 600,
                            color: 'rgba(15,23,42,0.8)',
                            textDecoration: 'none',
                            background: 'linear-gradient(145deg, #f9a8d4cc, #f9a8d488)',
                            borderRadius: '46% 54% 38% 62% / 55% 45% 51% 49%',
                            boxShadow: 'inset 4px 4px 8px rgba(255,255,255,0.5), inset -3px -3px 6px rgba(0,0,0,0.06), 0 6px 18px rgba(0,0,0,0.1)',
                            transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-3px) scale(1.06)';
                            e.currentTarget.style.boxShadow = 'inset 4px 4px 8px rgba(255,255,255,0.5), inset -3px -3px 6px rgba(0,0,0,0.06), 0 12px 28px rgba(0,0,0,0.15)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0) scale(1)';
                            e.currentTarget.style.boxShadow = 'inset 4px 4px 8px rgba(255,255,255,0.5), inset -3px -3px 6px rgba(0,0,0,0.06), 0 6px 18px rgba(0,0,0,0.1)';
                        }}
                    >
                        Post a Job →
                    </Link>
                </motion.div>

                {/* ── Social pebbles ── */}
                <motion.div
                    variants={fadeUp}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
                >
                    {[
                        { icon: XLogo, href: 'https://x.com/pmhnphiring', label: 'X', color: '#6ee7b7', shape: '54% 46% 62% 38% / 49% 55% 45% 51%' },
                        { icon: FacebookLogo, href: 'https://www.facebook.com/pmhnphiring', label: 'Facebook', color: '#5eead4', shape: '61% 39% 45% 55% / 40% 62% 38% 60%' },
                        { icon: InstagramLogo, href: 'https://www.instagram.com/pmhnphiring', label: 'Instagram', color: '#67e8f9', shape: '42% 58% 55% 45% / 58% 42% 60% 40%' },
                        { icon: LinkedinLogo, href: 'https://www.linkedin.com/company/pmhnpjobs', label: 'LinkedIn', color: '#a5b4fc', shape: '67% 33% 48% 52% / 45% 58% 42% 55%' },
                        { icon: YoutubeLogo, href: 'https://www.youtube.com/@pmhnphiring', label: 'YouTube', color: '#c4b5fd', shape: '50% 50% 60% 40% / 55% 45% 52% 48%' },
                    ].map((s) => {
                        const Icon = s.icon;
                        return (
                            <a
                                key={s.label}
                                href={s.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={s.label}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: 38,
                                    height: 34,
                                    background: `linear-gradient(145deg, ${s.color}cc, ${s.color}88)`,
                                    borderRadius: s.shape,
                                    boxShadow: 'inset 3px 3px 6px rgba(255,255,255,0.45), inset -2px -2px 4px rgba(0,0,0,0.06), 0 4px 10px rgba(0,0,0,0.08)',
                                    transition: 'transform 0.25s ease, box-shadow 0.25s ease',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'translateY(-3px) scale(1.12)';
                                    e.currentTarget.style.boxShadow = 'inset 3px 3px 6px rgba(255,255,255,0.45), inset -2px -2px 4px rgba(0,0,0,0.06), 0 8px 20px rgba(0,0,0,0.14)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'translateY(0) scale(1)';
                                    e.currentTarget.style.boxShadow = 'inset 3px 3px 6px rgba(255,255,255,0.45), inset -2px -2px 4px rgba(0,0,0,0.06), 0 4px 10px rgba(0,0,0,0.08)';
                                }}
                            >
                                <Icon size={16} weight="fill" style={{ color: 'rgba(51,65,85,0.7)' }} />
                            </a>
                        );
                    })}
                </motion.div>
            </motion.div>
        </section>
    );
}
