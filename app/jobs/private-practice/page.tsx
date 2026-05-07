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
import CategoryLocationsExplore from '@/components/seo/CategoryLocationsExplore';

const clayCard: React.CSSProperties = { background: '#FFFFFF', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)' };
export const revalidate = 3600;
interface EmployerGroupResult { employer: string; _count: { employer: number }; }
interface ProcessedEmployer { name: string; count: number; }

const PP_FILTER = buildCategoryWhereClause('private-practice');

async function getJobs(skip = 0, take = 20) { return prisma.job.findMany({ where: PP_FILTER, orderBy: [{ isFeatured: 'desc' }, { qualityScore: 'desc' }, { originalPostedAt: 'desc' }, { createdAt: 'desc' }], skip, take }); }
async function getStats() {
  const totalJobs = await prisma.job.count({ where: PP_FILTER });
  const salaryData = await prisma.job.aggregate({ where: { ...PP_FILTER, normalizedMinSalary: { not: null }, normalizedMaxSalary: { not: null } }, _avg: { normalizedMinSalary: true, normalizedMaxSalary: true } });
  const avgSalary = Math.round(((salaryData._avg.normalizedMinSalary || 0) + (salaryData._avg.normalizedMaxSalary || 0)) / 2 / 1000);
  const topEmployers = await prisma.job.groupBy({ by: ['employer'], where: PP_FILTER, _count: { employer: true }, orderBy: { _count: { employer: 'desc' } }, take: 8 });
  return { totalJobs, avgSalary, topEmployers: topEmployers.map((e: EmployerGroupResult) => ({ name: e.employer, count: e._count.employer })) };
}

const faqs = [
  { q: 'What types of private practice PMHNP roles exist?', a: 'Private practice roles include solo practice (you own and operate), group practice (join an established multi-provider office), independent contractor (1099 work for a practice), and hybrid roles combining in-person and telehealth. Each offers different levels of autonomy, risk, and earning potential.' },
  { q: 'How much do private practice PMHNPs earn?', a: 'Private practice PMHNPs earn $150K-$300K+ annually. Solo practice owners can earn even more but must cover overhead. Group practice employees typically earn $150K-$200K with benefits. Independent contractors earn $175K-$250K on 1099 arrangements.' },
  { q: 'Do I need business experience for private practice?', a: 'For group practice employee roles, no � you focus on clinical work. For starting your own practice, understanding billing, credentialing, marketing, and operations is essential. Many PMHNPs start in group practices before launching solo practices.' },
  { q: 'What\'s needed to start a private practice?', a: 'You need: PMHNP-BC certification, state APRN licensure with full practice authority (or collaborating physician), DEA registration, NPI number, malpractice insurance, EHR system, office space or telehealth platform, and insurance panel credentialing.' },
  { q: 'Is group practice or solo practice better?', a: 'Group practice offers built-in referrals, shared overhead, administrative support, and lower financial risk. Solo practice offers maximum autonomy, higher earning ceiling, and full control of your schedule. Most PMHNPs recommend 2-3 years in group practice before going solo.' },
];

export async function generateMetadata(): Promise<Metadata> {
  const stats = await getStats();
  return { title: `${stats.totalJobs} Private Practice PMHNP Jobs ($150K-300K)`, description: `Find ${stats.totalJobs} private practice PMHNP positions. Solo, group, and independent practice roles paying $150K-300K+.`, alternates: { canonical: `${brand.baseUrl}/jobs/private-practice` } };
}

interface PageProps { searchParams: Promise<{ page?: string }>; }

