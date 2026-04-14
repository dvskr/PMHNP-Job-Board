import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import { config } from '@/lib/config';
import { prisma } from '@/lib/prisma';
import {
  Check, Sparkles, Crown, Zap, ArrowRight, Users, TrendingUp, BarChart,
  FileText, Target, Clock, DollarSign, Mail, Briefcase, Eye,
  MousePointerClick, X, Shield, Search, Star, Building2,
} from 'lucide-react';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'For Employers — Hire PMHNPs | PMHNP Job Board',
  description:
    'Hire qualified Psychiatric Mental Health Nurse Practitioners. Post your first job free. Reach thousands of PMHNPs actively searching. Simple pricing, real results.',
  openGraph: {
    images: [{ url: '/images/pages/pmhnp-employer-hiring-solutions.webp', width: 1280, height: 900, alt: 'PMHNP employer hiring solutions' }],
  },
  twitter: { card: 'summary_large_image', images: ['/images/pages/pmhnp-employer-hiring-solutions.webp'] },
  alternates: { canonical: 'https://pmhnphiring.com/for-employers' },
};

/* ═══ Clay Tokens ═══ */
const clayCard: React.CSSProperties = {
  background: '#FFFFFF', borderRadius: '20px',
  border: '1px solid rgba(0,0,0,0.06)',
  boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

const clayIconWrap = (gradient: string): React.CSSProperties => ({
  width: '44px', height: '44px', borderRadius: '14px',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: gradient,
  boxShadow: '4px 4px 10px rgba(0,0,0,0.08), inset 1px 1px 2px rgba(255,255,255,0.2)',
  flexShrink: 0,
});

const sectionHeading: React.CSSProperties = {
  fontSize: 'clamp(22px, 3vw, 28px)', fontWeight: 800,
  fontFamily: 'var(--font-lora), Georgia, serif',
  color: '#1A2E35', textAlign: 'center' as const, marginBottom: '8px',
};

const sectionSub: React.CSSProperties = {
  fontSize: '15px', color: '#8A9BA6', textAlign: 'center' as const,
  maxWidth: '520px', margin: '0 auto 32px', lineHeight: 1.6,
};

async function getEmployerStats() {
  try {
    const [totalJobs, totalSubscribers, totalCompanies, avgViews] = await Promise.all([
      prisma.job.count({ where: { isPublished: true } }),
      prisma.emailLead.count({ where: { isSubscribed: true } }),
      prisma.job.groupBy({ by: ['employer'], where: { isPublished: true } }).then((r) => r.length),
      prisma.job.aggregate({ where: { isPublished: true, viewCount: { gt: 0 } }, _avg: { viewCount: true } }).then((r) => Math.round(r._avg.viewCount || 0)),
    ]);
    return { totalJobs, totalSubscribers, totalCompanies, avgViews };
  } catch {
    return { totalJobs: 0, totalSubscribers: 0, totalCompanies: 0, avgViews: 0 };
  }
}

const plans = [
  {
    name: 'Starter', price: 199, period: 'per posting', duration: '30 days',
    icon: Zap, gradient: 'linear-gradient(145deg, #2DD4BF, #0D9488)', popular: false, cta: 'Get Started',
    features: ['30-day job listing', 'Included in daily job alerts', 'Full job description page', 'Basic analytics (views)', '5 candidate unlocks/posting', '5 InMails/posting'],
  },
  {
    name: 'Growth', price: 299, period: 'per posting', duration: '60 days',
    icon: Sparkles, gradient: 'linear-gradient(145deg, #E86C2C, #F59E0B)', popular: true, cta: 'Get Growth',
    features: ['60-day listing (2× longer)', '"Featured" badge on listing', 'Top placement in search', 'Highlighted in email digests', '25 candidate unlocks/posting', '25 InMails/posting', 'Advanced analytics'],
  },
  {
    name: 'Premium', price: 399, period: 'per posting', duration: '90 days',
    icon: Crown, gradient: 'linear-gradient(145deg, #8B5CF6, #A855F7)', popular: false, cta: 'Go Premium',
    features: ['90-day listing (3× longer)', 'Everything in Growth', 'Unlimited candidate unlocks', 'Unlimited InMails', 'Social media promotion', 'Dedicated account support'],
  },
];

const comparisonRows = [
  { feature: 'PMHNP-Only Audience', us: true, indeed: false, linkedin: false },
  { feature: 'Only Qualified PMHNPs Apply', us: true, indeed: false, linkedin: false },
  { feature: 'First Post Free', us: true, indeed: false, linkedin: false },
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

      <div style={{ background: '#F5F6F8', minHeight: '100vh' }}>

        {/* ═══════════════ SECTION 1: HERO — Split Layout ═══════════════ */}
        <section style={{ maxWidth: '1140px', margin: '0 auto', padding: '48px 20px 40px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', alignItems: 'center' }}>
            {/* Left */}
            <div>
              {!config.isPaidPostingEnabled && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '6px 16px', borderRadius: '20px', fontSize: '13px', fontWeight: 600,
                  background: 'rgba(13,148,136,0.08)', border: '1px solid rgba(13,148,136,0.15)',
                  color: '#0D9488', marginBottom: '20px',
                }}>
                  ✅ Post Jobs for Free — Get Started in Minutes
                </div>
              )}
              <h1 style={{
                fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 800, lineHeight: 1.12,
                fontFamily: 'var(--font-lora), Georgia, serif',
                color: '#1A2E35', margin: '0 0 16px',
              }}>
                The #1 Job Board Built{' '}
                <span style={{ background: 'linear-gradient(135deg, #0D9488, #2DD4BF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Exclusively</span>{' '}
                for PMHNPs
              </h1>
              <p style={{ fontSize: '16px', color: '#6B7F8A', lineHeight: 1.65, margin: '0 0 28px', maxWidth: '440px' }}>
                Reach thousands of psychiatric nurse practitioners actively searching for their next role. Every candidate is a qualified PMHNP — zero noise, maximum relevance.
              </p>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '32px' }}>
                <Link href="/post-job" style={{
                  padding: '14px 28px', borderRadius: '14px', fontWeight: 700, fontSize: '15px',
                  background: 'linear-gradient(145deg, #0D9488, #10B981)', color: '#fff',
                  textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px',
                  boxShadow: '6px 6px 16px rgba(13,148,136,0.2), inset 1px 1px 2px rgba(255,255,255,0.15)',
                }}>
                  Post a Job {!config.isPaidPostingEnabled ? '— Free' : ''} <ArrowRight size={16} />
                </Link>
                {config.isPaidPostingEnabled && (
                  <Link href="/pricing" style={{
                    padding: '14px 28px', borderRadius: '14px', fontWeight: 600, fontSize: '15px',
                    ...clayCard, color: '#1A2E35', textDecoration: 'none',
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                  }}>
                    View Pricing
                  </Link>
                )}
              </div>

              {/* Stat pills */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {[
                  { value: fmt(stats.totalJobs), label: 'Active Jobs', icon: Briefcase, gradient: 'linear-gradient(145deg, #0D9488, #10B981)' },
                  { value: fmt(stats.totalSubscribers), label: 'Job Seekers', icon: Users, gradient: 'linear-gradient(145deg, #E86C2C, #F59E0B)' },
                  { value: fmt(stats.totalCompanies), label: 'Companies', icon: Building2, gradient: 'linear-gradient(145deg, #8B5CF6, #A855F7)' },
                ].map(s => {
                  const StatIcon = s.icon;
                  return (
                    <div key={s.label} style={{
                      ...clayCard, padding: '8px 14px',
                      display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '12px',
                    }}>
                      <div style={{ ...clayIconWrap(s.gradient), width: '28px', height: '28px', borderRadius: '8px' }}>
                        <StatIcon size={13} color="#fff" />
                      </div>
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: '#1A2E35', lineHeight: 1 }}>{s.value}+</div>
                        <div style={{ fontSize: '11px', color: '#B0BEC5', lineHeight: 1.2 }}>{s.label}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right — Illustration */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Image
                src="/images/employers/hero-illustration.png"
                alt="Employer reviewing PMHNP candidate profiles on dashboard"
                width={520} height={420}
                style={{ width: '100%', maxWidth: '520px', height: 'auto', borderRadius: '20px' }}
                priority
              />
            </div>
          </div>
        </section>

        {/* ═══════════════ SECTION 2: SOCIAL PROOF STATS BAR ═══════════════ */}
        <section style={{ maxWidth: '900px', margin: '0 auto', padding: '0 20px 48px' }}>
          <div style={{
            ...clayCard, padding: '24px 32px',
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px',
          }}>
            {[
              { value: fmt(stats.totalJobs), label: 'Active PMHNP Jobs', icon: Search, gradient: 'linear-gradient(145deg, #0D9488, #10B981)' },
              { value: fmt(stats.totalSubscribers), label: 'Job Seekers', icon: Users, gradient: 'linear-gradient(145deg, #E86C2C, #F59E0B)' },
              { value: fmt(stats.totalCompanies), label: 'Hiring Companies', icon: Building2, gradient: 'linear-gradient(145deg, #8B5CF6, #A855F7)' },
              { value: `${fmt(stats.avgViews)}`, label: 'Avg Views / Listing', icon: Eye, gradient: 'linear-gradient(145deg, #3B82F6, #60A5FA)' },
            ].map(s => {
              const SIcon = s.icon;
              return (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={clayIconWrap(s.gradient)}>
                    <SIcon size={18} color="#fff" />
                  </div>
                  <div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: '#1A2E35', lineHeight: 1 }}>{s.value}+</div>
                    <div style={{ fontSize: '12px', color: '#8A9BA6', lineHeight: 1.3, marginTop: '2px' }}>{s.label}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ═══════════════ SECTION 3: WHY CHOOSE US ═══════════════ */}
        <section style={{ maxWidth: '1140px', margin: '0 auto', padding: '0 20px 56px' }}>
          <h2 style={sectionHeading}>Why Employers Choose PMHNP Hiring</h2>
          <p style={sectionSub}>Purpose-built for psychiatric hiring. Every feature designed to connect you with the right PMHNP faster.</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', alignItems: 'center' }}>
            {/* Left — 2×3 Feature Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {[
                { icon: Target, title: '100% Targeted', desc: 'Every visitor is a psychiatric NP. Zero unqualified noise.', gradient: 'linear-gradient(145deg, #0D9488, #10B981)' },
                { icon: DollarSign, title: 'First Post Free', desc: 'No credit card, no commitment — try us risk-free.', gradient: 'linear-gradient(145deg, #E86C2C, #F59E0B)' },
                { icon: Clock, title: '5-Min Setup', desc: 'Simple form, instant publishing. Live in minutes.', gradient: 'linear-gradient(145deg, #8B5CF6, #A855F7)' },
                { icon: BarChart, title: 'Live Analytics', desc: 'Track views, clicks, and applications in real time.', gradient: 'linear-gradient(145deg, #3B82F6, #60A5FA)' },
                { icon: Mail, title: 'Daily Alerts', desc: 'Jobs emailed to thousands of opted-in PMHNP candidates.', gradient: 'linear-gradient(145deg, #F59E0B, #FBBF24)' },
                { icon: TrendingUp, title: 'SEO Pages', desc: 'Every listing gets its own SEO page on Google.', gradient: 'linear-gradient(145deg, #10B981, #34D399)' },
              ].map(({ icon: Icon, title, desc, gradient }) => (
                <div key={title} style={{ ...clayCard, padding: '20px' }}>
                  <div style={{ ...clayIconWrap(gradient), width: '36px', height: '36px', borderRadius: '10px', marginBottom: '12px' }}>
                    <Icon size={16} color="#fff" />
                  </div>
                  <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 4px' }}>{title}</h3>
                  <p style={{ fontSize: '12px', color: '#8A9BA6', margin: 0, lineHeight: 1.5 }}>{desc}</p>
                </div>
              ))}
            </div>

            {/* Right — Illustration */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Image
                src="/images/employers/why-choose.png"
                alt="Employer analytics dashboard with hiring insights"
                width={480} height={400}
                style={{ width: '100%', maxWidth: '480px', height: 'auto', borderRadius: '20px' }}
              />
            </div>
          </div>
        </section>

        {/* ═══════════════ SECTION 4: HOW IT WORKS ═══════════════ */}
        <section style={{ maxWidth: '1140px', margin: '0 auto', padding: '0 20px 56px' }}>
          <h2 style={sectionHeading}>How It Works</h2>
          <p style={sectionSub}>Three simple steps to find your next PMHNP hire.</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '40px', alignItems: 'center' }}>
            {/* Left — Illustration */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Image
                src="/images/employers/how-it-works.png"
                alt="Three stages of posting a PMHNP job listing"
                width={460} height={380}
                style={{ width: '100%', maxWidth: '460px', height: 'auto', borderRadius: '20px' }}
              />
            </div>

            {/* Right — 3 Steps */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {[
                { num: '1', icon: FileText, title: 'Create Your Listing', desc: 'Fill out the simple 5-step job posting wizard with your requirements, salary details, and application info. Takes under 5 minutes.', gradient: 'linear-gradient(145deg, #0D9488, #10B981)' },
                { num: '2', icon: Eye, title: 'Preview & Publish', desc: 'Review your posting with our live preview, then publish instantly. Your listing goes live immediately and is included in the next daily job alert.', gradient: 'linear-gradient(145deg, #E86C2C, #F59E0B)' },
                { num: '3', icon: TrendingUp, title: 'Receive Candidates', desc: 'Track views, apply clicks, and applications from your employer dashboard. Only verified PMHNPs see your listing — zero noise.', gradient: 'linear-gradient(145deg, #8B5CF6, #A855F7)' },
              ].map(({ num, icon: Icon, title, desc, gradient }) => (
                <div key={num} style={{ ...clayCard, padding: '24px', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                  <div style={{
                    ...clayIconWrap(gradient), width: '40px', height: '40px', borderRadius: '50%',
                    fontSize: '16px', fontWeight: 800, color: '#fff',
                  }}>
                    {num}
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>{title}</h3>
                    <p style={{ fontSize: '13px', color: '#8A9BA6', margin: 0, lineHeight: 1.6 }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════ SECTION 5: WHAT'S INCLUDED (Free Launch) ═══════════════ */}
        {!config.isPaidPostingEnabled && (
          <section style={{ maxWidth: '900px', margin: '0 auto', padding: '0 20px 56px' }}>
            <h2 style={sectionHeading}>What&apos;s Included — Growth Package</h2>
            <p style={sectionSub}>Every job posting includes our $299 Growth package — completely free during launch.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
              {[
                { icon: Sparkles, label: '60-day job listing (2× longer)', gradient: 'linear-gradient(145deg, #E86C2C, #F59E0B)' },
                { icon: Crown, label: '"Featured" badge on listing', gradient: 'linear-gradient(145deg, #8B5CF6, #A855F7)' },
                { icon: TrendingUp, label: 'Top placement in search results', gradient: 'linear-gradient(145deg, #0D9488, #10B981)' },
                { icon: Mail, label: 'Highlighted in daily job alerts', gradient: 'linear-gradient(145deg, #E86C2C, #F59E0B)' },
                { icon: Users, label: '25 candidate unlocks/posting', gradient: 'linear-gradient(145deg, #10B981, #34D399)' },
                { icon: Briefcase, label: '25 InMails/posting', gradient: 'linear-gradient(145deg, #F59E0B, #FBBF24)' },
                { icon: BarChart, label: 'Advanced analytics (views, clicks)', gradient: 'linear-gradient(145deg, #3B82F6, #60A5FA)' },
              ].map(({ icon: Icon, label, gradient }) => (
                <div key={label} style={{ ...clayCard, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ ...clayIconWrap(gradient), width: '32px', height: '32px', borderRadius: '10px' }}>
                    <Icon size={14} color="#fff" />
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#1A2E35' }}>{label}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ═══════════════ SECTION 5b: PRICING (Paid Mode) ═══════════════ */}
        {config.isPaidPostingEnabled && (
          <section style={{ maxWidth: '1000px', margin: '0 auto', padding: '0 20px 56px' }}>
            <h2 style={sectionHeading}>Simple, Transparent Pricing</h2>
            <p style={sectionSub}>Your first Standard post is <strong style={{ color: '#0D9488' }}>completely free</strong> — no credit card required.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              {plans.map((plan) => {
                const PIcon = plan.icon;
                return (
                  <div key={plan.name} style={{
                    ...clayCard, padding: '28px', position: 'relative',
                    border: plan.popular ? '2px solid #E86C2C' : '1px solid rgba(0,0,0,0.06)',
                  }}>
                    {plan.popular && (
                      <div style={{
                        position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)',
                        padding: '4px 16px', borderRadius: '12px', fontSize: '11px', fontWeight: 700,
                        background: plan.gradient, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.5px',
                      }}>MOST POPULAR</div>
                    )}
                    <div style={{ ...clayIconWrap(plan.gradient), width: '40px', height: '40px', marginBottom: '14px' }}>
                      <PIcon size={18} color="#fff" />
                    </div>
                    <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#1A2E35', margin: '0 0 4px' }}>{plan.name}</h3>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '36px', fontWeight: 800, color: '#1A2E35' }}>${plan.price}</span>
                      <span style={{ fontSize: '13px', color: '#B0BEC5' }}>{plan.period}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#0D9488', fontWeight: 600, marginBottom: '16px' }}>{plan.duration} listing</div>
                    <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px' }}>
                      {plan.features.map(f => (
                        <li key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', fontSize: '13px', color: '#6B7F8A' }}>
                          <Check size={14} style={{ color: '#0D9488', flexShrink: 0 }} /> {f}
                        </li>
                      ))}
                    </ul>
                    <Link href="/post-job" style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                      padding: '12px', borderRadius: '12px', fontWeight: 700, fontSize: '14px', textDecoration: 'none',
                      background: plan.popular ? plan.gradient : '#FFFFFF',
                      color: plan.popular ? '#fff' : '#1A2E35',
                      border: plan.popular ? 'none' : '1px solid rgba(0,0,0,0.08)',
                      boxShadow: plan.popular ? '4px 4px 12px rgba(232,108,44,0.2)' : 'none',
                    }}>
                      {plan.cta} <ArrowRight size={14} />
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ═══════════════ SECTION 6: COMPARISON TABLE ═══════════════ */}
        <section style={{ maxWidth: '800px', margin: '0 auto', padding: '0 20px 56px' }}>
          <h2 style={sectionHeading}>How We Compare</h2>
          <p style={sectionSub}>See why specialized beats generalist — every time.</p>
          <div style={{ ...clayCard, padding: '0', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.06), rgba(13,148,136,0.02))' }}>
                  <th style={{ width: '40%', padding: '14px 20px', textAlign: 'left', fontWeight: 600, color: '#8A9BA6', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>Feature</th>
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

        {/* ═══════════════ SECTION 7: BOTTOM CTA ═══════════════ */}
        <section style={{ maxWidth: '1000px', margin: '0 auto', padding: '0 20px 64px' }}>
          <div style={{
            ...clayCard, padding: '0', overflow: 'hidden',
            display: 'grid', gridTemplateColumns: '1.3fr 1fr', alignItems: 'center',
          }}>
            <div style={{ padding: '40px 48px' }}>
              <h2 style={{
                fontSize: 'clamp(22px, 3vw, 28px)', fontWeight: 800,
                fontFamily: 'var(--font-lora), Georgia, serif',
                color: '#1A2E35', margin: '0 0 12px',
              }}>
                Ready to Hire Your{' '}
                <span style={{ background: 'linear-gradient(135deg, #0D9488, #2DD4BF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Next PMHNP</span>?
              </h2>
              <p style={{ fontSize: '15px', color: '#8A9BA6', lineHeight: 1.6, margin: '0 0 24px', maxWidth: '400px' }}>
                {config.isPaidPostingEnabled
                  ? 'Simple pricing, real results. Post your job and start receiving qualified candidates today.'
                  : 'Post your job for free. No credit card required. Go live in under 5 minutes and start receiving candidates.'}
              </p>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <Link href="/post-job" style={{
                  padding: '14px 28px', borderRadius: '14px', fontWeight: 700, fontSize: '15px',
                  background: 'linear-gradient(145deg, #0D9488, #10B981)', color: '#fff',
                  textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px',
                  boxShadow: '6px 6px 16px rgba(13,148,136,0.2), inset 1px 1px 2px rgba(255,255,255,0.15)',
                }}>
                  Post a Job {!config.isPaidPostingEnabled ? '— Free' : ''} <ArrowRight size={16} />
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

      <style>{`
        @media (max-width: 768px) {
          section > div[style*="grid-template-columns: 1fr 1fr"],
          section > div[style*="grid-template-columns: 1fr 1.2fr"],
          section > div[style*="grid-template-columns: 1.3fr 1fr"] {
            grid-template-columns: 1fr !important;
          }
          section > div[style*="grid-template-columns: repeat(4"] {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          section > div[style*="grid-template-columns: repeat(3"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </>
  );
}
