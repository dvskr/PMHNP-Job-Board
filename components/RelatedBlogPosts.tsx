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

export default function RelatedBlogPosts({
    posts,
    title = 'Helpful Career Resources',
    context = 'job',
}: RelatedBlogPostsProps) {
    if (posts.length === 0) return null;

    return (
        <section
            style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: '20px 24px',
                marginBottom: '16px',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <BookOpen style={{ width: '20px', height: '20px', color: 'var(--color-primary)' }} />
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{title}</h2>
            </div>

            <div className={`grid gap-3 ${posts.length > 2 ? 'md:grid-cols-2' : ''}`}>
                {posts.slice(0, 3).map((post) => (
                    <Link
                        key={post.slug}
                        href={`/blog/${post.slug}`}
                        className="rbp-card"
                        style={{
                            display: 'block',
                            padding: '16px',
                            backgroundColor: 'var(--bg-tertiary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '10px',
                            textDecoration: 'none',
                            transition: 'all 0.2s',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                            <span style={{ fontSize: '18px' }}>
                                {post.category === 'salary' && '💰'}
                                {post.category === 'career' && '📈'}
                                {post.category === 'telehealth' && '💻'}
                                {post.category === 'states' && '📍'}
                                {post.category === 'new-grad' && '🎓'}
                                {post.category === 'interview' && '🎤'}
                            </span>
                            <div>
                                <h3 style={{
                                    fontSize: '14px', fontWeight: 600,
                                    color: 'var(--text-primary)', margin: '0 0 4px',
                                    lineHeight: 1.4,
                                }}>
                                    {post.title}
                                </h3>
                                <p style={{
                                    fontSize: '13px', color: 'var(--text-secondary)',
                                    margin: 0, lineHeight: 1.5,
                                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                }}>
                                    {post.description}
                                </p>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>

            {context === 'job' && (
                <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
                    <Link
                        href="/blog"
                        style={{
                            fontSize: '13px', fontWeight: 600,
                            color: 'var(--color-primary)',
                            textDecoration: 'none',
                        }}
                    >
                        Browse all career guides →
                    </Link>
                </div>
            )}

            <style>{`
                .rbp-card:hover {
                    border-color: var(--color-primary) !important;
                    transform: translateY(-1px);
                    box-shadow: 0 2px 8px var(--shadow-color, rgba(0,0,0,0.08));
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

    // Always include salary guide
    slugs.push('pmhnp-salary-guide-2026');

    if (options.isRemote || options.isTelehealth) {
        slugs.push('telehealth-pmhnp-guide');
        slugs.push('ultimate-guide-remote-pmhnp-jobs-2026');
    }

    if (options.isNewGrad) {
        slugs.push('new-grad-pmhnp-first-job');
        slugs.push('5-tips-new-grad-pmhnp-job-market');
    }

    // General career guides
    if (slugs.length < 3) {
        slugs.push('pmhnp-interview-questions');
        slugs.push('pmhnp-salary-negotiation');
    }

    return [...new Set(slugs)].slice(0, 3);
}