export default async function PrivatePracticePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const skip = (Math.max(1, parseInt(params.page || '1')) - 1) * 10;
  const [jobs, stats] = await Promise.all([getJobs(skip, 10), getStats()]);

  return (
    <div style={{ backgroundColor: '#FDFBF7' }}>
      <BreadcrumbSchema items={[{ name: "Home", url: "https://pmhnphiring.com" }, { name: "Jobs", url: "https://pmhnphiring.com/jobs" }, { name: "Private Practice", url: "https://pmhnphiring.com/jobs/private-practice" }]} />
      <JobListViewTracker jobs={jobs.map((j: Job) => ({ id: j.id, title: j.title, employer: j.employer }))} listName="Private Practice Jobs" />
      {jobs.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@type': 'ItemList', name: 'Private Practice PMHNP Jobs', numberOfItems: stats.totalJobs, itemListElement: jobs.slice(0, 10).map((job: Job, idx: number) => ({ '@type': 'ListItem', position: idx + 1, name: job.title, url: `https://pmhnphiring.com/jobs/${job.slug || job.id}` })) }) }} />
      )}

            {/* HERO */}
      <CategoryHero
        bgColor="#d4b0a3"
        heroImage="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/hero_wc_privatepractice.webp"
        heroAlt="Private practice PMHNP entrepreneurial independence"
        badgeText={`${stats.totalJobs} live roles � updated today`}
        breadcrumbs={['Careers', 'Nurse Practitioner', 'Private Practice']}
        indexLabel="? 21 / 28"
        headlineLine1="Private Practice"
        headlineLine2="PMHNP"
        headlineSub="jobs, own your practice."
        stats={[
          { value: `${stats.totalJobs}+`, label: 'positions' },
          { value: stats.avgSalary > 0 ? `${stats.avgSalary}k` : '$160K+', label: 'avg salary' },
          { value: `${stats.topEmployers.length}+`, label: 'employers' },
        ]}
        description="Build your own practice with clinical freedom, flexible schedules, and entrepreneurial independence."
        ctaLabel="Browse Private Practice Jobs"
        ctaHref="/jobs?category=private-practice"
        secondaryCtaLabel="Set Alert"
        secondaryCtaHref="/job-alerts"
      />

      {/* 2. JOB LISTINGS */}
      <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '32px 24px' }}>
        <div className="grid lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3">
            <h2 className="font-lora mb-6" style={{ fontSize: '20px', fontWeight: 700, color: '#1A2E35' }}>Private Practice Positions ({stats.totalJobs})</h2>
            {jobs.length > 0 ? (<div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">{jobs.map((job: Job) => (<JobCard key={job.id} job={job} />))}</div>) : (<div className="text-center py-12"><p style={{ color: '#7A6A62' }}>No positions right now.</p></div>)}
            <div style={{ textAlign: 'center', marginTop: '32px' }}><Link href="/jobs?category=private-practice" className="cat-cta-primary" style={{ padding: '14px 32px', borderRadius: '14px', fontWeight: 700, fontSize: '14px', background: '#0D9488', color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px', boxShadow: '4px 4px 12px rgba(13,148,136,0.2)' }}>Browse All Private Practice Jobs <ArrowRight size={16} /></Link></div>
          </div>
          <div className="lg:col-span-1">
            <div style={{ ...clayCard, padding: '24px', marginBottom: '20px', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', border: '2px solid rgba(13,148,136,0.15)' }}><Bell size={28} style={{ color: '#0D9488', marginBottom: '12px' }} /><h3 className="font-lora" style={{ fontSize: '18px', fontWeight: 700, color: '#134E4A', margin: '0 0 8px' }}>Practice Alerts</h3><p style={{ fontSize: '13px', color: '#0D9488', marginBottom: '16px' }}>New practice opportunities daily.</p><Link href="/job-alerts" style={{ display: 'block', textAlign: 'center', padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '13px', background: '#0D9488', color: '#fff', textDecoration: 'none' }}>Create Alert</Link></div>
            {stats.topEmployers.length > 0 && (<div style={{ ...clayCard, padding: '24px', marginBottom: '20px' }}><Building2 size={20} style={{ color: '#0D9488', marginBottom: '8px' }} /><h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1A2E35', margin: '0 0 12px' }}>Top Practices</h3><ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{stats.topEmployers.map((employer: ProcessedEmployer, index: number) => (<li key={index} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: index < stats.topEmployers.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}><span style={{ fontSize: '13px', color: '#5A4A42', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{employer.name}</span><span style={{ fontSize: '12px', fontWeight: 700, color: '#0D9488', marginLeft: '8px' }}>{employer.count}</span></li>))}</ul></div>)}
            {stats.avgSalary > 0 && (<div style={{ ...clayCard, padding: '24px' }}><TrendingUp size={20} style={{ color: '#34D399', marginBottom: '8px' }} /><div style={{ fontSize: '32px', fontWeight: 800, color: '#1A2E35' }}>${stats.avgSalary}k</div><div style={{ fontSize: '13px', color: '#7A6A62' }}>Average salary</div></div>)}
          </div>
        </div>
      </div>

      {/* 3. BENTO GRID */}
      <div style={{ background: 'linear-gradient(180deg, #F0FDFA 0%, #E6FAF5 50%, #F0FDFA 100%)' }}>
        <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '48px 20px 40px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#E86C2C', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>Why Choose Private Practice</p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(26px, 3.5vw, 38px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '48px' }}>Build Your Own Practice</h2>
          <div className="cat-bento-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '14px' }}>
            <div className="cat-bento-hero-1" style={{ ...clayCard, gridColumn: 'span 8', padding: '32px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'center' }}>
              <div><h3 className="font-lora" style={{ fontSize: '20px', fontWeight: 700, color: '#1A2E35', margin: '0 0 10px' }}>Your Own Practice</h3><p style={{ fontSize: '14px', color: '#5A4A42', lineHeight: 1.7, margin: 0 }}>Set your own schedule, clinical approach, and rates. Build long-term therapeutic relationships with your patient panel.</p></div>
              <Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/bento_pp_office.webp" alt="Private practice office" width={280} height={200} style={{ width: '100%', height: 'auto', borderRadius: '14px' }} />
            </div>
            <div className="cat-bento-hero-2" style={{ ...clayCard, gridColumn: 'span 4', padding: '28px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/bento_pp_group.webp" alt="Group practice" width={200} height={140} style={{ width: '100%', maxWidth: '180px', height: 'auto', borderRadius: '12px', marginBottom: '16px' }} />
              <h3 className="font-lora" style={{ fontSize: '17px', fontWeight: 700, color: '#1A2E35', margin: '0 0 8px' }}>Group Practice</h3>
              <p style={{ fontSize: '13px', color: '#5A4A42', lineHeight: 1.6, margin: 0 }}>Join established groups with built-in referral networks.</p>
            </div>
            <div className="cat-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}><Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/icon_pp_autonomy.webp" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} /><h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Autonomy</h3><p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Set your schedule, rates, and clinical approach.</p></div>
            <div className="cat-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}><Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/icon_pp_earning.webp" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} /><h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Top Earnings</h3><p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Private practice PMHNPs earn $200K-$300K+.</p></div>
            <div className="cat-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}><Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/icon_pp_group.webp" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} /><h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Group Practice</h3><p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Join groups with referral networks and shared overhead.</p></div>
            <div className="cat-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}><Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/icon_pp_hybrid.webp" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} /><h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Telehealth Hybrid</h3><p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Combine in-person and virtual sessions.</p></div>
            <div className="cat-bento-hero-3" style={{ ...clayCard, gridColumn: 'span 8', padding: '32px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'center' }}>
              <div><TrendingUp size={28} style={{ color: '#34D399', marginBottom: '12px' }} /><h3 className="font-lora" style={{ fontSize: '20px', fontWeight: 700, color: '#1A2E35', margin: '0 0 10px' }}>Practice Income</h3><p style={{ fontSize: '14px', color: '#5A4A42', lineHeight: 1.7, margin: '0 0 6px' }}>Average private practice salary:</p><p style={{ fontSize: '32px', fontWeight: 800, color: '#1A2E35', margin: 0 }}>${stats.avgSalary}k</p></div>
              <Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/bento_pp_salary.webp" alt="Earning potential" width={280} height={200} style={{ width: '100%', height: 'auto', borderRadius: '14px' }} />
            </div>
            <div className="cat-bento-cta" style={{ ...clayCard, gridColumn: 'span 4', padding: '28px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)' }}>
              <Bell size={32} style={{ color: '#0D9488', marginBottom: '14px' }} /><h3 className="font-lora" style={{ fontSize: '18px', fontWeight: 700, color: '#134E4A', margin: '0 0 10px' }}>Practice Alerts</h3><p style={{ fontSize: '13px', color: '#0D9488', lineHeight: 1.6, margin: '0 0 20px' }}>New practice opportunities daily.</p>
              <Link href="/job-alerts" className="cat-cta-primary" style={{ padding: '12px 28px', borderRadius: '12px', fontWeight: 700, fontSize: '14px', background: '#0D9488', color: '#fff', textDecoration: 'none', boxShadow: '3px 3px 10px rgba(13,148,136,0.2)' }}>Create Alert</Link>
            </div>
          </div>
        </section>
      </div>

      {/* 4. BEFORE YOU APPLY */}
      <div style={{ background: 'linear-gradient(180deg, #FDFBF7 0%, #FFF8F0 50%, #FDFBF7 100%)' }}>
        <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '56px 20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>Before You Apply</p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '40px' }}>What You Need</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
            {[{ n: '01', t: 'PMHNP-BC', d: 'Active certification through ANCC.' }, { n: '02', t: 'Full Practice Authority', d: 'State APRN licensure or collaborating physician agreement.' }, { n: '03', t: 'DEA + NPI', d: 'DEA registration and NPI number for billing.' }, { n: '04', t: 'Malpractice Insurance', d: 'Individual policy required for independent practice.' }].map(item => (
              <div key={item.n} className="cat-bento-card" style={{ ...clayCard, padding: '28px 24px', borderTop: '3px solid #0D9488' }}><span style={{ fontSize: '28px', fontWeight: 800, color: '#CCFBF1' }}>{item.n}</span><h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', marginTop: '12px', marginBottom: '8px' }}>{item.t}</h3><p style={{ fontSize: '13px', color: '#5A4A42', lineHeight: 1.6, margin: 0 }}>{item.d}</p></div>
            ))}
          </div>
        </section>
      </div>

      {/* 5. EXPLORE */}
      <div style={{ background: 'linear-gradient(180deg, #F0FDFA 0%, #E6FAF5 50%, #F0FDFA 100%)' }}>
        <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '56px 20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#E86C2C', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>Keep Exploring</p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '40px' }}>More Categories</h2>
          <div className="cat-explore-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
            {[{ href: '/jobs/outpatient', label: 'Outpatient', sub: 'Clinic-based', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_outpatient.webp' }, { href: '/jobs/telehealth', label: 'Telehealth', sub: 'Virtual care', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_telehealth.webp' }, { href: '/jobs/1099', label: '1099 / Contract', sub: 'Independent work' }, { href: '/jobs/remote', label: 'Remote', sub: 'Work from home', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_remote.webp' }, { href: '/salary-guide', label: 'Salary Guide', sub: '2026 data', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_salary.webp' }, { href: '/jobs/locations', label: 'By Location', sub: '50 states', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_location.webp' }].map(c => (
              <Link key={c.href} href={c.href} className="cat-bento-card" style={{ ...clayCard, padding: '24px 20px', textDecoration: 'none', textAlign: 'center' }}><span style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', display: 'block', marginBottom: '4px' }}>{c.label}</span><span style={{ fontSize: '12px', color: '#7A6A62', display: 'block' }}>{c.sub}</span></Link>
            ))}
          </div>
        </section>
      </div>

      {/* By Location — pseoStats-gated internal links */}

      <CategoryLocationsExplore categorySlug="private-practice" categoryLabel="Private Practice" />


      {/* 6. FAQ */}
      <div style={{ background: 'linear-gradient(180deg, #FDFBF7 0%, #FFF8F0 50%, #FDFBF7 100%)' }}>
        <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '56px 20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>FAQ</p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '40px' }}>Private Practice PMHNP Questions</h2>
          <div style={{ display: 'grid', gap: '16px' }}>{faqs.map((faq, idx) => (<div key={idx} className="cat-bento-card" style={{ ...clayCard, padding: '28px' }}><h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1A2E35', margin: '0 0 10px' }}>{faq.q}</h3><p style={{ fontSize: '14px', color: '#5A4A42', lineHeight: 1.7, margin: 0 }}>{faq.a}</p></div>))}</div>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }) }} />
        </section>
      </div>

      <style>{`
        .cat-cta-primary { transition: transform 0.25s ease, box-shadow 0.25s ease, filter 0.25s ease; }
        .cat-cta-primary:hover { transform: translateY(-3px); box-shadow: 0 10px 32px rgba(13,148,136,0.35) !important; filter: brightness(1.05); }
        .cat-bento-card { transition: transform 0.3s ease, box-shadow 0.3s ease; }
        .cat-bento-card:hover { transform: translateY(-4px); box-shadow: 8px 8px 24px rgba(0,0,0,0.1), -4px -4px 12px rgba(255,255,255,0.9), inset 1px 1px 2px rgba(255,255,255,0.6) !important; }
        @media (max-width: 768px) { .cat-hero-grid { grid-template-columns: 1fr !important; } .cat-bento-grid { grid-template-columns: 1fr !important; } .cat-bento-hero-1, .cat-bento-hero-2, .cat-bento-hero-3, .cat-bento-cta { grid-column: span 1 !important; } .cat-bento-hero-1, .cat-bento-hero-3 { grid-template-columns: 1fr !important; } .cat-bento-grid > div { grid-column: span 1 !important; } .cat-explore-grid { grid-template-columns: repeat(2, 1fr) !important; } }
        @media (min-width: 769px) and (max-width: 1024px) { .cat-bento-grid { grid-template-columns: repeat(6, 1fr) !important; } .cat-bento-hero-1, .cat-bento-hero-3 { grid-column: span 6 !important; } .cat-bento-hero-2, .cat-bento-cta { grid-column: span 6 !important; } .cat-bento-grid > div:not(.cat-bento-hero-1):not(.cat-bento-hero-2):not(.cat-bento-hero-3):not(.cat-bento-cta) { grid-column: span 3 !important; } }
      `}</style>
    </div>
  );
}
