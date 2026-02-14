'use client';

import { useEffect, useRef } from 'react';
import { Building2 } from 'lucide-react';

interface EmployerMarqueeProps {
    companies: string[];
}

export default function EmployerMarquee({ companies }: EmployerMarqueeProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const id = 'marquee-styles';
        if (document.getElementById(id)) return;
        const style = document.createElement('style');
        style.id = id;
        style.textContent = `
      @keyframes marqueeScroll {
        0% { transform: translateX(0); }
        100% { transform: translateX(-50%); }
      }
      @keyframes marqueeShimmer {
        0% { background-position: -200% center; }
        100% { background-position: 200% center; }
      }
      .marquee-track {
        animation: marqueeScroll 40s linear infinite;
      }
      .marquee-track:hover {
        animation-play-state: paused;
      }
      .marquee-badge {
        position: relative;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .marquee-badge:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 25px rgba(45, 212, 191, 0.15);
      }
      .marquee-badge::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        padding: 1px;
        background: linear-gradient(
          135deg,
          rgba(45, 212, 191, 0.3),
          rgba(232, 108, 44, 0.15),
          rgba(45, 212, 191, 0.1)
        );
        -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
        -webkit-mask-composite: xor;
        mask-composite: exclude;
        pointer-events: none;
      }
    `;
        document.head.appendChild(style);
    }, []);

    if (companies.length === 0) return null;

    return (
        <section
            className="relative py-12 md:py-14 overflow-hidden"
            style={{ backgroundColor: 'var(--bg-primary)' }}
        >
            {/* Subtle top border line */}
            <div
                className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-2/3"
                style={{
                    background: 'linear-gradient(90deg, transparent, var(--border-color), transparent)',
                }}
            />

            {/* Header */}
            <div className="text-center mb-10">
                <p
                    className="text-[11px] font-bold tracking-[0.25em] uppercase"
                    style={{ color: 'var(--accent-teal)', opacity: 0.8 }}
                >
                    Trusted by Leading Healthcare Employers
                </p>
            </div>

            {/* Marquee container */}
            <div className="relative">
                {/* Left fade */}
                <div
                    className="absolute left-0 top-0 bottom-0 w-24 md:w-40 z-10 pointer-events-none"
                    style={{
                        background: 'linear-gradient(to right, var(--bg-primary), transparent)',
                    }}
                />
                {/* Right fade */}
                <div
                    className="absolute right-0 top-0 bottom-0 w-24 md:w-40 z-10 pointer-events-none"
                    style={{
                        background: 'linear-gradient(to left, var(--bg-primary), transparent)',
                    }}
                />

                {/* Scrolling track */}
                <div
                    ref={scrollRef}
                    className="marquee-track flex items-center gap-4 whitespace-nowrap"
                    style={{ width: 'max-content' }}
                >
                    {[...companies, ...companies].map((name, i) => (
                        <span
                            key={`${name}-${i}`}
                            className="marquee-badge inline-flex items-center gap-2.5 px-5 py-3 rounded-xl text-sm font-medium shrink-0 cursor-default"
                            style={{
                                backgroundColor: 'var(--bg-tertiary)',
                                color: 'var(--text-secondary)',
                            }}
                        >
                            <Building2
                                size={15}
                                style={{ color: 'var(--accent-teal)', opacity: 0.6 }}
                            />
                            {name}
                        </span>
                    ))}
                </div>
            </div>

            {/* Subtle bottom border line */}
            <div
                className="absolute bottom-0 left-1/2 -translate-x-1/2 h-px w-2/3"
                style={{
                    background: 'linear-gradient(90deg, transparent, var(--border-color), transparent)',
                }}
            />
        </section>
    );
}
