import { brand } from '@/config/brand';
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

// force-dynamic removed: it overrides revalidate and defeats ISR caching
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

const SA_FILTER = buildCategoryWhereClause('substance-abuse');

async function getSubstanceAbuseJobs(skip: number = 0, take: number = 20) {
    return prisma.job.findMany({
        where: SA_FILTER,
        orderBy: [{ isFeatured: 'desc' }, { qualityScore: 'desc' }, { originalPostedAt: 'desc' }, { createdAt: 'desc' }],
        skip, take,
    });
}

async function getSubstanceAbuseStats() {
    const totalJobs = await prisma.job.count({ where: SA_FILTER });
    const salaryData = await prisma.job.aggregate({
        where: { ...SA_FILTER, normalizedMinSalary: { not: null }, normalizedMaxSalary: { not: null } },
        _avg: { normalizedMinSalary: true, normalizedMaxSalary: true },
    });
    const avgSalary = Math.round(((salaryData._avg.normalizedMinSalary || 0) + (salaryData._avg.normalizedMaxSalary || 0)) / 2 / 1000);
    const topEmployers = await prisma.job.groupBy({
        by: ['employer'], where: SA_FILTER,
        _count: { employer: true }, orderBy: { _count: { employer: 'desc' } }, take: 8,
    });
    return {
        totalJobs, avgSalary,
        topEmployers: topEmployers.map((e: EmployerGroupResult) => ({ name: e.employer, count: e._count.employer })),
    };
}


const substanceFaqs = [
  { question: 'What is a Substance Abuse PMHNP?', answer: 'A PMHNP specializing in addiction treatment, including medication-assisted treatment (MAT), detox management, and dual-diagnosis care.' },
  { question: 'What is MAT?', answer: 'Medication-Assisted Treatment uses FDA-approved medications like buprenorphine and naltrexone alongside counseling to treat opioid and alcohol use disorders.' },
  { question: 'What is the salary range?', answer: 'Substance abuse PMHNPs earn $130K-$180K, with MAT-certified providers commanding premium rates.' },
  { question: 'What certifications help?', answer: 'DEA registration, buprenorphine prescribing knowledge, and ASAM certification strengthen candidacy for addiction roles.' },
];

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
    const [stats, params] = await Promise.all([getSubstanceAbuseStats(), searchParams]);
    const page = parseInt(params.page || '1');

    return {
        title: `${stats.totalJobs} Substance Abuse PMHNP Jobs — Addiction & MAT Psych NP ($130K-180K)`,
        description: `Find ${stats.totalJobs} substance abuse and addiction PMHNP jobs paying $130K-$180K+. MAT clinics, dual diagnosis, Suboxone prescriber, and rehab psychiatric nurse practitioner positions. High demand, rewarding work.`,
        keywords: ['substance abuse pmhnp', 'addiction pmhnp jobs', 'MAT pmhnp', 'suboxone prescriber', 'dual diagnosis pmhnp', 'SUD nurse practitioner'],
        openGraph: {
            title: `${stats.totalJobs} Substance Abuse PMHNP Jobs — Addiction Treatment`,
            description: 'Browse addiction and substance abuse psychiatric nurse practitioner positions. MAT clinics, rehab, dual diagnosis roles.',
            type: 'website',
            images: [{
                url: `/api/og?type=page&title=${encodeURIComponent(`${stats.totalJobs} Substance Abuse PMHNP Jobs`)}&subtitle=${encodeURIComponent('Addiction & MAT psychiatric NP positions')}`,
                width: 1200, height: 630, alt: 'Substance Abuse PMHNP Jobs',
            }],
        },
        alternates: { canonical: `${brand.baseUrl}/jobs/substance-abuse` },
        ...(page > 1 && { robots: { index: false, follow: true } }),
    };
}

interface PageProps {
    searchParams: Promise<{ page?: string }>;
}

