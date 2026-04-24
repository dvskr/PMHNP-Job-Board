import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { Home, Globe, TrendingUp, Building2, Bell, ArrowRight, Briefcase, DollarSign } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import JobCard from '@/components/JobCard';
import { Job } from '@/lib/types';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import CategoryFAQ from '@/components/CategoryFAQ';
import { JobListViewTracker } from '@/components/analytics/ViewTrackers';

/* ═══ Design Tokens — matched to employer page ═══ */
const clayCard: React.CSSProperties = {
  background: '#FFFFFF', borderRadius: '20px',
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

// Force dynamic rendering - don't try to statically generate during build
// force-dynamic removed: it overrides revalidate and defeats ISR caching
export const revalidate = 3600; // ISR: cache for 1 hour to reduce DB load under crawl pressure

// Type definition for Prisma groupBy result
interface EmployerGroupResult {
  employer: string;
  _count: { employer: number };
}

// Type definition for processed/rendered data
interface ProcessedEmployer {
  name: string;
  count: number;
}

/**
 * Fetch remote jobs with pagination
 */
async function getRemoteJobs(skip: number = 0, take: number = 20) {
  const jobs = await prisma.job.findMany({
    where: {
      isPublished: true,
      isRemote: true,
    },
    orderBy: [
      { isFeatured: 'desc' },
      { qualityScore: 'desc' },
      { originalPostedAt: 'desc' },
      { createdAt: 'desc' },
    ],
    skip,
    take,
  });

  return jobs;
}

/**
 * Fetch remote job statistics
 */
async function getRemoteStats() {
  // Total remote jobs
  const totalJobs = await prisma.job.count({
    where: {
      isPublished: true,
      isRemote: true,
    },
  });

  // Average salary for remote positions
  const salaryData = await prisma.job.aggregate({
    where: {
      isPublished: true,
      isRemote: true,
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

  // Companies hiring remotely
  const topEmployers = await prisma.job.groupBy({
    by: ['employer'],
    where: {
      isPublished: true,
      isRemote: true,
    },
    _count: {
      employer: true,
    },
    orderBy: {
      _count: {
        employer: 'desc',
      },
    },
    take: 8,
  });

  // Process with explicit typing
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

/**
 * Generate metadata for SEO
 */
export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const [stats, params] = await Promise.all([getRemoteStats(), searchParams]);
  const page = parseInt(params.page || '1');

  return {
    title: `${stats.totalJobs} Remote PMHNP Jobs — Work From Home Psych NP ($130K-200K)`,
    description: `Find ${stats.totalJobs} remote PMHNP jobs paying $130K-$200K+. Work from home psychiatric nurse practitioner positions — telehealth, flexible schedules, no commute. Browse remote psych NP jobs updated daily.`,
    openGraph: {
      title: `${stats.totalJobs} Remote PMHNP Jobs - Work From Home`,
      description: 'Browse telehealth and remote psychiatric mental health nurse practitioner positions. Flexible schedules, competitive pay.',
      type: 'website',
      images: [{
        url: `/api/og?type=page&title=${encodeURIComponent(`${stats.totalJobs} Remote PMHNP Jobs`)}&subtitle=${encodeURIComponent('Work from home psychiatric NP positions')}`,
        width: 1200,
        height: 630,
        alt: 'Remote PMHNP Jobs',
      }],
    },
    alternates: {
      canonical: 'https://pmhnphiring.com/jobs/remote',
    },
    // Prevent Google from indexing paginated variants as separate pages
    // Fixes "Duplicate without user-selected canonical" GSC issue
    ...(page > 1 && {
      robots: {
        index: false,
        follow: true,
      },
    }),
  };
}

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

/**
 * Remote jobs page
 */
export default async function RemoteJobsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || '1'));
  const limit = 10;
  const skip = (page - 1) * limit;

  const [jobs, stats] = await Promise.all([
    getRemoteJobs(skip, limit),
    getRemoteStats(),
  ]);

  const totalPages = Math.ceil(stats.totalJobs / limit);

  return (
    <div style={{ backgroundColor: '#FDFBF7' }}>
      {/* Breadcrumb Schema */}
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://pmhnphiring.com" },
        { name: "Jobs", url: "https://pmhnphiring.com/jobs" },
        { name: "Remote", url: "https://pmhnphiring.com/jobs/remote" }
      ]} />
      {/* ItemList Schema — enables job carousels in Google search */}
      {jobs.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'ItemList',
              name: 'Remote PMHNP Jobs',
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
      <JobListViewTracker jobs={jobs.map((j: Job) => ({ id: j.id, title: j.title, employer: j.employer }))} listName="Remote PMHNP Jobs" />
      {/* ═══ HERO ═══ */}
      <section style={{ background: '#e8af9b', padding: '72px 0 56px' }}>
        <div style={{ maxWidth: '1140px', margin: '0 auto', padding: '0 24px' }}>
          <div className="remote-hero-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: '13px', fontWeight: 700, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '12px' }}>
                {stats.totalJobs}+ Open Positions
              </p>
              <h1 className="font-lora" style={{ fontSize: 'clamp(32px, 4.2vw, 48px)', fontWeight: 800, lineHeight: 1.08, color: '#1A2E35', margin: '0 0 20px' }}>
                Remote PMHNP<br />
                <span style={{ color: '#0D9488' }}>Jobs</span>
              </h1>
              <p style={{ fontSize: '16px', color: '#3D2E26', lineHeight: 1.7, margin: '0 0 36px', maxWidth: '440px', fontWeight: 400 }}>
                Telehealth and remote positions with competitive pay, flexible schedules, and multi-state reach.
              </p>
              <Link href="/jobs?workMode=remote" className="clay-btn remote-cta-primary" style={{
                padding: '16px 40px', borderRadius: '16px', fontWeight: 700, fontSize: '15px',
                background: '#0D9488', color: '#fff', textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: '10px',
                boxShadow: '4px 4px 14px rgba(13,148,136,0.25), inset 1px 1px 2px rgba(255,255,255,0.2)',
              }}>
                Browse All Remote Jobs <ArrowRight size={17} />
              </Link>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <Image
                src="/images/categories/hero_wc_remote.png"
                alt="PMHNP working remotely from home via telehealth"
                width={520} height={520}
                style={{ width: '100%', maxWidth: '500px', height: 'auto' }}
                priority
              />
            </div>
          </div>

          {/* Stat Pills */}
          <div className="remote-stats-grid" style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap', marginTop: '40px' }}>
            {[
              { value: `${stats.totalJobs}`, label: 'Remote Positions', bg: '#D4F5E9', iconBg: '#34D399', color: '#065F46', Icon: Briefcase },
              ...(stats.avgSalary > 0 ? [{ value: `$${stats.avgSalary}k`, label: 'Avg. Salary', bg: '#FFE0D3', iconBg: '#F97316', color: '#7C2D12', Icon: DollarSign }] : []),
              { value: `${stats.topEmployers.length}+`, label: 'Hiring Companies', bg: '#E8DAFE', iconBg: '#A855F7', color: '#4C1D95', Icon: Building2 },
            ].map(s => {
              const SIcon = s.Icon;
              return (
              <div key={s.label} className="remote-stat-pill" style={{
                display: 'inline-flex', alignItems: 'center', gap: '10px',
                padding: '10px 20px 10px 14px', borderRadius: '40px', background: s.bg,
                boxShadow: '4px 4px 12px rgba(0,0,0,0.05), -2px -2px 6px rgba(255,255,255,0.6), inset 1px 1px 2px rgba(255,255,255,0.5)',
              }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '50%', background: s.iconBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '2px 2px 6px rgba(0,0,0,0.1), inset 1px 1px 2px rgba(255,255,255,0.3)',
                }}>
                  <SIcon size={16} color="#fff" />
                </div>
                <div>
                  <span style={{ fontSize: '18px', fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</span>
                  <span style={{ fontSize: '12px', color: s.color, opacity: 0.7, marginLeft: '6px', fontWeight: 500 }}>{s.label}</span>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      </section>


      {/* ═══ JOB LISTINGS ═══ */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 20px' }}>
          <div className="grid lg:grid-cols-4 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-3">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-lora" style={{ fontSize: '20px', fontWeight: 700, color: '#1A2E35' }}>
                  Remote Positions ({stats.totalJobs})
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
                    No remote positions at this time
                  </h3>
                  <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
                    New remote PMHNP openings are added daily. Set an alert or check back soon.
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
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                    {jobs.map((job: Job) => (
                      <JobCard key={job.id} job={job} />
                    ))}
                  </div>

                  {/* Pagination */}
                </>
              )}

              {/* Browse All CTA */}
              <div style={{ textAlign: 'center', marginTop: '32px' }}>
                <Link href="/jobs?workMode=remote" className="remote-cta-primary" style={{
                  padding: '14px 32px', borderRadius: '14px', fontWeight: 700, fontSize: '14px',
                  background: '#0D9488', color: '#fff', textDecoration: 'none',
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  boxShadow: '4px 4px 12px rgba(13,148,136,0.2)',
                }}>
                  Browse All Remote Jobs <ArrowRight size={16} />
                </Link>
              </div>
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-1">
              {/* Job Alert CTA */}
              <div className="remote-bento-card" style={{ ...clayCard, padding: '0', overflow: 'hidden', marginBottom: '20px', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', border: '2px solid rgba(13,148,136,0.15)' }}>
                <div style={{ padding: '24px' }}>
                  <Bell size={28} style={{ color: '#0D9488', marginBottom: '12px' }} />
                  <h3 className="font-lora" style={{ fontSize: '18px', fontWeight: 700, color: '#134E4A', margin: '0 0 8px' }}>
                    Remote Alerts
                  </h3>
                  <p style={{ fontSize: '13px', color: '#0D9488', marginBottom: '16px', lineHeight: 1.6, fontWeight: 500 }}>
                    New remote listings delivered to your inbox daily.
                  </p>
                  <Link href="/job-alerts?mode=Remote" className="remote-cta-primary" style={{
                    display: 'block', width: '100%', textAlign: 'center',
                    padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '13px',
                    background: '#0D9488', color: '#fff', textDecoration: 'none',
                    boxShadow: '3px 3px 8px rgba(13,148,136,0.15)',
                  }}>
                    Create Alert
                  </Link>
                </div>
              </div>

              {/* Companies Hiring Remotely */}
              {stats.topEmployers.length > 0 && (
                <div className="remote-bento-card" style={{ ...clayCard, padding: '24px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <Building2 size={20} style={{ color: '#0D9488' }} />
                    <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1A2E35', margin: 0 }}>Hiring Remotely</h3>
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

              {/* Salary Insights */}
              {stats.avgSalary > 0 && (
                <div className="remote-bento-card" style={{ ...clayCard, padding: '24px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <TrendingUp size={20} style={{ color: '#34D399' }} />
                    <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1A2E35', margin: 0 }}>Salary Insights</h3>
                  </div>
                  <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A2E35', lineHeight: 1 }}>${stats.avgSalary}k</div>
                  <div style={{ fontSize: '13px', color: '#7A6A62', marginTop: '4px' }}>Average annual salary</div>
                  <p style={{ fontSize: '11px', color: '#A09080', marginTop: '12px' }}>Based on remote PMHNP positions with salary data.</p>
                </div>
              )}
            </div>
          </div>
      </div>


      {/* ═══ BENTO GRID — Why Choose Remote ═══ */}
      <div style={{ background: 'linear-gradient(180deg, #F0FDFA 0%, #E6FAF5 50%, #F0FDFA 100%)' }}>
        <section style={{ maxWidth: '1000px', margin: '0 auto', padding: '48px 20px 40px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#E86C2C', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
            Why Go Remote
          </p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(26px, 3.5vw, 38px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '8px' }}>
            Built for Modern Practice
          </h2>
          <p style={{ fontSize: '15px', color: '#5A4A42', textAlign: 'center', maxWidth: '480px', margin: '0 auto 48px', lineHeight: 1.6 }}>
            Remote roles offer clinical autonomy, geographic freedom, and salaries that match or exceed in-person positions.
          </p>

          <div className="remote-bento-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '14px' }}>
            {/* ROW 1: Work From Anywhere (8) + Multi-State (4) */}
            <div className="remote-bento-hero-1 remote-bento-card" style={{ ...clayCard, gridColumn: 'span 8', padding: '0', overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center' }}>
              <div style={{ padding: '32px 28px' }}>
                <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#1A2E35', margin: '0 0 8px' }}>Location Independence</h3>
                <p style={{ fontSize: '14px', color: '#5A4A42', margin: 0, lineHeight: 1.6 }}>
                  Practice from home, a private office, or anywhere with secure internet — no commute required.
                </p>
              </div>
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', padding: '16px' }}>
                <Image src="/images/categories/bento_remote_office.png" alt="Remote PMHNP home office setup" width={280} height={200} style={{ width: '100%', maxWidth: '280px', height: 'auto', borderRadius: '12px' }} />
              </div>
            </div>

            <div className="remote-bento-hero-2 remote-bento-card" style={{ ...clayCard, gridColumn: 'span 4', padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: '0 0 auto', background: 'linear-gradient(145deg, #FFFBEB, #FEF3C7)', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Image src="/images/categories/bento_multi_state_impact.png" alt="Multi-state licensure map" width={200} height={140} style={{ width: '100%', maxWidth: '200px', height: 'auto', borderRadius: '10px' }} />
              </div>
              <div style={{ padding: '24px 22px', flex: 1 }}>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#1A2E35', margin: '0 0 6px' }}>Multi-State Licensure</h3>
                <p style={{ fontSize: '12.5px', color: '#7A6A62', margin: 0, lineHeight: 1.5 }}>
                  Treat patients across state lines through compact licensure and employer-sponsored credentials.
                </p>
              </div>
            </div>

            {/* ROW 2: 4 compact cards (3 cols each) */}
            <div className="remote-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <Image src="/images/categories/icon_perdiem.png" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Flexible Hours</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Design a schedule around your life — mornings, evenings, or weekends.</p>
            </div>
            <div className="remote-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <Image src="/images/categories/icon_telehealth.png" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>High Demand</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Telehealth NP roles grew 45% year-over-year — demand continues to accelerate.</p>
            </div>
            <div className="remote-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <Image src="/images/categories/icon_shield_lock.png" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>HIPAA Compliant</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>End-to-end encrypted platforms with audit trails and secure EHR integration.</p>
            </div>
            <div className="remote-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <Image src="/images/categories/icon_newgrad.png" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>New Grad Friendly</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Supervised entry-level positions with structured onboarding and mentorship.</p>
            </div>

            {/* ROW 3: Salary (8) + Alert CTA (4) */}
            <div className="remote-bento-hero-3 remote-bento-card" style={{ ...clayCard, gridColumn: 'span 8', padding: '0', overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center' }}>
              <div style={{ padding: '32px 28px' }}>
                <TrendingUp size={28} style={{ color: '#0D9488', marginBottom: '16px' }} />
                <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#1A2E35', margin: '0 0 8px' }}>Salary Parity</h3>
                <p style={{ fontSize: '14px', color: '#5A4A42', margin: 0, lineHeight: 1.6 }}>
                  Remote PMHNPs earn {stats.avgSalary > 0 ? `$${stats.avgSalary}k` : '$130K–$200K'} annually — on par with or above in-office equivalents.
                </p>
              </div>
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(145deg, #FFF7ED, #FFEDD5)', padding: '16px' }}>
                <Image src="/images/categories/bento_salary_growth.png" alt="Remote PMHNP salary growth chart" width={280} height={200} style={{ width: '100%', maxWidth: '280px', height: 'auto', borderRadius: '12px' }} />
              </div>
            </div>

            <div className="remote-bento-cta remote-bento-card" style={{
              ...clayCard, gridColumn: 'span 4', padding: '28px 22px',
              display: 'flex', flexDirection: 'column', justifyContent: 'center',
              background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', border: '2px solid rgba(13,148,136,0.15)',
            }}>
              <Image src="/images/categories/icon_clay_bell.png" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', marginBottom: '14px' }} />
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#134E4A', margin: '0 0 6px' }}>Job Alerts</h3>
              <p style={{ fontSize: '13px', color: '#0D9488', margin: '0 0 16px', lineHeight: 1.6, fontWeight: 500 }}>
                New listings delivered to your inbox — be first to apply.
              </p>
              <Link href="/job-alerts?mode=Remote" className="remote-cta-primary" style={{
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

      {/* ═══ GETTING STARTED — Teal tinted bg ═══ */}
      <div style={{ background: 'linear-gradient(180deg, #F0FDFA 0%, #E6FFFA 50%, #F0FDFA 100%)' }}>
        <section style={{ maxWidth: '1000px', margin: '0 auto', padding: '56px 20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
            Before You Apply
          </p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '40px' }}>
            Getting Started with Remote Practice
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
            {[
              { step: '01', title: 'Platform Setup', text: 'Most employers provide HIPAA-compliant platforms like Zoom for Healthcare or Doxy.me with full onboarding.' },
              { step: '02', title: 'Licensure', text: 'Confirm NLC eligibility or employer-sponsored multi-state credentials before applying.' },
              { step: '03', title: 'Equipment', text: 'Reliable internet (10+ Mbps), quality webcam, noise-cancelling headset, and private workspace.' },
              { step: '04', title: 'Workspace', text: 'A quiet, well-lit room with neutral background and locked door meets HIPAA standards.' },
            ].map(r => (
              <div key={r.step} className="remote-bento-card" style={{ ...clayCard, padding: '28px 24px', borderTop: '3px solid #0D9488' }}>
                <span style={{ fontSize: '28px', fontWeight: 800, color: '#CCFBF1', display: 'block', marginBottom: '12px', fontFamily: 'var(--font-mono)' }}>{r.step}</span>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', marginBottom: '8px' }}>{r.title}</h3>
                <p style={{ fontSize: '13px', color: '#5A4A42', lineHeight: 1.6, margin: 0 }}>{r.text}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ═══ EXPLORE MORE — Warm bg ═══ */}
      <div style={{ background: 'linear-gradient(180deg, #FFF8F0 0%, #FFF3E8 50%, #FFF8F0 100%)' }}>
        <section style={{ maxWidth: '1000px', margin: '0 auto', padding: '56px 20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#E86C2C', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
            Keep Exploring
          </p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '40px' }}>
            More Ways to Find Your Next Role
          </h2>
          <div className="remote-explore-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
            {[
              { href: '/jobs/telehealth', label: 'Telehealth', sub: 'Virtual patient care', emoji: '💻' },
              { href: '/jobs/travel', label: 'Travel', sub: 'Locum tenens', emoji: '✈️' },
              { href: '/jobs/new-grad', label: 'New Grad', sub: 'Entry-level roles', emoji: '🎓' },
              { href: '/jobs/per-diem', label: 'Per Diem', sub: 'Flexible shifts', emoji: '📅' },
              { href: '/salary-guide', label: 'Salary Guide', sub: '2026 comp data', emoji: '💰' },
              { href: '/jobs/locations', label: 'By Location', sub: 'All 50 states', emoji: '📍' },
            ].map(c => (
              <Link key={c.href} href={c.href} className="remote-bento-card" style={{ ...clayCard, padding: '24px 20px', textDecoration: 'none', display: 'block', textAlign: 'center' }}>
                <span style={{ fontSize: '32px', display: 'block', marginBottom: '12px' }}>{c.emoji}</span>
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', display: 'block', marginBottom: '4px' }}>{c.label}</span>
                <span style={{ fontSize: '12px', color: '#7A6A62', display: 'block' }}>{c.sub}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>


      {/* FAQ Section with structured data */}
      <CategoryFAQ category="remote" totalJobs={stats.totalJobs} />

      {/* ═══ Responsive + Hover CSS ═══ */}
      <style>{`
        .remote-cta-primary { transition: transform 0.25s ease, box-shadow 0.25s ease, filter 0.25s ease; }
        .remote-cta-primary:hover { transform: translateY(-3px); box-shadow: 0 10px 32px rgba(13,148,136,0.35) !important; filter: brightness(1.05); }
        .remote-cta-secondary { transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease; }
        .remote-cta-secondary:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.08) !important; border-color: rgba(13,148,136,0.3) !important; }
        .remote-bento-card { transition: transform 0.3s ease, box-shadow 0.3s ease; }
        .remote-bento-card:hover { transform: translateY(-4px); box-shadow: 8px 8px 24px rgba(0,0,0,0.1), -4px -4px 12px rgba(255,255,255,0.9), inset 1px 1px 2px rgba(255,255,255,0.6) !important; }
        .remote-stat-pill { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .remote-stat-pill:hover { transform: translateY(-2px) scale(1.02); box-shadow: 6px 6px 20px rgba(0,0,0,0.1), -3px -3px 10px rgba(255,255,255,0.9) !important; }
        @media (max-width: 768px) {
          .remote-hero { background-size: contain !important; }
          .remote-hero-grid { grid-template-columns: 1fr !important; }
          .remote-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .remote-bento-grid { grid-template-columns: 1fr !important; }
          .remote-bento-hero-1, .remote-bento-hero-2, .remote-bento-hero-3, .remote-bento-cta { grid-column: span 1 !important; }
          .remote-bento-hero-1, .remote-bento-hero-3 { grid-template-columns: 1fr !important; }
          .remote-bento-grid > div { grid-column: span 1 !important; }
          .remote-explore-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (min-width: 769px) and (max-width: 1024px) {
          .remote-bento-grid { grid-template-columns: repeat(6, 1fr) !important; }
          .remote-bento-hero-1, .remote-bento-hero-3 { grid-column: span 6 !important; }
          .remote-bento-hero-2, .remote-bento-cta { grid-column: span 6 !important; }
          .remote-bento-grid > div:not(.remote-bento-hero-1):not(.remote-bento-hero-2):not(.remote-bento-hero-3):not(.remote-bento-cta) { grid-column: span 3 !important; }
        }
      `}</style>
    </div>
  );
}
