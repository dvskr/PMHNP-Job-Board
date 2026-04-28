'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';
import { motion } from 'framer-motion';

const fadeUp = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};
const stagger = {
    visible: { transition: { staggerChildren: 0.15 } },
};

const STEPS = [
    { img: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/step-employer-post.webp', title: 'Post Your Listing', desc: 'Fill out job details, preview, and publish — live in under 5 minutes. First 2 posts free.' },
    { img: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/step-employer-reach.webp', title: 'Reach Every PMHNP', desc: 'Your listing is emailed to thousands via daily job alerts and indexed on Google with its own SEO page.' },
    { img: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/step-employer-browse.webp', title: 'Browse & Message', desc: 'Search our talent pool of qualified PMHNPs. Save top candidates and reach out directly with InMail.' },
    { img: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/step-employer-track.webp', title: 'Track & Hire', desc: 'Real-time analytics on views, clicks, and applications. Get notified instantly when candidates apply.' },
];

const css = `
    .ehw-wrap {
        background: linear-gradient(175deg, #2A0E1E 0%, #3A1228 35%, #220B18 100%);
        position: relative;
        overflow: hidden;
    }
    .ehw-wrap::before {
        content: '';
        position: absolute;
        top: -200px;
        left: -100px;
        width: 500px;
        height: 500px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(220,120,140,0.06) 0%, transparent 70%);
        pointer-events: none;
    }
    .ehw-wrap::after {
        content: '';
        position: absolute;
        bottom: -150px;
        right: -80px;
        width: 400px;
        height: 400px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(180,100,160,0.05) 0%, transparent 70%);
        pointer-events: none;
    }

    .ehw-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 40px;
    }
    @media (max-width: 900px) {
        .ehw-grid { grid-template-columns: repeat(2, 1fr); gap: 32px; }
    }
    @media (max-width: 520px) {
        .ehw-grid { grid-template-columns: 1fr; gap: 28px; }
    }

    .ehw-step {
        position: relative;
        text-align: center;
    }

    /* Horizontal connecting line behind dots */
    .ehw-line {
        position: absolute;
        top: 198px;
        left: 12.5%;
        right: 12.5%;
        height: 2px;
        background: linear-gradient(90deg, transparent, rgba(220,120,140,0.35), rgba(220,120,140,0.35), transparent);
        z-index: 0;
    }
    @media (max-width: 900px) {
        .ehw-line { display: none; }
    }

    /* Glowing dot */
    .ehw-dot {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: linear-gradient(135deg, #e8788c, #c05a7a);
        box-shadow: 0 0 12px rgba(220,120,140,0.5), 0 0 24px rgba(220,120,140,0.2);
        margin: 16px auto;
        position: relative;
        z-index: 1;
    }
    .ehw-dot::after {
        content: '';
        position: absolute;
        left: -4px;
        top: -4px;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        border: 1px solid rgba(220,120,140,0.3);
        animation: ehwPulse 2s ease-in-out infinite;
    }
    @keyframes ehwPulse {
        0%, 100% { transform: scale(1); opacity: 0.5; }
        50% { transform: scale(1.5); opacity: 0; }
    }
    @media (max-width: 768px) {
        .ehw-inner { padding: 48px 20px !important; }
        .ehw-inner h2 { font-size: 28px !important; margin-bottom: 40px !important; }
    }
    @media (max-width: 520px) {
        .ehw-inner { padding: 40px 16px !important; }
        .ehw-inner h2 { font-size: 24px !important; margin-bottom: 32px !important; }
    }
`;

export default function EmployerHowItWorks() {
    return (
        <section className="ehw-wrap">
            <style>{css}</style>

            <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-60px' }}
                variants={stagger}
                style={{ maxWidth: '1440px', margin: '0 auto', padding: '80px 48px', position: 'relative', zIndex: 1 }}
                className="ehw-inner"
            >
                {/* Header */}
                <motion.p
                    variants={fadeUp}
                    style={{ fontSize: '13px', fontWeight: 600, color: '#e8788c', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '12px' }}
                >
                    Built for hiring managers
                </motion.p>
                <motion.h2
                    variants={fadeUp}
                    className="font-lora"
                    style={{ fontSize: '44px', fontWeight: 700, color: '#fff', margin: '0 0 64px', lineHeight: 1.15 }}
                >
                    How employers hire
                </motion.h2>

                {/* Horizontal 4-step grid */}
                <div style={{ position: 'relative' }}>
                    <div className="ehw-line" />
                    <div className="ehw-grid">
                        {STEPS.map((step, i) => (
                            <motion.div key={i} variants={fadeUp} className="ehw-step">
                                {/* Clay illustration */}
                                <div style={{
                                    width: 180,
                                    height: 180,
                                    margin: '0 auto',
                                    borderRadius: '20px',
                                    overflow: 'hidden',
                                }}>
                                    <Image
                                        src={step.img}
                                        alt={step.title}
                                        width={180}
                                        height={180}
                                        style={{ objectFit: 'cover', borderRadius: '20px' }}
                                        loading="lazy"
                                        placeholder="blur"
                                        blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTgwIiBoZWlnaHQ9IjE4MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTgwIiBoZWlnaHQ9IjE4MCIgZmlsbD0iIzNhMTIyOCIvPjwvc3ZnPg=="
                                    />
                                </div>

                                {/* Glowing dot */}
                                <div className="ehw-dot" />

                                {/* Title */}
                                <h4 style={{ fontSize: '18px', fontWeight: 700, color: '#f8e8ec', margin: '0 0 8px' }}>
                                    {step.title}
                                </h4>

                                {/* Description */}
                                <p style={{ fontSize: '13px', color: 'rgba(248,232,236,0.4)', margin: 0, lineHeight: 1.55, maxWidth: '240px', marginLeft: 'auto', marginRight: 'auto' }}>
                                    {step.desc}
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* CTA */}
                <motion.div variants={fadeUp} style={{ textAlign: 'center', marginTop: '56px' }}>
                    <Link
                        href="/post-job"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '13px 32px',
                            fontSize: '13px',
                            fontWeight: 700,
                            color: '#fff',
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            background: 'linear-gradient(135deg, #c05a7a, #e8788c)',
                            borderRadius: '12px',
                            boxShadow: '0 4px 20px rgba(200,90,120,0.3)',
                            textDecoration: 'none',
                            transition: 'transform 0.3s, box-shadow 0.3s',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-3px)';
                            e.currentTarget.style.boxShadow = '0 8px 32px rgba(200,90,120,0.45)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 4px 20px rgba(200,90,120,0.3)';
                        }}
                    >
                        Post a Job — First 2 Free <ArrowUpRight size={15} />
                    </Link>
                </motion.div>
            </motion.div>
        </section>
    );
}
