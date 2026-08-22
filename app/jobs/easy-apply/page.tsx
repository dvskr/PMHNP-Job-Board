import { jsonLdString } from '@/lib/seo/json-ld';
import { brand } from '@/config/brand';
import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { TrendingUp, Building2, Bell, ArrowRight, Briefcase, Zap, MessageSquare, ShieldCheck, MousePointerClick } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { siteAsset } from '@/lib/asset-url';
import { BEST_SORT_ORDER_BY } from '@/lib/utils/job-sort';
import { GLOBAL_EXCLUSIONS, easyApplyClause } from '@/lib/filters';
import { categoryTitleCount, categoryLandingRobotsMeta } from '@/lib/pseo/category-landing-gate';
import JobCard from '@/components/JobCard';
import { Job } from '@/lib/types';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import { JobListViewTracker } from '@/components/analytics/ViewTrackers';
import CategoryHero from '@/components/CategoryHero';

/* ═══ Design Tokens — matched to employer page ═══ */
const clayCard: React.CSSProperties = {
  background: '#FFFFFF', borderRadius: '20px',
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

// ISR: cache for 1 hour to reduce DB load under crawl pressure (same cadence
// as the /jobs/remote template this page is cloned from).
export const revalidate = 3600;

interface EmployerGroupResult {
  employer: string;
  _count: { employer: number };
}

interface ProcessedEmployer {
  name: string;
  count: number;
}

/**
 * Shared clause with the /jobs ?easyApply=1 checkbox and the filter-counts
 * badge (lib/filters.ts easyApplyClause): employer-posted OR
 * apply-on-platform. The expiry guard matters here more than on other
 * category pages because employer posts carry hard expiresAt terms.
 */
function easyApplyFilter(now: Date) {
  return {
    isPublished: true,
    AND: [
      easyApplyClause(),
      { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      ...GLOBAL_EXCLUSIONS.map(e => ({ NOT: e })),
    ],
  };
}

async function getEasyApplyJobs(skip: number = 0, take: number = 20) {
  return prisma.job.findMany({
    where: easyApplyFilter(new Date()),
    orderBy: BEST_SORT_ORDER_BY,
    skip,
    take,
  });
}

async function getEasyApplyStats() {
  const now = new Date();
  const where = easyApplyFilter(now);

  const totalJobs = await prisma.job.count({ where });

  // Live DB aggregate at request time (never hardcoded figures) — same
  // pattern as the /jobs/remote template.
  const salaryData = await prisma.job.aggregate({
    where: {
      ...where,
      normalizedMinSalary: { not: null },
      normalizedMaxSalary: { not: null },
    },
    _avg: {
      normalizedMinSalary: true,
      normalizedMaxSalary: true,
    },
  });

  const avgMinSalary = salaryData._avg.normalizedMinSalary || 0;
  const avgMaxSalary = salaryData._avg.normalizedMaxSalary || 0;
  const avgSalary = Math.round((avgMinSalary + avgMaxSalary) / 2 / 1000);

  const topEmployers = await prisma.job.groupBy({
    by: ['employer'],
    where,
    _count: { employer: true },
    orderBy: { _count: { employer: 'desc' } },
    take: 8,
  });

  const processedEmployers = topEmployers.map((e: EmployerGroupResult) => ({
    name: e.employer,
    count: e._count.employer,
  }));

  return {
    totalJobs,
    avgSalary,
    topEmployers: processedEmployers,
  };
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const [stats, params] = await Promise.all([getEasyApplyStats(), searchParams]);
  const page = parseInt(params.page || '1');

  return {
    // B3 (organic audit 2026-08): categoryTitleCount drops the number below
    // the MIN_JOBS floor; categoryLandingRobotsMeta noindexes sub-threshold
    // landings AND paginated variants.
    title: `${categoryTitleCount(stats.totalJobs)}Easy Apply PMHNP Jobs From Direct Employers`,
    description: `Browse ${categoryTitleCount(stats.totalJobs)}easy apply PMHNP jobs and direct employer PMHNP jobs. Apply in one click, direct to the hiring team.`,
    openGraph: {
      title: `${categoryTitleCount(stats.totalJobs)}Easy Apply PMHNP Jobs From Direct Employers`,
      description: 'Psychiatric nurse practitioner openings posted by the hiring employer. One-click apply, direct messaging, verified listings.',
      type: 'website',
      images: [{
        url: `/api/og?type=page&v=3&title=${encodeURIComponent(`${categoryTitleCount(stats.totalJobs)}Easy Apply PMHNP Jobs`)}&subtitle=${encodeURIComponent('Direct employer openings, one-click apply')}`,
        width: 1200,
        height: 630,
        alt: 'Easy Apply PMHNP Jobs',
      }],
    },
    alternates: {
      canonical: `${brand.baseUrl}/jobs/easy-apply`,
    },
    ...categoryLandingRobotsMeta(stats.totalJobs, page),
  };
}

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function EasyApplyJobsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || '1'));
  const limit = 10;
  const skip = (page - 1) * limit;

  const [jobs, stats] = await Promise.all([
    getEasyApplyJobs(skip, limit),
    getEasyApplyStats(),
  ]);

  return (
    <div style={{ backgroundColor: '#FDFBF7' }}>
      {/* Breadcrumb Schema */}
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://pmhnphiring.com" },
        { name: "Jobs", url: "https://pmhnphiring.com/jobs" },
        { name: "Easy Apply", url: "https://pmhnphiring.com/jobs/easy-apply" }
      ]} />
      {/* ItemList Schema — enables job carousels in Google search */}
      {jobs.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdString({
              '@context': 'https://schema.org',
              '@type': 'ItemList',
              name: 'Easy Apply PMHNP Jobs',
              numberOfItems: stats.totalJobs,
              itemListElement: jobs.slice(0, 10).map((job: Job, idx: number) => ({
                '@type': 'ListItem',
                position: idx + 1,
                name: job.title,
                url: `https://pmhnphiring.com/jobs/${job.slug || job.id}`,
              })),
            }),
          }}
        />
      )}
      <JobListViewTracker jobs={jobs.map((j: Job) => ({ id: j.id, title: j.title, employer: j.employer }))} listName="Easy Apply PMHNP Jobs" />

      {/* ═══ HERO ═══ */}
      <CategoryHero
        bgColor="#f1d49c"
        heroImage={siteAsset('images/categories/hero_wc_th_people.webp')}
        heroAlt="PMHNP applying directly to an employer job posting"
        badgeText={`${stats.totalJobs} live roles`}
        breadcrumbs={['Careers', 'Nurse Practitioner', 'Easy Apply']}
        headlineLine1="Easy Apply"
        headlineLine2="PMHNP"
        headlineSub="jobs, straight from employers."
        stats={[
          { value: `${stats.totalJobs}+`, label: 'positions' },
          { value: '1-click', label: 'apply flow' },
          { value: `${stats.topEmployers.length}+`, label: 'employers' },
        ]}
        description="Openings posted by the hiring employer, not scraped from aggregators. Apply in one click and message the hiring team directly."
        ctaLabel="Browse All Easy Apply Jobs"
        ctaHref="/jobs?easyApply=1"
        secondaryCtaLabel="Set Alert"
        secondaryCtaHref="/job-alerts"
      />

      {/* ═══ JOB LISTINGS ═══ */}
      <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '32px 24px' }}>
        <div className="grid lg:grid-cols-4 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-3">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-lora" style={{ fontSize: '20px', fontWeight: 700, color: '#1A2E35' }}>
                Direct Employer Positions ({stats.totalJobs})
              </h2>
              <Link
                href="/jobs"
                className="text-sm font-medium hover:opacity-80 transition-opacity"
                style={{ color: 'var(--color-primary)' }}
              >
                View All Jobs →
              </Link>
            </div>

            {jobs.length === 0 ? (
              <div className="text-center py-12 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <Briefcase className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  No direct employer positions at this time
                </h3>
                <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
                  New employer-posted PMHNP openings are added regularly. Set an alert or check back soon.
                </p>
                <Link
                  href="/jobs"
                  className="inline-block px-6 py-3 text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                >
                  Browse All Jobs
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                {jobs.map((job: Job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>
            )}

            {/* Browse All CTA */}
            <div style={{ textAlign: 'center', marginTop: '32px' }}>
              <Link href="/jobs?easyApply=1" className="ea-cta-primary" style={{
                padding: '14px 32px', borderRadius: '14px', fontWeight: 700, fontSize: '14px',
                background: '#0D9488', color: '#fff', textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                boxShadow: '4px 4px 12px rgba(13,148,136,0.2)',
              }}>
                Browse All Easy Apply Jobs <ArrowRight size={16} />
              </Link>
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            {/* Job Alert CTA */}
            <div className="ea-bento-card" style={{ ...clayCard, padding: '0', overflow: 'hidden', marginBottom: '20px', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', border: '2px solid rgba(13,148,136,0.15)' }}>
              <div style={{ padding: '24px' }}>
                <Bell size={28} style={{ color: '#0D9488', marginBottom: '12px' }} />
                <h3 className="font-lora" style={{ fontSize: '18px', fontWeight: 700, color: '#134E4A', margin: '0 0 8px' }}>
                  Job Alerts
                </h3>
                <p style={{ fontSize: '13px', color: '#0D9488', marginBottom: '16px', lineHeight: 1.6, fontWeight: 500 }}>
                  New employer-posted listings delivered to your inbox.
                </p>
                <Link href="/job-alerts" className="ea-cta-primary" style={{
                  display: 'block', width: '100%', textAlign: 'center',
                  padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '13px',
                  background: '#0D9488', color: '#fff', textDecoration: 'none',
                  boxShadow: '3px 3px 8px rgba(13,148,136,0.15)',
                }}>
                  Create Alert
                </Link>
              </div>
            </div>

            {/* Employers Hiring Directly */}
            {stats.topEmployers.length > 0 && (
              <div className="ea-bento-card" style={{ ...clayCard, padding: '24px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <Building2 size={20} style={{ color: '#0D9488' }} />
                  <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1A2E35', margin: 0 }}>Hiring Directly</h3>
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {stats.topEmployers.map((employer: ProcessedEmployer, index: number) => (
                    <li key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: index < stats.topEmployers.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}>
                      <span style={{ fontSize: '13px', color: '#5A4A42', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{employer.name}</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#0D9488', marginLeft: '8px', whiteSpace: 'nowrap' }}>
                        {employer.count} {employer.count === 1 ? 'job' : 'jobs'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Salary Insights — live DB aggregate, computed per request */}
            {stats.avgSalary > 0 && (
              <div className="ea-bento-card" style={{ ...clayCard, padding: '24px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <TrendingUp size={20} style={{ color: '#34D399' }} />
                  <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1A2E35', margin: 0 }}>Salary Insights</h3>
                </div>
                <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A2E35', lineHeight: 1 }}>${stats.avgSalary}k</div>
                <div style={{ fontSize: '13px', color: '#7A6A62', marginTop: '4px' }}>Average annual salary</div>
                <p style={{ fontSize: '11px', color: '#A09080', marginTop: '12px' }}>Based on direct employer PMHNP positions with salary data.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ WHY EASY APPLY ═══ */}
      <div style={{ background: 'linear-gradient(180deg, #F0FDFA 0%, #E6FAF5 50%, #F0FDFA 100%)' }}>
        <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '48px 20px 56px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#E86C2C', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
            Why Apply Direct
          </p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(26px, 3.5vw, 38px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '8px' }}>
            Skip the Middlemen
          </h2>
          <p style={{ fontSize: '15px', color: '#5A4A42', textAlign: 'center', maxWidth: '480px', margin: '0 auto 40px', lineHeight: 1.6 }}>
            These openings are posted by the hiring organization itself, so your application lands with the people who make the decision.
          </p>

          <div className="ea-bento-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
            {[
              { icon: <Zap size={26} style={{ color: '#0D9488' }} />, title: 'One-Click Apply', text: 'Apply on this site with your saved profile. No account creation on a third-party ATS.' },
              { icon: <MessageSquare size={26} style={{ color: '#0D9488' }} />, title: 'Message the Employer', text: 'Ask about schedule, caseload, or supervision before you commit to applying.' },
              { icon: <ShieldCheck size={26} style={{ color: '#0D9488' }} />, title: 'Verified Postings', text: 'Every listing here was created by the employer, not scraped from an aggregator.' },
              { icon: <MousePointerClick size={26} style={{ color: '#0D9488' }} />, title: 'No Dead Links', text: 'Direct postings stay live for their full term, so you never land on an expired page.' },
            ].map(c => (
              <div key={c.title} className="ea-bento-card" style={{ ...clayCard, padding: '24px 18px', textAlign: 'center' }}>
                <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}>{c.icon}</div>
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>{c.title}</h3>
                <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>{c.text}</p>
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
          <div className="ea-explore-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
            {[
              { href: '/jobs/remote', label: 'Remote', sub: 'Work from anywhere', icon: siteAsset('images/categories/clay_icon_telehealth.webp') },
              { href: '/jobs/telehealth', label: 'Telehealth', sub: 'Virtual patient care', icon: siteAsset('images/categories/clay_icon_telehealth.webp') },
              { href: '/jobs/new-grad', label: 'New Grad', sub: 'Entry-level roles', icon: siteAsset('images/categories/clay_icon_newgrad.webp') },
              { href: '/jobs/per-diem', label: 'Per Diem', sub: 'Flexible shifts', icon: siteAsset('images/categories/clay_icon_perdiem.webp') },
              { href: '/salary-guide', label: 'Salary Guide', sub: '2026 comp data', icon: siteAsset('images/categories/clay_icon_salary.webp') },
              { href: '/jobs/locations', label: 'By Location', sub: 'All 50 states', icon: siteAsset('images/categories/clay_icon_location.webp') },
            ].map(c => (
              <Link key={c.href} href={c.href} className="ea-bento-card" style={{ ...clayCard, padding: '24px 20px', textDecoration: 'none', display: 'block', textAlign: 'center' }}>
                <Image src={c.icon} alt="" width={48} sizes="48px" height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 12px', display: 'block' }} />
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', display: 'block', marginBottom: '4px' }}>{c.label}</span>
                <span style={{ fontSize: '12px', color: '#7A6A62', display: 'block' }}>{c.sub}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* No CategoryFAQ / CategoryLocationsExplore here: easy-apply is a
          landing-only taxonomy entry (no category-city pSEO pages, and the
          FAQ registry's CategorySlug union does not include it). */}

      {/* ═══ Responsive + Hover CSS ═══ */}
      <style>{`
        .ea-cta-primary { transition: transform 0.25s ease, box-shadow 0.25s ease, filter 0.25s ease; }
        .ea-cta-primary:hover { transform: translateY(-3px); box-shadow: 0 10px 32px rgba(13,148,136,0.35) !important; filter: brightness(1.05); }
        .ea-bento-card { transition: transform 0.3s ease, box-shadow 0.3s ease; }
        .ea-bento-card:hover { transform: translateY(-4px); box-shadow: 8px 8px 24px rgba(0,0,0,0.1), -4px -4px 12px rgba(255,255,255,0.9), inset 1px 1px 2px rgba(255,255,255,0.6) !important; }
        @media (max-width: 768px) {
          .ea-bento-grid { grid-template-columns: 1fr 1fr !important; }
          .ea-explore-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (min-width: 769px) and (max-width: 1024px) {
          .ea-bento-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}
