import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { GraduationCap, Sparkles, Users, BookOpen, TrendingUp, Building2, Lightbulb, Bell, Wifi, Video, Plane, Calendar , ArrowRight } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import JobCard from '@/components/JobCard';
import { Job } from '@/lib/types';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import CategoryFAQ from '@/components/CategoryFAQ';
import { JobListViewTracker } from '@/components/analytics/ViewTrackers';

// Force dynamic rendering - don't try to statically generate during build
// force-dynamic removed: it overrides revalidate and defeats ISR caching
/* Design Tokens */
const clayCard: React.CSSProperties = {
  background: '#FFFFFF', borderRadius: '20px',
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

export const revalidate = 3600; // Revalidate every hour

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
 * Fetch new grad jobs with pagination
 */
async function getNewGradJobs(skip: number = 0, take: number = 20) {
    const jobs = await prisma.job.findMany({
        where: {
            isPublished: true,
            OR: [
                { title: { contains: 'new grad', mode: 'insensitive' } },
                { title: { contains: 'new graduate', mode: 'insensitive' } },
                { title: { contains: 'entry level', mode: 'insensitive' } },
                { title: { contains: 'fellowship', mode: 'insensitive' } },
                { title: { contains: 'residency', mode: 'insensitive' } },
                { title: { contains: 'recent graduate', mode: 'insensitive' } },
                { title: { contains: 'training program', mode: 'insensitive' } },
            ],
        },
        orderBy: [
            { isFeatured: 'desc' },
            { createdAt: 'desc' },
        ],
        skip,
        take,
    });

    return jobs;
}

/**
 * Fetch new grad job statistics
 */
async function getNewGradStats() {
    // Total new grad jobs
    const totalJobs = await prisma.job.count({
        where: {
            isPublished: true,
            OR: [
                { title: { contains: 'new grad', mode: 'insensitive' } },
                { title: { contains: 'new graduate', mode: 'insensitive' } },
                { title: { contains: 'entry level', mode: 'insensitive' } },
                { title: { contains: 'fellowship', mode: 'insensitive' } },
                { title: { contains: 'residency', mode: 'insensitive' } },
                { title: { contains: 'recent graduate', mode: 'insensitive' } },
                { title: { contains: 'training program', mode: 'insensitive' } },
            ],
        },
    });

    // Average salary for new grad positions
    const salaryData = await prisma.job.aggregate({
        where: {
            isPublished: true,
            OR: [
                { title: { contains: 'new grad', mode: 'insensitive' } },
                { title: { contains: 'new graduate', mode: 'insensitive' } },
                { title: { contains: 'entry level', mode: 'insensitive' } },
                { title: { contains: 'fellowship', mode: 'insensitive' } },
                { title: { contains: 'residency', mode: 'insensitive' } },
                { title: { contains: 'recent graduate', mode: 'insensitive' } },
                { title: { contains: 'training program', mode: 'insensitive' } },
            ],
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

    // Companies hiring new grads
    const topEmployers = await prisma.job.groupBy({
        by: ['employer'],
        where: {
            isPublished: true,
            OR: [
                { title: { contains: 'new grad', mode: 'insensitive' } },
                { title: { contains: 'new graduate', mode: 'insensitive' } },
                { title: { contains: 'entry level', mode: 'insensitive' } },
                { title: { contains: 'fellowship', mode: 'insensitive' } },
                { title: { contains: 'residency', mode: 'insensitive' } },
                { title: { contains: 'recent graduate', mode: 'insensitive' } },
                { title: { contains: 'training program', mode: 'insensitive' } },
            ],
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

const newGradFaqs = [
  { question: 'Can new grads get PMHNP jobs?', answer: 'Yes! Many employers actively recruit new PMHNP graduates, especially in underserved areas and community health settings.' },
  { question: 'What should new grads expect?', answer: 'Structured onboarding, clinical supervision, mentorship programs, and gradual caseload increase over 3-6 months.' },
  { question: 'What is the starting salary?', answer: 'New grad PMHNPs typically start at $100K-$140K, with rapid increases after the first year of experience.' },
  { question: 'Do I need experience to apply?', answer: 'Clinical rotation hours count as experience. Highlight any psychiatric nursing background and relevant certifications.' },
];

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
    const [stats, params] = await Promise.all([getNewGradStats(), searchParams]);
    const page = parseInt(params.page || '1');

    return {
        title: `${stats.totalJobs} New Grad PMHNP Jobs — Entry-Level Psych NP ($120K-160K)`,
        description: `Find ${stats.totalJobs} new grad PMHNP jobs starting at $120K+. Entry-level psychiatric nurse practitioner positions with mentorship, fellowships, and residency programs. No experience required — start your PMHNP career today.`,
        keywords: ['new grad pmhnp', 'entry level pmhnp', 'pmhnp fellowship', 'new graduate psychiatric nurse practitioner', 'pmhnp residency'],
        openGraph: {
            title: `${stats.totalJobs} New Grad PMHNP Jobs - Entry Level Positions`,
            description: 'Browse new graduate and entry-level psychiatric mental health nurse practitioner positions. Fellowships, residencies, mentorship programs.',
            type: 'website',
            images: [{
                url: `/api/og?type=page&title=${encodeURIComponent(`${stats.totalJobs} New Grad PMHNP Jobs`)}&subtitle=${encodeURIComponent('Entry-level psychiatric NP positions')}`,
                width: 1200,
                height: 630,
                alt: 'New Grad PMHNP Jobs',
            }],
        },
        alternates: {
            canonical: 'https://pmhnphiring.com/jobs/new-grad',
        },
        // Prevent Google from indexing paginated variants as separate pages
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
 * New grad jobs page
 */
export default async function NewGradJobsPage({ searchParams }: PageProps) {
    const params = await searchParams;
    const page = Math.max(1, parseInt(params.page || '1'));
    const limit = 10;
    const skip = (page - 1) * limit;

    const [jobs, stats] = await Promise.all([
        getNewGradJobs(skip, limit),
        getNewGradStats(),
    ]);

    const totalPages = Math.ceil(stats.totalJobs / limit);

    return (
        <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* ═══ HERO ═══ */}
      <section style={{ background: '#c8d6e5', padding: '72px 0 56px' }}>
        <div style={{ maxWidth: '1140px', margin: '0 auto', padding: '0 24px' }}>
          <div className="cat-hero-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: '13px', fontWeight: 700, color: '#134E4A', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '12px' }}>{stats.totalJobs}+ Open Positions</p>
              <h1 className="font-lora" style={{ fontSize: 'clamp(32px, 4.2vw, 48px)', fontWeight: 800, lineHeight: 1.08, color: '#1A2E35', margin: '0 0 20px' }}>New Grad<br /><span style={{ color: '#0D9488' }}>PMHNP Jobs</span></h1>
              <p style={{ fontSize: '16px', color: '#3D2E26', lineHeight: 1.7, margin: '0 0 36px', maxWidth: '440px' }}>Entry-level positions with mentorship, structured onboarding, and clinical supervision.</p>
              <Link href="/jobs?q=new+grad" className="cat-cta-primary" style={{ padding: '16px 40px', borderRadius: '16px', fontWeight: 700, fontSize: '15px', background: '#0D9488', color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '10px', boxShadow: '4px 4px 14px rgba(13,148,136,0.25)' }}>Browse New Grad Jobs <ArrowRight size={17} /></Link>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Image src="/images/categories/hero_v2_newgrad.png" alt="New Grad PMHNP" width={520} height={520} style={{ width: '100%', maxWidth: '500px', height: 'auto' }} priority />
            </div>
          </div>
        </div>
      </section>

      {/* ═══ JOB LISTINGS ═══ */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 20px' }}>
        <div className="grid lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3">
            <h2 className="font-lora mb-6" style={{ fontSize: '20px', fontWeight: 700, color: '#1A2E35' }}>New Grad Positions ({stats.totalJobs})</h2>
            {jobs.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                {jobs.map((job: Job) => (<JobCard key={job.id} job={job} />))}
              </div>
            ) : (
              <div className="text-center py-12"><p>No positions at this time. Check back soon.</p></div>
            )}
            <div style={{ textAlign: 'center', marginTop: '32px' }}>
              <Link href="/jobs?q=new+grad" className="cat-cta-primary" style={{ padding: '14px 32px', borderRadius: '14px', fontWeight: 700, fontSize: '14px', background: '#0D9488', color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px', boxShadow: '4px 4px 12px rgba(13,148,136,0.2)' }}>Browse All New Grad Jobs <ArrowRight size={16} /></Link>
            </div>
          </div>
          <div className="lg:col-span-1">
            <div style={{ ...clayCard, padding: '24px', marginBottom: '20px', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', border: '2px solid rgba(13,148,136,0.15)' }}>
              <Bell size={28} style={{ color: '#0D9488', marginBottom: '12px' }} />
              <h3 className="font-lora" style={{ fontSize: '18px', fontWeight: 700, color: '#134E4A', margin: '0 0 8px' }}>New Grad Alerts</h3>
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
        <section style={{ maxWidth: '1000px', margin: '0 auto', padding: '48px 20px 40px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#E86C2C', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>Why Choose New Grad</p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(26px, 3.5vw, 38px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '48px' }}>Built for New Graduates</h2>
          <div className="cat-bento-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '14px' }}>
            <div className="cat-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <Image src="/images/categories/icon_newgrad_diploma.png" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>New Grad Welcome</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Employers actively seeking newly certified PMHNPs.</p>
            </div>
            <div className="cat-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <Image src="/images/categories/icon_newgrad_bulb.png" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Mentorship</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Structured mentorship with experienced providers.</p>
            </div>
            <div className="cat-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <Image src="/images/categories/icon_newgrad_stairs.png" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Career Growth</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Clear advancement paths from entry to senior roles.</p>
            </div>
            <div className="cat-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <Image src="/images/categories/icon_newgrad_cert.png" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Get Certified</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Support for specialty certifications and CE credits.</p>
            </div>
          </div>
        </section>
      </div>

      {/* ═══ BEFORE YOU APPLY ═══ */}
      <div style={{ background: 'linear-gradient(180deg, #FDFBF7 0%, #FFF8F0 50%, #FDFBF7 100%)' }}>
        <section style={{ maxWidth: '1000px', margin: '0 auto', padding: '56px 20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>Before You Apply</p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '40px' }}>What You Need to Know</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
            <div className="cat-bento-card" style={{ ...clayCard, padding: '28px 24px', borderTop: '3px solid #0D9488' }}>
              <span style={{ fontSize: '28px', fontWeight: 800, color: '#CCFBF1', display: 'block', marginBottom: '12px' }}>01</span>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', marginBottom: '8px' }}>ANCC Certification</h3>
              <p style={{ fontSize: '13px', color: '#5A4A42', lineHeight: 1.6, margin: 0 }}>Complete your PMHNP-BC certification before applying.</p>
            </div>
            <div className="cat-bento-card" style={{ ...clayCard, padding: '28px 24px', borderTop: '3px solid #0D9488' }}>
              <span style={{ fontSize: '28px', fontWeight: 800, color: '#CCFBF1', display: 'block', marginBottom: '12px' }}>02</span>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', marginBottom: '8px' }}>State Licensure</h3>
              <p style={{ fontSize: '13px', color: '#5A4A42', lineHeight: 1.6, margin: 0 }}>Obtain APRN licensure and prescriptive authority.</p>
            </div>
            <div className="cat-bento-card" style={{ ...clayCard, padding: '28px 24px', borderTop: '3px solid #0D9488' }}>
              <span style={{ fontSize: '28px', fontWeight: 800, color: '#CCFBF1', display: 'block', marginBottom: '12px' }}>03</span>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', marginBottom: '8px' }}>Clinical Hours</h3>
              <p style={{ fontSize: '13px', color: '#5A4A42', lineHeight: 1.6, margin: 0 }}>Document your rotation hours and specialty experience.</p>
            </div>
            <div className="cat-bento-card" style={{ ...clayCard, padding: '28px 24px', borderTop: '3px solid #0D9488' }}>
              <span style={{ fontSize: '28px', fontWeight: 800, color: '#CCFBF1', display: 'block', marginBottom: '12px' }}>04</span>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', marginBottom: '8px' }}>References</h3>
              <p style={{ fontSize: '13px', color: '#5A4A42', lineHeight: 1.6, margin: 0 }}>Secure references from clinical preceptors and advisors.</p>
            </div>
          </div>
        </section>
      </div>

      {/* ═══ EXPLORE MORE ═══ */}
      <div style={{ background: 'linear-gradient(180deg, #F0FDFA 0%, #E6FAF5 50%, #F0FDFA 100%)' }}>
        <section style={{ maxWidth: '1000px', margin: '0 auto', padding: '56px 20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#E86C2C', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>Keep Exploring</p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '40px' }}>More Ways to Find Your Next Role</h2>
          <div className="cat-explore-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
            {[
              { href: '/jobs/remote', label: 'Remote', sub: 'Work from home', emoji: '🏠' },
              { href: '/jobs/telehealth', label: 'Telehealth', sub: 'Virtual care', emoji: '💻' },
              { href: '/jobs/inpatient', label: 'Inpatient', sub: 'Hospital roles', emoji: '🏥' },
              { href: '/jobs/outpatient', label: 'Outpatient', sub: 'Clinic-based', emoji: '🏢' },
              { href: '/salary-guide', label: 'Salary Guide', sub: '2026 comp data', emoji: '💰' },
              { href: '/jobs/locations', label: 'By Location', sub: 'All 50 states', emoji: '📍' },
            ].map(c => (
              <Link key={c.href} href={c.href} className="cat-bento-card" style={{ ...clayCard, padding: '24px 20px', textDecoration: 'none', display: 'block', textAlign: 'center' }}>
                <span style={{ fontSize: '32px', display: 'block', marginBottom: '12px' }}>{c.emoji}</span>
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', display: 'block', marginBottom: '4px' }}>{c.label}</span>
                <span style={{ fontSize: '12px', color: '#7A6A62', display: 'block' }}>{c.sub}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* ═══ FAQ ═══ */}
      <div style={{ background: 'linear-gradient(180deg, #FDFBF7 0%, #FFF8F0 50%, #FDFBF7 100%)' }}>
        <section style={{ maxWidth: '1000px', margin: '0 auto', padding: '56px 20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>FAQ</p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '40px' }}>New Grad PMHNP Questions</h2>
          <div style={{ display: 'grid', gap: '16px' }}>
            {newGradFaqs.map((faq, idx) => (
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
        @media (max-width: 768px) {
          .cat-hero-grid { grid-template-columns: 1fr !important; }
          .cat-bento-grid { grid-template-columns: 1fr !important; }
          .cat-bento-grid > div { grid-column: span 1 !important; }
          .cat-explore-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (min-width: 769px) and (max-width: 1024px) {
          .cat-bento-grid { grid-template-columns: repeat(6, 1fr) !important; }
          .cat-bento-grid > div { grid-column: span 3 !important; }
        }
      `}</style>
    </div>
  );
}
