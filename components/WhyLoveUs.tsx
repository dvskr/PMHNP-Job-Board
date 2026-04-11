'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import {
    RocketLaunch,
    CurrencyDollar,
    CursorClick,
    Star,
    UsersThree,
    Lightning,
    ChartBar,
    Robot,
} from '@phosphor-icons/react';

const fadeUp = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

const stagger = {
    visible: { transition: { staggerChildren: 0.1 } },
};

const jobSeekerBenefits = [
    {
        icon: RocketLaunch,
        text: 'Connect directly with top psychiatric employers — no third-party recruiters. Your profile, your terms.',
        bg: 'bg-rose-50',
        border: 'border-rose-100',
        color: 'text-rose-500',
    },
    {
        icon: CurrencyDollar,
        text: 'Salary transparency on every listing. Know your worth before you apply — no guessing games.',
        bg: 'bg-amber-50',
        border: 'border-amber-100',
        color: 'text-amber-500',
    },
    {
        icon: CursorClick,
        text: 'Say goodbye to cover letters — your profile is all you need. One click to apply and you\'re done.',
        bg: 'bg-violet-50',
        border: 'border-violet-100',
        color: 'text-violet-500',
    },
    {
        icon: Star,
        text: 'Exclusive PMHNP-only roles you won\'t find on Indeed or LinkedIn. Curated for psychiatric NPs.',
        bg: 'bg-pink-50',
        border: 'border-pink-100',
        color: 'text-pink-500',
    },
];

const employerBenefits = [
    {
        icon: UsersThree,
        text: 'Tap into a community of 50,000+ active PMHNPs actively searching for their next role.',
        bg: 'bg-teal-50',
        border: 'border-teal-100',
        color: 'text-teal-500',
    },
    {
        icon: Lightning,
        text: 'Post a job in under 2 minutes. Set up company branding, job details, and start receiving applicants — free.',
        bg: 'bg-blue-50',
        border: 'border-blue-100',
        color: 'text-blue-500',
    },
    {
        icon: ChartBar,
        text: 'Built-in applicant tracking with real-time analytics. See who viewed, applied, and matched your criteria.',
        bg: 'bg-emerald-50',
        border: 'border-emerald-100',
        color: 'text-emerald-500',
    },
    {
        icon: Robot,
        text: 'AI-powered candidate matching surfaces the best-fit PMHNPs from our database, ranked by qualification and intent.',
        bg: 'bg-indigo-50',
        border: 'border-indigo-100',
        color: 'text-indigo-500',
    },
];

export default function WhyLoveUs() {
    return (
        <section
            style={{
                background: 'linear-gradient(180deg, #F5C4B0 0%, #FDFBF7 100%)',
            }}
            className="py-12 lg:py-16"
        >
            <div className="max-w-7xl mx-auto px-6">
                <motion.div
                    className="grid grid-cols-1 lg:grid-cols-2 gap-0"
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: '-80px' }}
                    variants={stagger}
                >
                    {/* ── Left: Job Seekers ── */}
                    <motion.div
                        variants={fadeUp}
                        className="p-8 lg:p-12 rounded-l-2xl lg:rounded-r-none rounded-t-2xl lg:rounded-bl-2xl"
                        style={{
                            backgroundColor: 'rgba(253, 232, 220, 0.6)',
                            backdropFilter: 'blur(12px)',
                        }}
                    >
                        <p className="text-sm font-medium text-teal-600 uppercase tracking-wider mb-2">
                            Looking for a role?
                        </p>
                        <h2 className="font-lora text-3xl lg:text-4xl font-bold text-gray-900 mb-10">
                            Why PMHNPs love us
                        </h2>

                        <div className="space-y-6">
                            {jobSeekerBenefits.map((b, i) => {
                                const Icon = b.icon;
                                return (
                                    <motion.div
                                        key={i}
                                        variants={fadeUp}
                                        className="flex items-start gap-4"
                                    >
                                        <div className={`shrink-0 w-11 h-11 rounded-full ${b.bg} border ${b.border} flex items-center justify-center`}>
                                            <Icon size={20} weight="duotone" className={b.color} />
                                        </div>
                                        <p className="text-sm leading-relaxed text-gray-600 pt-2">
                                            {b.text}
                                        </p>
                                    </motion.div>
                                );
                            })}
                        </div>

                        <div className="flex items-center gap-3 mt-10">
                            <Link
                                href="/jobs"
                                className="inline-flex items-center px-5 py-2.5 text-sm font-medium border border-gray-300 rounded-full text-gray-700 hover:border-gray-400 transition-colors"
                                style={{ textDecoration: 'none' }}
                            >
                                Learn more
                            </Link>
                            <Link
                                href="/auth/register"
                                className="inline-flex items-center px-5 py-2.5 text-sm font-medium rounded-full bg-teal-600 text-white hover:bg-teal-700 transition-colors"
                                style={{ textDecoration: 'none' }}
                            >
                                Sign up
                            </Link>
                        </div>
                    </motion.div>

                    {/* ── Right: Employers ── */}
                    <motion.div
                        variants={fadeUp}
                        className="p-8 lg:p-12 rounded-r-2xl lg:rounded-l-none rounded-b-2xl lg:rounded-tr-2xl bg-white/80 backdrop-blur-md border border-gray-100"
                    >
                        <p className="text-sm font-medium text-teal-600 uppercase tracking-wider mb-2">
                            Need talent?
                        </p>
                        <h2 className="font-lora text-3xl lg:text-4xl font-bold text-gray-900 mb-10">
                            Why employers love us
                        </h2>

                        <div className="space-y-6">
                            {employerBenefits.map((b, i) => {
                                const Icon = b.icon;
                                return (
                                    <motion.div
                                        key={i}
                                        variants={fadeUp}
                                        className="flex items-start gap-4"
                                    >
                                        <div className={`shrink-0 w-11 h-11 rounded-full ${b.bg} border ${b.border} flex items-center justify-center`}>
                                            <Icon size={20} weight="duotone" className={b.color} />
                                        </div>
                                        <p className="text-sm leading-relaxed text-gray-600 pt-2">
                                            {b.text}
                                        </p>
                                    </motion.div>
                                );
                            })}
                        </div>

                        <div className="flex items-center gap-3 mt-10">
                            <Link
                                href="/for-employers"
                                className="inline-flex items-center px-5 py-2.5 text-sm font-medium border border-gray-300 rounded-full text-gray-700 hover:border-gray-400 transition-colors"
                                style={{ textDecoration: 'none' }}
                            >
                                Learn more
                            </Link>
                            <Link
                                href="/for-employers#post"
                                className="inline-flex items-center px-5 py-2.5 text-sm font-medium rounded-full bg-teal-600 text-white hover:bg-teal-700 transition-colors"
                                style={{ textDecoration: 'none' }}
                            >
                                Sign up
                            </Link>
                        </div>
                    </motion.div>
                </motion.div>
            </div>
        </section>
    );
}
