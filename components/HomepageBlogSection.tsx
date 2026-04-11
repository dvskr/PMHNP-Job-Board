'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

/*
 * Exact Wellfound "From the blog" CSS — source: DevTools inspection
 *
 * Row: padding 40px → 64px on hover, bg → #fff4f6, border-radius 12px, transition 0.3s
 * Col1 (category): 150px, ml 24px, mr 64px
 * Col2 (title): flex 1, max-w 550px, mr 80px
 * Col3 (desc): flex 1, mr 100px
 * Title: Graphik 30px/39px, weight 600, ls -0.4px, color #000
 * Category: Graphik 16px/18px, weight 600, color #000
 * Description: Graphik 14px/19.6px, weight 400, color #000
 * Arrow tab: 64×32px, half-circle, absolute right:-16px, top:50px, rotate(-90deg), bg #ec2e3a
 */

const stagger = {
    visible: { transition: { staggerChildren: 0.12 } },
};
const rowAnim = {
    hidden: { opacity: 0, y: 24 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.6, ease: [0.25, 0.1, 0.25, 1] },
    },
};

const FEATURED_POSTS = [
    {
        category: 'Salary Guide',
        title: 'PMHNP Salary Guide 2026: State-by-State Analysis',
        description: 'Data from 8,500+ job postings reveals top-paying states, specialty premiums, and negotiation strategies that can add $15K–$25K to your offer.',
        href: '/blog/pmhnp-salary-guide-2026',
    },
    {
        category: 'Career Path',
        title: 'How to Become a PMHNP: The Complete Roadmap',
        description: 'From BSN to board certification — every step, timeline, and insider tip for launching your psychiatric NP career in 2026.',
        href: '/blog/how-to-become-a-pmhnp',
    },
    {
        category: 'Job Market',
        title: 'PMHNP Job Outlook: 45% Growth Through 2032',
        description: '123 million Americans live in mental health shortage areas. Here\'s what that means for your career trajectory and earning potential.',
        href: '/blog/pmhnp-job-outlook',
    },
    {
        category: 'Remote Work',
        title: 'The Ultimate Guide to Remote PMHNP Jobs',
        description: '62% of psych NP positions now offer telehealth. Find out which companies pay $130K–$200K for remote psychiatric care.',
        href: '/blog/ultimate-guide-remote-pmhnp-jobs-2026',
    },
    {
        category: 'New Graduates',
        title: 'New Grad PMHNP: Landing Your First Role',
        description: 'Residency programs, interview prep, salary benchmarks, and the resume strategies that get callbacks within 48 hours.',
        href: '/blog/new-grad-pmhnp-guide-2026',
    },
    {
        category: 'Private Practice',
        title: 'PMHNP Private Practice Income: What to Expect',
        description: 'Cash-pay vs insurance, overhead costs, and how practice owners in FPA states are clearing $200K–$300K+ annually.',
        href: '/blog/pmhnp-private-practice-income-2026',
    },
];

