import Link from 'next/link';

import { BookOpen } from 'lucide-react';

interface BlogPost {
    slug: string;
    title: string;
    description: string;
    category: string;
}

interface RelatedBlogPostsProps {
    posts: BlogPost[];
    title?: string;
    context?: 'job' | 'category' | 'state';
}

/* ═══ Clay card tokens ═══ */
const clayShadow = '8px 8px 20px rgba(0,0,0,0.07), -4px -4px 12px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.6), inset -1px -1px 2px rgba(0,0,0,0.02)';
const clayPebbleShadow = '4px 4px 10px rgba(0,0,0,0.06), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)';

const categoryEmoji: Record<string, string> = {
    salary: '💰',
    career: '📈',
    telehealth: '💻',
    states: '📍',
    'new-grad': '🎓',
    interview: '🎤',
};

/**
 * The salary guide is a standalone page, not a blog post, so it cannot come
 * through getPostBySlug. Pinning it here links /salary-guide directly with a
 * descriptive anchor instead of routing job pages through the
 * /blog/pmhnp-salary-guide-2026 -> /salary-guide redirect.
 */
const SALARY_GUIDE_LINK = {
    slug: '/salary-guide',
    title: 'PMHNP Salary Guide',
    description: 'Current PMHNP pay by state, setting and experience level.',
    category: 'salary',
};

export default function RelatedBlogPosts({
    posts,
    title = 'Career Resources',
    context = 'job',
}: RelatedBlogPostsProps) {
    // On job pages the block always has at least the salary guide to show.
    const entries = context === 'job'
        ? [
            { ...SALARY_GUIDE_LINK, href: SALARY_GUIDE_LINK.slug },
            ...posts.map(p => ({ ...p, href: `/blog/${p.slug}` })),
        ]
        : posts.map(p => ({ ...p, href: `/blog/${p.slug}` }));

    if (entries.length === 0) return null;

    return (
        <section style={{
            backgroundColor: '#F7FBF8',
            borderRadius: '22px',
            border: '1px solid rgba(255,255,255,0.6)',
            boxShadow: clayShadow,
            overflow: 'hidden',
        }}>


            {/* Content */}
            <div style={{ padding: '18px 20px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                    <div style={{
                        width: '32px', height: '32px', borderRadius: '10px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        backgroundColor: '#D5F5F1',
                        boxShadow: 'inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.04), 2px 2px 4px rgba(0,0,0,0.05)',
                        border: '1px solid rgba(255,255,255,0.6)',
                    }}>
                        <BookOpen style={{ width: '16px', height: '16px', color: '#0D9488' }} />
                    </div>
                    <h2 style={{
                        fontSize: '14px', fontWeight: 700,
                        fontFamily: 'var(--font-lora), Georgia, serif',
                        color: '#1F2937', margin: 0,
                    }}>{title}</h2>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {entries.slice(0, 3).map((post) => (
                        <Link
                            key={post.href}
                            href={post.href}
                            className="rbp-card"
                            style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '10px',
                                padding: '12px 14px',
                                backgroundColor: '#F0FAF8',
                                border: '1px solid rgba(255,255,255,0.5)',
                                borderRadius: '14px',
                                textDecoration: 'none',
                                transition: 'all 0.2s ease',
                                boxShadow: clayPebbleShadow,
                            }}
                        >
                            <span style={{
                                fontSize: '16px', flexShrink: 0, lineHeight: 1,
                                width: '30px', height: '30px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                borderRadius: '9px',
                                backgroundColor: '#E6FAF8',
                                boxShadow: 'inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.04), 2px 2px 4px rgba(0,0,0,0.05)',
                                border: '1px solid rgba(255,255,255,0.6)',
                            }}>
                                {categoryEmoji[post.category] || '📄'}
                            </span>
                            <div>
                                <h3 style={{
                                    fontSize: '13px', fontWeight: 600,
                                    color: '#1F2937', margin: '0 0 3px',
                                    lineHeight: 1.4,
                                }}>
                                    {post.title}
                                </h3>
                                <p style={{
                                    fontSize: '12px', color: '#6B7280',
                                    margin: 0, lineHeight: 1.5,
                                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                }}>
                                    {post.description}
                                </p>
                            </div>
                        </Link>
                    ))}
                </div>

                {context === 'job' && (
                    <Link
                        href="/blog"
                        className="rbp-cta"
                        style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                            marginTop: '14px',
                            padding: '9px 16px', borderRadius: '14px',
                            fontSize: '13px', fontWeight: 600,
                            color: '#0F766E',
                            backgroundColor: '#E6FAF8',
                            border: '1px solid rgba(255,255,255,0.5)',
                            boxShadow: clayPebbleShadow,
                            textDecoration: 'none',
                            transition: 'all 0.2s ease',
                        }}
                    >
                        Browse all career guides →
                    </Link>
                )}
            </div>

            <style>{`
                .rbp-card:hover {
                    transform: translateY(-2px) !important;
                    background-color: #E6FAF8 !important;
                    box-shadow: 6px 6px 14px rgba(13,148,136,0.12), -3px -3px 8px rgba(255,255,255,0.9), inset 2px 2px 5px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03) !important;
                }
                .rbp-cta:hover {
                    transform: translateY(-1px) !important;
                    background-color: #CCFBF1 !important;
                }
            `}</style>
        </section>
    );
}

/**
 * Get relevant blog posts based on job characteristics
 */
export function getRelevantBlogSlugs(options: {
    isRemote?: boolean;
    isTelehealth?: boolean;
    isNewGrad?: boolean;
    state?: string | null;
    jobType?: string | null;
}): string[] {
    const slugs: string[] = [];

    // NOTE: every slug returned here must resolve to a live /blog/<slug>.
    // 'pmhnp-salary-guide-2026' used to be pushed first, but next.config.ts
    // 301s it to /salary-guide, so every job page sent its strongest salary
    // vote through a redirect. The salary money page is now linked directly by
    // the component below (SALARY_GUIDE_LINK), with a descriptive anchor.
    // tests/regressions/related-blog-slugs.test.ts pins the invariant.

    if (options.isRemote || options.isTelehealth) {
        slugs.push('telehealth-pmhnp-guide');
        slugs.push('ultimate-guide-remote-pmhnp-jobs-2026');
    }

    if (options.isNewGrad) {
        slugs.push('new-grad-pmhnp-first-job');
        slugs.push('5-tips-new-grad-pmhnp-job-market');
    }

    // General career guides. The interview article was consolidated: the bare
    // '-questions' slug 301s to the '-2026' one, so link the destination.
    if (slugs.length < 3) {
        slugs.push('pmhnp-interview-questions-2026');
        slugs.push('pmhnp-salary-negotiation');
    }

    return [...new Set(slugs)].slice(0, 3);
}
