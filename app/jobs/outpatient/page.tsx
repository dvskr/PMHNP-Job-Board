import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { TrendingUp, Building2, Bell, ArrowRight } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { buildCategoryWhereClause } from '@/lib/filters';
import JobCard from '@/components/JobCard';
import { Job } from '@/lib/types';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import { JobListViewTracker } from '@/components/analytics/ViewTrackers';
import CategoryHero from '@/components/CategoryHero';

// Force dynamic rendering
/* Design Tokens */
const clayCard: React.CSSProperties = {
  background: '#FFFFFF', borderRadius: '20px',
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

export const revalidate = 3600;

interface EmployerGroupResult {
    employer: string;
    _count: { employer: number };
}

interface ProcessedEmployer {
    name: string;
    count: number;
}

const OUTPATIENT_FILTER = buildCategoryWhereClause('outpatient');

async function getOutpatientJobs(skip: number = 0, take: number = 20) {
    return prisma.job.findMany({
        where: OUTPATIENT_FILTER,
        orderBy: [{ isFeatured: 'desc' }, { qualityScore: 'desc' }, { originalPostedAt: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
    });
}

async function getOutpatientStats() {
    const totalJobs = await prisma.job.count({ where: OUTPATIENT_FILTER });
    const salaryData = await prisma.job.aggregate({
        where: { ...OUTPATIENT_FILTER, normalizedMinSalary: { not: null }, normalizedMaxSalary: { not: null } },
        _avg: { normalizedMinSalary: true, normalizedMaxSalary: true },
    });
    const avgSalary = Math.round(((salaryData._avg.normalizedMinSalary || 0) + (salaryData._avg.normalizedMaxSalary || 0)) / 2 / 1000);
    const topEmployers = await prisma.job.groupBy({
        by: ['employer'],
        where: OUTPATIENT_FILTER,
        _count: { employer: true },
        orderBy: { _count: { employer: 'desc' } },
        take: 8,
    });
    return {
        totalJobs,
        avgSalary,
        topEmployers: topEmployers.map((e: EmployerGroupResult) => ({ name: e.employer, count: e._count.employer })),
    };
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
    const [stats, params] = await Promise.all([getOutpatientStats(), searchParams]);
    const page = parseInt(params.page || '1');

    return {
        title: `${stats.totalJobs} Outpatient PMHNP Jobs — Clinic & Private Practice ($130K-190K)`,
        description: `Find ${stats.totalJobs} outpatient PMHNP jobs paying $130K-$190K+. Clinic, private practice, and community mental health psychiatric nurse practitioner positions with M-F schedules. Apply today.`,
        keywords: ['outpatient pmhnp jobs', 'outpatient psychiatric nurse practitioner', 'pmhnp private practice', 'clinic pmhnp jobs', 'community mental health pmhnp'],
        openGraph: {
            title: `${stats.totalJobs} Outpatient PMHNP Jobs — Clinic & Private Practice`,
            description: 'Browse outpatient psychiatric nurse practitioner positions in clinics, private practices, and community mental health centers.',
            type: 'website',
            images: [{
                url: `/api/og?type=page&title=${encodeURIComponent(`${stats.totalJobs} Outpatient PMHNP Jobs`)}&subtitle=${encodeURIComponent('Clinic & private practice positions')}`,
                width: 1200, height: 630, alt: 'Outpatient PMHNP Jobs',
            }],
        },
        alternates: { canonical: 'https://pmhnphiring.com/jobs/outpatient' },
        ...(page > 1 && { robots: { index: false, follow: true } }),
    };
}

interface PageProps {
    searchParams: Promise<{ page?: string }>;
}

export default async function OutpatientJobsPage({ searchParams }: PageProps) {
    const params = await searchParams;
    const page = Math.max(1, parseInt(params.page || '1'));
    const limit = 10;
    const skip = (page - 1) * limit;

    const [jobs, stats] = await Promise.all([getOutpatientJobs(skip, limit), getOutpatientStats()]);
    const totalPages = Math.ceil(stats.totalJobs / limit);

    return (
        <div className="min-h-screen" style={{ backgroundColor: '#FDFBF7' }}>
            <BreadcrumbSchema items={[
                { name: "Home", url: "https://pmhnphiring.com" },
                { name: "Jobs", url: "https://pmhnphiring.com/jobs" },
                { name: "Outpatient", url: "https://pmhnphiring.com/jobs/outpatient" }
            ]} />
            {jobs.length > 0 && (
              <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@type': 'ItemList', name: 'Outpatient PMHNP Jobs', numberOfItems: stats.totalJobs, itemListElement: jobs.slice(0, 10).map((job: Job, idx: number) => ({ '@type': 'ListItem', position: idx + 1, name: job.title, url: `https://pmhnphiring.com/jobs/${job.slug || job.id}` })) }) }} />
            )}

            {/* ═══ HERO ═══ */}
      <CategoryHero
        bgColor="#9ed2ba"
        heroImage="/images/categories/hero_v2_outpatient.png"
        heroAlt="Outpatient PMHNP clinic setting"
        badgeText={`${stats.totalJobs} live roles · updated today`}
        breadcrumbs={['Careers', 'Nurse Practitioner', 'Outpatient']}
        indexLabel="№ 11 / 28"
        headlineLine1="Outpatient"
        headlineLine2="PMHNP"
        headlineSub="jobs, clinic & practice."
        stats={[
          { value: `${stats.totalJobs}+`, label: 'positions' },
          { value: stats.avgSalary > 0 ? `$${stats.avgSalary}k` : '$130K+', label: 'avg salary' },
          { value: `${stats.topEmployers.length}+`, label: 'employers' },
        ]}
        description="Clinic and private practice positions with M-F schedules and long-term patient relationships."
        ctaLabel="Browse Outpatient Jobs"
        ctaHref="/jobs?category=outpatient"
        secondaryCtaLabel="Set Alert"
        secondaryCtaHref="/job-alerts"
      />

      {/* ═══ JOB LISTINGS ═══ */}
      <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '32px 24px' }}>
        <div className="grid lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-lora" style={{ fontSize: '20px', fontWeight: 700, color: '#1A2E35' }}>Outpatient Positions ({stats.totalJobs})</h2>
              <Link href="/jobs" className="text-sm font-medium hover:opacity-80 transition-opacity" style={{ color: 'var(--color-primary)' }}>View All Jobs →</Link>
            </div>
            {jobs.length === 0 ? (
              <div className="text-center py-12 rounded-xl" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>No outpatient positions at this time</h3>
                <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>New outpatient openings are added daily.</p>
                <Link href="/jobs" className="inline-block px-6 py-3 text-white rounded-lg font-medium" style={{ backgroundColor: 'var(--color-primary)' }}>Browse All Jobs</Link>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                  {jobs.map((job: Job) => (<JobCard key={job.id} job={job} />))}
                </div>
              </>
            )}
            <div style={{ textAlign: 'center', marginTop: '32px' }}>
              <Link href="/jobs?category=outpatient" className="cat-cta-primary" style={{ padding: '14px 32px', borderRadius: '14px', fontWeight: 700, fontSize: '14px', background: '#0D9488', color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px', boxShadow: '4px 4px 12px rgba(13,148,136,0.2)' }}>
                Browse All Outpatient Jobs <ArrowRight size={16} />
              </Link>
            </div>
          </div>
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="cat-bento-card" style={{ ...clayCard, padding: '0', overflow: 'hidden', marginBottom: '20px', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', border: '2px solid rgba(13,148,136,0.15)' }}>
              <div style={{ padding: '24px' }}>
                <Bell size={28} style={{ color: '#0D9488', marginBottom: '12px' }} />
                <h3 className="font-lora" style={{ fontSize: '18px', fontWeight: 700, color: '#134E4A', margin: '0 0 8px' }}>Outpatient Alerts</h3>
                <p style={{ fontSize: '13px', color: '#0D9488', marginBottom: '16px', lineHeight: 1.6, fontWeight: 500 }}>New outpatient listings delivered daily.</p>
                <Link href="/job-alerts" className="cat-cta-primary" style={{ display: 'block', width: '100%', textAlign: 'center', padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '13px', background: '#0D9488', color: '#fff', textDecoration: 'none', boxShadow: '3px 3px 8px rgba(13,148,136,0.15)' }}>Create Alert</Link>
              </div>
            </div>
            {stats.topEmployers.length > 0 && (
              <div className="cat-bento-card" style={{ ...clayCard, padding: '24px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <Building2 size={20} style={{ color: '#0D9488' }} />
                  <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1A2E35', margin: 0 }}>Top Employers</h3>
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {stats.topEmployers.map((employer: ProcessedEmployer, index: number) => (
                    <li key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: index < stats.topEmployers.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}>
                      <span style={{ fontSize: '13px', color: '#5A4A42', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{employer.name}</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#0D9488', marginLeft: '8px', whiteSpace: 'nowrap' }}>{employer.count} {employer.count === 1 ? 'job' : 'jobs'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {stats.avgSalary > 0 && (
              <div className="cat-bento-card" style={{ ...clayCard, padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <TrendingUp size={20} style={{ color: '#34D399' }} />
                  <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1A2E35', margin: 0 }}>Salary Insights</h3>
                </div>
                <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A2E35', lineHeight: 1 }}>${stats.avgSalary}k</div>
                <div style={{ fontSize: '13px', color: '#7A6A62', marginTop: '4px' }}>Average annual salary</div>
              </div>
            )}
          </div>
        </div>
      </div>


            {/* ═══ BENTO ═══ */}
      <div style={{ background: 'linear-gradient(180deg, #F0FDFA 0%, #E6FAF5 50%, #F0FDFA 100%)' }}>
        <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '48px 20px 40px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#E86C2C', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>Why Choose Outpatient</p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(26px, 3.5vw, 38px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '8px' }}>Built for Work-Life Balance</h2>
          <p style={{ fontSize: '15px', color: '#5A4A42', textAlign: 'center', maxWidth: '480px', margin: '0 auto 48px', lineHeight: 1.6 }}>Outpatient roles offer predictable hours, established patient panels, and a sustainable clinical practice.</p>

          <div className="cat-bento-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '14px' }}>
            {/* ROW 1 */}
            <div className="cat-bento-hero-1" style={{ ...clayCard, gridColumn: 'span 8', padding: '32px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'center' }}>
              <div>
                <h3 className="font-lora" style={{ fontSize: '20px', fontWeight: 700, color: '#1A2E35', margin: '0 0 10px' }}>Clinic & Private Practice</h3>
                <p style={{ fontSize: '14px', color: '#5A4A42', lineHeight: 1.7, margin: 0 }}>Work in modern outpatient settings with predictable hours, collaborative teams, and long-term patient relationships.</p>
              </div>
              <Image src="/images/categories/bento_outpatient_clinic.png" alt="Outpatient clinic" width={280} height={200} style={{ width: '100%', height: 'auto', borderRadius: '14px' }} />
            </div>
            <div className="cat-bento-hero-2" style={{ ...clayCard, gridColumn: 'span 4', padding: '28px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <Image src="/images/categories/bento_outpatient_panel.png" alt="Patient panel management" width={200} height={140} style={{ width: '100%', maxWidth: '180px', height: 'auto', borderRadius: '12px', marginBottom: '16px' }} />
              <h3 className="font-lora" style={{ fontSize: '17px', fontWeight: 700, color: '#1A2E35', margin: '0 0 8px' }}>Patient Panels</h3>
              <p style={{ fontSize: '13px', color: '#5A4A42', lineHeight: 1.6, margin: 0 }}>Manage a caseload of 80–120 patients with scheduled follow-ups.</p>
            </div>

            {/* ROW 2: Icon Cards */}
            <div className="cat-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <Image src="/images/categories/icon_outpatient_clinic.png" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Regular Hours</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Monday-Friday schedules with no nights, weekends, or on-call.</p>
            </div>
            <div className="cat-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <Image src="/images/categories/icon_outpatient_clock.png" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Patient Continuity</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Build lasting therapeutic relationships over time.</p>
            </div>
            <div className="cat-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <Image src="/images/categories/icon_outpatient_therapy.png" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Community Based</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Work in clinics, group practices, and CMHCs.</p>
            </div>
            <div className="cat-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <Image src="/images/categories/icon_outpatient_growth.png" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Work-Life Balance</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Sustainable pace with 15–20 patients per day.</p>
            </div>

            {/* ROW 3 */}
            <div className="cat-bento-hero-3" style={{ ...clayCard, gridColumn: 'span 8', padding: '32px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'center' }}>
              <div>
                <TrendingUp size={28} style={{ color: '#34D399', marginBottom: '12px' }} />
                <h3 className="font-lora" style={{ fontSize: '20px', fontWeight: 700, color: '#1A2E35', margin: '0 0 10px' }}>Salary & Benefits</h3>
                <p style={{ fontSize: '14px', color: '#5A4A42', lineHeight: 1.7, margin: '0 0 6px' }}>Average outpatient PMHNP salary:</p>
                <p style={{ fontSize: '32px', fontWeight: 800, color: '#1A2E35', margin: 0 }}>${stats.avgSalary}k</p>
              </div>
              <Image src="/images/categories/bento_outpatient_salary.png" alt="Outpatient PMHNP salary" width={280} height={200} style={{ width: '100%', height: 'auto', borderRadius: '14px' }} />
            </div>
            <div className="cat-bento-cta" style={{ ...clayCard, gridColumn: 'span 4', padding: '28px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)' }}>
              <Bell size={32} style={{ color: '#0D9488', marginBottom: '14px' }} />
              <h3 className="font-lora" style={{ fontSize: '18px', fontWeight: 700, color: '#134E4A', margin: '0 0 10px' }}>Get Outpatient Alerts</h3>
              <p style={{ fontSize: '13px', color: '#0D9488', lineHeight: 1.6, margin: '0 0 20px' }}>New clinic positions delivered daily.</p>
              <Link href="/job-alerts" className="cat-cta-primary" style={{ padding: '12px 28px', borderRadius: '12px', fontWeight: 700, fontSize: '14px', background: '#0D9488', color: '#fff', textDecoration: 'none', boxShadow: '3px 3px 10px rgba(13,148,136,0.2)' }}>Create Alert</Link>
            </div>
          </div>
        </section>
      </div>

      {/* ═══ BEFORE YOU APPLY ═══ */}
      <div style={{ background: 'linear-gradient(180deg, #FDFBF7 0%, #FFF8F0 50%, #FDFBF7 100%)' }}>
        <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '56px 20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>Before You Apply</p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '40px' }}>What You Need to Know</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
              <div key="01" className="cat-bento-card" style={{ ...clayCard, padding: '28px 24px', borderTop: '3px solid #0D9488' }}>
                <span style={{ fontSize: '28px', fontWeight: 800, color: '#CCFBF1', display: 'block', marginBottom: '12px' }}>01</span>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', marginBottom: '8px' }}>Panel Management</h3>
                <p style={{ fontSize: '13px', color: '#5A4A42', lineHeight: 1.6, margin: 0 }}>Prepare for managing a caseload of 80-120 patients with follow-up scheduling.</p>
              </div>
              <div key="02" className="cat-bento-card" style={{ ...clayCard, padding: '28px 24px', borderTop: '3px solid #0D9488' }}>
                <span style={{ fontSize: '28px', fontWeight: 800, color: '#CCFBF1', display: 'block', marginBottom: '12px' }}>02</span>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', marginBottom: '8px' }}>Insurance Panels</h3>
                <p style={{ fontSize: '13px', color: '#5A4A42', lineHeight: 1.6, margin: 0 }}>Understand insurance credentialing and which payers the practice accepts.</p>
              </div>
              <div key="03" className="cat-bento-card" style={{ ...clayCard, padding: '28px 24px', borderTop: '3px solid #0D9488' }}>
                <span style={{ fontSize: '28px', fontWeight: 800, color: '#CCFBF1', display: 'block', marginBottom: '12px' }}>03</span>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', marginBottom: '8px' }}>EHR Systems</h3>
                <p style={{ fontSize: '13px', color: '#5A4A42', lineHeight: 1.6, margin: 0 }}>Familiarize yourself with common outpatient EHRs like SimplePractice, Valant, or Epic.</p>
              </div>
              <div key="04" className="cat-bento-card" style={{ ...clayCard, padding: '28px 24px', borderTop: '3px solid #0D9488' }}>
                <span style={{ fontSize: '28px', fontWeight: 800, color: '#CCFBF1', display: 'block', marginBottom: '12px' }}>04</span>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', marginBottom: '8px' }}>Therapy Integration</h3>
                <p style={{ fontSize: '13px', color: '#5A4A42', lineHeight: 1.6, margin: 0 }}>Consider brief therapy modalities (CBT, MI) to complement medication management.</p>
              </div>
          </div>
        </section>
      </div>

      {/* ═══ EXPLORE MORE ═══ */}
      <div style={{ background: 'linear-gradient(180deg, #F0FDFA 0%, #E6FAF5 50%, #F0FDFA 100%)' }}>
        <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '56px 20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#E86C2C', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>Keep Exploring</p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '40px' }}>More Ways to Find Your Next Role</h2>
          <div className="cat-explore-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
            {[
              { href: '/jobs/remote', label: 'Remote', sub: 'Work from home', icon: '/images/categories/clay_icon_remote.png' },
              { href: '/jobs/telehealth', label: 'Telehealth', sub: 'Virtual care', icon: '/images/categories/clay_icon_telehealth.png' },
              { href: '/jobs/inpatient', label: 'Inpatient', sub: 'Hospital roles', icon: '/images/categories/clay_icon_inpatient.png' },
              { href: '/jobs/community-health', label: 'Community Health', sub: 'FQHC & public', icon: '/images/categories/clay_icon_communityhealth.png' },
              { href: '/salary-guide', label: 'Salary Guide', sub: '2026 comp data', icon: '/images/categories/clay_icon_salary.png' },
              { href: '/jobs/locations', label: 'By Location', sub: 'All 50 states', icon: '/images/categories/clay_icon_location.png' },
            ].map(c => (
              <Link key={c.href} href={c.href} className="cat-bento-card" style={{ ...clayCard, padding: '24px 20px', textDecoration: 'none', display: 'block', textAlign: 'center' }}>
                <Image src={c.icon} alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 12px', display: 'block' }} />
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', display: 'block', marginBottom: '4px' }}>{c.label}</span>
                <span style={{ fontSize: '12px', color: '#7A6A62', display: 'block' }}>{c.sub}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* ═══ FAQ ═══ */}
      <div style={{ background: 'linear-gradient(180deg, #FDFBF7 0%, #FFF8F0 50%, #FDFBF7 100%)' }}>
        <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '56px 20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>FAQ</p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '40px' }}>Outpatient PMHNP Questions</h2>
          <div style={{ display: 'grid', gap: '16px' }}>
            {[
              { q: 'What does a typical outpatient PMHNP schedule look like?', a: 'Most outpatient positions offer Monday-Friday, 8am-5pm schedules with no nights, weekends, or on-call. Some roles include a half-day administrative block for charting and follow-ups.' },
              { q: 'How many patients will I see per day?', a: 'Outpatient PMHNPs typically see 15-20 patients per day, with a mix of 30-minute follow-ups and 60-minute initial evaluations. Private practice caseloads may be lower.' },
              { q: 'What is the salary range for outpatient PMHNPs?', a: 'Outpatient PMHNP salaries range from $130K to $190K+, depending on location, experience, and practice setting. Private practice roles may offer higher earning potential through patient volume.' },
              { q: 'Do outpatient PMHNPs need to be credentialed with insurers?', a: 'In most group practices and clinics, the employer handles insurance credentialing. If you join a private practice, you may need to apply for your own panel memberships.' },
              { q: 'What EHR systems are common in outpatient settings?', a: 'Common outpatient EHRs include SimplePractice, Valant, TherapyNotes, and Epic Ambulatory. Most employers provide EHR training during onboarding.' },
            ].map((faq, idx) => (
              <div key={idx} className="cat-bento-card" style={{ ...clayCard, padding: '28px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1A2E35', margin: '0 0 10px' }}>{faq.q}</h3>
                <p style={{ fontSize: '14px', color: '#5A4A42', lineHeight: 1.7, margin: 0 }}>{faq.a}</p>
              </div>
            ))}
          </div>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [{q:'What does a typical outpatient PMHNP schedule look like?',a:'Most outpatient positions offer Monday-Friday, 8am-5pm schedules with no nights, weekends, or on-call.'},{q:'How many patients will I see per day?',a:'Outpatient PMHNPs typically see 15-20 patients per day, with a mix of 30-minute follow-ups and 60-minute initial evaluations.'},{q:'What is the salary range for outpatient PMHNPs?',a:'Outpatient PMHNP salaries range from $130K to $190K+, depending on location, experience, and practice setting.'},{q:'Do outpatient PMHNPs need to be credentialed with insurers?',a:'In most group practices, the employer handles insurance credentialing. Private practice may require your own panel memberships.'},{q:'What EHR systems are common in outpatient settings?',a:'Common outpatient EHRs include SimplePractice, Valant, TherapyNotes, and Epic Ambulatory.'}].map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }) }} />
        </section>
      </div>

      {/* ═══ RESPONSIVE CSS ═══ */}
      <style>{`
        .cat-cta-primary { transition: transform 0.25s ease, box-shadow 0.25s ease, filter 0.25s ease; }
        .cat-cta-primary:hover { transform: translateY(-3px); box-shadow: 0 10px 32px rgba(13,148,136,0.35) !important; filter: brightness(1.05); }
        .cat-bento-card { transition: transform 0.3s ease, box-shadow 0.3s ease; }
        .cat-bento-card:hover { transform: translateY(-4px); box-shadow: 8px 8px 24px rgba(0,0,0,0.1), -4px -4px 12px rgba(255,255,255,0.9), inset 1px 1px 2px rgba(255,255,255,0.6) !important; }
        .cat-stat-pill { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .cat-stat-pill:hover { transform: translateY(-2px) scale(1.02); box-shadow: 6px 6px 20px rgba(0,0,0,0.1), -3px -3px 10px rgba(255,255,255,0.9) !important; }
        @media (max-width: 768px) {
          .cat-hero-grid { grid-template-columns: 1fr !important; }
          .cat-bento-grid { grid-template-columns: 1fr !important; }
          .cat-bento-hero-1, .cat-bento-hero-2, .cat-bento-hero-3, .cat-bento-cta { grid-column: span 1 !important; }
          .cat-bento-hero-1, .cat-bento-hero-3 { grid-template-columns: 1fr !important; }
          .cat-bento-grid > div { grid-column: span 1 !important; }
          .cat-explore-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (min-width: 769px) and (max-width: 1024px) {
          .cat-bento-grid { grid-template-columns: repeat(6, 1fr) !important; }
          .cat-bento-hero-1, .cat-bento-hero-3 { grid-column: span 6 !important; }
          .cat-bento-hero-2, .cat-bento-cta { grid-column: span 6 !important; }
          .cat-bento-grid > div:not(.cat-bento-hero-1):not(.cat-bento-hero-2):not(.cat-bento-hero-3):not(.cat-bento-cta) { grid-column: span 3 !important; }
        }
      `}</style>
    </div>
  );
}

