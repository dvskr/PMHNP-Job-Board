import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { MapPin, DollarSign, Building2, Shield, TrendingUp, Users, Heart, Briefcase, ArrowRight, Bell } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { BEST_SORT_ORDER_BY } from '@/lib/utils/job-sort';
import { getMetroCity, getAllMetroSlugs, type MetroCity } from '@/lib/metro-data';
import JobCard from '@/components/JobCard';
import { Job } from '@/lib/types';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import CategoryHero from '@/components/CategoryHero';
import CategoryFAQ from '@/components/CategoryFAQ';
import { notFound } from 'next/navigation';

/* ═══ Design Tokens — V2 Warm Diorama ═══ */
const clayCard: React.CSSProperties = {
  background: '#FFFFFF', borderRadius: '20px',
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

export const revalidate = 3600;

interface PageProps {
  params: Promise<{ slug: string }>;
}

/** Only pre-generate the 10 target metro pages */
export async function generateStaticParams() {
  return getAllMetroSlugs().map(slug => ({ slug }));
}

/** Fetch job stats for a metro area */
async function getMetroStats(city: string, stateCode: string) {
  const where = {
    isPublished: true,
    OR: [
      { city: { contains: city, mode: 'insensitive' as const } },
      // Also match metro-area adjacent searches
      ...(city === 'New York' ? [{ city: { contains: 'Brooklyn', mode: 'insensitive' as const } }, { city: { contains: 'Queens', mode: 'insensitive' as const } }, { city: { contains: 'Bronx', mode: 'insensitive' as const } }] : []),
      ...(city === 'Tampa' ? [{ city: { contains: 'St. Petersburg', mode: 'insensitive' as const } }, { city: { contains: 'Clearwater', mode: 'insensitive' as const } }] : []),
      ...(city === 'Dallas' ? [{ city: { contains: 'Fort Worth', mode: 'insensitive' as const } }, { city: { contains: 'Plano', mode: 'insensitive' as const } }, { city: { contains: 'Arlington', mode: 'insensitive' as const } }] : []),
    ],
    stateCode: { equals: stateCode, mode: 'insensitive' as const },
  };

  const [totalJobs, salaryData, topEmployers, recentJobs] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.aggregate({
      where: { ...where, normalizedMinSalary: { not: null }, normalizedMaxSalary: { not: null } },
      _avg: { normalizedMinSalary: true, normalizedMaxSalary: true },
    }),
    prisma.job.groupBy({
      by: ['employer'],
      where,
      _count: { employer: true },
      orderBy: { _count: { employer: 'desc' } },
      take: 8,
    }),
    prisma.job.findMany({
      where,
      orderBy: BEST_SORT_ORDER_BY,
      take: 10,
    }),
  ]);

  const avgMin = salaryData._avg.normalizedMinSalary || 0;
  const avgMax = salaryData._avg.normalizedMaxSalary || 0;
  const avgSalary = Math.round((avgMin + avgMax) / 2 / 1000);

  return {
    totalJobs,
    avgSalary,
    topEmployers: topEmployers.map(e => ({ name: e.employer, count: e._count.employer })),
    recentJobs: recentJobs as Job[],
  };
}

