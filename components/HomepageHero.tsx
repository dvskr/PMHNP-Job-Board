'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, MapPin } from 'lucide-react';

interface HomepageHeroProps {
    jobCountDisplay: string;
}

const quickFilters = [
    { label: 'Remote', query: 'Remote' },
    { label: 'Telehealth', query: 'Telehealth' },
    { label: 'Full-Time', query: 'Full-Time' },
    { label: 'Part-Time', query: 'Part-Time' },
    { label: 'New Grad Friendly', query: 'New Grad Friendly' },
];

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

    const pillText = jobCountDisplay
        ? `${jobCountDisplay} PMHNP Jobs Updated Daily`
        : 'Thousands of PMHNP Jobs Updated Daily';

    // Inject keyframes + input styles into document.head
    useEffect(() => {
        const id = 'hero-keyframes';
        if (document.getElementById(id)) return;
        const style = document.createElement('style');
        style.id = id;
        style.textContent = `
            @keyframes heroPing {
                0% { transform: scale(1); opacity: 0.75; }
                75%, 100% { transform: scale(2.5); opacity: 0; }
            }
            @keyframes heroGradient {
                0% { background-position: 0% center; }
                100% { background-position: 200% center; }
            }
            .hero-input,
            .hero-input:focus,
            .hero-input:active {
                color: var(--input-text) !important;
                caret-color: var(--input-text) !important;
                box-shadow: none !important;
                outline: none !important;
                -webkit-text-fill-color: var(--input-text) !important;
            }
            .hero-input::placeholder {
                color: var(--input-placeholder) !important;
                -webkit-text-fill-color: var(--input-placeholder) !important;
            }
        `;
        document.head.appendChild(style);
    }, []);

    return (
        <section
            className="relative overflow-hidden -mt-16 pt-16"
            style={{ backgroundColor: 'var(--bg-primary)' }}
        >
            {/* Ambient gradient blob — teal only, bottom-left */}
            <div
                className="pointer-events-none absolute -bottom-48 -left-48 w-[700px] h-[700px] rounded-full"
                style={{
                    background: 'radial-gradient(circle, #2DD4BF 0%, transparent 70%)',
                    opacity: 0.07,
                }}
                aria-hidden="true"
            />

            <div className="relative z-10 max-w-4xl mx-auto px-4 pt-0 pb-3 text-center">
                {/* Live indicator pill */}
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-4"
                    style={{
                        backgroundColor: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                    }}
                >
                    <span className="relative flex h-3 w-3">
                        <span
                            className="absolute inline-flex h-full w-full rounded-full opacity-75"
                            style={{
                                backgroundColor: '#22c55e',
                                animation: 'heroPing 1.4s ease-in-out infinite',
                            }}
                        />
                        <span
                            className="relative inline-flex rounded-full h-3 w-3"
                            style={{ backgroundColor: '#22c55e' }}
                        />
                    </span>
                    <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                        {pillText}
                    </span>
                </div>

                {/* Two-line headline */}
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-normal mb-2 leading-tight">
                    <span style={{ color: 'var(--text-primary)' }}>
                        The Job Board
                    </span>
                    <br />
                    <span
                        className="font-bold"
                        style={{
                            background: 'linear-gradient(90deg, #E86C2C, #2DD4BF, #E86C2C)',
                            backgroundSize: '200% auto',
                            WebkitBackgroundClip: 'text',
                            backgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            animation: 'heroGradient 6s linear infinite',
                        }}
                    >
                        Built for PMHNPs
                    </span>
                </h1>

                {/* Subtitle */}
                <p
                    className="text-lg md:text-xl max-w-2xl mx-auto mb-5 leading-relaxed tracking-tight"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    The #1 specialized job board for Psychiatric Mental Health Nurse
                    Practitioners. Every listing verified. Zero irrelevant roles.
                </p>

                {/* Search bar */}
                <form onSubmit={handleSubmit} className="max-w-2xl mx-auto mb-4">
                    {/* Outer glow wrapper */}
                    <div
                        className="p-[1px] rounded-[20px] transition-all duration-300 hover:scale-[1.01]"
                        style={{
                            background: 'linear-gradient(135deg, var(--border-color), var(--accent-teal), var(--border-color))',
                            boxShadow: '0 4px 24px rgba(45, 212, 191, 0.08)',
                        }}
                    >
                        <div
                            className="flex flex-col sm:flex-row rounded-[19px] overflow-hidden"
                            style={{
                                backgroundColor: 'var(--bg-tertiary)',
                                backdropFilter: 'blur(20px)',
                            }}
                        >
                            {/* Keyword input */}
                            <div className="flex items-center flex-1 px-6 py-5 gap-3">
                                <Search size={22} className="flex-shrink-0" style={{ color: 'var(--accent-teal)' }} />
                                <input
                                    type="text"
                                    placeholder="Job title or keyword"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="hero-input w-full bg-transparent text-[17px] border-none outline-none shadow-none ring-0 focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                                />
                            </div>

                            {/* Divider */}
                            <div className="hidden sm:flex items-center py-3">
                                <div className="w-[1px] h-8 rounded-full" style={{ backgroundColor: 'var(--border-color)' }} />
                            </div>
                            <div className="sm:hidden mx-5" style={{ borderBottom: '1px solid var(--border-color)' }} />

                            {/* Location input */}
                            <div className="flex items-center flex-1 px-6 py-5 gap-3">
                                <MapPin size={22} className="flex-shrink-0" style={{ color: 'var(--accent-teal)' }} />
                                <input
                                    type="text"
                                    placeholder="City, state, or 'Remote'"
                                    value={locationQuery}
                                    onChange={(e) => setLocationQuery(e.target.value)}
                                    className="hero-input w-full bg-transparent text-[17px] border-none outline-none shadow-none ring-0 focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                                />
                            </div>

                            {/* Search button */}
                            <div className="p-2.5 sm:pl-0">
                                <button
                                    type="submit"
                                    className="w-full sm:w-auto px-8 py-4 font-semibold text-white text-[15px] tracking-wide cursor-pointer flex items-center justify-center gap-2.5 rounded-[14px] transition-all duration-200"
                                    style={{
                                        background: 'linear-gradient(135deg, #0D9488, #2DD4BF)',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'linear-gradient(135deg, #0F766E, #14B8A6)';
                                        e.currentTarget.style.boxShadow = '0 6px 24px rgba(45, 212, 191, 0.35)';
                                        e.currentTarget.style.transform = 'translateY(-1px)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'linear-gradient(135deg, #0D9488, #2DD4BF)';
                                        e.currentTarget.style.boxShadow = 'none';
                                        e.currentTarget.style.transform = 'translateY(0)';
                                    }}
                                >
                                    <Search size={18} />
                                    Search
                                </button>
                            </div>
                        </div>
                    </div>
                </form>

                {/* Quick filter chips */}
                <div className="flex flex-wrap justify-center gap-2 sm:gap-3 overflow-x-auto pb-2 scrollbar-hide">
                    {quickFilters.map((filter) => (
                        <Link
                            key={filter.label}
                            href={`/jobs?q=${encodeURIComponent(filter.query)}`}
                            className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap hover:scale-105"
                            style={{
                                backgroundColor: 'var(--bg-tertiary)',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--border-color)',
                            }}
                        >
                            {filter.label}
                        </Link>
                    ))}
                </div>
            </div>
        </section>
    );
}
