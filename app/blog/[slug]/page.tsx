import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import Link from 'next/link';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { getPostBySlug, getPostSlugs, getRelatedPosts } from '@/lib/blog';
import CopyCitation from '@/components/CopyCitation';
import { Calendar, Clock, User, Facebook, Linkedin, Twitter, ArrowLeft } from 'lucide-react';

// Force static generation for these paths
export async function generateStaticParams() {
    const posts = getPostSlugs();
    return posts.map((slug) => ({
        slug: slug.replace(/\.mdx$/, ''),
    }));
}

interface Props {
    params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;

    try {
        const post = getPostBySlug(slug);

        // Construct absolute URL for OG image
        const ogImage = post.image
            ? `https://pmhnphiring.com${post.image}`
            : 'https://pmhnphiring.com/og-blog-default.jpg'; // We should probably have a default

        return {
            title: `${post.title} | PMHNP Hiring`,
            description: post.description,
            openGraph: {
                title: post.title,
                description: post.description,
                type: 'article',
                publishedTime: post.date,
                modifiedTime: post.lastUpdated || post.date,
                authors: [post.author],
                images: [
                    {
                        url: ogImage,
                        width: 1200,
                        height: 630,
                        alt: post.title,
                    }
                ],
            },
            twitter: {
                card: 'summary_large_image',
                title: post.title,
                description: post.description,
                images: [ogImage],
            },
            alternates: {
                canonical: `/blog/${slug}`,
            },
        };
    } catch {
        return {
            title: 'Article Not Found',
        };
    }
}

