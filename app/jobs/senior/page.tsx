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

const clayCard: React.CSSProperties = {
  background: '#FFFFFF', borderRadius: '20px',
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

export const revalidate = 3600;

interface EmployerGroupResult { employer: string; _count: { employer: number }; }
interface ProcessedEmployer { name: string; count: number; }

const SENIOR_FILTER = buildCategoryWhereClause('senior');

async function getJobs(skip = 0, take = 20) {
  return prisma.job.findMany({ where: SENIOR_FILTER, orderBy: [{ isFeatured: 'desc' }, { qualityScore: 'desc' }, { originalPostedAt: 'desc' }, { createdAt: 'desc' }], skip, take });
}

async function getStats() {
  const totalJobs = await prisma.job.count({ where: SENIOR_FILTER });
  const salaryData = await prisma.job.aggregate({ where: { ...SENIOR_FILTER, normalizedMinSalary: { not: null }, normalizedMaxSalary: { not: null } }, _avg: { normalizedMinSalary: true, normalizedMaxSalary: true } });
  const avgSalary = Math.round(((salaryData._avg.normalizedMinSalary || 0) + (salaryData._avg.normalizedMaxSalary || 0)) / 2 / 1000);
  const topEmployers = await prisma.job.groupBy({ by: ['employer'], where: SENIOR_FILTER, _count: { employer: true }, orderBy: { _count: { employer: 'desc' } }, take: 8 });
  return { totalJobs, avgSalary, topEmployers: topEmployers.map((e: EmployerGroupResult) => ({ name: e.employer, count: e._count.employer })) };
}

const seniorFaqs = [
  { question: 'What qualifies as a Senior PMHNP role?', answer: 'Senior PMHNP roles include positions like Clinical Director, Program Director, Medical Director, Lead PMHNP, and Supervisor. These roles combine direct patient care with leadership responsibilities such as team oversight, program development, and quality improvement.' },
  { question: 'What salary range can Senior PMHNPs expect?', answer: 'Senior PMHNPs typically earn $160K-$250K+ annually. Clinical Directors and Medical Directors at larger organizations can exceed $250K with bonuses, equity, and comprehensive benefits packages.' },
  { question: 'How many years of experience are needed for senior positions?', answer: 'Most senior PMHNP roles require 5-10+ years of clinical psychiatric experience. Director-level positions often require demonstrated leadership experience, program development skills, and expertise in a specific psychiatric subspecialty.' },
  { question: 'What additional certifications help for leadership roles?', answer: 'Beyond the PMHNP-BC, certifications in healthcare administration (FACHE), nursing leadership (CENP/NEA-BC), or subspecialty certifications strengthen candidacy. Many senior roles also value advanced training in evidence-based therapies and quality improvement methodologies.' },
];

export async function generateMetadata(): Promise<Metadata> {
  const stats = await getStats();
  return {
    title: `${stats.totalJobs} Senior PMHNP Jobs � Director & Leadership ($160K-250K+)`,
    description: `Browse ${stats.totalJobs} senior PMHNP leadership positions. Clinical Director, Program Director, Medical Director, and Lead PMHNP roles paying $160K-$250K+.`,
    alternates: { canonical: 'https://pmhnphiring.com/jobs/senior' },
    keywords: ['senior PMHNP jobs', 'PMHNP director', 'PMHNP leadership', 'clinical director psychiatric', 'PMHNP supervisor'],
    openGraph: { title: `Senior PMHNP Jobs � ${stats.totalJobs} Leadership Positions`, description: `Find ${stats.totalJobs} senior psychiatric NP roles.`, url: 'https://pmhnphiring.com/jobs/senior', type: 'website' },
  };
}

interface PageProps { searchParams: Promise<{ page?: string }>; }

export default async function SeniorPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || '1'));
  const limit = 10;
  const skip = (page - 1) * limit;
  const [jobs, stats] = await Promise.all([getJobs(skip, limit), getStats()]);

  return (
    <div style={{ backgroundColor: '#FDFBF7' }}>
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://pmhnphiring.com" },
        { name: "Jobs", url: "https://pmhnphiring.com/jobs" },
        { name: "Senior", url: "https://pmhnphiring.com/jobs/senior" }
      ]} />
      <JobListViewTracker jobs={jobs.map((j: Job) => ({ id: j.id, title: j.title, employer: j.employer }))} listName="Senior Jobs" />

      {/* Schema Markup */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org', '@type': 'FAQPage',
        mainEntity: seniorFaqs.map(f => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })),
      }) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org', '@type': 'ItemList', name: 'Senior PMHNP Jobs',
        numberOfItems: stats.totalJobs, itemListOrder: 'https://schema.org/ItemListOrderDescending',
        itemListElement: jobs.slice(0, 10).map((j: Job, i: number) => ({ '@type': 'ListItem', position: i + 1, url: `https://pmhnphiring.com/jobs/${j.slug}`, name: j.title })),
      }) }} />

            {/* HERO */}
      <CategoryHero
        bgColor="#6a85a0"
        heroImage="/images/categories/hero_wc_senior.png"
        heroAlt="Senior PMHNP clinical leadership roles"
        badgeText={`${stats.totalJobs} live roles � updated today`}
        breadcrumbs={['Careers', 'Nurse Practitioner', 'Senior']}
        indexLabel="? 27 / 28"
        headlineLine1="Senior"
        headlineLine2="PMHNP"
        headlineSub="jobs, leadership roles."
        stats={[
          { value: `${stats.totalJobs}+`, label: 'positions' },
          { value: stats.avgSalary > 0 ? `${stats.avgSalary}k` : '$175K+', label: 'avg salary' },
          { value: `${stats.topEmployers.length}+`, label: 'employers' },
        ]}
        description="Senior-level PMHNP positions with clinical leadership, program development, and executive compensation."
        ctaLabel="Browse Senior Jobs"
        ctaHref="/jobs?category=senior"
        secondaryCtaLabel="Set Alert"
        secondaryCtaHref="/job-alerts"
      />

      {/* --- JOB LISTINGS --- */}
      <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '32px 24px' }}>
        <div className="grid lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3">
            <h2 className="font-lora mb-6" style={{ fontSize: '20px', fontWeight: 700, color: '#1A2E35' }}>Senior Positions ({stats.totalJobs})</h2>
            {jobs.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                {jobs.map((job: Job) => (<JobCard key={job.id} job={job} />))}
              </div>
            ) : (
              <div className="text-center py-12"><p style={{ color: '#7A6A62' }}>No positions right now. Check back soon.</p></div>
            )}
            <div style={{ textAlign: 'center', marginTop: '32px' }}>
              <Link href="/jobs?category=senior" className="cat-cta-primary" style={{ padding: '14px 32px', borderRadius: '14px', fontWeight: 700, fontSize: '14px', background: '#0D9488', color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px', boxShadow: '4px 4px 12px rgba(13,148,136,0.2)' }}>Browse All Senior Jobs <ArrowRight size={16} /></Link>
            </div>
          </div>
          <div className="lg:col-span-1">
            <div style={{ ...clayCard, padding: '24px', marginBottom: '20px', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', border: '2px solid rgba(13,148,136,0.15)' }}>
              <Bell size={28} style={{ color: '#0D9488', marginBottom: '12px' }} />
              <h3 className="font-lora" style={{ fontSize: '18px', fontWeight: 700, color: '#134E4A', margin: '0 0 8px' }}>Senior Alerts</h3>
              <p style={{ fontSize: '13px', color: '#0D9488', marginBottom: '16px' }}>New leadership listings delivered daily.</p>
              <Link href="/job-alerts" style={{ display: 'block', textAlign: 'center', padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '13px', background: '#0D9488', color: '#fff', textDecoration: 'none' }}>Create Alert</Link>
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
                <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A2E35' }}>${`${stats.avgSalary}k`}</div>
                <div style={{ fontSize: '13px', color: '#7A6A62' }}>Average salary</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- BENTO � Why Choose Senior --- */}
      <div style={{ background: 'linear-gradient(180deg, #F0FDFA 0%, #E6FAF5 50%, #F0FDFA 100%)' }}>
        <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '48px 20px 40px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#E86C2C', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>Why Choose Senior</p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(26px, 3.5vw, 38px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '48px' }}>Built for Leaders</h2>
          <div className="cat-bento-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '14px' }}>
            {/* ROW 1 */}
            <div className="cat-bento-card cat-bento-hero-1" style={{ ...clayCard, gridColumn: 'span 8', padding: '28px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#1A2E35', margin: '0 0 10px' }}>Lead Clinical Programs</h3>
                <p style={{ fontSize: '13px', color: '#5A4A42', lineHeight: 1.65, margin: 0 }}>Direct psychiatric programs, mentor NP teams, and drive quality improvement initiatives as a clinical leader.</p>
              </div>
              <Image src="/images/categories/bento_senior_leadership.png" alt="PMHNP leadership diorama" width={280} height={200} style={{ width: '100%', maxWidth: '280px', height: 'auto', borderRadius: '12px' }} />
            </div>
            <div className="cat-bento-card cat-bento-hero-2" style={{ ...clayCard, gridColumn: 'span 4', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <Image src="/images/categories/bento_senior_strategy.png" alt="Strategic planning diorama" width={200} height={140} style={{ width: '100%', maxWidth: '200px', height: 'auto', borderRadius: '12px', marginBottom: '14px' }} />
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Strategic Impact</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Shape mental health policy and organizational strategy at the executive level.</p>
            </div>
            {/* ROW 2: 4 icon cards */}
            <div className="cat-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <Image src="/images/categories/icon_senior_crown.png" alt="Executive roles" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Executive Roles</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Chief PMHNP, clinical director, and VP positions.</p>
            </div>
            <div className="cat-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <Image src="/images/categories/icon_senior_chart.png" alt="Top compensation" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Top Compensation</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Senior roles offer $180K-$250K+ with bonuses.</p>
            </div>
            <div className="cat-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <Image src="/images/categories/icon_senior_blueprint.png" alt="Program design" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Program Design</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Build and lead psychiatric programs from scratch.</p>
            </div>
            <div className="cat-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <Image src="/images/categories/icon_senior_globe.png" alt="Industry influence" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Industry Influence</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Shape mental health policy and best practices.</p>
            </div>
            {/* ROW 3 */}
            <div className="cat-bento-card cat-bento-hero-3" style={{ ...clayCard, gridColumn: 'span 8', padding: '28px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <TrendingUp size={20} style={{ color: '#34D399' }} />
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35' }}>Salary + Benefits</span>
                </div>
                <div style={{ fontSize: '36px', fontWeight: 800, color: '#1A2E35', marginBottom: '6px' }}>${`${stats.avgSalary}k`}</div>
                <p style={{ fontSize: '13px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Average senior PMHNP salary with executive bonuses, equity packages, and comprehensive benefits.</p>
              </div>
              <Image src="/images/categories/bento_senior_compensation.png" alt="Senior compensation diorama" width={280} height={200} style={{ width: '100%', maxWidth: '280px', height: 'auto', borderRadius: '12px' }} />
            </div>
            <div className="cat-bento-card cat-bento-cta" style={{ gridColumn: 'span 4', padding: '28px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: 'linear-gradient(145deg, #065F46, #0D9488)', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.15)' }}>
              <Bell size={28} style={{ color: '#fff', marginBottom: '12px' }} />
              <h3 className="font-lora" style={{ fontSize: '17px', fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>Get Leadership Alerts</h3>
              <p style={{ fontSize: '12px', color: '#A7F3D0', marginBottom: '16px', lineHeight: 1.5 }}>New director and supervisor roles daily.</p>
              <Link href="/job-alerts" style={{ padding: '12px 28px', borderRadius: '12px', fontWeight: 700, fontSize: '13px', background: '#fff', color: '#065F46', textDecoration: 'none', boxShadow: '4px 4px 12px rgba(0,0,0,0.15)' }}>Set Up Alerts</Link>
            </div>
          </div>
        </section>
      </div>

      {/* --- BEFORE YOU APPLY --- */}
      <div style={{ background: 'linear-gradient(180deg, #FDFBF7 0%, #FFF8F0 50%, #FDFBF7 100%)' }}>
        <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '56px 20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>Before You Apply</p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '40px' }}>What You Need</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
            {[
              { num: '01', title: 'PMHNP-BC', desc: 'Active PMHNP-BC certification through ANCC with 5+ years clinical experience.' },
              { num: '02', title: 'State License', desc: 'APRN licensure with prescriptive authority and DEA registration.' },
              { num: '03', title: 'Leadership Track', desc: 'Demonstrated experience in team supervision, program development, or clinical operations.' },
              { num: '04', title: 'Subspecialty Depth', desc: 'Expertise in a focused area: addiction, geriatrics, child/adolescent, or forensic psychiatry.' },
            ].map(item => (
              <div key={item.num} className="cat-bento-card" style={{ ...clayCard, padding: '28px 24px', borderTop: '3px solid #0D9488' }}>
                <span style={{ fontSize: '28px', fontWeight: 800, color: '#CCFBF1' }}>{item.num}</span>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', marginTop: '12px', marginBottom: '8px' }}>{item.title}</h3>
                <p style={{ fontSize: '13px', color: '#5A4A42', lineHeight: 1.6, margin: 0 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* --- EXPLORE MORE --- */}
      <div style={{ background: 'linear-gradient(180deg, #F0FDFA 0%, #E6FAF5 50%, #F0FDFA 100%)' }}>
        <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '56px 20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#E86C2C', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>Keep Exploring</p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '40px' }}>More Categories</h2>
          <div className="cat-explore-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
            {[
              { href: '/jobs/remote', label: 'Remote', sub: 'Work from home', icon: '/images/categories/clay_icon_remote.png' },
              { href: '/jobs/telehealth', label: 'Telehealth', sub: 'Virtual care', icon: '/images/categories/clay_icon_telehealth.png' },
              { href: '/jobs/private-practice', label: 'Private Practice', sub: 'Own your practice' },
              { href: '/jobs/outpatient', label: 'Outpatient', sub: 'Clinic based' },
              { href: '/salary-guide', label: 'Salary Guide', sub: '2026 data', icon: '/images/categories/clay_icon_salary.png' },
              { href: '/jobs/locations', label: 'By Location', sub: '50 states', icon: '/images/categories/clay_icon_location.png' },
            ].map(c => (
              <Link key={c.href} href={c.href} className="cat-bento-card" style={{ ...clayCard, padding: '24px 20px', textDecoration: 'none', textAlign: 'center' }}>
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', display: 'block', marginBottom: '4px' }}>{c.label}</span>
                <span style={{ fontSize: '12px', color: '#7A6A62', display: 'block' }}>{c.sub}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* --- FAQ --- */}
      <div style={{ background: 'linear-gradient(180deg, #FDFBF7 0%, #FFF8F0 50%, #FDFBF7 100%)' }}>
        <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '56px 20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>FAQ</p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '40px' }}>Senior PMHNP Questions</h2>
          <div style={{ display: 'grid', gap: '16px' }}>
            {seniorFaqs.map((faq, idx) => (
              <div key={idx} className="cat-bento-card" style={{ ...clayCard, padding: '28px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1A2E35', margin: '0 0 10px' }}>{faq.question}</h3>
                <p style={{ fontSize: '14px', color: '#5A4A42', lineHeight: 1.7, margin: 0 }}>{faq.answer}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <style>{`
        .cat-cta-primary { transition: transform 0.25s ease, box-shadow 0.25s ease, filter 0.25s ease; }
        .cat-cta-primary:hover { transform: translateY(-3px); box-shadow: 0 10px 32px rgba(13,148,136,0.35) !important; filter: brightness(1.05); }
        .cat-bento-card { transition: transform 0.3s ease, box-shadow 0.3s ease; }
        .cat-bento-card:hover { transform: translateY(-4px); box-shadow: 8px 8px 24px rgba(0,0,0,0.1), -4px -4px 12px rgba(255,255,255,0.9), inset 1px 1px 2px rgba(255,255,255,0.6) !important; }
        .cat-stat-pill { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .cat-stat-pill:hover { transform: translateY(-2px) scale(1.02); box-shadow: 6px 6px 20px rgba(0,0,0,0.1), -3px -3px 10px rgba(255,255,255,0.9) !important; }
        @media (max-width: 768px) {
          .cat-hero-grid { grid-template-columns: 1fr !important; }
          .cat-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
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
