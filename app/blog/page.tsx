import { brand } from '@/config/brand';
import Link from 'next/link';
import Image from 'next/image';
import { Metadata } from 'next';
import { ArrowRight, BookOpen, Newspaper, PenLine } from 'lucide-react';
import {
    getPublishedPosts,
    getPostCount,
    getPublishedCategoryCounts,
    BLOG_CATEGORIES,
} from '@/lib/blog';
import VideoJsonLd from '@/components/VideoJsonLd';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';

// ISR: blog index changes when posts publish/unpublish; 1-hour revalidate is
// well within the editorial cadence. Previously force-dynamic meant every
// Googlebot hit hit Supabase live — wasted DB and CPU on the highest-traffic
// editorial surface.
export const revalidate = 3600;

export const metadata: Metadata = {
    title: 'PMHNP Career Blog | Expert Guides & Insights',
    description:
        'PMHNP career guides, salary insights, and job market trends from the #1 psychiatric NP job board.',
    openGraph: {
        images: [{ url: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/pmhnp-career-insights-blog.webp', width: 1280, height: 900, alt: 'PMHNP career blog with expert guides on salary negotiation, state spotlights, and job market insights' }],
    },
    twitter: { card: 'summary_large_image', images: ['https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/pmhnp-career-insights-blog.webp'] },
    alternates: {
        canonical: `${brand.baseUrl}/blog`,
    },
};

const POSTS_PER_PAGE = 12;

/* ─── Clay Design Tokens ─── */
const clayCard: React.CSSProperties = {
    background: '#FFFFFF', borderRadius: '20px',
    border: '1px solid rgba(255,255,255,0.5)',
    boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

/* ─── Category colors ─── */
const CATEGORY_COLORS: Record<string, { color: string; bg: string }> = {
    job_seeker_tips: { color: '#0D9488', bg: '#F0FDFA' },
    career_opportunities: { color: '#6366F1', bg: '#EEF2FF' },
    salary_negotiation: { color: '#F59E0B', bg: '#FFFBEB' },
    career_myths: { color: '#A855F7', bg: '#FAF5FF' },
    state_spotlight: { color: '#3B82F6', bg: '#EFF6FF' },
    employer_facing: { color: '#EF4444', bg: '#FEF2F2' },
    community_lifestyle: { color: '#EC4899', bg: '#FDF2F8' },
    industry_awareness: { color: '#8B5CF6', bg: '#F5F3FF' },
    product_lead_gen: { color: '#14B8A6', bg: '#F0FDFA' },
    success_stories: { color: '#10B981', bg: '#ECFDF5' },
    mental_health_trends: { color: '#6366F1', bg: '#EEF2FF' },
    policy_industry: { color: '#64748B', bg: '#F1F5F9' },
    tech_tools: { color: '#0EA5E9', bg: '#F0F9FF' },
};

export default async function BlogIndexPage({
    searchParams,
}: {
    searchParams: Promise<{ category?: string; page?: string }>;
}) {
    const { category, page } = await searchParams;
    const parsed = parseInt(page || '1', 10);
    const currentPage = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    const categoryFilter = category || undefined;

    const [posts, totalCount, categoryCounts] = await Promise.all([
        getPublishedPosts(currentPage, POSTS_PER_PAGE, categoryFilter),
        getPostCount(categoryFilter),
        getPublishedCategoryCounts(),
    ]);

    // GSC Fix (2026-07 audit P3): only render pills for categories with ≥1
    // published post. Empty ?category= URLs returned 200 "No posts in this
    // category yet" — a soft-404 crawlers rediscovered on every crawl of
    // /blog. Keep the active filter's pill visible even if empty so the
    // "no posts" state stays navigable. null counts = lookup failed → FAIL
    // OPEN and render all pills rather than none.
    const visibleCategories = categoryCounts === null
        ? BLOG_CATEGORIES
        : BLOG_CATEGORIES.filter(
            (cat) => (categoryCounts[cat.id] || 0) > 0 || categoryFilter === cat.id
        );

    const totalPages = Math.ceil(totalCount / POSTS_PER_PAGE);

    const categoryLabels: Record<string, string> = {};
    BLOG_CATEGORIES.forEach((c) => {
        categoryLabels[c.id] = c.label;
    });

    // Format date helper
    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };

    // Build pagination URL
    const buildUrl = (p: number, cat?: string) => {
        const params = new URLSearchParams();
        if (cat && cat !== 'all') params.set('category', cat);
        if (p > 1) params.set('page', p.toString());
        const qs = params.toString();
        return `/blog${qs ? `?${qs}` : ''}`;
    };

    const getCatStyle = (catId: string) => CATEGORY_COLORS[catId] || { color: '#64748B', bg: '#F1F5F9' };

    return (
        <>
            <VideoJsonLd pathname="/blog" />
            <BreadcrumbSchema items={[
                { name: 'Home', url: 'https://pmhnphiring.com' },
                { name: 'Blog', url: 'https://pmhnphiring.com/blog' },
            ]} />
            {/* SEO Fix #16: wrap the post list in a Blog @graph alongside
                ItemList. Previously only ItemList was emitted, so Google had
                no signal that this is a blog index — losing eligibility for
                blog-style rich result treatment. The Blog node carries the
                publisher / mainEntity link to Organization defined in
                app/layout.tsx, and ItemList stays as the listing payload. */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify({
                    '@context': 'https://schema.org',
                    '@graph': [
                        {
                            '@type': 'Blog',
                            '@id': 'https://pmhnphiring.com/blog#blog',
                            name: 'PMHNP Career Blog',
                            description: 'Career guides, salary insights, and job market trends for psychiatric mental health nurse practitioners.',
                            url: 'https://pmhnphiring.com/blog',
                            inLanguage: 'en-US',
                            publisher: { '@id': 'https://pmhnphiring.com/#organization' },
                            blogPost: posts.slice(0, 10).map((post) => ({
                                '@type': 'BlogPosting',
                                headline: post.title,
                                url: `https://pmhnphiring.com/blog/${post.slug}`,
                                datePublished: post.publish_date || post.created_at,
                            })),
                        },
                        {
                            '@type': 'ItemList',
                            '@id': 'https://pmhnphiring.com/blog#postlist',
                            name: 'PMHNP Career Blog',
                            numberOfItems: totalCount,
                            itemListElement: posts.slice(0, 10).map((post, i) => ({
                                '@type': 'ListItem',
                                position: i + 1,
                                name: post.title,
                                url: `https://pmhnphiring.com/blog/${post.slug}`,
                            })),
                        },
                    ],
                }).replace(/</g, '\\u003c').replace(/>/g, '\\u003e') }}
            />

            {/* ═══ HERO — Warm Cream ═══ */}
            <div style={{ background: 'linear-gradient(180deg, #FFF5EE 0%, #FDE8D8 40%, #FFF5EE 100%)' }}>
                <section style={{ maxWidth: '1100px', margin: '0 auto', padding: '80px 20px 48px', textAlign: 'center' }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '8px' }}>
                        Career Insights
                    </p>
                    <h1 className="font-lora" style={{
                        fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 800, lineHeight: 1.15,
                        color: '#1A2E35', marginBottom: '16px',
                    }}>
                        PMHNP Career Blog
                    </h1>
                    <p style={{ fontSize: '17px', color: '#5A4A42', maxWidth: '600px', margin: '0 auto 32px', lineHeight: 1.6 }}>
                        Data-driven guides, salary negotiation tips, and career strategies
                        for psychiatric mental health nurse practitioners.
                    </p>

                    {/* Stat Pills */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px', marginBottom: '0' }}>
                        {[
                            { value: `${totalCount}`, label: 'Articles', bg: '#D4F5E9', color: '#065F46', icon: <Newspaper size={16} /> },
                            { value: `${BLOG_CATEGORIES.length}`, label: 'Categories', bg: '#E0E7FF', color: '#3730A3', icon: <BookOpen size={16} /> },
                            { value: 'Free', label: 'Always', bg: '#FFE0D3', color: '#7C2D12', icon: <PenLine size={16} /> },
                        ].map(s => (
                            <div key={s.label} className="blog-stat-pill" style={{
                                display: 'inline-flex', alignItems: 'center', gap: '8px',
                                padding: '10px 20px 10px 16px', borderRadius: '40px',
                                background: s.bg,
                                boxShadow: '3px 3px 8px rgba(0,0,0,0.04), inset 1px 1px 2px rgba(255,255,255,0.5)',
                            }}>
                                <span style={{ color: s.color, display: 'flex' }}>{s.icon}</span>
                                <span style={{ fontSize: '18px', fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</span>
                                <span style={{ fontSize: '12px', color: s.color, opacity: 0.7, fontWeight: 500 }}>{s.label}</span>
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            {/* ═══ FILTER PILLS ═══ */}
            <div style={{ background: '#FDFBF7', padding: '32px 20px 0' }}>
                <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                    <div className="blog-filter-wrap" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px', marginBottom: '36px' }}>
                        <Link
                            href="/blog"
                            className="blog-filter-pill"
                            style={{
                                padding: '8px 20px', borderRadius: '40px', fontSize: '13px', fontWeight: 600,
                                textDecoration: 'none', transition: 'all 0.2s ease',
                                ...(!categoryFilter
                                    ? { background: '#0D9488', color: '#fff', boxShadow: '0 4px 12px rgba(13,148,136,0.25)' }
                                    : {
                                        background: '#FFFFFF', color: '#5A4A42',
                                        border: '1px solid #EAE6DF',
                                        boxShadow: '3px 3px 8px rgba(0,0,0,0.03), -2px -2px 5px rgba(255,255,255,0.8)',
                                    }),
                            }}
                        >
                            All
                        </Link>
                        {visibleCategories.map((cat) => {
                            const isActive = categoryFilter === cat.id;
                            const cs = getCatStyle(cat.id);
                            return (
                                <Link
                                    key={cat.id}
                                    href={`/blog?category=${cat.id}`}
                                    className="blog-filter-pill"
                                    style={{
                                        padding: '8px 20px', borderRadius: '40px', fontSize: '13px', fontWeight: 600,
                                        textDecoration: 'none', transition: 'all 0.2s ease',
                                        ...(isActive
                                            ? { background: cs.color, color: '#fff', boxShadow: `0 4px 12px ${cs.color}40` }
                                            : {
                                                background: '#FFFFFF', color: '#5A4A42',
                                                border: '1px solid #EAE6DF',
                                                boxShadow: '3px 3px 8px rgba(0,0,0,0.03), -2px -2px 5px rgba(255,255,255,0.8)',
                                            }),
                                    }}
                                >
                                    {cat.label}
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* ═══ BLOG GRID ═══ */}
            <div style={{ background: '#FDFBF7', padding: '0 20px 80px' }}>
                <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                    <div className="blog-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
                        {posts.length > 0 ? (
                            posts.map((post) => {
                                const cs = getCatStyle(post.category);
                                return (
                                    <Link
                                        key={post.slug}
                                        href={`/blog/${post.slug}`}
                                        className="blog-card"
                                        style={{ ...clayCard, overflow: 'hidden', textDecoration: 'none', display: 'flex', flexDirection: 'column' }}
                                    >
                                        {/* Image */}
                                        <div style={{ position: 'relative', height: '180px', overflow: 'hidden' }}>
                                            {post.image_url ? (
                                                <Image
                                                    src={post.image_url}
                                                    alt={post.title}
                                                    fill
                                                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 360px"
                                                    quality={85}
                                                    className="object-cover"
                                                    style={{ transition: 'transform 0.4s ease' }}
                                                />
                                            ) : (
                                                <div style={{
                                                    position: 'absolute', inset: 0,
                                                    background: `linear-gradient(135deg, ${cs.bg}, ${cs.color}20)`,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                }}>
                                                    <PenLine size={48} style={{ color: cs.color, opacity: 0.3 }} />
                                                </div>
                                            )}
                                            {/* Category badge */}
                                            <div style={{
                                                position: 'absolute', top: '14px', left: '14px',
                                                padding: '5px 12px', borderRadius: '20px',
                                                fontSize: '11px', fontWeight: 700, letterSpacing: '0.03em',
                                                color: cs.color, background: 'rgba(255,255,255,0.92)',
                                                backdropFilter: 'blur(8px)',
                                                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                                            }}>
                                                {categoryLabels[post.category] || post.category}
                                            </div>
                                        </div>

                                        {/* Content */}
                                        <div style={{ padding: '20px 22px 24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                            {/* Date */}
                                            <p style={{ fontSize: '12px', color: '#7A6A62', fontWeight: 500, margin: '0 0 8px' }}>
                                                {formatDate(post.publish_date || post.created_at)}
                                            </p>
                                            {/* Title */}
                                            <h2 className="blog-card-title" style={{
                                                fontSize: '16px', fontWeight: 700, lineHeight: 1.4,
                                                color: '#1A2E35', margin: '0 0 10px',
                                                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                                                transition: 'color 0.2s ease',
                                            }}>
                                                {post.title}
                                            </h2>
                                            {/* Excerpt */}
                                            <p style={{
                                                fontSize: '13px', color: '#5A4A42', lineHeight: 1.55,
                                                margin: '0 0 16px', flex: 1,
                                                display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                                            }}>
                                                {post.meta_description || ''}
                                            </p>
                                            {/* CTA */}
                                            <span className="blog-card-cta" style={{
                                                fontSize: '13px', fontWeight: 600, color: '#0D9488',
                                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                marginTop: 'auto',
                                            }}>
                                                Read article <ArrowRight size={14} className="blog-card-arrow" />
                                            </span>
                                        </div>
                                    </Link>
                                );
                            })
                        ) : (
                            <div style={{
                                gridColumn: '1 / -1', textAlign: 'center', padding: '60px 20px',
                                ...clayCard,
                            }}>
                                <PenLine size={48} style={{ color: '#7A6A62', margin: '0 auto 16px', display: 'block' }} />
                                <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#1A2E35', margin: '0 0 8px' }}>
                                    No posts found
                                </h3>
                                <p style={{ fontSize: '14px', color: '#5A4A42' }}>
                                    {categoryFilter
                                        ? 'No posts in this category yet. Check back soon!'
                                        : 'No blog posts published yet. Check back soon!'}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* ═══ PAGINATION ═══ */}
                    {totalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '48px' }}>
                            {currentPage > 1 && (
                                <Link
                                    href={buildUrl(currentPage - 1, categoryFilter)}
                                    className="blog-page-btn"
                                    style={{
                                        padding: '10px 20px', borderRadius: '14px', fontSize: '13px', fontWeight: 600,
                                        textDecoration: 'none', color: '#1A2E35',
                                        ...clayCard,
                                    }}
                                >
                                    ← Previous
                                </Link>
                            )}

                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                                .filter(
                                    (p) =>
                                        p === 1 ||
                                        p === totalPages ||
                                        Math.abs(p - currentPage) <= 2
                                )
                                .reduce<(number | string)[]>((acc, p, idx, arr) => {
                                    if (idx > 0 && p - (arr[idx - 1] as number) > 1) {
                                        acc.push('...');
                                    }
                                    acc.push(p);
                                    return acc;
                                }, [])
                                .map((p, idx) =>
                                    typeof p === 'string' ? (
                                        <span key={`ellipsis-${idx}`} style={{ padding: '0 4px', color: '#7A6A62', fontSize: '14px' }}>
                                            …
                                        </span>
                                    ) : (
                                        <Link
                                            key={p}
                                            href={buildUrl(p, categoryFilter)}
                                            className="blog-page-btn"
                                            style={{
                                                width: '42px', height: '42px', borderRadius: '14px',
                                                fontSize: '14px', fontWeight: 600,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                textDecoration: 'none', transition: 'all 0.2s ease',
                                                ...(p === currentPage
                                                    ? {
                                                        background: '#0D9488', color: '#fff',
                                                        boxShadow: '0 4px 14px rgba(13,148,136,0.3)',
                                                    }
                                                    : { ...clayCard, color: '#1A2E35' }),
                                            }}
                                        >
                                            {p}
                                        </Link>
                                    )
                                )}

                            {currentPage < totalPages && (
                                <Link
                                    href={buildUrl(currentPage + 1, categoryFilter)}
                                    className="blog-page-btn"
                                    style={{
                                        padding: '10px 20px', borderRadius: '14px', fontSize: '13px', fontWeight: 600,
                                        textDecoration: 'none', color: '#1A2E35',
                                        ...clayCard,
                                    }}
                                >
                                    Next →
                                </Link>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ═══ BROWSE MORE — Clay CTA Section ═══ */}
            <section style={{ background: 'linear-gradient(180deg, #F1F5F9 0%, #E2E8F0 50%, #F1F5F9 100%)', padding: '64px 20px' }}>
                <div style={{ maxWidth: '900px', margin: '0 auto', textAlign: 'center' }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '8px' }}>
                        Explore More
                    </p>
                    <h2 className="font-lora" style={{ fontSize: 'clamp(22px, 3vw, 28px)', fontWeight: 700, color: '#1A2E35', marginBottom: '32px' }}>
                        Browse More Resources
                    </h2>
                    <div className="blog-cta-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                        {[
                            { href: '/salary-guide', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/employers/clay-dollar.webp', title: 'Salary Guide', desc: '2026 data with state breakdowns' },
                            { href: '/jobs', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/employers/clay-trending.webp', title: 'Browse Jobs', desc: '10,000+ PMHNP positions' },
                            { href: '/resources', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/employers/clay-chart.webp', title: 'Resources', desc: 'Licensure guides & tools' },
                        ].map(item => (
                            <Link key={item.href} href={item.href} className="blog-cta-card" style={{
                                ...clayCard, padding: '28px 22px', textDecoration: 'none',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', textAlign: 'center',
                            }}>
                                <div style={{
                                    width: '64px', height: '64px', borderRadius: '18px',
                                    background: 'linear-gradient(145deg, #F8F6F2, #EEEBE5)',
                                    boxShadow: 'inset 2px 2px 4px rgba(255,255,255,0.7), inset -2px -2px 4px rgba(0,0,0,0.04), 3px 3px 8px rgba(0,0,0,0.05)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                }}>
                                    <Image src={item.icon} alt={item.title} width={40} height={40} style={{ width: '40px', height: '40px', borderRadius: '10px', objectFit: 'contain' }} />
                                </div>
                                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1A2E35', margin: 0 }}>{item.title}</h3>
                                <p style={{ fontSize: '13px', color: '#5A4A42', margin: 0, lineHeight: 1.5 }}>{item.desc}</p>
                                <span style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    Explore <ArrowRight size={14} />
                                </span>
                            </Link>
                        ))}
                    </div>
                </div>
            </section>

            {/* ─── Styles ─── */}
            <style>{`
                .blog-stat-pill {
                    transition: transform 0.2s ease, box-shadow 0.2s ease;
                }
                .blog-stat-pill:hover {
                    transform: translateY(-2px) scale(1.02);
                    box-shadow: 6px 6px 20px rgba(0,0,0,0.1), -3px -3px 10px rgba(255,255,255,0.9) !important;
                }
                .blog-filter-pill {
                    transition: transform 0.2s ease, box-shadow 0.2s ease !important;
                }
                .blog-filter-pill:hover {
                    transform: translateY(-2px);
                }
                .blog-card {
                    transition: transform 0.3s ease, box-shadow 0.3s ease;
                }
                .blog-card:hover {
                    transform: translateY(-6px);
                    box-shadow: 8px 8px 24px rgba(0,0,0,0.1), -4px -4px 12px rgba(255,255,255,0.9), inset 1px 1px 2px rgba(255,255,255,0.6) !important;
                }
                .blog-card:hover img {
                    transform: scale(1.05);
                }
                .blog-card:hover .blog-card-title {
                    color: #0D9488 !important;
                }
                .blog-card:hover .blog-card-arrow {
                    transform: translateX(3px);
                    transition: transform 0.2s ease;
                }
                .blog-page-btn {
                    transition: transform 0.2s ease, box-shadow 0.2s ease;
                }
                .blog-page-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 6px 6px 16px rgba(0,0,0,0.08), -3px -3px 10px rgba(255,255,255,0.9) !important;
                }
                .blog-cta-card {
                    transition: transform 0.3s ease, box-shadow 0.3s ease;
                }
                .blog-cta-card:hover {
                    transform: translateY(-4px);
                    box-shadow: 8px 8px 24px rgba(0,0,0,0.1), -4px -4px 12px rgba(255,255,255,0.9), inset 1px 1px 2px rgba(255,255,255,0.6) !important;
                }
                @media (max-width: 768px) {
                    .blog-grid { grid-template-columns: 1fr !important; }
                    .blog-cta-grid { grid-template-columns: 1fr !important; }
                }
                @media (min-width: 769px) and (max-width: 1024px) {
                    .blog-grid { grid-template-columns: repeat(2, 1fr) !important; }
                    .blog-cta-grid { grid-template-columns: repeat(2, 1fr) !important; }
                }
            `}</style>
        </>
    );
}
