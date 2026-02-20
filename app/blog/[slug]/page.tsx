import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import Link from 'next/link';
import {
    getPostBySlug,
    getRelatedPosts,
    getAllPublishedSlugs,
    markdownToHtml,
    autoLinkStates,
    extractHeadings,
    BLOG_CATEGORIES,
} from '@/lib/blog';
import { Calendar, ArrowLeft, Facebook, Linkedin, Twitter } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface Props {
    params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const post = await getPostBySlug(slug);

    if (!post) {
        return { title: 'Article Not Found' };
    }

    const ogImage = post.image_url || 'https://pmhnphiring.com/api/og';
    const url = `https://pmhnphiring.com/blog/${slug}`;

    return {
        title: `${post.title} | PMHNP Hiring`,
        description: post.meta_description || post.title,
        keywords: post.target_keyword ? [post.target_keyword] : undefined,
        openGraph: {
            title: post.title,
            description: post.meta_description || post.title,
            type: 'article',
            publishedTime: post.publish_date || post.created_at,
            modifiedTime: post.updated_at,
            url,
            images: [
                {
                    url: ogImage,
                    width: 1200,
                    height: 630,
                    alt: post.title,
                },
            ],
        },
        twitter: {
            card: 'summary_large_image',
            title: post.title,
            description: post.meta_description || post.title,
            images: [ogImage],
        },
        alternates: {
            canonical: url,
        },
    };
}

