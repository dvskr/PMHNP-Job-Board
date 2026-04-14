import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import { config } from '@/lib/config';
import { prisma } from '@/lib/prisma';
import {
  Check, Sparkles, Crown, ArrowRight, Users, TrendingUp, BarChart,
  Target, Clock, DollarSign, Mail, Briefcase,
  X, Search, Building2, ArrowUpRight,
} from 'lucide-react';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'For Employers — Hire PMHNPs | PMHNP Job Board',
  description:
    'Hire qualified Psychiatric Mental Health Nurse Practitioners. First 2 posts free — all features included. Reach thousands of PMHNPs actively searching. Simple pricing, real results.',
  openGraph: {
    images: [{ url: '/images/pages/pmhnp-employer-hiring-solutions.webp', width: 1280, height: 900, alt: 'PMHNP employer hiring solutions' }],
  },
  twitter: { card: 'summary_large_image', images: ['/images/pages/pmhnp-employer-hiring-solutions.webp'] },
  alternates: { canonical: 'https://pmhnphiring.com/for-employers' },
};

/* ═══ Design Tokens — matched to homepage ═══ */
const clayCard: React.CSSProperties = {
  background: '#FFFFFF', borderRadius: '20px',
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

const clayIconWrap = (gradient: string): React.CSSProperties => ({
  width: '44px', height: '44px', borderRadius: '14px',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: gradient,
  boxShadow: '4px 4px 10px rgba(0,0,0,0.08), inset 1px 1px 2px rgba(255,255,255,0.2)',
  flexShrink: 0,
});

async function getEmployerStats() {
  try {
    const [totalJobs, totalSubscribers, totalCompanies] = await Promise.all([
      prisma.job.count({ where: { isPublished: true } }),
      prisma.emailLead.count({ where: { isSubscribed: true } }),
      prisma.job.groupBy({ by: ['employer'], where: { isPublished: true } }).then((r) => r.length),
    ]);
    return { totalJobs, totalSubscribers, totalCompanies };
  } catch {
    return { totalJobs: 0, totalSubscribers: 0, totalCompanies: 0 };
  }
}

const comparisonRows = [
  { feature: 'PMHNP-Only Audience', us: true, indeed: false, linkedin: false },
  { feature: 'Only Qualified PMHNPs Apply', us: true, indeed: false, linkedin: false },
  { feature: 'First 2 Posts Free', us: true, indeed: false, linkedin: false },
  { feature: 'Daily Job Alert Emails', us: true, indeed: false, linkedin: true },
  { feature: 'SEO-Optimized Listing', us: true, indeed: false, linkedin: false },
  { feature: 'Salary Transparency', us: true, indeed: false, linkedin: false },
  { feature: 'Candidate Database', us: true, indeed: true, linkedin: true },
  { feature: 'Flat-Rate Pricing', us: true, indeed: false, linkedin: true },
];

export default async function ForEmployersPage() {
  const stats = await getEmployerStats();
  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${n}`;

  return (
    <>
      <BreadcrumbSchema items={[{ name: 'Home', url: 'https://pmhnphiring.com' }, { name: 'For Employers', url: 'https://pmhnphiring.com/for-employers' }]} />

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 1: HERO + STATS
          ═══════════════════════════════════════════════════════════════ */}
      <section style={{ background: '#F0BFB5', padding: '64px 0 56px' }}>
        <div style={{ maxWidth: '1140px', margin: '0 auto', padding: '0 24px' }}>
          <div className="emp-hero-grid" style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: '40px', alignItems: 'center' }}>
            {/* Left — Text Content */}
            <div>
              <h1 className="font-lora" style={{
                fontSize: 'clamp(32px, 4.2vw, 48px)', fontWeight: 800, lineHeight: 1.08,
                color: '#1A2E35', margin: '0 0 20px',
              }}>
                The #1 Job Board Built<br />
                <span style={{ color: '#0D9488' }}>Exclusively</span>{' '}
                for PMHNPs
              </h1>

              <p style={{
                fontSize: '16.5px', color: '#3D2E26', lineHeight: 1.75,
                margin: '0 0 36px', maxWidth: '460px', fontWeight: 400,
              }}>
                Reach thousands of psychiatric nurse practitioners actively searching for their next role. Every candidate is a qualified PMHNP — zero noise, maximum relevance.
              </p>

              {/* CTA Buttons */}
              <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
                <Link href="/post-job" className="clay-btn" style={{
                  padding: '16px 36px', borderRadius: '16px', fontWeight: 700, fontSize: '15px',
                  background: '#0D9488', color: '#fff',
                  textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '10px',
                }}>
                  Post a Job — First 2 Free <ArrowRight size={17} />
                </Link>
                <Link href="/pricing" className="clay-btn" style={{
                  padding: '16px 36px', borderRadius: '16px', fontWeight: 600, fontSize: '15px',
                  background: '#FFFFFF',
                  color: '#1A2E35', textDecoration: 'none',
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                }}>
                  View Pricing
                </Link>
              </div>
            </div>

            {/* Right — Illustration */}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
              <Image
                src="/images/employers/hero-v4.png"
                alt="Employer posting job and receiving qualified PMHNP candidates"
                width={520} height={520}
                style={{ width: '100%', maxWidth: '520px', height: 'auto' }}
                priority
              />
            </div>
          </div>

          {/* Stats — Real Data */}
          <div className="emp-stats-grid" style={{
            display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap',
            marginTop: '48px',
          }}>
            {[
              { value: fmt(stats.totalJobs), label: 'Active Jobs', icon: Search, bg: '#D4F5E9', iconBg: '#34D399', color: '#065F46' },
              { value: fmt(stats.totalSubscribers), label: 'Job Seekers', icon: Users, bg: '#FFE0D3', iconBg: '#F97316', color: '#7C2D12' },
              { value: fmt(stats.totalCompanies), label: 'Hiring Companies', icon: Building2, bg: '#E8DAFE', iconBg: '#A855F7', color: '#4C1D95' },
            ].map(s => {
              const SIcon = s.icon;
              return (
                <div key={s.label} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '10px',
                  padding: '10px 20px 10px 10px', borderRadius: '40px',
                  background: s.bg,
                  boxShadow: '4px 4px 12px rgba(0,0,0,0.05), -2px -2px 6px rgba(255,255,255,0.6), inset 1px 1px 2px rgba(255,255,255,0.5)',
                }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%',
                    background: s.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '2px 2px 6px rgba(0,0,0,0.1), inset 1px 1px 2px rgba(255,255,255,0.3)',
                  }}>
                    <SIcon size={16} color="#fff" />
                  </div>
                  <div>
                    <span style={{ fontSize: '18px', fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}+</span>
                    <span style={{ fontSize: '12px', color: s.color, opacity: 0.7, marginLeft: '6px', fontWeight: 500 }}>{s.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 2: HOW IT WORKS (dark band)
          ═══════════════════════════════════════════════════════════════ */}
      <section style={{
        background: 'linear-gradient(175deg, #2A0E1E 0%, #3A1228 35%, #220B18 100%)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Ambient glow decorations */}
        <div style={{
          position: 'absolute', top: '-200px', left: '-100px', width: '500px', height: '500px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(220,120,140,0.06) 0%, transparent 70%)', pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: '-150px', right: '-80px', width: '400px', height: '400px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(180,100,160,0.05) 0%, transparent 70%)', pointerEvents: 'none',
        }} />

        <div style={{ maxWidth: '1140px', margin: '0 auto', padding: '72px 20px', position: 'relative', zIndex: 1 }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#e8788c', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '12px', textAlign: 'center' }}>
            Built for Hiring Managers
          </p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 700, color: '#fff', textAlign: 'center', margin: '0 0 12px' }}>
            How It Works
          </h2>
          <p style={{ fontSize: '15px', color: 'rgba(248,232,236,0.5)', textAlign: 'center', maxWidth: '420px', margin: '0 auto 48px', lineHeight: 1.6 }}>
            Three simple steps to find your next PMHNP hire.
          </p>

          <div className="emp-steps-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '48px', alignItems: 'center' }}>
            {/* Left — Illustration */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Image
                src="/images/employers/how-it-works.png"
                alt="Three stages of posting a PMHNP job listing"
                width={440} height={360}
                style={{ width: '100%', maxWidth: '440px', height: 'auto', borderRadius: '20px' }}
              />
            </div>

            {/* Right — 3 Steps */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {[
                { num: '1', title: 'Create Your Listing', desc: 'Fill out the simple job posting form with your requirements, salary details, and application info. Takes under 5 minutes.', gradient: 'linear-gradient(135deg, #e8788c, #c05a7a)' },
                { num: '2', title: 'Preview & Publish', desc: 'Review your posting with our live preview, then publish instantly. Your listing goes live immediately and is included in the next daily job alert.', gradient: 'linear-gradient(135deg, #c05a7a, #a8456a)' },
                { num: '3', title: 'Receive Candidates', desc: 'Track views, apply clicks, and applications from your employer dashboard. Only verified PMHNPs see your listing — zero noise.', gradient: 'linear-gradient(135deg, #a8456a, #e8788c)' },
              ].map(({ num, title, desc, gradient }) => (
                <div key={num} style={{
                  padding: '24px', display: 'flex', gap: '16px', alignItems: 'flex-start',
                  background: 'rgba(255,255,255,0.04)', borderRadius: '16px',
                  border: '1px solid rgba(220,120,140,0.1)',
                }}>
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: gradient, boxShadow: '0 0 12px rgba(220,120,140,0.3)',
                    fontSize: '16px', fontWeight: 800, color: '#fff',
                  }}>
                    {num}
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#f8e8ec', margin: '0 0 6px' }}>{title}</h3>
                    <p style={{ fontSize: '13px', color: 'rgba(248,232,236,0.4)', margin: 0, lineHeight: 1.6 }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CTA in dark section */}
          <div style={{ textAlign: 'center', marginTop: '48px' }}>
            <Link href="/post-job" style={{
              display: 'inline-flex', alignItems: 'center', gap: '10px',
              padding: '13px 32px', fontSize: '13px', fontWeight: 700, color: '#fff',
              textTransform: 'uppercase', letterSpacing: '0.08em',
              background: 'linear-gradient(135deg, #c05a7a, #e8788c)',
              borderRadius: '12px', boxShadow: '0 4px 20px rgba(200,90,120,0.3)',
              textDecoration: 'none',
            }}>
              Post a Job — First 2 Free <ArrowUpRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 3: WHAT EVERY POST INCLUDES (merged features)
          ═══════════════════════════════════════════════════════════════ */}
      <div style={{ background: 'linear-gradient(180deg, #FDFBF7 0%, #FFF8F0 50%, #FDFBF7 100%)' }}>
        <section style={{ maxWidth: '960px', margin: '0 auto', padding: '72px 20px 56px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#E86C2C', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
            First 2 Posts Free · Then ${config.postingPrice}/post
          </p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '8px' }}>
            Every Post Gets the Full Package
          </h2>
          <p style={{ fontSize: '15px', color: '#5A4A42', textAlign: 'center', maxWidth: '520px', margin: '0 auto 40px', lineHeight: 1.6 }}>
            No tiers. No feature gates. Free or paid — every listing gets the same premium treatment.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
            {[
              { icon: Clock, title: '60-Day Listing', desc: 'Double the industry standard. Your job stays visible for 2 full months.', gradient: 'linear-gradient(145deg, #0D9488, #10B981)' },
              { icon: Sparkles, title: 'Featured Badge', desc: 'Stand out with a prominent Featured tag on your listing and in search.', gradient: 'linear-gradient(145deg, #E86C2C, #F59E0B)' },
              { icon: TrendingUp, title: 'Top Search Placement', desc: 'Featured listings rank higher in search results — more visibility, more clicks.', gradient: 'linear-gradient(145deg, #8B5CF6, #A855F7)' },
              { icon: Mail, title: 'Daily Job Alerts', desc: 'Your listing is highlighted in daily email digests to opted-in PMHNPs.', gradient: 'linear-gradient(145deg, #F59E0B, #FBBF24)' },
              { icon: Users, title: '25 Candidate Unlocks', desc: 'View full profiles of interested applicants — contact info, resume, LinkedIn.', gradient: 'linear-gradient(145deg, #10B981, #34D399)' },
              { icon: Briefcase, title: '25 InMails', desc: 'Message candidates directly through the platform — no guessing emails.', gradient: 'linear-gradient(145deg, #3B82F6, #60A5FA)' },
              { icon: BarChart, title: 'Live Analytics', desc: 'Track views, clicks, and applications in real time from your dashboard.', gradient: 'linear-gradient(145deg, #E86C2C, #F59E0B)' },
              { icon: Target, title: '100% PMHNP Audience', desc: 'Every visitor is a psychiatric nurse practitioner. Zero unqualified noise.', gradient: 'linear-gradient(145deg, #0D9488, #10B981)' },
              { icon: DollarSign, title: 'No Surprises', desc: `First 2 free. After that, flat $${config.postingPrice}. Renewals just $${config.renewalPrice}.`, gradient: 'linear-gradient(145deg, #8B5CF6, #A855F7)' },
            ].map(({ icon: Icon, title, desc, gradient }) => (
              <div key={title} style={{ ...clayCard, padding: '22px' }}>
                <div style={{ ...clayIconWrap(gradient), width: '38px', height: '38px', borderRadius: '12px', marginBottom: '14px' }}>
                  <Icon size={16} color="#fff" />
                </div>
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>{title}</h3>
                <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════
            SECTION 4: COMPARISON TABLE
            ═══════════════════════════════════════════════════════════════ */}
        <section style={{ maxWidth: '800px', margin: '0 auto', padding: '0 20px 64px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#8B5CF6', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
            Competitive Advantage
          </p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '8px' }}>
            How We Compare
          </h2>
          <p style={{ fontSize: '15px', color: '#5A4A42', textAlign: 'center', maxWidth: '420px', margin: '0 auto 28px', lineHeight: 1.6 }}>
            See why specialized beats generalist — every time.
          </p>
          <div style={{ ...clayCard, padding: '0', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.06), rgba(13,148,136,0.02))' }}>
                  <th style={{ width: '40%', padding: '14px 20px', textAlign: 'left', fontWeight: 600, color: '#8B7B73', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>Feature</th>
                  <th style={{ width: '20%', padding: '14px 20px', textAlign: 'center', fontWeight: 700, color: '#0D9488', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>PMHNP Hiring</th>
                  <th style={{ width: '20%', padding: '14px 20px', textAlign: 'center', fontWeight: 600, color: '#B0BEC5', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>Indeed</th>
                  <th style={{ width: '20%', padding: '14px 20px', textAlign: 'center', fontWeight: 600, color: '#B0BEC5', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>LinkedIn</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row, i) => (
                  <tr key={row.feature} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)' }}>
                    <td style={{ padding: '12px 20px', color: '#1A2E35', fontWeight: 500, borderBottom: '1px solid rgba(0,0,0,0.04)' }}>{row.feature}</td>
                    <td style={{ padding: '12px 20px', textAlign: 'center', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                      {row.us ? <Check size={16} style={{ color: '#0D9488', display: 'block', margin: '0 auto' }} /> : <X size={16} style={{ color: '#D1D5DB', display: 'block', margin: '0 auto' }} />}
                    </td>
                    <td style={{ padding: '12px 20px', textAlign: 'center', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                      {row.indeed ? <Check size={16} style={{ color: '#B0BEC5', display: 'block', margin: '0 auto' }} /> : <X size={16} style={{ color: '#D1D5DB', display: 'block', margin: '0 auto' }} />}
                    </td>
                    <td style={{ padding: '12px 20px', textAlign: 'center', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                      {row.linkedin ? <Check size={16} style={{ color: '#B0BEC5', display: 'block', margin: '0 auto' }} /> : <X size={16} style={{ color: '#D1D5DB', display: 'block', margin: '0 auto' }} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════
            SECTION 5: BOTTOM CTA
            ═══════════════════════════════════════════════════════════════ */}
        <section style={{ maxWidth: '1000px', margin: '0 auto', padding: '0 20px 64px' }}>
          <div className="emp-cta-grid" style={{
            ...clayCard, padding: '0', overflow: 'hidden',
            display: 'grid', gridTemplateColumns: '1.3fr 1fr', alignItems: 'center',
          }}>
            <div style={{ padding: '40px 48px' }}>
              <h2 className="font-lora" style={{
                fontSize: 'clamp(22px, 3vw, 28px)', fontWeight: 700,
                color: '#1A2E35', margin: '0 0 12px',
              }}>
                Ready to Hire Your{' '}
                <span style={{ color: '#0D9488' }}>Next PMHNP</span>?
              </h2>
              <p style={{ fontSize: '15px', color: '#5A4A42', lineHeight: 1.6, margin: '0 0 24px', maxWidth: '400px' }}>
                First 2 posts free — all features included. After that, just ${config.postingPrice}/post. Simple pricing, real results.
              </p>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <Link href="/post-job" style={{
                  padding: '14px 28px', borderRadius: '14px', fontWeight: 700, fontSize: '15px',
                  background: 'linear-gradient(145deg, #0D9488, #10B981)', color: '#fff',
                  textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px',
                  boxShadow: '6px 6px 16px rgba(13,148,136,0.2), inset 1px 1px 2px rgba(255,255,255,0.15)',
                }}>
                  Post a Job — First 2 Free <ArrowRight size={16} />
                </Link>
                <Link href="/contact" style={{
                  padding: '14px 28px', borderRadius: '14px', fontWeight: 600, fontSize: '15px',
                  ...clayCard, color: '#1A2E35', textDecoration: 'none',
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                }}>
                  Contact Us
                </Link>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
              <Image
                src="/images/employers/cta-illustration.png"
                alt="Successful PMHNP hiring celebration"
                width={380} height={320}
                style={{ width: '100%', maxWidth: '380px', height: 'auto', borderRadius: '16px' }}
              />
            </div>
          </div>
        </section>
      </div>

      {/* ═══ Responsive overrides ═══ */}
      <style>{`
        @media (max-width: 768px) {
          .emp-hero-grid { grid-template-columns: 1fr !important; }
          .emp-steps-layout { grid-template-columns: 1fr !important; }
          .emp-cta-grid { grid-template-columns: 1fr !important; }
          .emp-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </>
  );
}
