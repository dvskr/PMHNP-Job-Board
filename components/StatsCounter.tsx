'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Briefcase, Building2, TrendingUp, MapPin } from 'lucide-react';

interface StatsCounterProps {
    totalJobs: number;
    totalCompanies: number;
    newJobsCount: number;
    newJobsLabel: string;
    statesCovered: number;
}

function useCountUp(end: number, duration: number, shouldStart: boolean): number {
    const [count, setCount] = useState(0);
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
        if (!shouldStart || end === 0) return;

        const startTime = performance.now();

        const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * end));

            if (progress < 1) {
                rafRef.current = requestAnimationFrame(animate);
            } else {
                setCount(end);
            }
        };

        rafRef.current = requestAnimationFrame(animate);

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [end, duration, shouldStart]);

    return count;
}

function formatNumber(num: number): string {
    return num.toLocaleString('en-US');
}

export default function StatsCounter({
    totalJobs,
    totalCompanies,
    newJobsCount,
    newJobsLabel,
    statesCovered,
}: StatsCounterProps) {
    const sectionRef = useRef<HTMLDivElement>(null);
    const [hasAnimated, setHasAnimated] = useState(false);

    const handleIntersect = useCallback((entries: IntersectionObserverEntry[]) => {
        if (entries[0].isIntersecting && !hasAnimated) {
            setHasAnimated(true);
        }
    }, [hasAnimated]);

    useEffect(() => {
        const el = sectionRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(handleIntersect, { threshold: 0.3 });
        observer.observe(el);
        return () => observer.disconnect();
    }, [handleIntersect]);

    const jobsCount = useCountUp(totalJobs, 2000, hasAnimated);
    const companiesCount = useCountUp(totalCompanies, 2000, hasAnimated);
    const newCount = useCountUp(newJobsCount, 2000, hasAnimated);
    const statesCount = useCountUp(statesCovered, 2000, hasAnimated);

    const stats = [
        {
            icon: Briefcase,
            value: formatNumber(jobsCount),
            suffix: '+',
            label: 'ACTIVE JOBS',
        },
        {
            icon: Building2,
            value: formatNumber(companiesCount),
            suffix: '+',
            label: 'COMPANIES HIRING',
        },
        {
            icon: TrendingUp,
            value: formatNumber(newCount),
            suffix: '',
            label: newJobsLabel,
        },
        {
            icon: MapPin,
            value: formatNumber(statesCount),
            suffix: '',
            label: 'STATES COVERED',
        },
    ];

    return (
        <section
            ref={sectionRef}
            style={{ backgroundColor: 'var(--bg-secondary)' }}
        >
            <div className="max-w-5xl mx-auto px-4 py-10 md:py-14">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-0">
                    {stats.map((stat, i) => {
                        const Icon = stat.icon;
                        return (
                            <div
                                key={stat.label}
                                className="flex flex-col items-center text-center relative"
                            >
                                {/* Vertical divider — desktop only, between items */}
                                {i > 0 && (
                                    <div
                                        className="hidden md:block absolute left-0 top-1/2 -translate-y-1/2 w-px h-12"
                                        style={{ backgroundColor: 'var(--border-color)' }}
                                    />
                                )}

                                <div
                                    className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                                    style={{
                                        backgroundColor: 'rgba(232, 108, 44, 0.15)',
                                    }}
                                >
                                    <Icon size={20} style={{ color: '#E86C2C' }} />
                                </div>

                                <div
                                    className="text-3xl md:text-4xl font-bold tabular-nums mb-1"
                                    style={{ color: 'var(--text-primary)' }}
                                >
                                    {stat.value}
                                    {stat.suffix && (
                                        <span style={{ color: 'var(--accent-teal)' }}>{stat.suffix}</span>
                                    )}
                                </div>

                                <div
                                    className="text-[11px] font-semibold tracking-[0.15em] uppercase"
                                    style={{ color: 'var(--text-muted)' }}
                                >
                                    {stat.label}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
