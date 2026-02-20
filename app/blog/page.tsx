import Link from 'next/link';
import { Metadata } from 'next';
import {
    getPublishedPosts,
    getPostCount,
    BLOG_CATEGORIES,
} from '@/lib/blog';
import VideoJsonLd from '@/components/VideoJsonLd';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'PMHNP Career Blog | Expert Guides & Insights',
    description:
        'Expert PMHNP career guides, salary negotiation tips, state spotlights, and job market insights for psychiatric mental health nurse practitioners.',
    openGraph: {
        images: [{ url: '/images/pages/pmhnp-career-insights-blog.webp', width: 1280, height: 900, alt: 'PMHNP career blog with expert guides on salary negotiation, state spotlights, and job market insights' }],
    },
    twitter: { card: 'summary_large_image', images: ['/images/pages/pmhnp-career-insights-blog.webp'] },
    alternates: {
        canonical: 'https://pmhnphiring.com/blog',
    },
};

const POSTS_PER_PAGE = 12;

export default async function BlogIndexPage({
    searchParams,
}: {
    searchParams: Promise<{ category?: string; page?: string }>;
}) {
    const { category, page } = await searchParams;
    const parsed = parseInt(page || '1', 10);
    const currentPage = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    const categoryFilter = category || undefined;

    const [posts, totalCount] = await Promise.all([
        getPublishedPosts(currentPage, POSTS_PER_PAGE, categoryFilter),
        getPostCount(categoryFilter),
    ]);

    const totalPages = Math.ceil(totalCount / POSTS_PER_PAGE);

    const categoryLabels: Record<string, string> = {};
    BLOG_CATEGORIES.forEach((c) => {
        categoryLabels[c.id] = c.label;
    });

    // Format date helper
    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'long',
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

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            <VideoJsonLd pathname="/blog" />
            {/* Breadcrumb Schema */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                        '@context': 'https://schema.org',
                        '@type': 'BreadcrumbList',
                        itemListElement: [
                            {
                                '@type': 'ListItem',
                                position: 1,
                                name: 'Home',
                                item: 'https://pmhnphiring.com',
                            },
                            {
                                '@type': 'ListItem',
                                position: 2,
                                name: 'Blog',
                                item: 'https://pmhnphiring.com/blog',
                            },
                        ],
                    }),
                }}
            />

            {/* Hero Section */}
            <section
                className="bg-gradient-to-br from-[#0F172A] to-[#1e3a8a] text-white py-16 px-4"
            >
                <div className="max-w-6xl mx-auto text-center">
                    <h1 className="text-4xl md:text-5xl font-bold mb-4 text-white">
                        PMHNP Career Insights
                    </h1>
                    <p className="text-xl text-teal-200 max-w-2xl mx-auto">
                        Data-driven guides, salary negotiation tips, and career strategies
                        for psychiatric mental health nurse practitioners.
                    </p>
                    <div className="mt-4 text-sm text-teal-300">
                        {totalCount} {totalCount === 1 ? 'article' : 'articles'} published
                    </div>
                </div>
            </section>

            {/* Filter Section */}
            <div className="max-w-6xl mx-auto px-4 py-8">
                <div className="flex flex-wrap justify-center gap-2 mb-10">
                    <Link
                        href="/blog"
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${!categoryFilter
                            ? 'bg-teal-600 text-white shadow-md'
                            : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                            }`}
                    >
                        All
                    </Link>
                    {BLOG_CATEGORIES.map((cat) => (
                        <Link
                            key={cat.id}
                            href={`/blog?category=${cat.id}`}
                            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${categoryFilter === cat.id
                                ? 'bg-teal-600 text-white shadow-md'
                                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                                }`}
                        >
                            {cat.label}
                        </Link>
                    ))}
                </div>

                {/* Blog Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {posts.length > 0 ? (
                        posts.map((post) => (
                            <Link
                                key={post.slug}
                                href={`/blog/${post.slug}`}
                                className="group block h-full"
                            >
                                <article className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 border border-gray-200 h-full flex flex-col">
                                    {/* Header — image or gradient fallback */}
                                    <div className="h-44 relative overflow-hidden">
                                        {post.image_url ? (
                                            <img
                                                src={post.image_url}
                                                alt={post.title}
                                                className="absolute inset-0 w-full h-full object-cover"
                                                loading="lazy"
                                            />
                                        ) : (
                                            <div className="absolute inset-0 bg-gradient-to-br from-teal-500 to-teal-600" />
                                        )}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                                        <div className="relative h-full p-6 flex flex-col justify-between">
                                            <span className="bg-teal-600 text-white px-3 py-1 rounded text-xs font-bold uppercase tracking-wider w-fit shadow-md">
                                                {categoryLabels[post.category] || post.category}
                                            </span>
                                            <div className="text-white/90 text-sm">
                                                {formatDate(post.publish_date || post.created_at)}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-6 flex-1 flex flex-col">
                                        <h2 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-teal-600 transition-colors line-clamp-2">
                                            {post.title}
                                        </h2>
                                        <p className="text-gray-600 text-sm line-clamp-3 mb-4 flex-1">
                                            {post.meta_description || ''}
                                        </p>
                                        <div className="text-teal-600 font-semibold text-sm flex items-center mt-auto">
                                            Read more{' '}
                                            <span className="ml-1 transition-transform group-hover:translate-x-1">
                                                →
                                            </span>
                                        </div>
                                    </div>
                                </article>
                            </Link>
                        ))
                    ) : (
                        <div className="col-span-full py-16 text-center">
                            <div className="text-5xl mb-4">📝</div>
                            <h3 className="text-xl font-bold text-gray-900 mb-2">
                                No posts found
                            </h3>
                            <p className="text-gray-500">
                                {categoryFilter
                                    ? 'No posts in this category yet. Check back soon!'
                                    : 'No blog posts published yet. Check back soon!'}
                            </p>
                        </div>
                    )}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex justify-center items-center gap-2 mt-12">
                        {currentPage > 1 && (
                            <Link
                                href={buildUrl(currentPage - 1, categoryFilter)}
                                className="px-4 py-2 rounded-lg text-sm font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
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
                                    <span key={`ellipsis-${idx}`} className="px-2 text-gray-400">
                                        …
                                    </span>
                                ) : (
                                    <Link
                                        key={p}
                                        href={buildUrl(p, categoryFilter)}
                                        className={`w-10 h-10 rounded-lg text-sm font-medium flex items-center justify-center transition-colors ${p === currentPage
                                            ? 'bg-teal-600 text-white shadow-md'
                                            : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                                            }`}
                                    >
                                        {p}
                                    </Link>
                                )
                            )}

                        {currentPage < totalPages && (
                            <Link
                                href={buildUrl(currentPage + 1, categoryFilter)}
                                className="px-4 py-2 rounded-lg text-sm font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                                Next →
                            </Link>
                        )}
                    </div>
                )}
            </div>

            {/* Internal Links Footer */}
            <section className="border-t border-gray-200 mt-16 bg-white py-12">
                <div className="max-w-6xl mx-auto px-4">
                    <h3 className="text-lg font-bold text-gray-900 mb-6 text-center">
                        Browse More Resources
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Link
                            href="/salary-guide"
                            className="block p-4 rounded-lg bg-gray-50 hover:bg-teal-50 transition-colors text-center group"
                        >
                            <span className="text-2xl block mb-2">💰</span>
                            <span className="font-semibold text-gray-900 group-hover:text-teal-700">
                                Salary Guide
                            </span>
                        </Link>
                        <Link
                            href="/jobs"
                            className="block p-4 rounded-lg bg-gray-50 hover:bg-teal-50 transition-colors text-center group"
                        >
                            <span className="text-2xl block mb-2">🔍</span>
                            <span className="font-semibold text-gray-900 group-hover:text-teal-700">
                                Browse All Jobs
                            </span>
                        </Link>
                        <Link
                            href="/jobs/remote"
                            className="block p-4 rounded-lg bg-gray-50 hover:bg-teal-50 transition-colors text-center group"
                        >
                            <span className="text-2xl block mb-2">🏠</span>
                            <span className="font-semibold text-gray-900 group-hover:text-teal-700">
                                Remote Jobs
                            </span>
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