export default async function BlogPostPage({ params }: Props) {
    const { slug } = await params;
    const post = await getPostBySlug(slug);

    if (!post) {
        notFound();
    }

    const relatedPosts = await getRelatedPosts(post.category, post.slug);
    const currentUrl = `https://pmhnphiring.com/blog/${slug}`;

    // Convert markdown to HTML and auto-link states
    let contentHtml = markdownToHtml(post.content);
    contentHtml = autoLinkStates(contentHtml);

    // Extract headings for TOC
    const headings = extractHeadings(post.content);

    // Category label lookup
    const categoryLabel =
        BLOG_CATEGORIES.find((c) => c.id === post.category)?.label || post.category;

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
        });
    };

    // JSON-LD BlogPosting schema
    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.title,
        description: post.meta_description || post.title,
        datePublished: post.publish_date || post.created_at,
        dateModified: post.updated_at,
        author: {
            '@type': 'Organization',
            name: 'PMHNP Hiring',
            url: 'https://pmhnphiring.com',
        },
        publisher: {
            '@type': 'Organization',
            name: 'PMHNP Hiring',
            logo: {
                '@type': 'ImageObject',
                url: 'https://pmhnphiring.com/pmhnp_logo.png',
            },
        },
        mainEntityOfPage: {
            '@type': 'WebPage',
            '@id': currentUrl,
        },
        image: post.image_url || 'https://pmhnphiring.com/api/og',
        keywords: post.target_keyword || undefined,
        articleSection: categoryLabel,
        url: currentUrl,
    };

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* BlogPosting Schema */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
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
                            {
                                '@type': 'ListItem',
                                position: 3,
                                name: post.title,
                                item: currentUrl,
                            },
                        ],
                    }),
                }}
            />

            {/* Header */}
            <header className="bg-white border-b border-gray-200 py-12 px-4">
                <div className="max-w-4xl mx-auto">
                    <Link
                        href="/blog"
                        className="inline-flex items-center text-sm text-gray-500 hover:text-teal-600 mb-6 transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Blog
                    </Link>
                    <div className="flex flex-wrap gap-2 mb-6">
                        <span className="bg-teal-100 text-teal-800 text-xs px-3 py-1 rounded-full font-semibold uppercase tracking-wide">
                            {categoryLabel}
                        </span>
                    </div>
                    <h1 className="text-3xl md:text-5xl font-bold text-gray-900 mb-6 leading-tight">
                        {post.title}
                    </h1>
                    <div className="flex items-center text-gray-500 text-sm gap-6">
                        <div className="flex items-center">
                            <Calendar className="w-4 h-4 mr-2" />
                            {formatDate(post.publish_date || post.created_at)}
                        </div>
                        {post.target_keyword && (
                            <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">
                                {post.target_keyword}
                            </span>
                        )}
                    </div>
                </div>
            </header>

            {/* Featured Image */}
            {post.image_url && (
                <div className="max-w-4xl mx-auto px-4 -mb-4 mt-8">
                    <img
                        src={post.image_url}
                        alt={post.title}
                        className="w-full h-auto max-h-[480px] object-cover rounded-xl shadow-md"
                        loading="eager"
                    />
                </div>
            )}

            {/* Content Area — Full Width, No Sidebar */}
            <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
                {/* Author Bar (compact inline) */}
                <div className="flex items-center gap-3 mb-8 pb-6 border-b border-gray-200">
                    <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center text-teal-600 font-bold text-lg">
                        P
                    </div>
                    <div>
                        <span className="font-semibold text-gray-900 text-sm">PMHNP Hiring</span>
                        <span className="text-gray-400 mx-2">·</span>
                        <span className="text-sm text-gray-500">Editorial Team</span>
                    </div>
                </div>

                {/* Table of Contents (collapsible) */}
                {headings.length > 0 && (
                    <details className="mb-8 bg-gray-50 rounded-lg border border-gray-200">
                        <summary className="px-5 py-3 cursor-pointer font-semibold text-gray-900 text-sm hover:text-teal-600 transition-colors select-none">
                            📑 Table of Contents
                        </summary>
                        <nav className="px-5 pb-4 pt-1 space-y-1.5">
                            {headings.map((heading, idx) => (
                                <a
                                    key={idx}
                                    href={`#${heading.id}`}
                                    className={`block text-sm hover:text-teal-600 transition-colors ${heading.level === 3
                                        ? 'pl-4 text-gray-500'
                                        : 'text-gray-700 font-medium'
                                        }`}
                                >
                                    {heading.text}
                                </a>
                            ))}
                        </nav>
                    </details>
                )}

                {/* Article */}
                <article className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
                    <div
                        className="prose prose-lg max-w-none dark:prose-invert prose-headings:text-gray-900 dark:prose-headings:text-gray-100 prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-a:text-teal-600 dark:prose-a:text-teal-400 prose-a:no-underline hover:prose-a:underline prose-strong:text-gray-900 dark:prose-strong:text-gray-100 prose-blockquote:border-l-teal-500 prose-blockquote:bg-teal-50 dark:prose-blockquote:bg-teal-950/30 prose-blockquote:py-2 prose-blockquote:px-4 prose-blockquote:text-gray-700 dark:prose-blockquote:text-gray-300 prose-blockquote:italic prose-code:bg-gray-100 dark:prose-code:bg-gray-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-li:text-gray-700 dark:prose-li:text-gray-300"
                        dangerouslySetInnerHTML={{ __html: contentHtml }}
                    />

                    {/* Social Share */}
                    <div className="mt-12 pt-8 border-t border-gray-100">
                        <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wider">
                            Share this article
                        </h3>
                        <div className="flex gap-4">
                            <a
                                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title)}&url=${encodeURIComponent(currentUrl)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2.5 bg-gray-100 rounded-full hover:bg-[#1DA1F2] hover:text-white transition-colors"
                                aria-label="Share on Twitter"
                            >
                                <Twitter className="w-5 h-5" />
                            </a>
                            <a
                                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(currentUrl)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2.5 bg-gray-100 rounded-full hover:bg-[#0A66C2] hover:text-white transition-colors"
                                aria-label="Share on LinkedIn"
                            >
                                <Linkedin className="w-5 h-5" />
                            </a>
                            <a
                                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(currentUrl)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2.5 bg-gray-100 rounded-full hover:bg-[#1877F2] hover:text-white transition-colors"
                                aria-label="Share on Facebook"
                            >
                                <Facebook className="w-5 h-5" />
                            </a>
                        </div>
                    </div>
                </article>

                {/* CTA Section */}
                <div className="mt-8 bg-gradient-to-r from-teal-600 to-teal-700 rounded-xl p-8 text-white text-center">
                    <h3 className="text-2xl font-bold mb-3">
                        Ready to Find Your Next PMHNP Position?
                    </h3>
                    <p className="text-teal-100 mb-6 max-w-lg mx-auto">
                        Browse hundreds of psychiatric mental health nurse practitioner
                        jobs with salary transparency.
                    </p>
                    <Link
                        href="/jobs"
                        className="inline-flex items-center px-6 py-3 bg-white text-teal-700 font-bold rounded-lg hover:bg-teal-50 transition-colors shadow-lg"
                    >
                        Browse PMHNP Jobs →
                    </Link>
                </div>

                {/* Related Posts */}
                {relatedPosts.length > 0 && (
                    <div className="mt-12">
                        <h3 className="text-2xl font-bold text-gray-900 mb-6">
                            Related Articles
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {relatedPosts.map((relPost) => {
                                const relLabel =
                                    BLOG_CATEGORIES.find((c) => c.id === relPost.category)
                                        ?.label || relPost.category;
                                return (
                                    <Link
                                        key={relPost.slug}
                                        href={`/blog/${relPost.slug}`}
                                        className="block group"
                                    >
                                        <div className="bg-white p-6 rounded-lg border border-gray-200 hover:shadow-md transition-all">
                                            <div className="text-xs text-teal-600 font-bold uppercase mb-2">
                                                {relLabel}
                                            </div>
                                            <h4 className="font-bold text-gray-900 group-hover:text-teal-600 transition-colors mb-2">
                                                {relPost.title}
                                            </h4>
                                            <p className="text-sm text-gray-500 line-clamp-2">
                                                {relPost.meta_description || ''}
                                            </p>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Popular Resources — bottom of page */}
                <div className="mt-12 bg-teal-50 p-6 rounded-xl border border-teal-100">
                    <h3 className="font-bold text-teal-900 mb-4 text-center">
                        Popular Resources
                    </h3>
                    <div className="flex flex-wrap justify-center gap-6">
                        <Link
                            href="/salary-guide"
                            className="flex items-center text-sm text-gray-700 hover:text-teal-600 transition-colors"
                        >
                            <span className="mr-2">💰</span> 2026 Salary Guide
                        </Link>
                        <Link
                            href="/jobs"
                            className="flex items-center text-sm text-gray-700 hover:text-teal-600 transition-colors"
                        >
                            <span className="mr-2">🔍</span> Browse All Jobs
                        </Link>
                        <Link
                            href="/jobs/remote"
                            className="flex items-center text-sm text-gray-700 hover:text-teal-600 transition-colors"
                        >
                            <span className="mr-2">🏠</span> Remote Jobs
                        </Link>
                        <Link
                            href="/job-alerts"
                            className="flex items-center text-sm text-gray-700 hover:text-teal-600 transition-colors"
                        >
                            <span className="mr-2">🔔</span> Get Job Alerts
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
