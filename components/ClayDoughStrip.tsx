'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

const CLAY_COLORS = [
    '#6ee7b7', '#5eead4', '#67e8f9', '#a5b4fc', '#c4b5fd',
    '#f0abfc', '#fda4af', '#fcd34d', '#86efac', '#99f6e4',
    '#a5f3fc', '#c7d2fe', '#ddd6fe', '#f5d0fe', '#fbcfe8',
    '#fde68a', '#bef264',
];

interface ClayDoughStripProps {
    employers: { name: string; count: number }[];
}

export default function ClayDoughStrip({ employers }: ClayDoughStripProps) {
    const [isPaused, setIsPaused] = useState(false);
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

    // Deduplicate by normalized name
    const seen = new Set<string>();
    const unique = employers.filter((emp) => {
        const key = emp.name.toLowerCase().trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    const items = unique.map((emp, i) => ({
        name: emp.name,
        roles: emp.count,
        color: CLAY_COLORS[i % CLAY_COLORS.length],
    }));

    // Double for seamless infinite loop
    const doubled = [...items, ...items];


    return (
        <section
            className="w-full flex flex-col items-center justify-center overflow-hidden relative py-16 lg:py-24"
            style={{
                background: 'linear-gradient(160deg, #FDFBF7 0%, #F5D5C4 40%, #F0B8A0 100%)',
            }}
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => { setIsPaused(false); setHoveredIdx(null); }}
        >
            {/* Single flowing row */}
            <div className="relative w-full overflow-hidden" style={{ height: '72px' }}>
                {/* Left fade */}
                <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0, width: '120px', zIndex: 2,
                    background: 'linear-gradient(to right, #F2C5A8, transparent)',
                    pointerEvents: 'none',
                }} />
                {/* Right fade */}
                <div style={{
                    position: 'absolute', right: 0, top: 0, bottom: 0, width: '120px', zIndex: 2,
                    background: 'linear-gradient(to left, #F2C5A8, transparent)',
                    pointerEvents: 'none',
                }} />

                <motion.div
                    className="absolute flex items-center gap-5 whitespace-nowrap h-full"
                    animate={isPaused ? { x: 0 } : { x: ['0%', '-50%'] }}
                    transition={isPaused ? { duration: 0 } : {
                        duration: 50,
                        repeat: Infinity,
                        ease: 'linear',
                    }}
                >
                    {doubled.map((emp, i) => {
                        const isHovered = hoveredIdx === i;
                        return (
                            <Link
                                key={i}
                                href={`/jobs?q=${encodeURIComponent(emp.name)}`}
                                onMouseEnter={() => setHoveredIdx(i)}
                                onMouseLeave={() => setHoveredIdx(null)}
                                className="px-7 py-3.5 flex items-center gap-3"
                                style={{
                                    background: `linear-gradient(145deg, ${emp.color}${isHovered ? 'ff' : 'cc'}, ${emp.color}${isHovered ? 'dd' : '99'})`,
                                    borderRadius: '20px',
                                    boxShadow: isHovered
                                        ? `inset 3px 3px 6px rgba(255,255,255,0.5), inset -2px -2px 4px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.14)`
                                        : 'inset 3px 3px 6px rgba(255,255,255,0.4), inset -2px -2px 4px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.08)',
                                    flexShrink: 0,
                                    cursor: 'pointer',
                                    transform: isHovered ? 'translateY(-4px) scale(1.05)' : 'translateY(0) scale(1)',
                                    transition: 'transform 0.25s ease, box-shadow 0.25s ease, background 0.25s ease',
                                    textDecoration: 'none',
                                }}
                            >
                                <div
                                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                                    style={{
                                        color: 'rgba(51,65,85,0.65)',
                                        background: 'rgba(255,255,255,0.45)',
                                        boxShadow:
                                            'inset 1px 1px 3px rgba(255,255,255,0.5), inset -1px -1px 2px rgba(0,0,0,0.04)',
                                    }}
                                >
                                    {emp.name[0]}
                                </div>
                                <span className="text-sm font-medium" style={{ color: 'rgba(30,41,59,0.8)' }}>
                                    {emp.name}
                                </span>
                                <span
                                    className="text-xs"
                                    style={{
                                        color: isHovered ? 'rgba(13,148,136,0.9)' : 'rgba(51,65,85,0.45)',
                                        fontWeight: isHovered ? 700 : 500,
                                        transition: 'color 0.2s ease, font-weight 0.2s ease',
                                    }}
                                >
                                    {emp.roles} {isHovered ? 'jobs →' : ''}
                                </span>
                            </Link>
                        );
                    })}
                </motion.div>
            </div>
        </section>
    );
}
