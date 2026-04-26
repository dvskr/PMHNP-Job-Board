import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import VideoJsonLd from '@/components/VideoJsonLd';
import HomepageHero from '@/components/HomepageHero';
import FeaturedJobsSection from '@/components/FeaturedJobsSection';
import { prisma } from '@/lib/prisma';
import {
  ArrowRight, Search, Users, Briefcase, MapPin,
  Check, X, Star,
} from 'lucide-react';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'For Job Seekers — Find Your Next PMHNP Role | PMHNP Hiring',
  description:
    'Find your next PMHNP opportunity. Search 9,000+ remote and in-person psychiatric nurse practitioner jobs with salary transparency, AI matching, and one-click apply. 100% free for job seekers.',
  openGraph: {
    images: [{ url: '/images/pages/pmhnp-job-seeker-career-resources.webp', width: 1280, height: 900, alt: 'PMHNP job seeker career resources' }],
  },
  twitter: { card: 'summary_large_image', images: ['/images/pages/pmhnp-job-seeker-career-resources.webp'] },
  alternates: { canonical: 'https://pmhnphiring.com/for-job-seekers' },
};

/* ═══ Design Tokens ═══ */
const clayCard: React.CSSProperties = {
  background: '#FFFFFF', borderRadius: '20px',
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

async function getStats() {
  try {
    const [totalJobs, remoteJobs, stateCount, totalCompanies] = await Promise.all([
      prisma.job.count({ where: { isPublished: true } }),
      prisma.job.count({ where: { isPublished: true, isRemote: true } }),
      prisma.job.groupBy({ by: ['state'], where: { isPublished: true, state: { not: null } } }).then(r => r.length),
      prisma.job.groupBy({ by: ['employer'], where: { isPublished: true } }).then(r => r.length),
    ]);
    return { totalJobs, remoteJobs, stateCount, totalCompanies };
  } catch {
    return { totalJobs: 9000, remoteJobs: 2000, stateCount: 50, totalCompanies: 4000 };
  }
}

const comparisonRows: { feature: string; us: true | false | 'partial'; indeed: true | false | 'partial'; linkedin: true | false | 'partial'; note?: string }[] = [
  { feature: '100% PMHNP-Only Jobs', us: true, indeed: false, linkedin: false },
  { feature: 'Salary Transparency on Every Listing', us: true, indeed: false, linkedin: false, note: 'Others hide salary' },
  { feature: 'Completely Free for Job Seekers', us: true, indeed: true, linkedin: 'partial', note: 'LinkedIn: premium features cost' },
  { feature: 'AI Match Scoring', us: true, indeed: false, linkedin: false },
  { feature: 'One-Click Direct Apply', us: true, indeed: true, linkedin: true },
  { feature: '50-State Licensure Guides', us: true, indeed: false, linkedin: false },
  { feature: 'State-by-State Salary Data', us: true, indeed: 'partial', linkedin: false },
  { feature: 'Save & Track Applications', us: true, indeed: true, linkedin: true },
  { feature: 'AI Resume Parser', us: true, indeed: false, linkedin: false },
  { feature: 'Zero Spam or Recruiter Noise', us: true, indeed: false, linkedin: false },
];

export default async function ForJobSeekersPage() {
  const stats = await getStats();
  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${n}`;
  const jobCountDisplay = stats.totalJobs > 1000
    ? `${Math.floor(stats.totalJobs / 100) * 100}+`
    : stats.totalJobs.toLocaleString();

  return (
    <>
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://pmhnphiring.com' },
        { name: 'For Job Seekers', url: 'https://pmhnphiring.com/for-job-seekers' },
      ]} />
      <VideoJsonLd pathname="/for-job-seekers" />

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 1: HERO — Reuse HomepageHero (3D nurse background)
          ═══════════════════════════════════════════════════════════════ */}
      <div style={{ background: 'linear-gradient(180deg, #FDFBF7 0%, #F5D5C4 15%, #F0C4AF 50%, #FDFBF7 100%)' }}>
        <HomepageHero jobCountDisplay={jobCountDisplay} />
      </div>

      {/* ═══ FEATURED JOBS ═══ */}
      <FeaturedJobsSection />

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 4: BENTO FEATURES — What You Get (warm cream)
          ═══════════════════════════════════════════════════════════════ */}
      <div style={{ background: 'linear-gradient(180deg, #FDFBF7 0%, #FFF8F0 50%, #FDFBF7 100%)' }}>
        <section style={{ maxWidth: '1000px', margin: '0 auto', padding: '80px 20px 56px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
            100% Free · No Hidden Fees
          </p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(26px, 3.5vw, 38px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '8px' }}>
            Everything You Need — For Free
          </h2>
          <p style={{ fontSize: '15px', color: '#5A4A42', textAlign: 'center', maxWidth: '480px', margin: '0 auto 48px', lineHeight: 1.6 }}>
            Every feature, every tool, every resource — completely free for PMHNP job seekers.
          </p>

          {/* Bento Grid */}
          <div className="seeker-bento" style={{
            display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gridTemplateRows: 'auto', gap: '14px',
          }}>
            {/* ROW 1: AI Matching (8 cols) + Salary Data (4 cols) */}
            <div className="seeker-bento-hero-1 emp-bento-card" style={{
              ...clayCard, gridColumn: 'span 8', padding: '0', overflow: 'hidden',
              display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center',
            }}>
              <div style={{ padding: '32px 28px' }}>
                <Image src="/images/job-seekers/icon-ai-match.png" alt="" width={56} height={56} style={{ width: '56px', height: '56px', objectFit: 'contain', marginBottom: '16px' }} />
                <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#1A2E35', margin: '0 0 8px' }}>AI Match Scoring</h3>
                <p style={{ fontSize: '14px', color: '#5A4A42', margin: 0, lineHeight: 1.6 }}>
                  Every job gets a 0–100 match score based on your license, specialty, experience, location, and salary preferences.
                </p>
              </div>
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', padding: '16px' }}>
                <Image src="/images/job-seekers/bento-match.png" alt="AI match scoring" width={280} height={200} style={{ width: '100%', maxWidth: '280px', height: 'auto', borderRadius: '12px' }} />
              </div>
            </div>

            <div className="seeker-bento-hero-2 emp-bento-card" style={{
              ...clayCard, gridColumn: 'span 4', padding: '0', overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ flex: '0 0 auto', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Image src="/images/job-seekers/bento-salary.png" alt="Salary transparency" width={200} height={140} style={{ width: '100%', maxWidth: '200px', height: 'auto', borderRadius: '10px' }} />
              </div>
              <div style={{ padding: '24px 22px', flex: 1 }}>
                <Image src="/images/job-seekers/icon-salary.png" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', marginBottom: '12px' }} />
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#1A2E35', margin: '0 0 6px' }}>Salary Transparency</h3>
                <p style={{ fontSize: '12.5px', color: '#7A6A62', margin: 0, lineHeight: 1.5 }}>
                  See salary ranges on every listing. No guessing, no surprises, no &quot;DOE.&quot;
                </p>
              </div>
            </div>

            {/* ROW 2: 4 compact cards (3 cols each) */}
            <div className="emp-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <Image src="/images/job-seekers/icon-alerts.png" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Daily Job Alerts</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>New jobs matching your criteria — delivered to your inbox daily.</p>
            </div>

            <div className="emp-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <Image src="/images/job-seekers/icon-tracking.png" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Application Tracking</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Track every application status from Applied to Hired.</p>
            </div>

            <div className="emp-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <Image src="/images/job-seekers/icon-resume.png" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>AI Resume Parser</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Upload your resume — AI fills your profile instantly.</p>
            </div>

            <div className="emp-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <Image src="/images/job-seekers/icon-save.png" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Save & Compare</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Bookmark jobs, compare benefits, decide on your terms.</p>
            </div>

            {/* ROW 3: Licensure Guides (8 cols) + Free Forever (4 cols) */}
            <div className="seeker-bento-hero-3 emp-bento-card" style={{
              ...clayCard, gridColumn: 'span 8', padding: '0', overflow: 'hidden',
              display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center',
            }}>
              <div style={{ padding: '32px 28px' }}>
                <Image src="/images/job-seekers/icon-licensure.png" alt="" width={56} height={56} style={{ width: '56px', height: '56px', objectFit: 'contain', marginBottom: '16px' }} />
                <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#1A2E35', margin: '0 0 8px' }}>50-State Licensure Guides</h3>
                <p style={{ fontSize: '14px', color: '#5A4A42', margin: 0, lineHeight: 1.6 }}>
                  Requirements, board links, practice authority, salary data, and step-by-step instructions for every state.
                </p>
              </div>
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(145deg, #FFF7ED, #FFEDD5)', padding: '16px' }}>
                <Image src="/images/job-seekers/bento-guides.png" alt="50-state licensure guides" width={280} height={200} style={{ width: '100%', maxWidth: '280px', height: 'auto', borderRadius: '12px' }} />
              </div>
            </div>

            <div className="seeker-bento-free emp-bento-card" style={{
              ...clayCard, gridColumn: 'span 4',
              padding: '28px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center',
              background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)',
              border: '2px solid rgba(13,148,136,0.15)',
            }}>
              <Image src="/images/job-seekers/icon-free.png" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', marginBottom: '14px' }} />
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#134E4A', margin: '0 0 6px' }}>Free Forever</h3>
              <p style={{ fontSize: '13px', color: '#0D9488', margin: '0 0 16px', lineHeight: 1.6, fontWeight: 500 }}>
                No subscriptions. No premium tiers.<br />
                Every feature is free for job seekers.
              </p>
              <Link href="/jobs" className="seeker-cta-primary" style={{
                padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '13px',
                background: '#0D9488', color: '#fff', textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: '6px', width: 'fit-content',
                boxShadow: '3px 3px 8px rgba(13,148,136,0.15)',
              }}>
                Start Searching <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </section>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 5: EXPLORE JOB TYPES (warm peach)
          ═══════════════════════════════════════════════════════════════ */}
      <section style={{ background: 'linear-gradient(180deg, #FDE8D8 0%, #F5D0B5 40%, #FDE8D8 100%)', padding: '80px 20px' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
            Explore Opportunities
          </p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(26px, 3.5vw, 36px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '8px' }}>
            Find Your Ideal Work Setting
          </h2>
          <p style={{ fontSize: '15px', color: '#5A4A42', textAlign: 'center', maxWidth: '440px', margin: '0 auto 44px', lineHeight: 1.6 }}>
            From telehealth to private practice — we cover every practice setting.
          </p>

          <div className="seeker-types-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
            {[
              { title: 'Remote / Telehealth', desc: 'Work from anywhere with telepsychiatry', href: '/jobs?mode=Remote', img: '/images/job-seekers/remote-telehealth.png' },
              { title: 'In-Person Clinical', desc: 'Hospital, clinic, and outpatient roles', href: '/jobs?mode=In-Person', img: '/images/job-seekers/clinical-inperson.png' },
              { title: 'Private Practice', desc: 'Start or join a psychiatric practice', href: '/resources/private-practice-guide', img: '/images/job-seekers/private-practice.png' },
              { title: 'Part-Time / PRN', desc: 'Flexible schedules and per diem', href: '/jobs?jobType=Part-Time', img: '/images/job-seekers/parttime-prn.png' },
            ].map(t => (
              <Link key={t.title} href={t.href} className="emp-bento-card" style={{
                ...clayCard, padding: '0', overflow: 'hidden', textDecoration: 'none', display: 'block',
              }}>
                <div style={{ position: 'relative', aspectRatio: '4/3', overflow: 'hidden' }}>
                  <Image src={t.img} alt={t.title} fill className="object-cover" sizes="(max-width: 768px) 50vw, 25vw" />
                </div>
                <div style={{ padding: '20px 18px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>{t.title}</h3>
                  <p style={{ fontSize: '12px', color: '#7A6A62', margin: '0 0 10px', lineHeight: 1.5 }}>{t.desc}</p>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#0D9488' }}>Explore →</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 6: COMPARISON TABLE + CTA (slate)
          ═══════════════════════════════════════════════════════════════ */}
      <section style={{ background: 'linear-gradient(180deg, #F1F5F9 0%, #E8EDF2 50%, #F1F5F9 100%)', padding: '80px 20px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
            Why Switch
          </p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(26px, 3.5vw, 36px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '8px' }}>
            How We Compare
          </h2>
          <p style={{ fontSize: '15px', color: '#5A4A42', textAlign: 'center', maxWidth: '440px', margin: '0 auto 44px', lineHeight: 1.6 }}>
            Built exclusively for PMHNPs — not a generic job board.
          </p>

          <div className="seeker-compare-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '24px', alignItems: 'start' }}>
            {/* Comparison Table */}
            <div className="seeker-compare-table" style={{ ...clayCard, padding: '0', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', tableLayout: 'fixed' }}>
                <thead>
                  <tr style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.08), rgba(13,148,136,0.02))' }}>
                    <th style={{ width: '40%', padding: '16px 24px', textAlign: 'left', fontWeight: 600, color: '#64748B', borderBottom: '2px solid rgba(0,0,0,0.06)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Feature</th>
                    <th style={{ width: '20%', padding: '16px 16px', textAlign: 'center', fontWeight: 800, color: '#0D9488', borderBottom: '2px solid rgba(13,148,136,0.2)', fontSize: '12px' }}>PMHNP Hiring</th>
                    <th style={{ width: '20%', padding: '16px 16px', textAlign: 'center', fontWeight: 600, color: '#94A3B8', borderBottom: '2px solid rgba(0,0,0,0.06)', fontSize: '12px' }}>Indeed</th>
                    <th style={{ width: '20%', padding: '16px 16px', textAlign: 'center', fontWeight: 600, color: '#94A3B8', borderBottom: '2px solid rgba(0,0,0,0.06)', fontSize: '12px' }}>LinkedIn</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row, i) => {
                    const renderCell = (val: true | false | 'partial', isUs: boolean) => {
                      if (val === true) return <Check size={16} style={{ color: isUs ? '#0D9488' : '#94A3B8', display: 'block', margin: '0 auto' }} />;
                      if (val === 'partial') return <span style={{ fontSize: '11px', color: '#F59E0B', fontWeight: 600 }}>Partial</span>;
                      return <X size={16} style={{ color: '#D1D5DB', display: 'block', margin: '0 auto' }} />;
                    };
                    return (
                      <tr key={row.feature} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)' }}>
                        <td style={{ padding: '12px 24px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                          <span style={{ color: '#1A2E35', fontWeight: 500 }}>{row.feature}</span>
                          {row.note && <span style={{ display: 'block', fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>{row.note}</span>}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center', borderBottom: '1px solid rgba(0,0,0,0.04)', background: 'rgba(13,148,136,0.03)' }}>
                          {renderCell(row.us, true)}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                          {renderCell(row.indeed, false)}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                          {renderCell(row.linkedin, false)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* CTA Card */}
            <div style={{
              ...clayCard, padding: '0', overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{
                background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)',
                padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Image
                  src="/images/job-seekers/cta-dream-role.png"
                  alt="Start your PMHNP job search"
                  width={280} height={220}
                  style={{ width: '100%', maxWidth: '260px', height: 'auto', borderRadius: '14px' }}
                />
              </div>
              <div style={{ padding: '28px 24px' }}>
                <h3 className="font-lora" style={{ fontSize: '20px', fontWeight: 700, color: '#1A2E35', margin: '0 0 10px' }}>
                  Ready to Find Your{' '}
                  <span style={{ color: '#0D9488' }}>Dream Role</span>?
                </h3>
                <p style={{ fontSize: '13px', color: '#5A4A42', lineHeight: 1.6, margin: '0 0 20px' }}>
                  100% free. No sign-up required to browse. Create a profile to apply and get matched.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <Link href="/jobs" className="seeker-cta-primary" style={{
                    padding: '12px 24px', borderRadius: '12px', fontWeight: 700, fontSize: '14px',
                    background: 'linear-gradient(145deg, #0D9488, #10B981)', color: '#fff',
                    textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    boxShadow: '4px 4px 12px rgba(13,148,136,0.2), inset 1px 1px 2px rgba(255,255,255,0.15)',
                  }}>
                    Browse Jobs <ArrowRight size={15} />
                  </Link>
                  <Link href="/salary-guide" className="seeker-cta-secondary" style={{
                    padding: '12px 24px', borderRadius: '12px', fontWeight: 600, fontSize: '14px',
                    background: '#fff', color: '#1A2E35', textDecoration: 'none',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    border: '1px solid rgba(0,0,0,0.08)', boxShadow: '2px 2px 6px rgba(0,0,0,0.04)',
                  }}>
                    <Star size={14} /> Salary Guide
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 7: CAREER RESOURCES (clay cards on warm bg)
          ═══════════════════════════════════════════════════════════════ */}
      <section style={{ background: 'linear-gradient(180deg, #FFF5EE 0%, #FDE8D8 50%, #FFF5EE 100%)', padding: '80px 20px' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#E86C2C', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
            Career Resources
          </p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(26px, 3.5vw, 36px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '8px' }}>
            Tools Built for Your PMHNP Career
          </h2>
          <p style={{ fontSize: '15px', color: '#5A4A42', textAlign: 'center', maxWidth: '450px', margin: '0 auto 44px', lineHeight: 1.6 }}>
            Research salaries, check licensure requirements, and plan your next move — all in one place.
          </p>

          <div className="seeker-resource-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            {[
              {
                title: '2026 PMHNP Salary Guide',
                desc: 'State-by-state salary data, experience-based ranges, and negotiation strategies. See what PMHNPs actually earn.',
                href: '/salary-guide',
                icon: '/images/job-seekers/icon-salary.png',
                gradient: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)',
                cta: 'View Salary Data',
              },
              {
                title: '50-State Licensure Guides',
                desc: 'Step-by-step requirements, board links, practice authority status, and processing times for every state.',
                href: '/resources',
                icon: '/images/job-seekers/icon-licensure.png',
                gradient: 'linear-gradient(145deg, #FFF7ED, #FFEDD5)',
                cta: 'Check Your State',
              },
              {
                title: 'PMHNP Career Blog',
                desc: 'Interview tips, resume advice, CE requirements, and industry trends — written by PMHNPs, for PMHNPs.',
                href: '/blog',
                icon: '/images/job-seekers/icon-blog.png',
                gradient: 'linear-gradient(145deg, #EEF2FF, #E0E7FF)',
                cta: 'Read Articles',
              },
              {
                title: 'Full Practice Authority Guide',
                desc: 'Which states let you practice independently? Understand FPA, reduced, and restricted practice levels.',
                href: '/resources/fpa-guide',
                icon: '/images/job-seekers/icon-fpa.png',
                gradient: 'linear-gradient(145deg, #FFFBEB, #FEF3C7)',
                cta: 'Learn About FPA',
              },
            ].map(r => (
              <Link key={r.title} href={r.href} className="emp-bento-card" style={{
                ...clayCard, padding: '0', overflow: 'hidden', textDecoration: 'none',
                display: 'grid', gridTemplateColumns: '100px 1fr', alignItems: 'center',
              }}>
                <div style={{ background: r.gradient, padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <Image src={r.icon} alt="" width={56} height={56} style={{ width: '56px', height: '56px', objectFit: 'contain' }} />
                </div>
                <div style={{ padding: '20px 22px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>{r.title}</h3>
                  <p style={{ fontSize: '12.5px', color: '#7A6A62', margin: '0 0 10px', lineHeight: 1.55 }}>{r.desc}</p>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#0D9488', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    {r.cta} <ArrowRight size={12} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Responsive overrides ═══ */}
      <style>{`
        .seeker-cta-primary {
          transition: transform 0.25s ease, box-shadow 0.25s ease, filter 0.25s ease;
        }
        .seeker-cta-primary:hover {
          transform: translateY(-3px);
          box-shadow: 0 10px 32px rgba(13,148,136,0.35), inset 1px 1px 2px rgba(255,255,255,0.2) !important;
          filter: brightness(1.05);
        }
        .seeker-cta-secondary {
          transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
        }
        .seeker-cta-secondary:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0,0,0,0.08) !important;
          border-color: rgba(13,148,136,0.3) !important;
        }
        .seeker-stat-pill {
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .seeker-stat-pill:hover {
          transform: translateY(-2px) scale(1.02);
          box-shadow: 6px 6px 20px rgba(0,0,0,0.1), -3px -3px 10px rgba(255,255,255,0.9) !important;
        }
        .seeker-compare-table tr {
          transition: background 0.2s ease;
        }
        .seeker-compare-table tbody tr:hover {
          background: rgba(13,148,136,0.04) !important;
        }

        @media (max-width: 768px) {
          .seeker-compare-grid { grid-template-columns: 1fr !important; }
          .seeker-types-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .seeker-resource-grid { grid-template-columns: 1fr !important; }
          .seeker-bento { grid-template-columns: 1fr !important; }
          .seeker-bento-hero-1, .seeker-bento-hero-2, .seeker-bento-hero-3, .seeker-bento-free {
            grid-column: span 1 !important;
          }
          .seeker-bento-hero-1, .seeker-bento-hero-3 {
            grid-template-columns: 1fr !important;
          }
          .seeker-bento > div { grid-column: span 1 !important; }
        }
        @media (min-width: 769px) and (max-width: 1024px) {
          .seeker-bento { grid-template-columns: repeat(6, 1fr) !important; }
          .seeker-bento-hero-1, .seeker-bento-hero-3 { grid-column: span 6 !important; }
          .seeker-bento-hero-2, .seeker-bento-free { grid-column: span 6 !important; }
          .seeker-bento > div:not(.seeker-bento-hero-1):not(.seeker-bento-hero-2):not(.seeker-bento-hero-3):not(.seeker-bento-free) {
            grid-column: span 3 !important;
          }
          .seeker-types-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </>
  );
}
