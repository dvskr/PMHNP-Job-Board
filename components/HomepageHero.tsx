'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Search, MapPin, Globe, Monitor, Clock, Clock3, GraduationCap } from 'lucide-react';
import { LazyMotion, domAnimation, m } from 'framer-motion';

interface HomepageHeroProps {
    jobCountDisplay: string;
    /** Real employer count for the subtitle stats line. Optional so
     *  app/page.tsx keeps working unchanged; the subtitle falls back to the
     *  50-states line when either stat is missing. */
    totalCompanies?: number;
    /** Percentage (0-100) of published jobs that display a salary. */
    salaryTransparencyPct?: number;
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

export default function HomepageHero({ jobCountDisplay, totalCompanies, salaryTransparencyPct }: HomepageHeroProps) {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState('');
    const [locationQuery, setLocationQuery] = useState('');

    const hasRealStats =
        typeof totalCompanies === 'number' && totalCompanies > 0 &&
        typeof salaryTransparencyPct === 'number' && salaryTransparencyPct > 0;

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        const params = new URLSearchParams();
        if (searchQuery.trim()) params.set('q', searchQuery.trim());
        if (locationQuery.trim()) params.set('location', locationQuery.trim());
        const queryString = params.toString();
        router.push(queryString ? `/jobs?${queryString}` : '/jobs');
    };

    return (
        <LazyMotion features={domAnimation}>
        {/* minHeight 85vh (not a fixed 100vh) + statically-positioned content:
            the section can GROW when the content is taller than the viewport
            (short/mobile screens) instead of clipping behind overflow:hidden,
            and jobs below start closer to the fold on desktop. */}
        <section
            style={{
                position: 'relative',
                margin: 0,
                padding: 0,
                marginTop: -80,
                overflow: 'hidden',
                minHeight: '85vh',
            }}
        >
            {/* ── Nurse crowd background — fills viewport, anchored bottom ── */}
            <Image
                src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/hero-nurses.webp"
                alt="Diverse community of PMHNP professionals"
                fill
                priority
                fetchPriority="high"
                sizes="100vw"
                quality={75}
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
                        rgba(245,240,235,1) 0%,
                        rgba(245,240,235,0.98) 25%,
                        rgba(245,240,235,0.85) 45%,
                        rgba(245,240,235,0.3) 65%,
                        transparent 80%
                    )`,
                    pointerEvents: 'none',
                }}
            />

            {/* ── Centered content — in normal flow so the section grows with
                   it; only the background image/gradient stay absolute ── */}
            <m.div
                variants={container}
                initial="hidden"
                animate="show"
                style={{
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    textAlign: 'center',
                    padding: '70px 24px 40px',
                }}
            >
                {/* ── Eyebrow ── */}
                <m.p
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
                </m.p>

                {/* ── Headline ── */}
                <m.h1
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
                </m.h1>

                {/* ── Subtitle ── */}
                <m.p
                    variants={fadeUp}
                    style={{
                        fontSize: '17px',
                        lineHeight: 1.6,
                        color: '#5a6577',
                        marginBottom: '32px',
                        maxWidth: '480px',
                    }}
                >
                    {hasRealStats
                        ? `${jobCountDisplay} open roles · ${totalCompanies} employers · ${salaryTransparencyPct}% show salary.`
                        : `${jobCountDisplay} open positions across all 50 states.`}
                </m.p>

                {/* ── Search bar ── */}
                <m.form
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
                            <Search size={18} style={{ color: '#9ca3af', flexShrink: 0 }} aria-hidden="true" />
                            {/* SEO Fix C2/C3: aria-label gives screen readers a name (WCAG 4.1.2);
                                onFocus outline-stripping removed so the focus-visible ring in
                                globals.css is allowed to render (WCAG 2.4.7). */}
                            <input
                                aria-label="Job title or keyword"
                                placeholder="Job title or keyword"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                autoComplete="off"
                                className="hero-search-input"
                                style={{ border: 'none', background: 'transparent', width: '100%', fontSize: '16px', color: '#1f2937', textAlign: 'left' }}
                            />
                        </div>
                        <div className="hero-search-divider" style={{ width: '1px', background: '#e5e7eb', flexShrink: 0, margin: '10px 0' }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 18px', flex: 1, minWidth: 0 }}>
                            <MapPin size={18} style={{ color: '#9ca3af', flexShrink: 0 }} aria-hidden="true" />
                            <input
                                aria-label="City or remote"
                                placeholder="City or 'Remote'"
                                value={locationQuery}
                                onChange={(e) => setLocationQuery(e.target.value)}
                                autoComplete="off"
                                className="hero-search-input"
                                style={{ border: 'none', background: 'transparent', width: '100%', fontSize: '16px', color: '#1f2937', textAlign: 'left' }}
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
                </m.form>

                {/* ── Quick filters ── */}
                <m.div
                    variants={fadeUp}
                    style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '28px' }}
                >
                    {quickFilters.map((filter) => {
                        const Icon = filter.icon;
                        return (
                            <Link
                                key={filter.label}
                                href={`/jobs?q=${encodeURIComponent(filter.query)}`}
                                className="hero-filter-badge"
                                style={{
                                    // SEO Fix M13: padding 8px 18px → 12px 20px
                                    // gives the pill ~44px tap-target height
                                    // (24px line + 12px*2 = 48px) — clears
                                    // WCAG 2.5.8 (24px AA) with margin and
                                    // Apple/Google's 44px informal target.
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '12px 20px',
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
                </m.div>

                {/* ── Clay CTA buttons ── */}
                <m.div
                    variants={fadeUp}
                    className="hero-cta-row"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}
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
                </m.div>


            </m.div>
        </section>
        </LazyMotion>
    );
}
