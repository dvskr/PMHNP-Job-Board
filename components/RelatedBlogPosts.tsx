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
        <section className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-5 md:p-6 mb-4 lg:mb-6 border border-blue-200">
            <div className="flex items-center gap-2 mb-4">
                <BookOpen className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            </div>

            <div className={`grid gap-3 ${posts.length > 2 ? 'md:grid-cols-2' : ''}`}>
                {posts.slice(0, 3).map((post) => (
                    <Link
                        key={post.slug}
                        href={`/blog/${post.slug}`}
                        className="block p-4 bg-white rounded-lg border border-blue-100 hover:border-blue-300 hover:shadow-sm transition-all group"
                    >
                        <div className="flex items-start gap-3">
                            <span className="text-lg">
                                {post.category === 'salary' && '💰'}
                                {post.category === 'career' && '📈'}
                                {post.category === 'telehealth' && '💻'}
                                {post.category === 'states' && '📍'}
                                {post.category === 'new-grad' && '🎓'}
                                {post.category === 'interview' && '🎤'}
                            </span>
                            <div>
                                <h3 className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2">
                                    {post.title}
                                </h3>
                                <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                                    {post.description}
                                </p>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>

            {context === 'job' && (
                <div className="mt-4 pt-3 border-t border-blue-200">
                    <Link
                        href="/blog"
                        className="text-sm text-blue-700 hover:text-blue-800 font-medium"
                    >
                        Browse all career guides →
                    </Link>
                </div>
            )}
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