/** Also fetch statewide stats for comparison */
async function getStateStats(stateCode: string) {
  const stateJobs = await prisma.job.count({
    where: { isPublished: true, stateCode: { equals: stateCode, mode: 'insensitive' } },
  });
  const stateSalary = await prisma.job.aggregate({
    where: {
      isPublished: true,
      stateCode: { equals: stateCode, mode: 'insensitive' },
      normalizedMinSalary: { not: null },
      normalizedMaxSalary: { not: null },
    },
    _avg: { normalizedMinSalary: true, normalizedMaxSalary: true },
  });
  const avgMin = stateSalary._avg.normalizedMinSalary || 0;
  const avgMax = stateSalary._avg.normalizedMaxSalary || 0;
  return {
    totalJobs: stateJobs,
    avgSalary: Math.round((avgMin + avgMax) / 2 / 1000),
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const metro = getMetroCity(slug);
  if (!metro) return { title: 'Not Found' };

  const stats = await getMetroStats(metro.city, metro.stateCode);

  // Title trimmed to <60 chars for SERP display. Salary/licensure/employer
  // detail moved to the description; longer "Top Employers (YYYY)" suffix
  // was reliably truncated mid-phrase.
  const title = `${stats.totalJobs > 0 ? `${stats.totalJobs} ` : ''}PMHNP Jobs in ${metro.city}, ${metro.stateCode} (${new Date().getFullYear()})`;
  // Description capped at ~155 chars to avoid SERP truncation. Full hero
  // copy still renders on the page for users.
  const description = [
    `Find PMHNP jobs in ${metro.city}, ${metro.stateCode}.`,
    `${metro.practiceAuthority} practice authority.`,
    stats.avgSalary > 0 ? `Avg salary $${stats.avgSalary}K.` : '',
    `${metro.heroDescription.slice(0, 70).trim()}.`,
  ].filter(Boolean).join(' ').slice(0, 158);

  return {
    title,
    description,
    keywords: [
      `pmhnp jobs ${metro.city.toLowerCase()}`,
      `psychiatric nurse practitioner ${metro.city.toLowerCase()}`,
      `pmhnp salary ${metro.city.toLowerCase()}`,
      `mental health np jobs ${metro.stateCode.toLowerCase()}`,
    ],
    openGraph: {
      title: `PMHNP Jobs in ${metro.city}, ${metro.stateCode}`,
      description,
      type: 'website',
      images: [{
        url: `/api/og?type=page&title=${encodeURIComponent(`PMHNP Jobs in ${metro.city}`)}&subtitle=${encodeURIComponent(`${metro.practiceAuthority} Practice Authority • ${metro.avgCostOfLiving} cost of living`)}`,
        width: 1200, height: 630,
        alt: `PMHNP Jobs in ${metro.city}, ${metro.stateCode}`,
      }],
    },
    alternates: {
      canonical: `https://pmhnphiring.com/jobs/metro/${slug}`,
    },
  };
}

export default async function MetroLandingPage({ params }: PageProps) {
  const { slug } = await params;
  const metro = getMetroCity(slug);
  if (!metro) notFound();

  const [stats, stateStats] = await Promise.all([
    getMetroStats(metro.city, metro.stateCode),
    getStateStats(metro.stateCode),
  ]);

  const practiceAuthorityColor = metro.practiceAuthority === 'Full' ? '#22c55e' : metro.practiceAuthority === 'Reduced' ? '#f59e0b' : '#ef4444';
  const practiceAuthorityBg = metro.practiceAuthority === 'Full' ? 'rgba(34,197,94,0.1)' : metro.practiceAuthority === 'Reduced' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)';

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FDFBF7' }}>
      {/* Breadcrumb Schema */}
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://pmhnphiring.com" },
        { name: "Jobs", url: "https://pmhnphiring.com/jobs" },
        { name: metro.state, url: `https://pmhnphiring.com/jobs/state/${metro.stateSlug}` },
        { name: `${metro.city} PMHNP Jobs`, url: `https://pmhnphiring.com/jobs/metro/${slug}` },
      ]} />

      {/* FAQ Schema */}
      {metro.faqs.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: metro.faqs.map(faq => ({
                '@type': 'Question',
                name: faq.question,
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: faq.answer,
                },
              })),
            }),
          }}
        />
      )}
      {/* ItemList schema */}
      {stats.recentJobs.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          '@context': 'https://schema.org', '@type': 'ItemList',
          name: `PMHNP Jobs in ${metro.city}, ${metro.stateCode}`,
          numberOfItems: stats.totalJobs,
          itemListElement: stats.recentJobs.slice(0, 6).map((job: Job, idx: number) => ({
            '@type': 'ListItem', position: idx + 1, name: job.title,
            url: `https://pmhnphiring.com/jobs/${job.slug || job.id}`,
          })),
        }) }} />
      )}
      {/* ═══ HERO ═══ */}
      <CategoryHero
        bgColor={metro.practiceAuthority === 'Full' ? '#86c1a8' : metro.practiceAuthority === 'Reduced' ? '#c1a886' : '#c1868a'}
        heroImage="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/hero_wc_states.webp"
        heroAlt={`PMHNP jobs in ${metro.city}, ${metro.stateCode}`}
        badgeText={`${stats.totalJobs} live roles · updated today`}
        breadcrumbs={['Careers', metro.state, metro.city]}
        headlineLine1={metro.city}
        headlineLine2="PMHNP"
        headlineSub={`jobs in ${metro.stateCode}, find your fit.`}
        stats={[
          { value: `${stats.totalJobs}+`, label: 'positions' },
          { value: stats.avgSalary > 0 ? `$${stats.avgSalary}k` : '$130K+', label: 'avg salary' },
          { value: metro.practiceAuthority, label: 'practice auth' },
        ]}
        description={metro.heroDescription}
        ctaLabel={`View All ${metro.city} Jobs`}
        ctaHref={`/jobs?location=${encodeURIComponent(metro.city)}`}
        secondaryCtaLabel="Set Alert"
        secondaryCtaHref={`/job-alerts?location=${encodeURIComponent(metro.city)}`}
      />

      {/* ═══ JOB LISTINGS ═══ */}
      <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '32px 24px' }}>
        <div className="grid lg:grid-cols-4 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-3">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-lora" style={{ fontSize: '20px', fontWeight: 700, color: '#1A2E35' }}>
                {metro.city} Positions ({stats.totalJobs})
              </h2>
              <Link
                href={`/jobs?location=${encodeURIComponent(metro.city)}`}
                className="text-sm font-medium hover:opacity-80 transition-opacity"
                style={{ color: '#0D9488' }}
              >
                View All Jobs →
              </Link>
            </div>

            {stats.recentJobs.length === 0 ? (
              <div className="text-center py-12 rounded-xl" style={{ ...clayCard, padding: '48px 24px' }}>
                <Briefcase className="h-12 w-12 mx-auto mb-4" style={{ color: '#A09080' }} />
                <h3 className="text-lg font-semibold mb-2" style={{ color: '#1A2E35' }}>
                  No positions at this time
                </h3>
                <p className="mb-6" style={{ color: '#5A4A42' }}>
                  New {metro.city} PMHNP openings are added daily. Set an alert or check back soon.
                </p>
                <Link
                  href="/jobs"
                  className="metro-cta"
                  style={{ padding: '12px 24px', borderRadius: '12px', fontWeight: 700, fontSize: '14px', background: '#0D9488', color: '#fff', textDecoration: 'none', display: 'inline-block' }}
                >
                  Browse All Jobs
                </Link>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                  {stats.recentJobs.map((job: Job) => (
                    <JobCard key={job.id} job={job} />
                  ))}
                </div>

                {/* Browse All CTA */}
                <div style={{ textAlign: 'center', marginTop: '32px' }}>
                  <Link href={`/jobs?location=${encodeURIComponent(metro.city)}`} className="metro-cta" style={{
                    padding: '14px 32px', borderRadius: '14px', fontWeight: 700, fontSize: '14px',
                    background: '#0D9488', color: '#fff', textDecoration: 'none',
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    boxShadow: '4px 4px 12px rgba(13,148,136,0.2)',
                  }}>
                    View All {stats.totalJobs} Jobs in {metro.city} <ArrowRight size={16} />
                  </Link>
                </div>
              </>
            )}
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            {/* Job Alert CTA */}
            <div className="metro-card" style={{ ...clayCard, padding: '24px', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', border: '2px solid rgba(13,148,136,0.15)', marginBottom: '20px' }}>
              <Bell size={28} style={{ color: '#0D9488', marginBottom: '12px' }} />
              <h3 className="font-lora" style={{ fontSize: '18px', fontWeight: 700, color: '#134E4A', margin: '0 0 8px' }}>
                Get {metro.city} Job Alerts
              </h3>
              <p style={{ fontSize: '13px', color: '#0D9488', marginBottom: '16px', lineHeight: 1.6, fontWeight: 500 }}>
                New {metro.city} listings delivered to your inbox daily.
              </p>
              <Link
                href={`/job-alerts?location=${encodeURIComponent(metro.city)}`}
                className="metro-cta" style={{ display: 'block', width: '100%', textAlign: 'center', padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '13px', background: '#0D9488', color: '#fff', textDecoration: 'none', boxShadow: '3px 3px 8px rgba(13,148,136,0.15)' }}
              >
                Create Alert
              </Link>
            </div>

            {/* Top Employers */}
            {stats.topEmployers.length > 0 && (
              <div className="metro-card" style={{ ...clayCard, padding: '24px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <Building2 size={20} style={{ color: '#0D9488' }} />
                  <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1A2E35', margin: 0 }}>Top Employers</h3>
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {stats.topEmployers.map((employer, i) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < stats.topEmployers.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}>
                      <span style={{ fontSize: '13px', color: '#5A4A42', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{employer.name}</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#0D9488', marginLeft: '8px', whiteSpace: 'nowrap' }}>
                        {employer.count} {employer.count === 1 ? 'job' : 'jobs'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Salary Insights */}
            {stats.avgSalary > 0 && (
              <div className="metro-card" style={{ ...clayCard, padding: '24px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <TrendingUp size={20} style={{ color: '#34D399' }} />
                  <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1A2E35', margin: 0 }}>Salary Insights</h3>
                </div>
                <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A2E35', lineHeight: 1 }}>${stats.avgSalary}k</div>
                <div style={{ fontSize: '13px', color: '#7A6A62', marginTop: '4px' }}>Average annual salary</div>
                <p style={{ fontSize: '11px', color: '#A09080', marginTop: '12px' }}>Based on {metro.city} PMHNP positions with salary data.</p>
              </div>
            )}

            {/* Quick Links */}
            <div className="metro-card" style={{ ...clayCard, padding: '24px', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1A2E35', margin: '0 0 16px' }}>Explore More</h3>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {[
                  { href: `/jobs/state/${metro.stateSlug}`, icon: '📍', label: `All ${metro.state} Jobs (${stateStats.totalJobs})` },
                  { href: `/salary-guide/${metro.stateSlug}`, icon: '💰', label: `${metro.state} Salary Guide` },
                  { href: '/jobs/remote', icon: '🏠', label: 'Remote PMHNP Jobs' },
                  { href: '/jobs/telehealth', icon: '💻', label: 'Telehealth Positions' },
                ].map(link => (
                  <li key={link.href} style={{ padding: '6px 0' }}>
                    <Link href={link.href} style={{ fontSize: '13px', color: '#0D9488', textDecoration: 'none', fontWeight: 500 }}>
                      {link.icon} {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ BENTO GRID — Why Choose This Metro ═══ */}
      <div style={{ background: 'linear-gradient(180deg, #F0FDFA 0%, #E6FAF5 50%, #F0FDFA 100%)' }}>
        <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '48px 20px 40px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#E86C2C', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
            Why This Market
          </p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(26px, 3.5vw, 38px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '8px' }}>
            Why PMHNPs Choose {metro.city}
          </h2>
          <p style={{ fontSize: '15px', color: '#5A4A42', textAlign: 'center', maxWidth: '480px', margin: '0 auto 48px', lineHeight: 1.6 }}>
            {metro.practiceAuthority} Practice Authority · {metro.avgCostOfLiving} cost of living · {metro.population.split(' ')[0]} population
          </p>

          <div className="metro-bento-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '14px' }}>
            {/* ROW 1: Practice Authority (8) + Cost of Living (4) */}
            <div className="metro-bento-hero-1 metro-card" style={{ ...clayCard, gridColumn: 'span 8', padding: '0', overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center' }}>
              <div style={{ padding: '32px 28px' }}>
                <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#1A2E35', margin: '0 0 8px' }}>{metro.practiceAuthority} Practice Authority</h3>
                <p style={{ fontSize: '14px', color: '#5A4A42', margin: 0, lineHeight: 1.6 }}>
                  {metro.licensureNote.slice(0, 150)}...
                </p>
              </div>
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', padding: '16px' }}>
                <Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/bento_state_practice.webp" alt={`${metro.state} practice authority`} width={280} height={200} style={{ width: '100%', maxWidth: '280px', height: 'auto', borderRadius: '12px' }} />
              </div>
            </div>

            <div className="metro-bento-hero-2 metro-card" style={{ ...clayCard, gridColumn: 'span 4', padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: '0 0 auto', background: 'linear-gradient(145deg, #FFFBEB, #FEF3C7)', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/bento_state_growth.webp" alt="Metro growth" width={200} height={140} style={{ width: '100%', maxWidth: '200px', height: 'auto', borderRadius: '10px' }} />
              </div>
              <div style={{ padding: '24px 22px', flex: 1 }}>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#1A2E35', margin: '0 0 6px' }}>Cost of Living</h3>
                <p style={{ fontSize: '12.5px', color: '#7A6A62', margin: 0, lineHeight: 1.5 }}>
                  {metro.avgCostOfLiving} — {metro.costOfLivingNote.split('.')[0]}.
                </p>
              </div>
            </div>

            {/* ROW 2: 4 compact cards with clay icons */}
            {[
              { icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_salary.webp', text: metro.whyThisMetro[0] },
              { icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_hospital.webp', text: metro.whyThisMetro[1] },
              { icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_community.webp', text: metro.whyThisMetro[2] },
              { icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_telehealth.webp', text: metro.whyThisMetro[3] },
            ].map((card, i) => (
              <div key={i} className="metro-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
                <Image src={card.icon} alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
                <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>{card.text}</p>
              </div>
            ))}

            {/* ROW 3: Salary (8) + Alert CTA (4) */}
            <div className="metro-bento-hero-3 metro-card" style={{ ...clayCard, gridColumn: 'span 8', padding: '0', overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center' }}>
              <div style={{ padding: '32px 28px' }}>
                <TrendingUp size={28} style={{ color: '#0D9488', marginBottom: '16px' }} />
                <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#1A2E35', margin: '0 0 8px' }}>Salary Outlook</h3>
                <p style={{ fontSize: '14px', color: '#5A4A42', margin: 0, lineHeight: 1.6 }}>
                  {metro.city} PMHNPs earn {stats.avgSalary > 0 ? `$${stats.avgSalary}k` : '$130K–$200K'} annually — {metro.costOfLivingNote.split('.')[0].toLowerCase()}.
                </p>
              </div>
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(145deg, #FFF7ED, #FFEDD5)', padding: '16px' }}>
                <Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/bento_state_salary.webp" alt={`${metro.city} PMHNP salary`} width={280} height={200} style={{ width: '100%', maxWidth: '280px', height: 'auto', borderRadius: '12px' }} />
              </div>
            </div>

            <div className="metro-bento-cta metro-card" style={{
              ...clayCard, gridColumn: 'span 4', padding: '28px 22px',
              display: 'flex', flexDirection: 'column', justifyContent: 'center',
              background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', border: '2px solid rgba(13,148,136,0.15)',
            }}>
              <Bell size={28} style={{ color: '#0D9488', marginBottom: '14px' }} />
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#134E4A', margin: '0 0 6px' }}>Job Alerts</h3>
              <p style={{ fontSize: '13px', color: '#0D9488', margin: '0 0 16px', lineHeight: 1.6, fontWeight: 500 }}>
                New {metro.city} listings delivered to your inbox — be first to apply.
              </p>
              <Link href={`/job-alerts?location=${encodeURIComponent(metro.city)}`} className="metro-cta" style={{
                padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '13px',
                background: '#0D9488', color: '#fff', textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: '6px', width: 'fit-content',
                boxShadow: '3px 3px 8px rgba(13,148,136,0.15)',
              }}>
                Create Alert <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </section>
      </div>

      {/* ═══ GETTING STARTED ═══ */}
      <div style={{ background: 'linear-gradient(180deg, #F0FDFA 0%, #E6FFFA 50%, #F0FDFA 100%)' }}>
        <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '56px 20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
            Before You Apply
          </p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '40px' }}>
            Getting Started in {metro.city}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
            {[
              { step: '01', title: 'Licensure', text: `${metro.state} has ${metro.practiceAuthority} Practice Authority. ${metro.licensureNote.split('.')[0]}.` },
              { step: '02', title: 'Cost of Living', text: `${metro.city} cost of living is ${metro.avgCostOfLiving}. ${metro.costOfLivingNote.split('.')[0]}.` },
              { step: '03', title: 'Top Settings', text: `Popular settings include ${metro.topSettings.slice(0, 3).join(', ')}. Explore all options.` },
              { step: '04', title: 'Apply', text: `Browse ${stats.totalJobs}+ positions in ${metro.city} and set up job alerts to be first to apply.` },
            ].map(r => (
              <div key={r.step} className="metro-card" style={{ ...clayCard, padding: '28px 24px', borderTop: '3px solid #0D9488' }}>
                <span style={{ fontSize: '28px', fontWeight: 800, color: '#CCFBF1', display: 'block', marginBottom: '12px', fontFamily: 'var(--font-mono)' }}>{r.step}</span>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', marginBottom: '8px' }}>{r.title}</h3>
                <p style={{ fontSize: '13px', color: '#5A4A42', lineHeight: 1.6, margin: 0 }}>{r.text}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ═══ EXPLORE MORE ═══ */}
      <div style={{ background: 'linear-gradient(180deg, #FFF8F0 0%, #FFF3E8 50%, #FFF8F0 100%)' }}>
        <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '56px 20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#E86C2C', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
            Keep Exploring
          </p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '40px' }}>
            More Ways to Find Your Next Role
          </h2>
          <div className="metro-explore-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
            {[
              { href: `/jobs/state/${metro.stateSlug}`, label: `${metro.state} Jobs`, sub: `All ${metro.stateCode} positions`, icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_location.webp' },
              { href: '/jobs/remote', label: 'Remote', sub: 'Work from anywhere', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_telehealth.webp' },
              { href: '/jobs/new-grad', label: 'New Grad', sub: 'Entry-level roles', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_newgrad.webp' },
              { href: '/jobs/telehealth', label: 'Telehealth', sub: 'Virtual patient care', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_telehealth.webp' },
              { href: `/salary-guide/${metro.stateSlug}`, label: 'Salary Guide', sub: `${metro.state} comp data`, icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_salary.webp' },
              { href: '/jobs/locations', label: 'By Location', sub: 'All 50 states', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_location.webp' },
            ].map(c => (
              <Link key={c.href} href={c.href} className="metro-card" style={{ ...clayCard, padding: '24px 20px', textDecoration: 'none', display: 'block', textAlign: 'center' }}>
                <Image src={c.icon} alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 12px', display: 'block' }} />
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', display: 'block', marginBottom: '4px' }}>{c.label}</span>
                <span style={{ fontSize: '12px', color: '#7A6A62', display: 'block' }}>{c.sub}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* ═══ FAQ ═══ */}
      <CategoryFAQ category="metro" totalJobs={stats.totalJobs} customFaqs={metro.faqs} />

      {/* ═══ Hover + Responsive CSS ═══ */}
      <style>{`
        .metro-cta { transition: transform 0.25s ease, box-shadow 0.25s ease, filter 0.25s ease; }
        .metro-cta:hover { transform: translateY(-3px); box-shadow: 0 10px 32px rgba(13,148,136,0.35) !important; filter: brightness(1.05); }
        .metro-card { transition: transform 0.3s ease, box-shadow 0.3s ease; }
        .metro-card:hover { transform: translateY(-4px); box-shadow: 8px 8px 24px rgba(0,0,0,0.1), -4px -4px 12px rgba(255,255,255,0.9), inset 1px 1px 2px rgba(255,255,255,0.6) !important; }
        @media (max-width: 768px) {
          .metro-bento-grid { grid-template-columns: 1fr !important; }
          .metro-bento-hero-1, .metro-bento-hero-2, .metro-bento-hero-3, .metro-bento-cta { grid-column: span 1 !important; }
          .metro-bento-hero-1, .metro-bento-hero-3 { grid-template-columns: 1fr !important; }
          .metro-bento-grid > div { grid-column: span 1 !important; }
          .metro-explore-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (min-width: 769px) and (max-width: 1024px) {
          .metro-bento-grid { grid-template-columns: repeat(6, 1fr) !important; }
          .metro-bento-hero-1, .metro-bento-hero-3 { grid-column: span 6 !important; }
          .metro-bento-hero-2, .metro-bento-cta { grid-column: span 6 !important; }
          .metro-bento-grid > div:not(.metro-bento-hero-1):not(.metro-bento-hero-2):not(.metro-bento-hero-3):not(.metro-bento-cta) { grid-column: span 3 !important; }
        }
      `}</style>
    </div>
  );
}
