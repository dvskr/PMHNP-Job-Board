'use client';

import { motion } from 'framer-motion';

interface EmployerTrustStripProps {
    companies: string[];
}

export default function EmployerTrustStrip({ companies }: EmployerTrustStripProps) {
    if (!companies.length) return null;

    // Double the list for seamless infinite scroll
    const doubled = [...companies, ...companies];

    return (
        <section className="overflow-hidden py-5 border-b border-gray-100">
            <div className="max-w-7xl mx-auto px-6 flex items-center gap-8">
                {/* Left-pinned label */}
                <p className="shrink-0 text-xs font-medium text-gray-400 uppercase tracking-[0.15em]">
                    Trusted by 3,000+ employers
                </p>
                <div className="w-px h-5 bg-gray-200 shrink-0" />

                {/* Scrolling logos */}
                <div className="flex-1 overflow-hidden relative">
                    {/* Fade edges */}
                    <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-[#FDFBF7] to-transparent z-10 pointer-events-none" />
                    <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-[#FDFBF7] to-transparent z-10 pointer-events-none" />

                    <motion.div
                        className="flex items-center gap-10 whitespace-nowrap"
                        animate={{ x: ['0%', '-50%'] }}
                        transition={{
                            x: {
                                repeat: Infinity,
                                repeatType: 'loop',
                                duration: 30,
                                ease: 'linear',
                            },
                        }}
                    >
                        {doubled.map((company, i) => (
                            <span
                                key={`${company}-${i}`}
                                className="text-sm font-medium text-gray-300 hover:text-gray-600 transition-colors duration-300 cursor-default select-none"
                            >
                                {company}
                            </span>
                        ))}
                    </motion.div>
                </div>
            </div>
        </section>
    );
}