export default function HomepageBlogSection() {
    return (
        <section style={{ background: '#fff', paddingTop: '88px', paddingBottom: '72px' }}>

            {/* ═══ Header ═══ */}
            <div style={{
                padding: '0 48px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: '40px',
            }}>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#000', margin: 0 }}>
                    From the blog
                </h2>
                <Link href="/blog" className="wf-more-btn">
                    More posts
                </Link>
            </div>

            {/* ═══ Blog rows ═══ */}
            <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-50px' }}
                variants={stagger}
            >
                {FEATURED_POSTS.map((post, i) => (
                    <motion.div key={i} variants={rowAnim}>
                        <Link href={post.href} className="wf-link">
                            <div className="wf-row">
                                {/* Col1: Category — 150px, ml 24px, mr 64px */}
                                <div className="wf-col1">
                                    <span className="wf-category">{post.category}</span>
                                </div>
                                {/* Col2: Title — flex 1, max-w 550px, mr 80px */}
                                <div className="wf-col2">
                                    <h3 className="wf-title font-heading">{post.title}</h3>
                                </div>
                                {/* Col3: Description — flex 1, mr 100px */}
                                <div className="wf-col3">
                                    <p className="wf-desc">{post.description}</p>
                                </div>
                                {/* Arrow circle */}
                                <div className="wf-arrow-tab">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                        <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                </div>
                            </div>
                        </Link>
                    </motion.div>
                ))}
            </motion.div>

            {/* ═══ Exact Wellfound CSS ═══ */}
            <style jsx global>{`
                /* Link wrapper */
                .wf-link {
                    text-decoration: none;
                    display: block;
                    color: inherit;
                }

                /* Row container: flex, padding 40px, transition 0.3s */
                .wf-row {
                    padding: 40px 48px;
                    transition: all 0.3s ease;
                    display: flex;
                    position: relative;
                    align-items: flex-start;
                    border-top: 1px solid #eee;
                }

                /* HOVER: bg #fff4f6, border-radius 12px, padding EXPANDS to 64px */
                .wf-link:hover .wf-row {
                    background-color: #fff4f6;
                    border-radius: 12px;
                    padding-top: 64px;
                    padding-bottom: 64px;
                    border-top-color: transparent;
                }

                /* Title turns red on hover */
                .wf-link:hover .wf-title {
                    color: #ec2e3a;
                }

                /* Arrow tab scales on hover */
                .wf-link:hover .wf-arrow-tab {
                    transform: rotate(-90deg) scale(1.1);
                }

                /* Col1: Category — 150px, ml 24px, mr 64px */
                .wf-col1 {
                    width: 150px;
                    flex-shrink: 0;
                    margin-left: 24px;
                    margin-right: 64px;
                    padding-top: 6px;
                }

                /* Col2: Title — flex 1, max-w 550px, mr 80px */
                .wf-col2 {
                    flex: 1 1 0%;
                    max-width: 550px;
                    margin-right: 80px;
                }

                /* Col3: Description — flex 1, mr 100px */
                .wf-col3 {
                    flex: 1 1 0%;
                    margin-right: 100px;
                }

                /* Category: 16px, 600, #000 */
                .wf-category {
                    font-size: 16px;
                    font-weight: 600;
                    line-height: 18px;
                    color: #000;
                }

                /* Title: 30px, 600, ls -0.4px, #000, mb 16px */
                .wf-title {
                    font-size: 30px;
                    font-weight: 600;
                    line-height: 39px;
                    letter-spacing: -0.4px;
                    color: #000;
                    margin: 0 0 16px 0;
                    transition: color 0.3s ease;
                }

                /* Description: 14px, 400, #000 */
                .wf-desc {
                    font-size: 14px;
                    font-weight: 400;
                    line-height: 19.6px;
                    color: #000;
                    margin: 0;
                }

                /* Arrow: full red circle, right side */
                .wf-arrow-tab {
                    background-color: #ec2e3a;
                    color: white;
                    border-radius: 50%;
                    justify-content: center;
                    align-items: center;
                    width: 48px;
                    height: 48px;
                    display: flex;
                    flex-shrink: 0;
                    margin-left: auto;
                    transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                }

                .wf-link:hover .wf-arrow-tab {
                    transform: scale(1.1);
                }

                /* More posts button */
                .wf-more-btn {
                    padding: 8px 20px;
                    font-size: 13px;
                    font-weight: 600;
                    color: #1a1a1a;
                    text-decoration: none;
                    border: 1.5px solid #1a1a1a;
                    border-radius: 100px;
                    background: transparent;
                    transition: all 0.2s ease;
                }
                .wf-more-btn:hover {
                    background: #1a1a1a;
                    color: #fff;
                }

                /* ═══ Responsive ═══ */
                @media (max-width: 991px) {
                    .wf-title { font-size: 23px; line-height: 30px; }
                    .wf-col1 { margin-right: 32px; }
                    .wf-col2 { margin-right: 40px; }
                    .wf-col3 { margin-right: 40px; }
                }
                @media (max-width: 768px) {
                    .wf-row {
                        flex-wrap: wrap;
                        padding: 28px 24px;
                    }
                    .wf-col1 { width: 100%; margin: 0 0 8px 0; }
                    .wf-col2 { width: 100%; max-width: none; margin: 0 0 8px 0; }
                    .wf-col3 { display: none; }
                    .wf-arrow-tab { display: none; }
                    .wf-link:hover .wf-row {
                        padding-top: 36px;
                        padding-bottom: 36px;
                    }
                }
                @media (max-width: 479px) {
                    .wf-title { font-size: 20px; line-height: 26px; }
                    .wf-arrow-tab { display: none; }
                }
            `}</style>
        </section>
    );
}
