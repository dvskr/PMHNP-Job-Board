import { brand } from '@/config/brand';
import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import VideoJsonLd from '@/components/VideoJsonLd';
import ResourceDownloadGate from '@/components/ResourceDownloadGate';
import LicensureChecker from '@/components/LicensureChecker';
import StateImage from '@/components/StateImage';
import { prisma } from '@/lib/prisma';
import { STATE_PRACTICE_AUTHORITY } from '@/lib/state-practice-authority';

export const revalidate = 86400;

const SALARY_GUIDE_URL = process.env.SALARY_GUIDE_URL || 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/resources/PMHNP_Salary_Guide_2026.pdf';

export const metadata: Metadata = {
  title: 'PMHNP Resources & Career Guides — 85+ Free Articles',
  description: 'Free PMHNP career resources: 50-state licensure guides, salary calculator, negotiation tips, private practice startup, 1099 vs W2 comparison, and 85+ expert articles.',
  keywords: [
    'pmhnp resources', 'psychiatric nurse practitioner career', 'pmhnp salary guide',
    'pmhnp licensure by state', 'pmhnp private practice', 'pmhnp career guide',
    'pmhnp interview tips', 'pmhnp job search',
  ],
  openGraph: {
    title: 'PMHNP Resources & Career Guides — 85+ Free Articles',
    description: 'Free career resources for psychiatric nurse practitioners. Salary data, licensure guides, and expert articles.',
    images: [{ url: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/pmhnp-career-resources-guides.webp', width: 1280, height: 900, alt: 'PMHNP career resources and guides' }],
  },
  twitter: { card: 'summary_large_image', images: ['https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/pmhnp-career-resources-guides.webp'] },
  alternates: { canonical: `${brand.baseUrl}/resources` },
};

/* ─── Clay styles ─── */
const clayCard: React.CSSProperties = {
  background: '#FFFFFF', borderRadius: '20px',
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

/* ─── Category config ─── */
const CATEGORY_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  career_opportunities: { label: 'Career', color: '#6366F1', bg: '#EEF2FF', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/employers/clay-trending.webp' },
  salary_negotiation: { label: 'Salary', color: '#0D9488', bg: '#F0FDFA', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/employers/clay-dollar.webp' },
  job_seeker_attraction: { label: 'Job Search', color: '#3B82F6', bg: '#EFF6FF', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/blog/icon-job-search.webp' },
  career_myths: { label: 'Education', color: '#A855F7', bg: '#FAF5FF', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/blog/icon-education.webp' },
  community_lifestyle: { label: 'Lifestyle', color: '#F59E0B', bg: '#FFFBEB', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/employers/clay-people.webp' },
  employer_facing: { label: 'Employers', color: '#EF4444', bg: '#FEF2F2', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/blog/icon-employers.webp' },
  product_lead_gen: { label: 'Product', color: '#0D9488', bg: '#F0FDFA', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/blog/icon-product.webp' },
  industry_awareness: { label: 'Industry', color: '#8B5CF6', bg: '#F5F3FF', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/blog/icon-industry.webp' },
};

/* ─── Featured guides data ─── */
const featuredGuides = [
  {
    href: '/salary-guide',
    title: 'Salary Calculator & Guide',
    desc: 'Interactive salary tool with state, experience, and setting selectors. Complete 2026 data.',
    img: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/employers/clay-dollar.webp',
    badge: 'Interactive Tool',
    badgeColor: '#0D9488',
  },
  {
    href: '/resources/fpa-guide',
    title: 'Full Practice Authority Guide',
    desc: 'All 50 states classified. See which states allow independent practice and how FPA impacts pay.',
    img: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/employers/clay-chart.webp',
    badge: '50 States',
    badgeColor: '#6366F1',
  },
  {
    href: '/resources/private-practice-guide',
    title: 'Private Practice Startup',
    desc: 'LLC formation, credentialing, EHR, malpractice insurance, and income projections.',
    img: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/employers/clay-trending.webp',
    badge: 'Step-by-Step',
    badgeColor: '#F59E0B',
  },
];

export default async function ResourcesPage() {
  const [blogPosts, stateSalaryData] = await Promise.all([
    prisma.blogPost.findMany({
      where: { status: 'published' },
      select: { slug: true, title: true, category: true, metaDescription: true, imageUrl: true, publishDate: true },
      orderBy: { publishDate: 'desc' },
    }),
    prisma.job.groupBy({
      by: ['state'],
      where: { isPublished: true, state: { not: null }, normalizedMinSalary: { not: null } },
      _avg: { normalizedMinSalary: true, normalizedMaxSalary: true },
      _min: { normalizedMinSalary: true },
      _max: { normalizedMaxSalary: true },
      _count: { id: true },
    }),
  ]);

  const stateSalaries = stateSalaryData
    .filter(s => s.state && s._avg.normalizedMinSalary)
    .map(s => ({
      state: s.state!,
      avgSalary: Math.round(((s._avg.normalizedMinSalary || 0) + (s._avg.normalizedMaxSalary || 0)) / 2),
      minSalary: Math.round(s._min.normalizedMinSalary || 0),
      maxSalary: Math.round(s._max.normalizedMaxSalary || 0),
      jobCount: s._count.id,
    }))
    .sort((a, b) => b.avgSalary - a.avgSalary);

  // Split state_spotlight from other articles
  const stateGuides = blogPosts.filter(p => p.category === 'state_spotlight');
  const articles = blogPosts.filter(p => p.category !== 'state_spotlight');

  // Group articles by category
  const grouped: Record<string, typeof articles> = {};
  articles.forEach(a => {
    if (!grouped[a.category]) grouped[a.category] = [];
    grouped[a.category].push(a);
  });

  // Extract unique state names from slugs for the grid
  const stateNames = stateGuides.map(s => {
    const match = s.slug.match(/pmhnp-license-(.+)/);
    if (!match) return null;
    const raw = match[1].replace(/-\d+$/, ''); // remove trailing -2 duplicates
    return {
      name: raw.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      slug: s.slug,
      title: s.title,
    };
  }).filter(Boolean);

  // Deduplicate (some states have -2 copies)
  const uniqueStates = new Map<string, typeof stateNames[0]>();
  stateNames.forEach(s => {
    if (s && !uniqueStates.has(s.name)) uniqueStates.set(s.name, s);
  });
  const sortedStates = Array.from(uniqueStates.values()).sort((a, b) => a!.name.localeCompare(b!.name));

  const currentYear = new Date().getFullYear();

  return (
    <>
      <VideoJsonLd pathname="/resources" />
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://pmhnphiring.com' },
        { name: 'Resources', url: 'https://pmhnphiring.com/resources' },
      ]} />

      {/* CollectionPage Schema. Audit 14 M-4: previously had no `hasPart`,
          so Google couldn't resolve the hub-and-spoke relationship between
          this page and the three core resource guides. numberOfItems also
          referenced blogPosts.length (the post grid below the resource
          tiles), which was semantically wrong — the CollectionPage is the
          guide hub, not a blog index. Now lists the actual featured guide
          URLs and counts them. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: `PMHNP Resources & Career Guides — ${currentYear}`,
        description: 'Free career resources for psychiatric nurse practitioners.',
        url: 'https://pmhnphiring.com/resources',
        publisher: { '@type': 'Organization', name: 'PMHNP Hiring', url: 'https://pmhnphiring.com' },
        hasPart: [
          { '@type': 'Article', name: 'PMHNP Full Practice Authority Guide', url: 'https://pmhnphiring.com/resources/fpa-guide' },
          { '@type': 'Article', name: '1099 vs W2 for PMHNPs — Compensation Comparison', url: 'https://pmhnphiring.com/resources/1099-vs-w2' },
          { '@type': 'Article', name: 'How to Start a PMHNP Private Practice', url: 'https://pmhnphiring.com/resources/private-practice-guide' },
        ],
        numberOfItems: 3,
      }) }} />

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 1: HERO (warm cream bg)
          ═══════════════════════════════════════════════════════════════ */}
      <div style={{ background: 'linear-gradient(180deg, #FFF5EE 0%, #FDE8D8 40%, #FFF5EE 100%)' }}>
        <section style={{ maxWidth: '1100px', margin: '0 auto', padding: '80px 20px 0', textAlign: 'center' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '8px' }}>
            Free Career Resources
          </p>
          <h1 className="font-lora" style={{
            fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 800, lineHeight: 1.15,
            color: '#1A2E35', marginBottom: '16px',
          }}>
            PMHNP Resources & Guides
          </h1>
          <p style={{ fontSize: '17px', color: '#5A4A42', maxWidth: '600px', margin: '0 auto 32px', lineHeight: 1.6 }}>
            Everything you need for your PMHNP career — from licensure requirements to salary negotiation.
          </p>

          {/* Stat Pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px', marginBottom: '48px' }}>
            {[
              { value: `${blogPosts.length}+`, label: 'Articles', bg: '#D4F5E9', color: '#065F46' },
              { value: `${sortedStates.length}`, label: 'State Guides', bg: '#E0E7FF', color: '#3730A3' },
              { value: '3', label: 'Deep Guides', bg: '#FEF3C7', color: '#92400E' },
              { value: 'Free', label: 'Always', bg: '#FFE0D3', color: '#7C2D12' },
            ].map(s => (
              <div key={s.label} className="sal-stat-pill" style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                padding: '10px 20px 10px 16px', borderRadius: '40px',
                background: s.bg,
                boxShadow: '3px 3px 8px rgba(0,0,0,0.04), inset 1px 1px 2px rgba(255,255,255,0.5)',
              }}>
                <span style={{ fontSize: '20px', fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</span>
                <span style={{ fontSize: '12px', color: s.color, opacity: 0.7, fontWeight: 500 }}>{s.label}</span>
              </div>
            ))}
          </div>

          {/* ─── Section 2: Featured Guides Bento ─── */}
          <div style={{ textAlign: 'left' }}>
            <div className="res-feat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '14px' }}>
              {featuredGuides.map(g => (
                <Link key={g.href} href={g.href} className="emp-bento-card" style={{
                  ...clayCard, padding: '28px 24px', textDecoration: 'none',
                  display: 'flex', flexDirection: 'column', gap: '14px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Image src={g.img} alt={g.title} width={48} height={48} style={{ width: '48px', height: '48px', borderRadius: '14px' }} />
                    <span style={{
                      fontSize: '11px', fontWeight: 700, color: g.badgeColor,
                      background: `${g.badgeColor}15`, padding: '4px 10px', borderRadius: '20px',
                    }}>{g.badge}</span>
                  </div>
                  <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1A2E35', margin: 0 }}>{g.title}</h2>
                  <p style={{ fontSize: '13px', color: '#5A4A42', lineHeight: 1.55, margin: 0, flex: 1 }}>{g.desc}</p>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    Read Guide <ArrowRight size={14} />
                  </span>
                </Link>
              ))}
            </div>

            {/* 1099 vs W2 — full-width banner */}
            <Link href="/resources/1099-vs-w2" className="emp-bento-card" style={{
              ...clayCard, padding: '0', overflow: 'hidden', textDecoration: 'none',
              display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center',
            }}>
              <div style={{ padding: '24px 28px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#F59E0B', background: '#FEF3C7', padding: '4px 10px', borderRadius: '20px' }}>Compensation</span>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1A2E35', margin: '10px 0 6px' }}>1099 vs W2 for PMHNPs — Complete Comparison</h2>
                <p style={{ fontSize: '13px', color: '#5A4A42', lineHeight: 1.55, margin: 0 }}>
                  Independent contractor vs employee: tax strategies, income comparison, and which model maximizes your earnings.
                </p>
              </div>
              <div style={{ padding: '24px 28px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/employers/clay-dollar.webp" alt="1099 vs W2" width={56} height={56} style={{ width: '56px', height: '56px', borderRadius: '16px' }} />
              </div>
            </Link>
          </div>
        </section>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 3A: LICENSURE CHECKER TOOL (cool slate bg)
          ═══════════════════════════════════════════════════════════════ */}
      <section style={{ background: 'linear-gradient(180deg, #F1F5F9 0%, #E2E8F0 50%, #F1F5F9 100%)', padding: '80px 20px', marginTop: '24px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
            Interactive Tool
          </p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.5vw, 32px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '12px' }}>
            PMHNP Licensure Checker
          </h2>
          <p style={{ fontSize: '15px', color: '#5A4A42', textAlign: 'center', maxWidth: '550px', margin: '0 auto 44px', lineHeight: 1.6 }}>
            Select your state to instantly see requirements, practice authority, salary data, and timeline.
          </p>

          {/* ─── Licensure Checker Tool ─── */}
          <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <LicensureChecker
              stateGuides={sortedStates.filter(Boolean).map(s => ({ name: s!.name, slug: s!.slug }))}
              stateSalaries={stateSalaries}
              practiceAuthority={STATE_PRACTICE_AUTHORITY}
            />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 3B: BROWSE ALL STATE GUIDES (warm peach bg)
          ═══════════════════════════════════════════════════════════════ */}
      <section style={{ background: 'linear-gradient(180deg, #FDE8D8 0%, #F5D0B5 40%, #FDE8D8 100%)', padding: '80px 20px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
            50-State Coverage
          </p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.5vw, 32px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '12px' }}>
            Browse All Licensure Guides
          </h2>
          <p style={{ fontSize: '15px', color: '#5A4A42', textAlign: 'center', maxWidth: '500px', margin: '0 auto 36px', lineHeight: 1.6 }}>
            Requirements, board links, salary data, and step-by-step instructions for every state.
          </p>

          <div className="res-state-grid" style={{
            display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '20px',
          }}>
            {sortedStates.map(s => {
              if (!s) return null;
              const slug = s.name.toLowerCase().replace(/\s+/g, '-');
              return (
                <Link key={s.name} href={`/blog/${s.slug}`}
                  className="res-diorama-card"
                  style={{ textDecoration: 'none', display: 'block' }}
                >
                  <div
                    className="res-diorama-img"
                    style={{
                      position: 'relative', overflow: 'hidden', aspectRatio: '1',
                      borderRadius: '24px', marginBottom: '8px',
                      boxShadow: 'inset 4px 4px 10px rgba(255,255,255,0.3), inset -3px -3px 8px rgba(0,0,0,0.08), 0 6px 20px rgba(0,0,0,0.1)',
                      transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                    }}
                  >
                    {/* SEO Fix H15: StateImage falls back if per-state webp is missing. */}
                    <StateImage
                      slug={slug}
                      alt={`${s.name} PMHNP licensure guide`}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 20vw"
                    />
                  </div>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: '#1A2E35', textAlign: 'center', margin: '0 0 2px', transition: 'color 0.2s ease' }}
                    className="res-diorama-name">{s.name}</p>
                  <p style={{ fontSize: '11px', color: '#6366F1', textAlign: 'center', margin: 0, fontWeight: 500 }}>Read Guide →</p>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 4: BLOG ARTICLES BY CATEGORY (cream bg)
          ═══════════════════════════════════════════════════════════════ */}
      <div style={{ background: 'linear-gradient(180deg, #FFF5EE 0%, #FDE8D8 50%, #FFF5EE 100%)', padding: '80px 20px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
            Expert Articles
          </p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.5vw, 32px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '40px' }}>
            Career Guides & Insights
          </h2>

          {Object.entries(grouped).map(([category, posts]) => {
            const cfg = CATEGORY_CONFIG[category] || { label: category, color: '#64748B', bg: '#F1F5F9', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/employers/clay-star.webp' };
            return (
              <div key={category} style={{ marginBottom: '48px' }}>
                {/* Category header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                  <Image src={cfg.icon} alt={cfg.label} width={36} height={36} style={{ width: '36px', height: '36px', borderRadius: '10px' }} />
                  <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#1A2E35', margin: 0 }}>{cfg.label}</h3>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#94A3B8', marginLeft: '4px' }}>({posts.length})</span>
                </div>
                {/* Post grid */}
                <div className="res-article-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                  {posts.slice(0, 6).map(post => (
                    <Link key={post.slug} href={`/blog/${post.slug}`} className="emp-bento-card" style={{
                      ...clayCard, padding: '24px 22px', textDecoration: 'none',
                      display: 'flex', flexDirection: 'column', gap: '10px',
                    }}>
                      <span style={{
                        fontSize: '10px', fontWeight: 700, color: cfg.color,
                        background: cfg.bg, padding: '3px 10px', borderRadius: '20px',
                        alignSelf: 'flex-start',
                      }}>{cfg.label}</span>
                      <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', margin: 0, lineHeight: 1.4 }}>{post.title}</h4>
                      {post.metaDescription && (
                        <p style={{ fontSize: '12.5px', color: '#5A4A42', lineHeight: 1.5, margin: 0, flex: 1 }}>
                          {post.metaDescription.length > 120 ? post.metaDescription.slice(0, 120) + '…' : post.metaDescription}
                        </p>
                      )}
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#0D9488', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        Read more <ArrowRight size={12} />
                      </span>
                    </Link>
                  ))}
                </div>
                {posts.length > 6 && (
                  <div style={{ textAlign: 'center', marginTop: '16px' }}>
                    <Link href="/blog" style={{
                      fontSize: '13px', fontWeight: 600, color: '#0D9488',
                      textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px',
                    }}>
                      View all {cfg.label} articles <ArrowRight size={14} />
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 5: TOOLS & DOWNLOADS (slate bg)
          ═══════════════════════════════════════════════════════════════ */}
      <section style={{ background: 'linear-gradient(180deg, #F1F5F9 0%, #E8EDF2 50%, #F1F5F9 100%)', padding: '80px 20px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
            Free Tools
          </p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.5vw, 32px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '32px' }}>
            Tools & Downloads
          </h2>

          <div className="res-tools-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
            {/* Salary Calculator */}
            <Link href="/salary-guide" className="emp-bento-card" style={{
              ...clayCard, padding: '28px 24px', textDecoration: 'none',
              background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)',
              border: '2px solid rgba(13,148,136,0.12)',
            }}>
              <Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/employers/clay-dollar.webp" alt="Salary Calculator" width={48} height={48} style={{ width: '48px', height: '48px', borderRadius: '14px', marginBottom: '12px' }} />
              <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#134E4A', margin: '0 0 6px' }}>Salary Calculator</h3>
              <p style={{ fontSize: '13px', color: '#5A4A42', lineHeight: 1.5, margin: '0 0 14px' }}>
                Get a personalized salary estimate based on your state, experience, setting, and specialty.
              </p>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                Use Calculator <ArrowRight size={14} />
              </span>
            </Link>

            {/* PDF Download */}
            <div className="emp-bento-card" style={{ ...clayCard, padding: '28px 24px' }}>
              <Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/employers/clay-envelope.webp" alt="PDF Guide" width={48} height={48} style={{ width: '48px', height: '48px', borderRadius: '14px', marginBottom: '12px' }} />
              <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Free Salary Guide PDF</h3>
              <p style={{ fontSize: '13px', color: '#5A4A42', lineHeight: 1.5, margin: '0 0 14px' }}>
                Download the complete {currentYear} salary guide with state-by-state data and negotiation tips.
              </p>
              <ResourceDownloadGate resourceUrl={SALARY_GUIDE_URL} resourceTitle="Salary Guide PDF" />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 6: CTA
          ═══════════════════════════════════════════════════════════════ */}
      <div style={{ background: 'linear-gradient(180deg, #FFF5EE 0%, #FDE8D8 50%, #FFF5EE 100%)', padding: '80px 20px' }}>
        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
          <div className="emp-bento-card" style={{
            ...clayCard, padding: '0', overflow: 'hidden', textAlign: 'center',
            border: '2px solid rgba(13,148,136,0.10)',
          }}>
            <div style={{ background: 'linear-gradient(145deg, #0D9488, #10B981)', padding: '40px 32px', color: '#fff' }}>
              <Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/clay-icon-match.webp" alt="Jobs" width={56} height={56} style={{ width: '56px', height: '56px', margin: '0 auto 16px', borderRadius: '16px' }} />
              <h2 className="font-lora" style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 8px' }}>Ready to Find Your Next PMHNP Role?</h2>
              <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.8)', margin: '0 0 24px' }}>
                Browse thousands of psychiatric nurse practitioner positions updated daily.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px' }}>
                <Link href="/jobs" className="emp-cta-primary" style={{
                  padding: '14px 32px', borderRadius: '12px', fontWeight: 700, fontSize: '14px',
                  background: '#fff', color: '#0D9488', textDecoration: 'none',
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                }}>Browse Jobs <ArrowRight size={16} /></Link>
                <Link href="/job-alerts" className="emp-cta-secondary" style={{
                  padding: '14px 32px', borderRadius: '12px', fontWeight: 700, fontSize: '14px',
                  background: 'transparent', color: '#fff', textDecoration: 'none',
                  border: '2px solid rgba(255,255,255,0.4)',
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                }}>Set Up Job Alerts</Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Styles ─── */}
      <style>{`
        .emp-cta-primary {
          transition: transform 0.25s ease, box-shadow 0.25s ease;
        }
        .emp-cta-primary:hover {
          transform: translateY(-3px);
          box-shadow: 0 10px 32px rgba(0,0,0,0.2) !important;
        }
        .emp-cta-secondary {
          transition: transform 0.25s ease, border-color 0.25s ease;
        }
        .emp-cta-secondary:hover {
          transform: translateY(-2px);
          border-color: rgba(255,255,255,0.7) !important;
        }
        .emp-bento-card {
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .emp-bento-card:hover {
          transform: translateY(-4px);
          box-shadow: 8px 8px 24px rgba(0,0,0,0.1), -4px -4px 12px rgba(255,255,255,0.9), inset 1px 1px 2px rgba(255,255,255,0.6) !important;
        }
        .sal-stat-pill {
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .sal-stat-pill:hover {
          transform: translateY(-2px) scale(1.02);
          box-shadow: 6px 6px 20px rgba(0,0,0,0.1), -3px -3px 10px rgba(255,255,255,0.9) !important;
        }
        .res-diorama-card:hover .res-diorama-img {
          transform: translateY(-6px) scale(1.03);
          box-shadow: inset 4px 4px 10px rgba(255,255,255,0.3), inset -3px -3px 8px rgba(0,0,0,0.08), 0 14px 32px rgba(0,0,0,0.16) !important;
        }
        .res-diorama-card:hover .res-diorama-name {
          color: #0D9488 !important;
        }
        @media (max-width: 768px) {
          .res-feat-grid { grid-template-columns: 1fr !important; }
          .res-state-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .res-article-grid { grid-template-columns: 1fr !important; }
          .res-tools-grid { grid-template-columns: 1fr !important; }
        }
        @media (min-width: 769px) and (max-width: 1024px) {
          .res-feat-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .res-state-grid { grid-template-columns: repeat(3, 1fr) !important; }
          .res-article-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </>
  );
}