export default async function SubstanceAbuseJobsPage({ searchParams }: PageProps) {
    const params = await searchParams;
    const page = Math.max(1, parseInt(params.page || '1'));
    const limit = 10;
    const skip = (page - 1) * limit;

    const [jobs, stats] = await Promise.all([getSubstanceAbuseJobs(skip, limit), getSubstanceAbuseStats()]);
    const totalPages = Math.ceil(stats.totalJobs / limit);

    return (
        <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {jobs.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@type': 'ItemList', name: 'Substance Abuse PMHNP Jobs', numberOfItems: stats.totalJobs, itemListElement: jobs.slice(0, 10).map((job: Job, idx: number) => ({ '@type': 'ListItem', position: idx + 1, name: job.title, url: `https://pmhnphiring.com/jobs/${job.slug || job.id}` })) }) }} />
      )}
      {/* ═══ HERO ═══ */}
      <CategoryHero
        bgColor="#9bb7a5"
        heroImage="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/hero_wc_sa_people.webp"
        heroAlt="Substance Abuse PMHNP counseling session"
        badgeText={`${stats.totalJobs} live roles · updated today`}
        breadcrumbs={['Careers', 'Nurse Practitioner', 'Substance Abuse']}
        indexLabel="№ 13 / 28"
        headlineLine1="Substance Abuse"
        headlineLine2="PMHNP"
        headlineSub="jobs, addiction care."
        stats={[
          { value: `${stats.totalJobs}+`, label: 'positions' },
          { value: stats.avgSalary > 0 ? `$${stats.avgSalary}k` : '$130K+', label: 'avg salary' },
          { value: `${stats.topEmployers.length}+`, label: 'employers' },
        ]}
        description="Addiction treatment roles including MAT programs, detox centers, and dual-diagnosis facilities."
        ctaLabel="Browse Substance Abuse Jobs"
        ctaHref="/jobs?category=substance-abuse"
        secondaryCtaLabel="Set Alert"
        secondaryCtaHref="/job-alerts"
      />

      {/* ═══ JOB LISTINGS ═══ */}
      <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '32px 24px' }}>
        <div className="grid lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3">
            <h2 className="font-lora mb-6" style={{ fontSize: '20px', fontWeight: 700, color: '#1A2E35' }}>Substance Abuse Positions ({stats.totalJobs})</h2>
            {jobs.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                {jobs.map((job: Job) => (<JobCard key={job.id} job={job} />))}
              </div>
            ) : (
              <div className="text-center py-12"><p>No positions at this time. Check back soon.</p></div>
            )}
            <div style={{ textAlign: 'center', marginTop: '32px' }}>
              <Link href="/jobs?category=substance-abuse" className="cat-cta-primary" style={{ padding: '14px 32px', borderRadius: '14px', fontWeight: 700, fontSize: '14px', background: '#0D9488', color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px', boxShadow: '4px 4px 12px rgba(13,148,136,0.2)' }}>Browse All Substance Abuse Jobs <ArrowRight size={16} /></Link>
            </div>
          </div>
          <div className="lg:col-span-1">
            <div style={{ ...clayCard, padding: '24px', marginBottom: '20px', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', border: '2px solid rgba(13,148,136,0.15)' }}>
              <Bell size={28} style={{ color: '#0D9488', marginBottom: '12px' }} />
              <h3 className="font-lora" style={{ fontSize: '18px', fontWeight: 700, color: '#134E4A', margin: '0 0 8px' }}>Substance Abuse Alerts</h3>
              <p style={{ fontSize: '13px', color: '#0D9488', marginBottom: '16px' }}>New listings delivered daily.</p>
              <Link href="/job-alerts" className="cat-cta-primary" style={{ display: 'block', textAlign: 'center', padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '13px', background: '#0D9488', color: '#fff', textDecoration: 'none' }}>Create Alert</Link>
            </div>
            {stats.topEmployers.length > 0 && (
              <div style={{ ...clayCard, padding: '24px', marginBottom: '20px' }}>
                <Building2 size={20} style={{ color: '#0D9488', marginBottom: '8px' }} />
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1A2E35', margin: '0 0 12px' }}>Top Employers</h3>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {stats.topEmployers.map((employer: ProcessedEmployer, index: number) => (
                    <li key={index} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: index < stats.topEmployers.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}>
                      <span style={{ fontSize: '13px', color: '#5A4A42', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{employer.name}</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#0D9488', marginLeft: '8px' }}>{employer.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {stats.avgSalary > 0 && (
              <div style={{ ...clayCard, padding: '24px' }}>
                <TrendingUp size={20} style={{ color: '#34D399', marginBottom: '8px' }} />
                <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A2E35' }}>${stats.avgSalary}k</div>
                <div style={{ fontSize: '13px', color: '#7A6A62' }}>Average salary</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ BENTO ═══ */}
      <div style={{ background: 'linear-gradient(180deg, #F0FDFA 0%, #E6FAF5 50%, #F0FDFA 100%)' }}>
        <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '48px 20px 40px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#E86C2C', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>Why Choose Substance Abuse</p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(26px, 3.5vw, 38px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '48px' }}>Built for Addiction Care</h2>
          <div className="cat-bento-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '14px' }}>
            {/* ROW 1 */}
            <div className="cat-bento-hero-1" style={{ ...clayCard, gridColumn: 'span 8', padding: '32px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'center' }}>
              <div>
                <h3 className="font-lora" style={{ fontSize: '20px', fontWeight: 700, color: '#1A2E35', margin: '0 0 10px' }}>MAT & Recovery Programs</h3>
                <p style={{ fontSize: '14px', color: '#5A4A42', lineHeight: 1.7, margin: 0 }}>Lead medication-assisted treatment programs, manage buprenorphine protocols, and guide patients through recovery.</p>
              </div>
              <Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/bento_sa_counseling.webp" alt="Addiction treatment counseling" width={280} height={200} style={{ width: '100%', height: 'auto', borderRadius: '14px' }} />
            </div>
            <div className="cat-bento-hero-2" style={{ ...clayCard, gridColumn: 'span 4', padding: '28px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/bento_sa_grouptherapy.webp" alt="Group therapy recovery session" width={200} height={140} style={{ width: '100%', maxWidth: '180px', height: 'auto', borderRadius: '12px', marginBottom: '16px' }} />
              <h3 className="font-lora" style={{ fontSize: '17px', fontWeight: 700, color: '#1A2E35', margin: '0 0 8px' }}>Recovery Journey</h3>
              <p style={{ fontSize: '13px', color: '#5A4A42', lineHeight: 1.6, margin: 0 }}>Guide patients from detox through sustained recovery milestones.</p>
            </div>

            {/* ROW 2: Icon Cards */}
            <div className="cat-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/icon_sa_recovery.webp" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Recovery Focus</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Help patients achieve lasting recovery from SUD.</p>
            </div>
            <div className="cat-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/icon_sa_medicine.webp" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>MAT Programs</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Prescribe and manage medication-assisted treatment.</p>
            </div>
            <div className="cat-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/icon_sa_group.webp" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Group Therapy</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Lead group therapy and peer support programs.</p>
            </div>
            <div className="cat-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/icon_sa_impact.webp" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Life Impact</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Transform lives through evidence-based addiction care.</p>
            </div>

            {/* ROW 3 */}
            <div className="cat-bento-hero-3" style={{ ...clayCard, gridColumn: 'span 8', padding: '32px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'center' }}>
              <div>
                <TrendingUp size={28} style={{ color: '#34D399', marginBottom: '12px' }} />
                <h3 className="font-lora" style={{ fontSize: '20px', fontWeight: 700, color: '#1A2E35', margin: '0 0 10px' }}>Salary & Benefits</h3>
                <p style={{ fontSize: '14px', color: '#5A4A42', lineHeight: 1.7, margin: '0 0 6px' }}>Average substance abuse PMHNP salary:</p>
                <p style={{ fontSize: '32px', fontWeight: 800, color: '#1A2E35', margin: 0 }}>${stats.avgSalary}k</p>
              </div>
              <Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/bento_sa_salary.webp" alt="Addiction PMHNP salary" width={280} height={200} style={{ width: '100%', height: 'auto', borderRadius: '14px' }} />
            </div>
            <div className="cat-bento-cta" style={{ ...clayCard, gridColumn: 'span 4', padding: '28px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)' }}>
              <Bell size={32} style={{ color: '#0D9488', marginBottom: '14px' }} />
              <h3 className="font-lora" style={{ fontSize: '18px', fontWeight: 700, color: '#134E4A', margin: '0 0 10px' }}>Get Addiction Alerts</h3>
              <p style={{ fontSize: '13px', color: '#0D9488', lineHeight: 1.6, margin: '0 0 20px' }}>New SUD positions delivered daily.</p>
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
            <div className="cat-bento-card" style={{ ...clayCard, padding: '28px 24px', borderTop: '3px solid #0D9488' }}>
              <span style={{ fontSize: '28px', fontWeight: 800, color: '#CCFBF1', display: 'block', marginBottom: '12px' }}>01</span>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', marginBottom: '8px' }}>DEA Requirements</h3>
              <p style={{ fontSize: '13px', color: '#5A4A42', lineHeight: 1.6, margin: 0 }}>Understand buprenorphine prescribing and current DEA regulations.</p>
            </div>
            <div className="cat-bento-card" style={{ ...clayCard, padding: '28px 24px', borderTop: '3px solid #0D9488' }}>
              <span style={{ fontSize: '28px', fontWeight: 800, color: '#CCFBF1', display: 'block', marginBottom: '12px' }}>02</span>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', marginBottom: '8px' }}>SUD Experience</h3>
              <p style={{ fontSize: '13px', color: '#5A4A42', lineHeight: 1.6, margin: 0 }}>Highlight substance use disorder rotation or volunteer experience.</p>
            </div>
            <div className="cat-bento-card" style={{ ...clayCard, padding: '28px 24px', borderTop: '3px solid #0D9488' }}>
              <span style={{ fontSize: '28px', fontWeight: 800, color: '#CCFBF1', display: 'block', marginBottom: '12px' }}>03</span>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', marginBottom: '8px' }}>Crisis Skills</h3>
              <p style={{ fontSize: '13px', color: '#5A4A42', lineHeight: 1.6, margin: 0 }}>Demonstrate competency in overdose response and de-escalation.</p>
            </div>
            <div className="cat-bento-card" style={{ ...clayCard, padding: '28px 24px', borderTop: '3px solid #0D9488' }}>
              <span style={{ fontSize: '28px', fontWeight: 800, color: '#CCFBF1', display: 'block', marginBottom: '12px' }}>04</span>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', marginBottom: '8px' }}>Dual Diagnosis</h3>
              <p style={{ fontSize: '13px', color: '#5A4A42', lineHeight: 1.6, margin: 0 }}>Prepare for co-occurring mental health and SUD treatment.</p>
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
              { href: '/jobs/remote', label: 'Remote', sub: 'Work from home', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_remote.webp' },
              { href: '/jobs/telehealth', label: 'Telehealth', sub: 'Virtual care', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_telehealth.webp' },
              { href: '/jobs/inpatient', label: 'Inpatient', sub: 'Hospital roles', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_inpatient.webp' },
              { href: '/jobs/outpatient', label: 'Outpatient', sub: 'Clinic-based', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_outpatient.webp' },
              { href: '/salary-guide', label: 'Salary Guide', sub: '2026 comp data', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_salary.webp' },
              { href: '/jobs/locations', label: 'By Location', sub: 'All 50 states', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_location.webp' },
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
          <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '40px' }}>Substance Abuse PMHNP Questions</h2>
          <div style={{ display: 'grid', gap: '16px' }}>
            {substanceFaqs.map((faq, idx) => (
              <div key={idx} className="cat-bento-card" style={{ ...clayCard, padding: '28px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1A2E35', margin: '0 0 10px' }}>{faq.question}</h3>
                <p style={{ fontSize: '14px', color: '#5A4A42', lineHeight: 1.7, margin: 0 }}>{faq.answer}</p>
              </div>
            ))}
          </div>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: substanceFaqs.map(f => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })) }) }} />
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

