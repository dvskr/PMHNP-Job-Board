import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
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
import { ArrowRight } from 'lucide-react';
import EditorialTOC from '@/components/blog/EditorialTOC';
import EditorialToolbar from '@/components/blog/EditorialToolbar';
import EditorialShare from '@/components/blog/EditorialShare';
import EditorialStickyFix from '@/components/blog/EditorialStickyFix';
import VideoLightbox from '@/components/blog/VideoLightbox';
import BlogEmailSignup from '@/components/BlogEmailSignup';
import '@/app/editorial.css';

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
        title: post.title.match(/\(\d{4}\)\s*$/) ? post.title : `${post.title} (${new Date().getFullYear()})`,
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

    // GSC Fix (P1.5): for state-license blog posts (slug like "pmhnp-license-{state}"),
    // we render CTA links to /jobs/{cat}/{state} pages. If a setting-state combo has
    // 0 jobs, that page now 410s — so don't render the link at all.
    const licenseSlugMatch = slug.match(/^pmhnp-license-(.+)$/);
    const validBlogStateSettings = new Set<string>();
    if (licenseSlugMatch) {
        const stateSlugFromBlog = licenseSlugMatch[1];
        try {
            const rows = await prisma.pseoStats.findMany({
                where: {
                    type: 'setting-state',
                    locationSlug: stateSlugFromBlog,
                    totalJobs: { gte: 1 },
                    categorySlug: { in: ['remote', 'telehealth', 'outpatient'] },
                },
                select: { categorySlug: true },
            });
            for (const r of rows) validBlogStateSettings.add(r.categorySlug);
        } catch {
            // On DB failure, render no setting CTAs (safer than linking to 410s)
        }
    }

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

    // Word count and read time for editorial TOC
    // Strip markdown syntax to get accurate word count
    const plainText = post.content
        .replace(/^#{1,6}\s+/gm, '')           // headings
        .replace(/\*\*(.+?)\*\*/g, '$1')       // bold
        .replace(/\*(.+?)\*/g, '$1')           // italic
        .replace(/!\[[^\]]*\]\([^)]+\)/g, '')  // images
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → keep text
        .replace(/https?:\/\/\S+/g, '')        // bare URLs
        .replace(/[`~>|]/g, '')                // code ticks, blockquotes
        .replace(/\s+/g, ' ')
        .trim();
    const wordCount = plainText.split(/\s+/).filter(Boolean).length;
    const readTime = `${Math.max(1, Math.ceil(wordCount / 238))} min`;

    // JSON-LD BlogPosting schema
    const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.title,
        description: post.meta_description || post.title,
        datePublished: post.publish_date || post.created_at,
        dateModified: post.updated_at,
        author: [{
            '@type': 'Person',
            name: 'PMHNP Hiring Editorial Team',
            jobTitle: 'Board-Certified Psychiatric-Mental Health Nurse Practitioners',
            url: 'https://pmhnphiring.com/about',
        }, {
            '@type': 'Organization',
            name: 'PMHNP Hiring',
            url: 'https://pmhnphiring.com',
        }],
        reviewedBy: {
            '@type': 'Person',
            name: 'PMHNP Clinical Review Board',
            jobTitle: 'Board-Certified Psychiatric-Mental Health Nurse Practitioners',
            url: 'https://pmhnphiring.com/about',
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
        <div className="ed-page">
            <EditorialStickyFix />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            {faqSchema && (
                <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
            )}
            {videoSchema && (
                <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(videoSchema) }} />
            )}
            {howToSchema && (
                <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }} />
            )}
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
                '@context': 'https://schema.org', '@type': 'BreadcrumbList',
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://pmhnphiring.com' },
                    { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://pmhnphiring.com/blog' },
                    { '@type': 'ListItem', position: 3, name: post.title, item: currentUrl },
                ],
            }) }} />

            {/* -- HERO -- */}
            <header className="ed-hero">
                <nav className="ed-breadcrumb">
                    <Link href="/">Home</Link>
                    <span className="ed-sep">/</span>
                    <Link href="/blog">Blog</Link>
                    <span className="ed-sep">/</span>
                    <span>{categoryLabel}</span>
                </nav>
                <div className="ed-hero-grid">
                    <div className="ed-hero-main">
                        <h1 className="ed-title">{post.title}</h1>
                        {post.meta_description && (
                            <p className="ed-deck">{post.meta_description}</p>
                        )}
                        <div className="ed-hero-meta">
                            <div>
                                <label>Published</label>
                                <strong>{formatDate(post.publish_date || post.created_at)}</strong>
                            </div>
                            <div>
                                <label>Read Time</label>
                                <strong>{readTime}</strong>
                            </div>
                            {post.updated_at && (
                                <div>
                                    <label>Last Reviewed</label>
                                    <strong>{formatDate(post.updated_at)}</strong>
                                </div>
                            )}
                            <div>
                                <label>Category</label>
                                <strong>{categoryLabel}</strong>
                            </div>
                        </div>
                    </div>
                    <div className="ed-hero-side">
                        <div
                            className="ed-hero-photo"
                            style={post.image_url ? { backgroundImage: `url(${post.image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
                        >
                            <div className="ed-hero-photo-caption">
                                <strong>{categoryLabel}</strong>
                                <span>{formatDate(post.publish_date || post.created_at)}</span>
                            </div>
                            {post.video_url && (
                                <VideoLightbox videoUrl={post.video_url} title={post.title} />
                            )}
                        </div>


                    </div>
                </div>
            </header>


            {/* -- THREE-COLUMN LAYOUT -- */}
            <div className="ed-layout">
                {/* Left rail - Sticky TOC */}
                <aside className="ed-col-left">
                    <EditorialTOC headings={headings} readTime={readTime} wordCount={wordCount} />
                </aside>

                {/* Center - Article prose */}
                <main className="ed-col-center">
                    <article>
                        <div
                            className="editorial-prose"
                            dangerouslySetInnerHTML={{ __html: contentHtml }}
                        />
                    </article>

                    {/* Share row */}
                    <EditorialShare title={post.title} url={currentUrl} />


                    {/* Author */}
                    <div className="ed-author">
                        <div className="ed-author-avatar">P</div>
                        <div>
                            <div className="ed-author-role">Editorial Team</div>
                            <h4 className="ed-author-name">PMHNP Hiring</h4>
                            <p className="ed-author-bio">Board-certified psychiatric-mental health nurse practitioners and healthcare career specialists.</p>
                        </div>
                        <Link href="/about" className="ed-author-link">
                            About Us <ArrowRight size={14} />
                        </Link>
                    </div>
                </main>

                {/* Right rail - Toolbar + Newsletter */}
                <aside className="ed-col-right">
                    <EditorialToolbar slug={slug} title={post.title} url={currentUrl} />
                </aside>
            </div>

            {/* -- READ NEXT -- */}
            {relatedPosts.length > 0 && (
                <section className="ed-read-next">
                    <div className="ed-read-next-header">
                        <h2 className="ed-read-next-title">Read <em>Next</em></h2>
                        <Link href="/blog" className="ed-read-next-all">All Articles &rarr;</Link>
                    </div>
                    <div className="ed-read-next-grid">
                        {relatedPosts.slice(0, 3).map((relPost, idx) => {
                            const relLabel = BLOG_CATEGORIES.find((c) => c.id === relPost.category)?.label || relPost.category;
                            return (
                                <Link key={relPost.slug} href={`/blog/${relPost.slug}`} className={`ed-next-card ${idx === 0 ? 'ed-next-card-featured' : ''}`}>
                                    <div
                                        className="ed-next-card-img"
                                        style={relPost.image_url ? { backgroundImage: `url(${relPost.image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
                                    />
                                    <div className="ed-next-card-meta">
                                        <span className="ed-next-card-cat">{relLabel}</span>
                                    </div>
                                    <h3 className="ed-next-card-title">{relPost.title}</h3>
                                    {idx === 0 && relPost.meta_description && (
                                        <p className="ed-next-card-desc">{relPost.meta_description}</p>
                                    )}
                                </Link>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* ══ CONTEXTUAL pSEO LINKS (Phase 7.5) ══ */}
            <div className="ed-jobs-cta" style={{ textAlign: 'center' }}>
                {(() => {
                    // State license guide → link to that state's job pages
                    const licenseMatch = slug.match(/^pmhnp-license-(.+)$/);
                    if (licenseMatch) {
                        const stateSlug = licenseMatch[1];
                        return (
                            <>
                                <p className="ed-jobs-cta-text" style={{ marginBottom: '12px' }}>
                                    Ready to start your career? Browse PMHNP positions:
                                </p>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
                                    <Link href={`/jobs/state/${stateSlug}`} className="ed-jobs-cta-link" style={{ padding: '6px 14px', borderRadius: '10px', background: '#F0FDFA', border: '1px solid rgba(13,148,136,0.15)', textDecoration: 'none', fontSize: '13px', fontWeight: 600, color: '#0D9488' }}>
                                        All Jobs in {stateSlug.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')} →
                                    </Link>
                                    {validBlogStateSettings.has('remote') && (
                                        <Link href={`/jobs/remote/${stateSlug}`} className="ed-jobs-cta-link" style={{ padding: '6px 14px', borderRadius: '10px', background: '#F0FDFA', border: '1px solid rgba(13,148,136,0.15)', textDecoration: 'none', fontSize: '13px', fontWeight: 600, color: '#0D9488' }}>
                                            Remote →
                                        </Link>
                                    )}
                                    {validBlogStateSettings.has('telehealth') && (
                                        <Link href={`/jobs/telehealth/${stateSlug}`} className="ed-jobs-cta-link" style={{ padding: '6px 14px', borderRadius: '10px', background: '#F0FDFA', border: '1px solid rgba(13,148,136,0.15)', textDecoration: 'none', fontSize: '13px', fontWeight: 600, color: '#0D9488' }}>
                                            Telehealth →
                                        </Link>
                                    )}
                                    {validBlogStateSettings.has('outpatient') && (
                                        <Link href={`/jobs/outpatient/${stateSlug}`} className="ed-jobs-cta-link" style={{ padding: '6px 14px', borderRadius: '10px', background: '#F0FDFA', border: '1px solid rgba(13,148,136,0.15)', textDecoration: 'none', fontSize: '13px', fontWeight: 600, color: '#0D9488' }}>
                                            Outpatient →
                                        </Link>
                                    )}
                                    <Link href={`/salary-guide/${stateSlug}`} className="ed-jobs-cta-link" style={{ padding: '6px 14px', borderRadius: '10px', background: '#F0FDFA', border: '1px solid rgba(13,148,136,0.15)', textDecoration: 'none', fontSize: '13px', fontWeight: 600, color: '#0D9488' }}>
                                        Salary Guide →
                                    </Link>
                                </div>
                            </>
                        );
                    }

                    // Career-related posts → relevant category links
                    const categoryLinks = [
                        { match: /remote|work.from.home/i, label: 'Remote Jobs', href: '/jobs/remote' },
                        { match: /telehealth|virtual/i, label: 'Telehealth Jobs', href: '/jobs/telehealth' },
                        { match: /new.grad|first.job|entry.level/i, label: 'New Grad Jobs', href: '/jobs/new-grad' },
                        { match: /salary|compensation|pay/i, label: 'Salary Guide', href: '/salary-guide' },
                        { match: /travel|locum/i, label: 'Travel Jobs', href: '/jobs/travel' },
                        { match: /private.practice/i, label: 'Private Practice', href: '/jobs/private-practice' },
                        { match: /inpatient|hospital/i, label: 'Inpatient Jobs', href: '/jobs/inpatient' },
                        { match: /outpatient|clinic/i, label: 'Outpatient Jobs', href: '/jobs/outpatient' },
                    ];
                    const fullText = `${post.title} ${post.content.slice(0, 500)}`;
                    const matched = categoryLinks.filter(l => l.match.test(fullText)).slice(0, 4);

                    return (
                        <>
                            <p className="ed-jobs-cta-text" style={{ marginBottom: '12px' }}>
                                Looking for your next role?
                            </p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
                                <Link href="/jobs" className="ed-jobs-cta-link" style={{ padding: '6px 14px', borderRadius: '10px', background: '#0D9488', textDecoration: 'none', fontSize: '13px', fontWeight: 600, color: '#fff' }}>
                                    Browse All PMHNP Jobs →
                                </Link>
                                {matched.map(l => (
                                    <Link key={l.href} href={l.href} className="ed-jobs-cta-link" style={{ padding: '6px 14px', borderRadius: '10px', background: '#F0FDFA', border: '1px solid rgba(13,148,136,0.15)', textDecoration: 'none', fontSize: '13px', fontWeight: 600, color: '#0D9488' }}>
                                        {l.label} →
                                    </Link>
                                ))}
                            </div>
                        </>
                    );
                })()}
            </div>
        </div>
    );
}
