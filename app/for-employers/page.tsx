import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import EmployerHowItWorks from '@/components/EmployerHowItWorks';
import { config } from '@/lib/config';
import { prisma } from '@/lib/prisma';
import {
  Check, ArrowRight, Users,
  X, Search, Building2,
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

const comparisonRows: { feature: string; us: true | false | 'partial'; indeed: true | false | 'partial'; linkedin: true | false | 'partial'; note?: string }[] = [
  { feature: '100% Psychiatric NP Audience', us: true, indeed: false, linkedin: false },
  { feature: 'No Unqualified Applicants', us: true, indeed: false, linkedin: false },
  { feature: 'First 2 Posts Free (No Card)', us: true, indeed: false, linkedin: false },
  { feature: 'Flat $199/Post — No Bidding', us: true, indeed: false, linkedin: false, note: 'Indeed is pay-per-click' },
  { feature: '60-Day Listing Duration', us: true, indeed: false, linkedin: false, note: 'Others: 30 days' },
  { feature: 'Direct Candidate Messaging', us: true, indeed: false, linkedin: 'partial', note: 'LinkedIn: paid add-on' },
  { feature: 'Candidate Profile Unlocks', us: true, indeed: false, linkedin: 'partial', note: 'LinkedIn: paid add-on' },
  { feature: 'Built-In Screening Questions', us: true, indeed: true, linkedin: false },
  { feature: 'Daily Niche Job Alerts', us: true, indeed: 'partial', linkedin: 'partial', note: 'Others: generic alerts' },
  { feature: 'Instant Apply Notifications', us: true, indeed: true, linkedin: true },
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
          SECTION 2: HOW EMPLOYERS HIRE (shared component from homepage)
          ═══════════════════════════════════════════════════════════════ */}
      <EmployerHowItWorks />

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 3: BENTO GRID FEATURES
          ═══════════════════════════════════════════════════════════════ */}
      <div style={{ background: 'linear-gradient(180deg, #FDFBF7 0%, #FFF8F0 50%, #FDFBF7 100%)' }}>
        <section style={{ maxWidth: '1000px', margin: '0 auto', padding: '80px 20px 56px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#E86C2C', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
            First 2 Posts Free · Then ${config.postingPrice}/post
          </p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(26px, 3.5vw, 38px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '8px' }}>
            Every Post Gets the Full Package
          </h2>
          <p style={{ fontSize: '15px', color: '#5A4A42', textAlign: 'center', maxWidth: '480px', margin: '0 auto 48px', lineHeight: 1.6 }}>
            No tiers. No feature gates. Free or paid — every listing gets the same premium treatment.
          </p>

          {/* ─── Bento Grid ─── */}
          <div className="bento-grid" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(12, 1fr)',
            gridTemplateRows: 'auto',
            gap: '14px',
          }}>

            {/* ROW 1: 60-Day Listing (8 cols) + Featured Badge (4 cols) */}
            <div className="bento-hero-1" style={{
              ...clayCard, gridColumn: 'span 8', padding: '0', overflow: 'hidden',
              display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center',
            }}>
              <div style={{ padding: '32px 28px' }}>
                <Image src="/images/employers/clay-calendar.png" alt="" width={56} height={56} style={{ width: '56px', height: '56px', objectFit: 'contain', marginBottom: '16px' }} />
                <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#1A2E35', margin: '0 0 8px' }}>60-Day Listing</h3>
                <p style={{ fontSize: '14px', color: '#5A4A42', margin: 0, lineHeight: 1.6 }}>
                  Double the industry standard. Your job stays visible for 2 full months — no daily budget, no bidding.
                </p>
              </div>
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', padding: '16px' }}>
                <Image src="/images/employers/bento-60day.png" alt="60-day job listing calendar" width={280} height={200} style={{ width: '100%', maxWidth: '280px', height: 'auto', borderRadius: '12px' }} />
              </div>
            </div>

            <div className="bento-hero-2" style={{
              ...clayCard, gridColumn: 'span 4', padding: '0', overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ flex: '0 0 auto', background: 'linear-gradient(145deg, #FFFBEB, #FEF3C7)', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Image src="/images/employers/bento-featured.png" alt="Featured badge on job listing" width={200} height={140} style={{ width: '100%', maxWidth: '200px', height: 'auto', borderRadius: '10px' }} />
              </div>
              <div style={{ padding: '24px 22px', flex: 1 }}>
                <Image src="/images/employers/clay-star.png" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', marginBottom: '12px' }} />
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#1A2E35', margin: '0 0 6px' }}>Featured Badge</h3>
                <p style={{ fontSize: '12.5px', color: '#7A6A62', margin: 0, lineHeight: 1.5 }}>
                  Stand out with a prominent Featured tag on your listing and in search results.
                </p>
              </div>
            </div>

            {/* ROW 2: 4 compact cards (3 cols each) — CENTERED */}
            <div style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <Image src="/images/employers/clay-trending.png" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Top Search Placement</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Featured listings rank higher — more visibility, more clicks.</p>
            </div>

            <div style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <Image src="/images/employers/clay-envelope.png" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>Daily Job Alerts</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Highlighted in daily email digests to opted-in PMHNPs.</p>
            </div>

            <div style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <Image src="/images/employers/clay-people.png" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>25 Candidate Unlocks</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>View full profiles — contact info, resume, LinkedIn.</p>
            </div>

            <div style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
              <Image src="/images/employers/clay-briefcase.png" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>25 InMails</h3>
              <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>Message candidates directly — no guessing emails.</p>
            </div>

            {/* ROW 3: Analytics (8 cols) + Pricing (4 cols) */}
            <div className="bento-hero-3" style={{
              ...clayCard, gridColumn: 'span 8', padding: '0', overflow: 'hidden',
              display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center',
            }}>
              <div style={{ padding: '32px 28px' }}>
                <Image src="/images/employers/clay-chart.png" alt="" width={56} height={56} style={{ width: '56px', height: '56px', objectFit: 'contain', marginBottom: '16px' }} />
                <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#1A2E35', margin: '0 0 8px' }}>Live Analytics</h3>
                <p style={{ fontSize: '14px', color: '#5A4A42', margin: 0, lineHeight: 1.6 }}>
                  Track views, clicks, and applications in real time. See exactly where your candidates come from.
                </p>
              </div>
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(145deg, #FFF7ED, #FFEDD5)', padding: '16px' }}>
                <Image src="/images/employers/bento-analytics.png" alt="Analytics dashboard with charts" width={280} height={200} style={{ width: '100%', maxWidth: '280px', height: 'auto', borderRadius: '12px' }} />
              </div>
            </div>

            <div className="bento-pricing" style={{
              ...clayCard, gridColumn: 'span 4',
              padding: '28px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center',
              background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)',
              border: '2px solid rgba(13,148,136,0.15)',
            }}>
              <Image src="/images/employers/clay-dollar.png" alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', marginBottom: '14px' }} />
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#134E4A', margin: '0 0 6px' }}>Simple Pricing</h3>
              <p style={{ fontSize: '13px', color: '#0D9488', margin: '0 0 16px', lineHeight: 1.6, fontWeight: 500 }}>
                First 2 posts free. Then ${config.postingPrice}/post.<br />
                Renewals just ${config.renewalPrice}. No hidden fees.
              </p>
              <Link href="/post-job" style={{
                padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '13px',
                background: '#0D9488', color: '#fff', textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: '6px', width: 'fit-content',
                boxShadow: '3px 3px 8px rgba(13,148,136,0.15)',
              }}>
                Post a Job <ArrowRight size={14} />
              </Link>
            </div>

          </div>
        </section>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 4: COMPARISON + CTA (split screen, same section)
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
            An honest look at what you get — no cherry-picking.
          </p>

          {/* Split: Table (left) + CTA Card (right) */}
          <div className="emp-compare-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '24px', alignItems: 'start' }}>

            {/* LEFT — Comparison Table */}
            <div style={{ ...clayCard, padding: '0', overflow: 'hidden' }}>
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

            {/* RIGHT — Vertical CTA Card (image top, content bottom) */}
            <div style={{
              ...clayCard, padding: '0', overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
            }}>
              {/* Image */}
              <div style={{
                background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)',
                padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Image
                  src="/images/employers/cta-illustration.png"
                  alt="Successful PMHNP hiring celebration"
                  width={280} height={220}
                  style={{ width: '100%', maxWidth: '260px', height: 'auto', borderRadius: '14px' }}
                />
              </div>

              {/* Content */}
              <div style={{ padding: '28px 24px' }}>
                <h3 className="font-lora" style={{
                  fontSize: '20px', fontWeight: 700,
                  color: '#1A2E35', margin: '0 0 10px',
                }}>
                  Ready to Hire Your{' '}
                  <span style={{ color: '#0D9488' }}>Next PMHNP</span>?
                </h3>
                <p style={{ fontSize: '13px', color: '#5A4A42', lineHeight: 1.6, margin: '0 0 20px' }}>
                  First 2 posts free — all features included. Then just ${config.postingPrice}/post.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <Link href="/post-job" style={{
                    padding: '12px 24px', borderRadius: '12px', fontWeight: 700, fontSize: '14px',
                    background: 'linear-gradient(145deg, #0D9488, #10B981)', color: '#fff',
                    textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    boxShadow: '4px 4px 12px rgba(13,148,136,0.2), inset 1px 1px 2px rgba(255,255,255,0.15)',
                  }}>
                    Post a Job — First 2 Free <ArrowRight size={15} />
                  </Link>
                  <Link href="/contact" style={{
                    padding: '12px 24px', borderRadius: '12px', fontWeight: 600, fontSize: '14px',
                    background: '#fff', color: '#1A2E35', textDecoration: 'none',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    border: '1px solid rgba(0,0,0,0.08)',
                    boxShadow: '2px 2px 6px rgba(0,0,0,0.04)',
                  }}>
                    Contact Us
                  </Link>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ═══ Responsive overrides ═══ */}
      <style>{`
        @media (max-width: 768px) {
          .emp-hero-grid { grid-template-columns: 1fr !important; }
          .emp-compare-grid { grid-template-columns: 1fr !important; }
          .emp-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .bento-grid { grid-template-columns: 1fr !important; }
          .bento-hero-1, .bento-hero-2, .bento-hero-3, .bento-pricing {
            grid-column: span 1 !important;
          }
          .bento-hero-1, .bento-hero-3 {
            grid-template-columns: 1fr !important;
          }
          .bento-grid > div { grid-column: span 1 !important; }
        }
        @media (min-width: 769px) and (max-width: 1024px) {
          .bento-grid { grid-template-columns: repeat(6, 1fr) !important; }
          .bento-hero-1, .bento-hero-3 { grid-column: span 6 !important; }
          .bento-hero-2, .bento-pricing { grid-column: span 6 !important; }
          .bento-grid > div:not(.bento-hero-1):not(.bento-hero-2):not(.bento-hero-3):not(.bento-pricing) {
            grid-column: span 3 !important;
          }
        }
      `}</style>
    </>
  );
}
