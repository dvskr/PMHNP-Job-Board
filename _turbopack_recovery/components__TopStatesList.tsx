'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';

const DIORAMA_STATES = new Set([
    'alabama', 'alaska', 'arizona', 'arkansas', 'california',
    'colorado', 'connecticut', 'delaware', 'florida', 'georgia',
    'hawaii', 'idaho', 'illinois', 'indiana', 'iowa',
    'kansas', 'kentucky', 'louisiana', 'maine', 'maryland',
    'massachusetts', 'michigan', 'minnesota', 'mississippi', 'missouri',
    'montana', 'nebraska', 'nevada', 'new-hampshire', 'new-jersey',
    'new-mexico', 'new-york', 'north-carolina', 'north-dakota', 'ohio',
    'oklahoma', 'oregon', 'pennsylvania', 'rhode-island', 'south-carolina',
    'south-dakota', 'tennessee', 'texas', 'utah', 'vermont',
    'virginia', 'washington', 'west-virginia', 'wisconsin', 'wyoming',
]);

const fadeUp = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
};

const stagger = {
    visible: { transition: { staggerChildren: 0.06 } },
};

interface TopStatesProps {
    states: { name: string; count: number; slug: string }[];
}

export default function TopStatesList({ states }: TopStatesProps) {
    if (!states.length) return null;

    const dioramaStates = states.filter((s) => DIORAMA_STATES.has(s.slug)).slice(0, 10);

    return (
        <section className="py-8 lg:py-12">
            <div className="max-w-7xl mx-auto px-6">
                {/* Header */}
                <motion.div
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-60px' }}
                    variants={stagger}
                    className="mb-8"
                >
                    <motion.p variants={fadeUp} className="text-sm font-medium text-teal-600 uppercase tracking-[0.15em] mb-2">
                        Browse by state
                    </motion.p>
                    <motion.h2 variants={fadeUp} className="font-lora text-3xl lg:text-4xl font-bold text-gray-900">
                        Top states hiring PMHNPs
                    </motion.h2>
                </motion.div>

                {/* Diorama grid: 5 columns */}
                <motion.div
                    className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5 mb-8"
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-60px' }}
                    variants={stagger}
                >
                    {dioramaStates.map((state) => (
                        <motion.div key={state.slug} variants={fadeUp}>
                            <Link
                                href={`/jobs/${state.slug}`}
                                className="group block no-underline"
                                style={{ textDecoration: 'none' }}
                            >
                                <div
                                    className="relative overflow-hidden aspect-square mb-2"
                                    style={{
                                        borderRadius: '24px',
                                        boxShadow:
                                            'inset 4px 4px 10px rgba(255,255,255,0.3), inset -3px -3px 8px rgba(0,0,0,0.08), 0 6px 20px rgba(0,0,0,0.1)',
                                        transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.transform = 'translateY(-6px) scale(1.03)';
                                        e.currentTarget.style.boxShadow =
                                            'inset 4px 4px 10px rgba(255,255,255,0.3), inset -3px -3px 8px rgba(0,0,0,0.08), 0 14px 32px rgba(0,0,0,0.16)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = 'translateY(0) scale(1)';
                                        e.currentTarget.style.boxShadow =
                                            'inset 4px 4px 10px rgba(255,255,255,0.3), inset -3px -3px 8px rgba(0,0,0,0.08), 0 6px 20px rgba(0,0,0,0.1)';
                                    }}
                                >
                                    <Image
                                        src={`/images/states/${state.slug}.png`}
                                        alt={`${state.name} PMHNP jobs`}
                                        fill
                                        className="object-cover"
                                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 20vw"
                                    />
                                </div>
                                <p className="text-sm font-semibold text-gray-800 group-hover:text-teal-700 transition-colors text-center">
                                    {state.name}
                                </p>
                                <p className="text-xs text-gray-400 text-center">{state.count} openings</p>
                            </Link>
                        </motion.div>
                    ))}
                </motion.div>

                {/* Browse all jobs pebble button */}
                <motion.div
                    className="flex justify-center"
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.4 }}
                >
                    <Link
                        href="/jobs"
                        className="inline-flex items-center gap-2 px-8 py-3 text-sm font-semibold text-slate-700/80 no-underline"
                        style={{
                            background: 'linear-gradient(145deg, #5eead4cc, #5eead488)',
                            borderRadius: '54% 46% 62% 38% / 49% 55% 45% 51%',
                            boxShadow:
                                'inset 4px 4px 8px rgba(255,255,255,0.45), inset -3px -3px 6px rgba(0,0,0,0.06), 0 6px 16px rgba(0,0,0,0.1)',
                            textDecoration: 'none',
                            transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-3px) scale(1.06)';
                            e.currentTarget.style.boxShadow =
                                'inset 4px 4px 8px rgba(255,255,255,0.45), inset -3px -3px 6px rgba(0,0,0,0.06), 0 10px 24px rgba(0,0,0,0.14)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0) scale(1)';
                            e.currentTarget.style.boxShadow =
                                'inset 4px 4px 8px rgba(255,255,255,0.45), inset -3px -3px 6px rgba(0,0,0,0.06), 0 6px 16px rgba(0,0,0,0.1)';
                        }}
                    >
                        Browse all jobs â†’
                    </Link>
                </motion.div>
            </div>
        </section>
    );
}
