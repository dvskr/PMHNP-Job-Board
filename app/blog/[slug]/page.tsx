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
import { autoLinkCategories } from '@/lib/autoLink';
import { Calendar, ArrowLeft, Facebook, Linkedin, Twitter, User, Briefcase, ArrowRight, Search, MapPin, Home } from 'lucide-react';
import BlogEmailSignup from '@/components/BlogEmailSignup';

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
        title: `${post.title} (2026) | PMHNP Hiring`,
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
    contentHtml = autoLinkCategories(contentHtml);

    // Extract headings for TOC
    const headings = extractHeadings(post.content);

    // F4: Inject mid-article email signup placeholder
    // Find the ~40% point of h2 tags and inject a marker
    const h2Matches = [...contentHtml.matchAll(/<h2[^>]*>/g)];
    if (h2Matches.length >= 3) {
        const midIdx = Math.floor(h2Matches.length * 0.4);
        const insertPos = h2Matches[midIdx]?.index;
        if (insertPos !== undefined) {
            contentHtml = contentHtml.slice(0, insertPos)
                + '<div id="mid-article-signup" class="mid-article-signup-slot"></div>'
                + contentHtml.slice(insertPos);
        }
    }

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

    // VideoObject schema when a YouTube video or Supabase video is associated
    const videoSchema = post.youtube_video_id ? {
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        name: post.title,
        description: post.meta_description || post.title,
        thumbnailUrl: `https://img.youtube.com/vi/${post.youtube_video_id}/maxresdefault.jpg`,
        uploadDate: post.publish_date || post.created_at,
        contentUrl: `https://www.youtube.com/watch?v=${post.youtube_video_id}`,
        embedUrl: `https://www.youtube.com/embed/${post.youtube_video_id}`,
        publisher: { '@type': 'Organization', name: 'PMHNP Hiring', url: 'https://pmhnphiring.com' },
    } : post.video_url ? {
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        name: post.title,
        description: post.meta_description || post.title,
        thumbnailUrl: post.image_url || 'https://pmhnphiring.com/api/og',
        uploadDate: post.publish_date || post.created_at,
        contentUrl: post.video_url,
        publisher: { '@type': 'Organization', name: 'PMHNP Hiring', url: 'https://pmhnphiring.com' },
    } : null;

    // Slug-specific FAQ schemas for Google rich results
    const blogFaqData: Record<string, Array<{ name: string; text: string }>> = {
        'how-to-become-a-pmhnp': [
            {
                name: 'How long does it take to become a PMHNP?',
                text: 'It typically takes 6-8 years total: 4 years for a BSN, 1-2 years of RN experience, and 2-3 years for an MSN or DNP with PMHNP specialization.',
            },
            {
                name: 'What degree do you need to be a PMHNP?',
                text: 'You need a Master of Science in Nursing (MSN) or Doctor of Nursing Practice (DNP) with a Psychiatric Mental Health Nurse Practitioner specialization from an accredited program. You must also pass the PMHNP certification exam through ANCC.',
            },
            {
                name: 'Can a PMHNP prescribe medication?',
                text: 'Yes. PMHNPs can prescribe psychiatric medications including antidepressants, antipsychotics, mood stabilizers, and controlled substances. Prescribing authority varies by state, with some states granting full practice authority and others requiring physician collaboration.',
            },
            {
                name: 'What is the difference between a PMHNP and a psychiatrist?',
                text: 'Both can diagnose and treat mental health conditions and prescribe medications. Psychiatrists complete medical school (MD/DO) plus a 4-year residency. PMHNPs complete nursing school plus a master\'s or doctoral nursing program. PMHNPs typically spend more time on therapy and holistic care, while psychiatrists often focus on medication management.',
            },
            {
                name: 'Is PMHNP a good career?',
                text: 'Yes. PMHNPs are among the most in-demand healthcare providers in the US. Average salaries range from $140,000-$175,000, job growth is projected at 40%+ through 2031, and there are 10,000+ open positions nationwide. The mental health provider shortage ensures strong demand for years to come.',
            },
        ],
        'new-grad-pmhnp-first-job': [
            {
                name: 'Can new grad PMHNPs get hired without experience?',
                text: 'Yes. Due to the mental health provider shortage, many employers actively hire new grad PMHNPs. Telehealth companies, community mental health centers, and large health systems commonly offer new grad PMHNP positions with mentorship and supervision.',
            },
            {
                name: 'What is the best setting for a new grad PMHNP?',
                text: 'Community mental health centers and outpatient clinics are often recommended for new grads because they offer diverse patient populations, structured supervision, and exposure to a wide range of diagnoses. Inpatient settings and telehealth are also options depending on comfort level.',
            },
            {
                name: 'How many jobs are available for new grad PMHNPs?',
                text: 'There are hundreds of new grad-friendly PMHNP positions available at any given time. PMHNP Hiring lists new grad-specific roles that can be filtered at pmhnphiring.com/jobs/new-grad.',
            },
        ],
        'pmhnp-vs-psychiatrist': [
            {
                name: 'Can a PMHNP do everything a psychiatrist can?',
                text: 'PMHNPs can diagnose mental health conditions, prescribe medications including controlled substances, and provide therapy. The main differences are in training path and, in some states, practice authority requirements. In full practice authority states, PMHNPs operate independently.',
            },
            {
                name: 'Do PMHNPs make as much as psychiatrists?',
                text: 'No. Psychiatrists earn $250,000-$400,000+ annually while PMHNPs earn $140,000-$175,000 on average. However, PMHNPs require significantly less training time and student debt, often resulting in a better return on investment earlier in their career.',
            },
            {
                name: 'Should I become a PMHNP or psychiatrist?',
                text: 'It depends on your goals. If you want a faster path to practice (6-8 years vs 12+ years), lower student debt, and a holistic nursing approach, PMHNP is the better fit. If you want the highest salary ceiling and full medical training, psychiatry may be preferred.',
            },
        ],
    };

    // Dynamic FAQ generation for state license posts
    const stateSlugMatch = slug.match(/^how-to-get-your-pmhnp-license-in-(.+)-2026/);
    if (stateSlugMatch && !blogFaqData[slug]) {
        const stateNameRaw = stateSlugMatch[1].replace(/-/g, ' ');
        const stateName = stateNameRaw.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        blogFaqData[slug] = [
            {
                name: `How long does it take to get a PMHNP license in ${stateName}?`,
                text: `The timeline to obtain your PMHNP license in ${stateName} typically takes 2-4 weeks after submitting a complete application, assuming you have already earned your MSN/DNP, passed the ANCC PMHNP-BC certification exam, and hold an active RN license. Processing times vary based on ${stateName}'s Board of Nursing workload.`,
            },
            {
                name: `What are the requirements to become a PMHNP in ${stateName}?`,
                text: `To practice as a PMHNP in ${stateName}, you need: (1) an active RN license, (2) a Master's or Doctoral degree in nursing with PMHNP specialization from an accredited program, (3) national certification as a PMHNP-BC from ANCC, and (4) an APRN license from ${stateName}'s Board of Nursing. Prescriptive authority may require additional applications.`,
            },
            {
                name: `What is the average PMHNP salary in ${stateName}?`,
                text: `PMHNP salaries in ${stateName} vary by setting and experience. Refer to the salary section in our detailed ${stateName} licensing guide above for the latest data, including comparisons between inpatient, outpatient, and telehealth settings.`,
            },
        ];
    }

    // HowTo schema for state license guides (Google shows numbered steps in search)
    const howToSchema = stateSlugMatch ? (() => {
        const stateNameRaw = stateSlugMatch[1].replace(/-/g, ' ');
        const sn = stateNameRaw.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        return {
            '@context': 'https://schema.org',
            '@type': 'HowTo',
            name: `How to Get Your PMHNP License in ${sn}`,
            description: `Step-by-step guide to obtaining your Psychiatric-Mental Health Nurse Practitioner license in ${sn}.`,
            totalTime: 'P60D',
            estimatedCost: { '@type': 'MonetaryCost', currency: 'USD', value: '500-1500' },
            image: post.image_url || undefined,
            step: [
                { '@type': 'HowToStep', position: 1, name: 'Complete MSN or DNP', text: `Earn a Master of Science in Nursing (MSN) or Doctor of Nursing Practice (DNP) degree with a Psychiatric-Mental Health Nurse Practitioner specialization from an CCNE or ACEN accredited program.` },
                { '@type': 'HowToStep', position: 2, name: 'Pass the ANCC PMHNP-BC Exam', text: 'Pass the American Nurses Credentialing Center (ANCC) Psychiatric-Mental Health Nurse Practitioner Board Certification (PMHNP-BC) examination.' },
                { '@type': 'HowToStep', position: 3, name: `Apply for ${sn} RN License`, text: `Obtain or verify your Registered Nurse (RN) license with the ${sn} Board of Nursing. If licensed in another state, apply for licensure by endorsement.` },
                { '@type': 'HowToStep', position: 4, name: `Apply for ${sn} APRN License`, text: `Submit your Advanced Practice Registered Nurse (APRN) application to the ${sn} Board of Nursing, including proof of education, national certification, and any required fees.` },
                { '@type': 'HowToStep', position: 5, name: 'Apply for Prescriptive Authority', text: `Apply for prescriptive authority through ${sn}'s Board of Nursing or Board of Pharmacy, which allows you to prescribe medications including controlled substances.` },
                { '@type': 'HowToStep', position: 6, name: 'Register with DEA', text: 'Register with the Drug Enforcement Administration (DEA) to obtain a DEA number, required for prescribing controlled substances.' },
                { '@type': 'HowToStep', position: 7, name: 'Apply for NPI Number', text: 'Apply for a National Provider Identifier (NPI) number through the National Plan and Provider Enumeration System (NPPES), required for billing and insurance purposes.' },
            ],
        };
    })() : null;

    const faqQuestions = blogFaqData[slug];
    const faqSchema = faqQuestions ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqQuestions.map((q) => ({
            '@type': 'Question',
            name: q.name,
            acceptedAnswer: {
                '@type': 'Answer',
                text: q.text,
            },
        })),
    } : null;

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-20">
            {/* BlogPosting Schema */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            {/* FAQ Schema (only for posts with FAQ data) */}
            {faqSchema && (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
                />
            )}
            {/* VideoObject Schema (when YouTube video is present) */}
            {videoSchema && (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(videoSchema) }}
                />
            )}
            {/* HowTo Schema (state license guides) */}
            {howToSchema && (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }}
                />
            )}
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
            <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 py-12 px-4">
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
                    <h1 className="text-3xl md:text-5xl font-bold text-gray-900 dark:text-gray-100 mb-6 leading-tight">
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

            {/* Featured Image (only if no video) */}
            {post.image_url && !post.youtube_video_id && !post.video_url && (
                <div className="max-w-4xl mx-auto px-4 -mb-4 mt-8">
                    <img
                        src={post.image_url}
                        alt={post.title}
                        className="w-full h-auto max-h-[480px] object-cover rounded-xl shadow-md"
                        loading="eager"
                    />
                </div>
            )}

            {/* YouTube Video Embed */}
            {post.youtube_video_id && (
                <div className="max-w-4xl mx-auto px-4 mt-8">
                    <div className="relative pb-[56.25%] h-0 rounded-xl overflow-hidden shadow-md bg-gray-900">
                        <iframe
                            src={`https://www.youtube.com/embed/${post.youtube_video_id}?rel=0`}
                            title={post.title}
                            loading="lazy"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            className="absolute top-0 left-0 w-full h-full"
                        />
                    </div>
                    <p className="text-sm text-gray-500 mt-2 text-center">
                        ▶ Watch our complete video walkthrough
                    </p>
                </div>
            )}

            {/* Supabase Video Embed (fallback when no YouTube ID) */}
            {!post.youtube_video_id && post.video_url && (
                <div className="max-w-4xl mx-auto px-4 mt-8">
                    <div className="relative pb-[56.25%] h-0 rounded-xl overflow-hidden shadow-md bg-gray-900">
                        <video
                            src={post.video_url}
                            controls
                            playsInline
                            preload="auto"
                            crossOrigin="anonymous"
                            poster={post.image_url || undefined}
                            className="absolute top-0 left-0 w-full h-full object-contain"
                        >
                            <source src={post.video_url} type="video/mp4" />
                            Your browser does not support the video tag.
                        </video>
                    </div>
                    <p className="text-sm text-gray-500 mt-2 text-center">
                        ▶ Watch our complete video walkthrough
                    </p>
                </div>
            )}

            {/* Content Area — Full Width, No Sidebar */}
            <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
                {/* Author Bar (compact inline) */}
                <div className="flex items-center gap-3 mb-8 pb-6 border-b border-gray-200 dark:border-gray-700">
                    <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center text-teal-600 font-bold text-lg">
                        P
                    </div>
                    <div>
                        <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">PMHNP Hiring</span>
                        <span className="text-gray-400 mx-2">·</span>
                        <span className="text-sm text-gray-500">Editorial Team</span>
                    </div>
                </div>

                {/* Table of Contents (collapsible) */}
                {headings.length > 0 && (
                    <details className="mb-8 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                        <summary className="px-5 py-3 cursor-pointer font-semibold text-gray-900 dark:text-gray-100 text-sm hover:text-teal-600 transition-colors select-none">
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
                <article className="bg-white dark:bg-gray-900 p-8 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
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

                {/* F5: End-of-Article Email Signup */}
                <div className="mt-8 bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-950/40 dark:to-cyan-950/40 rounded-xl p-6 border border-teal-100 dark:border-teal-800 text-center">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">📬 Stay Updated</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Get the latest PMHNP career tips, salary data, and job openings delivered to your inbox.</p>
                    <BlogEmailSignup source={`blog_end_${slug}`} />
                </div>

                {/* Existing CTA Section */}
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

                {/* F7: Job Category CTAs */}
                <div className="mt-8">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Explore PMHNP Jobs</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                            { label: 'Remote', href: '/jobs/remote', icon: Home, color: '#2DD4BF' },
                            { label: 'Full-Time', href: '/jobs?jobType=Full-Time', icon: Briefcase, color: '#3B82F6' },
                            { label: 'Travel / Locum', href: '/jobs?specialty=Travel', icon: MapPin, color: '#E86C2C' },
                            { label: 'All Jobs', href: '/jobs', icon: Search, color: '#A855F7' },
                        ].map(({ label, href, icon: Icon, color }) => (
                            <Link key={label} href={href}
                                className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-teal-300 hover:shadow-sm transition-all text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-teal-700">
                                <Icon size={16} style={{ color }} />
                                {label}
                            </Link>
                        ))}
                    </div>
                </div>

                {/* F8: Create Your Profile CTA */}
                <div className="mt-8 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                            <User size={20} className="text-teal-600" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-1">Let Employers Find You</h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">Create your PMHNP profile and get discovered by top employers actively hiring.</p>
                            <Link href="/for-job-seekers/create-profile"
                                className="inline-flex items-center gap-1 text-sm font-bold text-teal-600 hover:text-teal-700 transition-colors">
                                Create Your Profile <ArrowRight size={14} />
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Related Posts */}
                {relatedPosts.length > 0 && (
                    <div className="mt-12">
                        <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
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
                                        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-md transition-all">
                                            <div className="text-xs text-teal-600 font-bold uppercase mb-2">
                                                {relLabel}
                                            </div>
                                            <h4 className="font-bold text-gray-900 dark:text-gray-100 group-hover:text-teal-600 transition-colors mb-2">
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
                <div className="mt-12 bg-teal-50 dark:bg-teal-950/30 p-6 rounded-xl border border-teal-100 dark:border-teal-800">
                    <h3 className="font-bold text-teal-900 dark:text-teal-200 mb-4 text-center">
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
