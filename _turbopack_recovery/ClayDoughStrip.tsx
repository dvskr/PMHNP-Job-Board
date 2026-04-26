'use client';

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
    // Map employers to clay items with colors
    const items = employers.map((emp, i) => ({
        name: emp.name,
        roles: emp.count,
        color: CLAY_COLORS[i % CLAY_COLORS.length],
    }));

    const doubled = [...items, ...items];

    return (
        <section
            className="w-full flex flex-col items-center justify-center overflow-hidden relative py-16 lg:py-24"
            style={{
                background: 'linear-gradient(160deg, #FDFBF7 0%, #F5D5C4 40%, #F0B8A0 100%)',
            }}
        >

            {/* Flowing dough strips */}
            {[0, 1, 2].map((row) => (
                <div key={row} className="relative w-full h-16 overflow-hidden my-2">
                    <motion.div
                        className="absolute flex items-center gap-6 whitespace-nowrap h-full"
                        animate={{
                            x: row % 2 === 0 ? ['0%', '-50%'] : ['-50%', '0%'],
                        }}
                        transition={{
                            duration: 45 + row * 5,
                            repeat: Infinity,
                            ease: 'linear',
                        }}
                    >
                        {doubled.map((emp, i) => (
                            <div
                                key={`${row}-${i}`}
                                className="px-7 py-3 flex items-center gap-3"
                                style={{
                                    background: `linear-gradient(145deg, ${emp.color}cc, ${emp.color}99)`,
                                    borderRadius: '20px',
                                    boxShadow:
                                        'inset 3px 3px 6px rgba(255,255,255,0.4), inset -2px -2px 4px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.08)',
                                }}
                            >
                                <div
                                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold text-slate-600"
                                    style={{
                                        background: 'rgba(255,255,255,0.45)',
                                        boxShadow:
                                            'inset 1px 1px 3px rgba(255,255,255,0.5), inset -1px -1px 2px rgba(0,0,0,0.04)',
                                    }}
                                >
                                    {emp.name[0]}
                                </div>
                                <span className="text-sm text-slate-700/80 font-medium">
                                    {emp.name}
                                </span>
                                <span className="text-xs text-slate-600/50">
                                    {emp.roles}
                                </span>
                            </div>
                        ))}
                    </motion.div>
                </div>
            ))}
        </section>
    );
}
