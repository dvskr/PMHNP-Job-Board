'use client';

import { useEffect, useRef } from 'react';

interface EmployerMarqueeProps {
    companies: string[];
}

export default function EmployerMarquee({ companies }: EmployerMarqueeProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const id = 'marquee-keyframes';
        if (document.getElementById(id)) return;
        const style = document.createElement('style');
        style.id = id;
        style.textContent = `
      @keyframes marqueeScroll {
        0% { transform: translateX(0); }
        100% { transform: translateX(-50%); }
      }
    `;
        document.head.appendChild(style);
    }, []);

    if (companies.length === 0) return null;

    return (
        <section
            style={{ backgroundColor: 'var(--bg-primary)' }}
            className="py-10 md:py-12 overflow-hidden"
        >
            {/* Header */}
            <p
                className="text-center text-[11px] font-semibold tracking-[0.2em] uppercase mb-8"
                style={{ color: 'var(--text-muted)' }}
            >
                Trusted by Leading Healthcare Employers
            </p>

            {/* Marquee container */}
            <div className="relative">
                {/* Left fade */}
                <div
                    className="absolute left-0 top-0 bottom-0 w-20 md:w-32 z-10 pointer-events-none"
                    style={{
                        background: 'linear-gradient(to right, var(--bg-primary), transparent)',
                    }}
                />
                {/* Right fade */}
                <div
                    className="absolute right-0 top-0 bottom-0 w-20 md:w-32 z-10 pointer-events-none"
                    style={{
                        background: 'linear-gradient(to left, var(--bg-primary), transparent)',
                    }}
                />

                {/* Scrolling track */}
                <div
                    ref={scrollRef}
                    className="flex items-center gap-5 whitespace-nowrap hover:[animation-play-state:paused]"
                    style={{
                        animation: 'marqueeScroll 35s linear infinite',
                        width: 'max-content',
                    }}
                >
                    {/* Duplicate list for seamless loop */}
                    {[...companies, ...companies].map((name, i) => (
                        <span
                            key={`${name}-${i}`}
                            className="inline-flex items-center px-5 py-2.5 rounded-full text-sm font-medium shrink-0 transition-colors duration-200"
                            style={{
                                border: '1px solid var(--border-color)',
                                color: 'var(--text-secondary)',
                                backgroundColor: 'var(--bg-secondary)',
                            }}
                        >
                            {name}
                        </span>
                    ))}
                </div>
            </div>
        </section>
    );
}
