import { Metadata } from 'next';
import Link from 'next/link';
import { MapPin, DollarSign, Building2, Shield, TrendingUp, Users, Heart, Briefcase, ArrowRight, Bell } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { getMetroCity, getAllMetroSlugs, type MetroCity } from '@/lib/metro-data';
import JobCard from '@/components/JobCard';
import { Job } from '@/lib/types';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import { notFound } from 'next/navigation';

export const revalidate = 3600; // ISR: 1 hour

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
      orderBy: [{ isFeatured: 'desc' }, { qualityScore: 'desc' }, { createdAt: 'desc' }],
      take: 6,
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

  const title = `${stats.totalJobs > 0 ? `${stats.totalJobs} ` : ''}PMHNP Jobs in ${metro.city}, ${metro.stateCode} â€” Salary, Licensure & Top Employers (${new Date().getFullYear()})`;
  const description = `Find PMHNP jobs in ${metro.city}, ${metro.stateCode}. ${metro.practiceAuthority} Practice Authority. ${stats.avgSalary > 0 ? `Average salary: $${stats.avgSalary}K.` : ''} ${metro.heroDescription.slice(0, 100)}...`;

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
        url: `/api/og?type=page&title=${encodeURIComponent(`PMHNP Jobs in ${metro.city}`)}&subtitle=${encodeURIComponent(`${metro.practiceAuthority} Practice Authority â€¢ ${metro.avgCostOfLiving} cost of living`)}`,
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
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
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

      {/* Hero Section */}
      <section className="bg-teal-600 text-white py-12 md:py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <MapPin className="h-8 w-8" />
              <Building2 className="h-8 w-8" />
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
              PMHNP Jobs in {metro.city}, {metro.stateCode}
            </h1>
            <p className="text-sm text-teal-200 text-center mt-2 mb-4">
              Last Updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} | {metro.metroArea}
            </p>
            <p className="text-lg md:text-xl text-teal-100 mb-6 max-w-3xl mx-auto">
              {metro.heroDescription}
            </p>

            {/* Stats Bar */}
            <div className="flex flex-wrap justify-center gap-6 md:gap-8 mt-8">
              <div className="text-center">
                <div className="text-3xl font-bold">{stats.totalJobs}</div>
                <div className="text-sm text-teal-100">Open Positions</div>
              </div>
              {stats.avgSalary > 0 && (
                <div className="text-center">
                  <div className="text-3xl font-bold">${stats.avgSalary}K</div>
                  <div className="text-sm text-teal-100">Avg. Salary</div>
                </div>
              )}
              <div className="text-center">
                <div className="text-3xl font-bold" style={{ color: metro.practiceAuthority === 'Full' ? '#86efac' : metro.practiceAuthority === 'Reduced' ? '#fde68a' : '#fca5a5' }}>
                  {metro.practiceAuthority}
                </div>
                <div className="text-sm text-teal-100">Practice Authority</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold">{metro.population.split(' ')[0]}</div>
                <div className="text-sm text-teal-100">Population</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-7xl mx-auto">

          {/* Why This Metro */}
          <div className="mb-8 md:mb-12">
            <div className="rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
                Why {metro.city} for PMHNP Careers
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                {metro.whyThisMetro.map((reason, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <span className="mt-1 flex-shrink-0" style={{ color: 'var(--color-primary)' }}>
                      {i === 0 ? <DollarSign size={18} /> : i === 1 ? <Building2 size={18} /> : i === 2 ? <Users size={18} /> : <TrendingUp size={18} />}
                    </span>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{reason}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Main Content â€” 2/3 */}
            <div className="lg:col-span-2 space-y-8">

              {/* Practice Authority Card */}
              <div className="rounded-xl p-6" style={{ backgroundColor: practiceAuthorityBg, border: `1px solid ${practiceAuthorityColor}40` }}>
                <div className="flex items-center gap-3 mb-3">
                  <Shield size={24} style={{ color: practiceAuthorityColor }} />
                  <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    {metro.state}: {metro.practiceAuthority} Practice Authority
                  </h2>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {metro.licensureNote}
                </p>
                <Link
                  href={`/resources/state-licensure-guide/${metro.stateSlug}`}
                  className="inline-flex items-center gap-1 mt-3 text-sm font-medium hover:opacity-80 transition-opacity"
                  style={{ color: 'var(--color-primary)' }}
                >
                  Read the full {metro.state} licensure guide <ArrowRight size={14} />
                </Link>
              </div>

              {/* Cost of Living */}
              <div className="rounded-xl p-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <div className="flex items-center gap-3 mb-3">
                  <DollarSign size={22} style={{ color: 'var(--color-primary)' }} />
                  <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    Cost of Living: {metro.avgCostOfLiving}
                  </h2>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {metro.costOfLivingNote}
                </p>
              </div>

              {/* Salary Comparison */}
              {stats.avgSalary > 0 && stateStats.avgSalary > 0 && (
                <div className="rounded-xl p-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                  <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                    PMHNP Salary: {metro.city} vs {metro.state} Average
                  </h2>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <div className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>${stats.avgSalary}K</div>
                      <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{metro.city} Average</div>
                    </div>
                    <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <div className="text-2xl font-bold" style={{ color: 'var(--text-secondary)' }}>${stateStats.avgSalary}K</div>
                      <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{metro.state} Statewide</div>
                    </div>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Based on active PMHNP positions with salary data. See our full{' '}
                    <Link href="/salary-guide" className="font-medium hover:underline" style={{ color: 'var(--color-primary)' }}>
                      2026 PMHNP Salary Guide
                    </Link>{' '}for detailed breakdowns.
                  </p>
                </div>
              )}

              {/* Mental Health Context */}
              <div className="rounded-xl p-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <div className="flex items-center gap-3 mb-3">
                  <Heart size={22} style={{ color: 'var(--color-primary)' }} />
                  <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    Mental Health Landscape in {metro.city}
                  </h2>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {metro.mentalHealthContext}
                </p>
              </div>

              {/* Top Settings */}
              <div className="rounded-xl p-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                  Top PMHNP Practice Settings in {metro.city}
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {metro.topSettings.map((setting, i) => (
                    <div key={i} className="flex items-center gap-2 p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <Briefcase size={14} style={{ color: 'var(--color-primary)' }} />
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{setting}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Job Listings */}
              {stats.recentJobs.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                      Latest PMHNP Jobs in {metro.city} ({stats.totalJobs})
                    </h2>
                    <Link
                      href={`/jobs/city/${metro.citySlug}`}
                      className="text-sm font-medium hover:opacity-80 transition-opacity"
                      style={{ color: 'var(--color-primary)' }}
                    >
                      View All â†’
                    </Link>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {stats.recentJobs.map((job: Job) => (
                      <JobCard key={job.id} job={job} />
                    ))}
                  </div>
                  {stats.totalJobs > 6 && (
                    <div className="text-center mt-6">
                      <Link
                        href={`/jobs/city/${metro.citySlug}`}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-white hover:opacity-90 transition-opacity"
                        style={{ backgroundColor: 'var(--color-primary)' }}
                      >
                        View All {stats.totalJobs} Jobs in {metro.city} <ArrowRight size={16} />
                      </Link>
                    </div>
                  )}
                </div>
              )}

              {/* FAQ Section */}
              <div className="rounded-xl p-6 md:p-8" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
                  Frequently Asked Questions: PMHNP Jobs in {metro.city}
                </h2>
                <div className="space-y-6">
                  {metro.faqs.map((faq, i) => (
                    <div key={i}>
                      <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                        {faq.question}
                      </h3>
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                        {faq.answer}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sidebar â€” 1/3 */}
            <div className="space-y-6">
              {/* Job Alert CTA */}
              <div className="bg-teal-600 rounded-xl p-6 text-white shadow-lg">
                <Bell className="h-8 w-8 mb-3" />
                <h3 className="text-lg font-bold mb-2">
                  Get {metro.city} Job Alerts
                </h3>
                <p className="text-sm text-teal-100 mb-4">
                  Be the first to know about new PMHNP positions in the {metro.metroArea}.
                </p>
                <Link
                  href={`/job-alerts?location=${encodeURIComponent(metro.city)}`}
                  className="block w-full text-center px-4 py-2 bg-white text-teal-700 rounded-lg font-medium hover:bg-teal-50 transition-colors"
                >
                  Create Alert
                </Link>
              </div>

              {/* Top Employers */}
              {stats.topEmployers.length > 0 && (
                <div className="rounded-xl p-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                  <div className="flex items-center gap-2 mb-4">
                    <Building2 className="h-5 w-5" style={{ color: 'var(--color-primary)' }} />
                    <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>Top Employers</h3>
                  </div>
                  <ul className="space-y-3">
                    {stats.topEmployers.map((employer, i) => (
                      <li key={i} className="flex items-center justify-between">
                        <span className="text-sm truncate flex-1" style={{ color: 'var(--text-secondary)' }}>{employer.name}</span>
                        <span className="text-sm font-medium ml-2" style={{ color: 'var(--color-primary)' }}>
                          {employer.count} {employer.count === 1 ? 'job' : 'jobs'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Quick Links */}
              <div className="rounded-xl p-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <h3 className="font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Explore More</h3>
                <ul className="space-y-3">
                  <li>
                    <Link href={`/jobs/state/${metro.stateSlug}`} className="text-sm hover:underline" style={{ color: 'var(--color-primary)' }}>
                      ðŸ“ All {metro.state} PMHNP Jobs ({stateStats.totalJobs})
                    </Link>
                  </li>
                  <li>
                    <Link href={`/salary-guide/${metro.stateSlug}`} className="text-sm hover:underline" style={{ color: 'var(--color-primary)' }}>
                      ðŸ’° {metro.state} Salary Guide
                    </Link>
                  </li>
                  <li>
                    <Link href={`/resources/state-licensure-guide/${metro.stateSlug}`} className="text-sm hover:underline" style={{ color: 'var(--color-primary)' }}>
                      ðŸ“‹ {metro.state} Licensure Guide
                    </Link>
                  </li>
                  <li>
                    <Link href="/jobs/remote" className="text-sm hover:underline" style={{ color: 'var(--color-primary)' }}>
                      ðŸ  Remote PMHNP Jobs
                    </Link>
                  </li>
                  <li>
                    <Link href="/salary-guide" className="text-sm hover:underline" style={{ color: 'var(--color-primary)' }}>
                      ðŸ“Š 2026 Salary Guide
                    </Link>
                  </li>
                </ul>
              </div>

              {/* Browse Other Metros */}
              <div className="rounded-xl p-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <h3 className="font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Other Top Metros</h3>
                <ul className="space-y-2">
                  {getAllMetroSlugs().filter(s => s !== slug).slice(0, 6).map(s => {
                    const m = getMetroCity(s)!;
                    return (
                      <li key={s}>
                        <Link href={`/jobs/metro/${s}`} className="text-sm hover:underline" style={{ color: 'var(--color-primary)' }}>
                          {m.city}, {m.stateCode} â†’
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
