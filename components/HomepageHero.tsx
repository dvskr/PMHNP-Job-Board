'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, MapPin, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

interface HomepageHeroProps {
    jobCountDisplay: string;
}

const quickFilters = [
    { label: 'Remote', query: 'Remote', emoji: '🌎' },
    { label: 'Telehealth', query: 'Telehealth', emoji: '💻' },
    { label: 'Full-Time', query: 'Full-Time', emoji: '⏰' },
    { label: 'Part-Time', query: 'Part-Time', emoji: '🕐' },
    { label: 'New Grad', query: 'New Grad Friendly', emoji: '🎓' },
];

/* ── animation variants ── */
const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
};
const fadeUp = {
    hidden: { opacity: 0, y: 28 },
    show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] } },
};
const scaleIn = {
    hidden: { opacity: 0, scale: 0.95 },
    show: { opacity: 1, scale: 1, transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] } },
};
const chipStagger = {
    hidden: {},
    show: { transition: { staggerChildren: 0.06, delayChildren: 0.5 } },
};
const chipPop = {
    hidden: { opacity: 0, scale: 0.8, y: 10 },
    show: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring' as const, stiffness: 400, damping: 25 } },
};

export default function HomepageHero({ jobCountDisplay }: HomepageHeroProps) {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState('');
    const [locationQuery, setLocationQuery] = useState('');
    const [isFocused, setIsFocused] = useState(false);

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        const params = new URLSearchParams();
        if (searchQuery.trim()) params.set('q', searchQuery.trim());
        if (locationQuery.trim()) params.set('location', locationQuery.trim());
        const queryString = params.toString();
        router.push(queryString ? `/jobs?${queryString}` : '/jobs');
    };

    const pillText = jobCountDisplay
        ? `${jobCountDisplay} PMHNP Jobs Updated Daily`
        : 'Thousands of PMHNP Jobs Updated Daily';

    const css = `
        @keyframes heroPing {
            0% { transform: scale(1); opacity: 0.75; }
            75%, 100% { transform: scale(2.5); opacity: 0; }
        }
        @keyframes heroGradient {
            0% { background-position: 0% center; }
            100% { background-position: 200% center; }
        }
        @keyframes searchGlow {
            0%, 100% { opacity: 0.5; }
            50% { opacity: 1; }
        }
        @keyframes float {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-12px); }
        }
        @keyframes orbitSlow {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
        .hero-input,
        .hero-input:focus,
        .hero-input:active {
            color: var(--input-text) !important;
            caret-color: #2DD4BF !important;
            box-shadow: none !important;
            outline: none !important;
            -webkit-text-fill-color: var(--input-text) !important;
        }
        .hero-input::placeholder {
            color: var(--input-placeholder) !important;
            -webkit-text-fill-color: var(--input-placeholder) !important;
        }
        .hero-chip:hover {
            background: rgba(45,212,191,0.1) !important;
            border-color: rgba(45,212,191,0.3) !important;
            color: #2DD4BF !important;
            transform: translateY(-2px);
            box-shadow: 0 4px 16px rgba(45,212,191,0.1);
        }
    `;

    return (
        <section
            className="relative overflow-hidden"
            style={{ backgroundColor: 'var(--bg-primary)' }}
        >
            <style>{css}</style>

            {/* ── Ambient orbs ── */}
            <motion.div
                className="pointer-events-none absolute"
                style={{
                    width: '600px', height: '600px', borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(45,212,191,0.12) 0%, transparent 70%)',
                    top: '-200px', right: '-100px',
                    filter: 'blur(60px)',
                }}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 2, ease: 'easeOut' }}
                aria-hidden="true"
            />
            <motion.div
                className="pointer-events-none absolute"
                style={{
                    width: '500px', height: '500px', borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(232,108,44,0.08) 0%, transparent 70%)',
                    bottom: '-150px', left: '-100px',
                    filter: 'blur(80px)',
                }}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 2, ease: 'easeOut', delay: 0.3 }}
                aria-hidden="true"
            />

            {/* ── Floating geometric shapes ── */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
                <div style={{
                    position: 'absolute', top: '15%', left: '8%',
                    width: '6px', height: '6px', borderRadius: '50%',
                    background: '#2DD4BF', opacity: 0.3,
                    animation: 'float 6s ease-in-out infinite',
                }} />
                <div style={{
                    position: 'absolute', top: '25%', right: '12%',
                    width: '4px', height: '4px', borderRadius: '50%',
                    background: '#E86C2C', opacity: 0.4,
                    animation: 'float 8s ease-in-out infinite 1s',
                }} />
                <div style={{
                    position: 'absolute', bottom: '20%', left: '15%',
                    width: '40px', height: '40px', borderRadius: '12px',
                    border: '1px solid rgba(45,212,191,0.1)',
                    animation: 'float 7s ease-in-out infinite 0.5s',
                    transform: 'rotate(45deg)',
                }} />
                <div style={{
                    position: 'absolute', top: '35%', right: '8%',
                    width: '60px', height: '60px', borderRadius: '50%',
                    border: '1px solid rgba(232,108,44,0.08)',
                    animation: 'orbitSlow 20s linear infinite',
                }} />
            </div>

            <motion.div
                className="relative z-10 max-w-4xl mx-auto px-4 pt-4 pb-14 text-center"
                variants={container}
                initial="hidden"
                animate="show"
            >
                {/* ── Live indicator pill ── */}
                <motion.div variants={fadeUp} className="mb-8">
                    <span
                        className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full text-[13px] font-semibold"
                        style={{
                            background: 'linear-gradient(135deg, rgba(45,212,191,0.08), rgba(232,108,44,0.06))',
                            border: '1px solid rgba(45,212,191,0.15)',
                            color: '#2dd4bf',
                            backdropFilter: 'blur(10px)',
                        }}
                    >
                        <span className="relative flex h-2.5 w-2.5">
                            <span
                                className="absolute inline-flex h-full w-full rounded-full"
                                style={{
                                    backgroundColor: '#22c55e',
                                    animation: 'heroPing 1.4s ease-in-out infinite',
                                }}
                            />
                            <span
                                className="relative inline-flex rounded-full h-2.5 w-2.5"
                                style={{ backgroundColor: '#22c55e' }}
                            />
                        </span>
                        {pillText}
                    </span>
                </motion.div>

                {/* ── Headline — large, bold, gradient ── */}
                <motion.h1
                    variants={fadeUp}
                    className="mb-5 leading-[1.08] tracking-tight"
                    style={{ fontSize: 'clamp(2.5rem, 6vw, 4rem)', fontWeight: 800 }}
                >
                    <span style={{ color: 'var(--text-primary)' }}>
                        The Job Board
                    </span>
                    <br />
                    <span
                        style={{
                            backgroundImage: 'linear-gradient(135deg, #E86C2C 0%, #2DD4BF 50%, #818cf8 100%)',
                            backgroundSize: '200% auto',
                            WebkitBackgroundClip: 'text',
                            backgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            animation: 'heroGradient 4s linear infinite',
                        }}
                    >
                        Built for PMHNPs
                    </span>
                </motion.h1>

                {/* ── Subtitle ── */}
                <motion.p
                    variants={fadeUp}
                    className="max-w-xl mx-auto mb-10 leading-relaxed"
                    style={{
                        fontSize: 'clamp(1rem, 2vw, 1.15rem)',
                        color: 'var(--text-secondary)',
                        letterSpacing: '-0.01em',
                    }}
                >
                    The #1 specialized job board for Psychiatric Mental Health Nurse
                    Practitioners. Every listing verified. Zero irrelevant roles.
                </motion.p>

                {/* ── Search bar with animated gradient border ── */}
                <motion.form
                    variants={scaleIn}
                    onSubmit={handleSubmit}
                    className="max-w-2xl mx-auto mb-8"
                >
                    {/* Outer glow ring */}
                    <div
                        className="rounded-2xl p-[1.5px] transition-all duration-500"
                        style={{
                            backgroundImage: isFocused
                                ? 'linear-gradient(135deg, #2DD4BF, #E86C2C, #818cf8, #2DD4BF)'
                                : 'linear-gradient(135deg, rgba(45,212,191,0.3), rgba(232,108,44,0.2), rgba(129,140,248,0.2))',
                            backgroundSize: '300% 300%',
                            animation: isFocused ? 'heroGradient 3s linear infinite' : 'none',
                            boxShadow: isFocused
                                ? '0 0 30px rgba(45,212,191,0.15), 0 0 60px rgba(232,108,44,0.08)'
                                : '0 0 20px rgba(45,212,191,0.05)',
                        }}
                    >
                        <div
                            className="flex flex-col sm:flex-row items-stretch rounded-[14px] overflow-hidden"
                            style={{
                                backgroundColor: 'var(--bg-primary)',
                            }}
                        >
                            {/* Keyword input */}
                            <div className="flex items-center flex-1 px-5 py-4 gap-3">
                                <Search size={18} className="flex-shrink-0" style={{ color: '#2DD4BF', opacity: 0.8 }} />
                                <input
                                    type="text"
                                    placeholder="Job title or keyword"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onFocus={() => setIsFocused(true)}
                                    onBlur={() => setIsFocused(false)}
                                    className="hero-input w-full bg-transparent text-[15px] font-medium border-none outline-none shadow-none ring-0 focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                                />
                            </div>

                            {/* Divider */}
                            <div className="hidden sm:flex items-center py-3">
                                <div className="w-[1px] h-7 rounded-full" style={{ background: 'linear-gradient(to bottom, transparent, var(--border-color), transparent)' }} />
                            </div>
                            <div className="sm:hidden mx-5" style={{ borderBottom: '1px solid var(--border-color)' }} />

                            {/* Location input */}
                            <div className="flex items-center flex-1 px-5 py-4 gap-3">
                                <MapPin size={18} className="flex-shrink-0" style={{ color: '#E86C2C', opacity: 0.8 }} />
                                <input
                                    type="text"
                                    placeholder="City, state, or 'Remote'"
                                    value={locationQuery}
                                    onChange={(e) => setLocationQuery(e.target.value)}
                                    onFocus={() => setIsFocused(true)}
                                    onBlur={() => setIsFocused(false)}
                                    className="hero-input w-full bg-transparent text-[15px] font-medium border-none outline-none shadow-none ring-0 focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                                />
                            </div>

                            {/* Search button */}
                            <div className="p-2 sm:pl-0 flex items-center">
                                <button
                                    type="submit"
                                    className="w-full sm:w-auto px-7 py-3 font-semibold text-[14px] tracking-wide cursor-pointer flex items-center justify-center gap-2 rounded-xl transition-all duration-300"
                                    style={{
                                        background: 'transparent',
                                        color: 'var(--text-secondary)',
                                        fontWeight: 600,
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.borderColor = 'rgba(45,212,191,0.4)';
                                        e.currentTarget.style.color = '#2DD4BF';
                                        e.currentTarget.style.background = 'rgba(45,212,191,0.05)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.borderColor = 'var(--border-color)';
                                        e.currentTarget.style.color = 'var(--text-secondary)';
                                        e.currentTarget.style.background = 'transparent';
                                    }}
                                >
                                    <Search size={16} strokeWidth={2.5} />
                                    Search
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.form>

                {/* ── Quick filter chips — glassmorphism ── */}
                <motion.div
                    variants={chipStagger}
                    className="flex flex-wrap justify-center gap-2.5 sm:gap-3 pb-2"
                >
                    {quickFilters.map((filter) => (
                        <motion.div key={filter.label} variants={chipPop}>
                            <Link
                                href={`/jobs?q=${encodeURIComponent(filter.query)}`}
                                className="hero-chip inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[13px] font-semibold whitespace-nowrap"
                                style={{
                                    backgroundColor: 'var(--bg-tertiary)',
                                    color: 'var(--text-secondary)',
                                    border: '1px solid var(--border-color)',
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                }}
                            >
                                <span style={{ fontSize: '14px' }}>{filter.emoji}</span>
                                {filter.label}
                                <ArrowRight size={12} style={{ opacity: 0.5 }} />
                            </Link>
                        </motion.div>
                    ))}
                </motion.div>

                {/* ── Email capture row ── */}
                <motion.div
                    variants={chipPop}
                    className="flex justify-center pt-3"
                >
                    <HeroEmailCapture />
                </motion.div>
            </motion.div>
        </section>
    );
}

function HeroEmailCapture() {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'done'>('idle');

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        const trimmed = email.trim();
        if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return;
        setStatus('loading');
        try {
            await fetch('/api/job-alerts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: trimmed, frequency: 'daily', newsletterOptIn: true }),
            });
        } catch { /* silent */ }
        setStatus('done');
        setEmail('');
    };

    if (status === 'done') {
        return (
            <p className="text-sm font-medium" style={{ color: '#2DD4BF' }}>
                ✓ You&apos;re subscribed! Check your email.
            </p>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col items-center gap-2">
            <span className="text-sm" style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>📬 Get PMHNP Resources →</span>
            <div className="flex items-center gap-2">
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="px-3 py-1.5 rounded-lg text-sm outline-none"
                    style={{
                        backgroundColor: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        width: '180px',
                    }}
                />
                <button
                    type="submit"
                    disabled={status === 'loading'}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #2DD4BF, #14B8A6)' }}
                >
                    {status === 'loading' ? '...' : 'Go'}
                </button>
            </div>
        </form>
    );
}