export default async function BlogPostPage({ params }: Props) {
    const { slug } = await params;
    let post;
    try {
        post = getPostBySlug(slug);
    } catch {
        notFound();
    }

    const relatedPosts = getRelatedPosts(post.category, post.slug);
    const currentUrl = `https://pmhnphiring.com/blog/${slug}`;

    // Simple TOC generation from content string
    // Matches ## Heading and ### Heading
    const headings = post.content.match(/^#{2,3}\s.+/gm)?.map(heading => {
        const level = heading.startsWith('###') ? 3 : 2;
        const text = heading.replace(/^#{2,3}\s/, '');
        const id = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
        return { level, text, id };
    }) || [];

    // Custom components for MDX to auto-id headings
    const components = {
        h2: ({ children }: any) => {
            const id = children?.toString().toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
            return <h2 id={id} className="text-2xl font-bold mt-8 mb-4">{children}</h2>;
        },
        h3: ({ children }: any) => {
            const id = children?.toString().toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
            return <h3 id={id} className="text-xl font-bold mt-6 mb-3">{children}</h3>;
        },
        blockquote: ({ children }: any) => (
            <blockquote className="border-l-4 border-blue-500 pl-4 py-2 my-6 bg-blue-50 text-gray-700 italic">
                {children}
            </blockquote>
        ),
        a: ({ href, children }: any) => (
            <Link href={href || '#'} className="text-blue-600 hover:underline">
                {children}
            </Link>
        ),
    };

    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: post.title,
        description: post.description,
        image: post.image ? `https://pmhnphiring.com${post.image}` : undefined,
        datePublished: post.date,
        dateModified: post.lastUpdated || post.date,
        author: {
            '@type': 'Organization',
            name: post.author,
            url: 'https://pmhnphiring.com'
        },
        publisher: {
            '@type': 'Organization',
            name: 'PMHNP Hiring',
            logo: {
                '@type': 'ImageObject',
                url: 'https://pmhnphiring.com/logo.png'
            }
        },
        mainEntityOfPage: {
            '@type': 'WebPage',
            '@id': currentUrl
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
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
                            { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://pmhnphiring.com' },
                            { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://pmhnphiring.com/blog' },
                            { '@type': 'ListItem', position: 3, name: post.title, item: currentUrl },
                        ],
                    }),
                }}
            />

            {/* Header */}
            <header className="bg-white border-b border-gray-200 py-12 px-4">
                <div className="max-w-4xl mx-auto">
                    <Link href="/blog" className="inline-flex items-center text-sm text-gray-500 hover:text-blue-600 mb-6 transition-colors">
                        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Blog
                    </Link>
                    <div className="flex flex-wrap gap-2 mb-6">
                        <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full font-semibold uppercase tracking-wide">
                            {post.category}
                        </span>
                        {post.tags.map(tag => (
                            <span key={tag} className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full capitalize">
                                #{tag}
                            </span>
                        ))}
                    </div>
                    <h1 className="text-3xl md:text-5xl font-bold text-gray-900 mb-6 leading-tight">
                        {post.title}
                    </h1>
                    <div className="flex items-center text-gray-500 text-sm gap-6">
                        <div className="flex items-center">
                            <User className="w-4 h-4 mr-2" />
                            {post.author}
                        </div>
                        <div className="flex items-center">
                            <Calendar className="w-4 h-4 mr-2" />
                            {new Date(post.date).toLocaleDateString()}
                        </div>
                        <div className="flex items-center text-gray-400">
                            {post.lastUpdated && `Updated: ${new Date(post.lastUpdated).toLocaleDateString()}`}
                        </div>
                    </div>
                </div>
            </header>

            {/* Content Area */}
            <div className="max-w-7xl mx-auto px-4 py-8 md:py-12">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">

                    {/* Main Content */}
                    <main className="lg:col-span-8">
                        <article className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
                            {/* Cite This Dropdown (Top) */}
                            <div className="mb-8 p-4 bg-gray-50 rounded-lg border border-gray-100">
                                <details className="group">
                                    <summary className="list-none cursor-pointer flex items-center justify-between text-sm font-medium text-gray-700">
                                        <span>📚 Cite this article</span>
                                        <span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span>
                                    </summary>
                                    <div className="mt-4 pt-4 border-t border-gray-200">
                                        <CopyCitation citation={`${post.author}. "${post.title}." PMHNP Hiring, ${new Date(post.date).getFullYear()}, ${currentUrl}.`} />
                                    </div>
                                </details>
                            </div>

                            <div className="prose prose-blue prose-lg max-w-none">
                                <MDXRemote source={post.content} components={components} />
                            </div>

                            {/* Social Share (Bottom) */}
                            <div className="mt-12 pt-8 border-t border-gray-100">
                                <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wider">Share this article</h3>
                                <div className="flex gap-4">
                                    <a
                                        href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title)}&url=${encodeURIComponent(currentUrl)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-2 bg-gray-100 rounded-full hover:bg-[#1DA1F2] hover:text-white transition-colors"
                                        aria-label="Share on Twitter"
                                    >
                                        <Twitter className="w-5 h-5" />
                                    </a>
                                    <a
                                        href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(currentUrl)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-2 bg-gray-100 rounded-full hover:bg-[#0A66C2] hover:text-white transition-colors"
                                        aria-label="Share on LinkedIn"
                                    >
                                        <Linkedin className="w-5 h-5" />
                                    </a>
                                    <a
                                        href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(currentUrl)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-2 bg-gray-100 rounded-full hover:bg-[#1877F2] hover:text-white transition-colors"
                                        aria-label="Share on Facebook"
                                    >
                                        <Facebook className="w-5 h-5" />
                                    </a>
                                </div>
                            </div>
                        </article>

                        {/* Related Posts */}
                        {relatedPosts.length > 0 && (
                            <div className="mt-12">
                                <h3 className="text-2xl font-bold text-gray-900 mb-6">Related Articles</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {relatedPosts.map(relPost => (
                                        <Link key={relPost.slug} href={`/blog/${relPost.slug}`} className="block group">
                                            <div className="bg-white p-6 rounded-lg border border-gray-200 hover:shadow-md transition-all">
                                                <div className="text-xs text-blue-600 font-bold uppercase mb-2">{relPost.category}</div>
                                                <h4 className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors mb-2">
                                                    {relPost.title}
                                                </h4>
                                                <p className="text-sm text-gray-500 line-clamp-2">{relPost.description}</p>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}
                    </main>

                    {/* Sidebar */}
                    <aside className="lg:col-span-4 space-y-8">
                        {/* Author Box */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-xl">
                                    {post.author.charAt(0)}
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-900">{post.author}</h3>
                                    <p className="text-xs text-gray-500">Editor</p>
                                </div>
                            </div>
                            <p className="text-sm text-gray-600">
                                Data-driven insights from analyzing 8,500+ PMHNP job postings across 1,249+ companies.
                            </p>
                        </div>

                        {/* Sticky Container for TOC and Resources */}
                        <div className="sticky top-4 space-y-8 max-h-[calc(100vh-2rem)] overflow-y-auto custom-scrollbar">
                            {/* Table of Contents */}
                            {headings.length > 0 && (
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                    <h3 className="font-bold text-gray-900 mb-4 border-b border-gray-100 pb-2">Table of Contents</h3>
                                    <nav className="space-y-2">
                                        {headings.map((heading, idx) => (
                                            <a
                                                key={idx}
                                                href={`#${heading.id}`}
                                                className={`block text-sm hover:text-blue-600 transition-colors ${heading.level === 3 ? 'pl-4 text-gray-500' : 'text-gray-700 font-medium'
                                                    }`}
                                            >
                                                {heading.text}
                                            </a>
                                        ))}
                                    </nav>
                                </div>
                            )}

                            {/* Cross Links */}
                            <div className="bg-blue-50 p-6 rounded-xl border border-blue-100">
                                <h3 className="font-bold text-blue-900 mb-4">Popular Resources</h3>
                                <ul className="space-y-3">
                                    <li>
                                        <Link href="/salary-guide" className="flex items-center text-sm text-gray-700 hover:text-blue-600 transition-colors">
                                            <span className="mr-2">💰</span> 2026 Salary Guide
                                        </Link>
                                    </li>
                                    <li>
                                        <Link href="/jobs" className="flex items-center text-sm text-gray-700 hover:text-blue-600 transition-colors">
                                            <span className="mr-2">🔍</span> Browse All Jobs
                                        </Link>
                                    </li>
                                    <li>
                                        <Link href="/jobs/remote" className="flex items-center text-sm text-gray-700 hover:text-blue-600 transition-colors">
                                            <span className="mr-2">🏠</span> Remote Jobs
                                        </Link>
                                    </li>
                                    <li>
                                        <Link href="/job-alerts" className="flex items-center text-sm text-gray-700 hover:text-blue-600 transition-colors">
                                            <span className="mr-2">🔔</span> Get Job Alerts
                                        </Link>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </aside>

                </div>
            </div>

        </div>
    );
}
