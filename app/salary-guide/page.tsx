import { jsonLdString } from '@/lib/seo/json-ld';
import { brand } from '@/config/brand';
import { Metadata } from 'next';
import VideoJsonLd from '@/components/VideoJsonLd';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, ArrowRight } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import SalaryGuideForm from '@/components/SalaryGuideForm';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import CopyCitation from '@/components/CopyCitation';
import SalaryStateExplorer, { type ExplorerState } from '@/components/SalaryStateExplorer';
import {
  getOfferMarketData,
  getHubStateSummaries,
  getNationalSettingMedians,
} from '@/lib/salary-report/market-data';
import { summarizeMidpoints, roundDisplayDollars } from '@/lib/salary-report/stats';
import { getStatesByAuthority } from '@/lib/state-practice-authority';

// Enable ISR with daily revalidation
export const revalidate = 86400;

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com';

// State codes mapping
const STATE_CODES: Record<string, string> = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
  'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
  'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
  'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
  'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
  'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
  'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC',
};

const stateSlug = (name: string) => name.toLowerCase().replace(/\s+/g, '-');

// GSC Fix (2026-07 audit, Phase 1): every dollar figure on this page now
// flows through lib/salary-report/stats.ts (medians, quarantine, tiered
// n-gating) — the fabricated trends table, hardcoded FAQ figures, invented
// experience/setting/specialty ranges, and third-party "sources" claims
// are gone. The page publishes what live postings advertise, nothing else.
export async function generateMetadata(): Promise<Metadata> {
  // Fallbacks are degraded-mode only; live values overwrite them.
  let medK = 155;
  let p75K = 200;
  try {
    const market = await getOfferMarketData();
    const national = summarizeMidpoints(market.national);
    if (national.tier === 'full') {
      medK = Math.round(national.median / 1000);
      p75K = Math.round(national.p75 / 1000);
    } else if (national.tier === 'median') {
      medK = Math.round(national.median / 1000);
    }
  } catch {
    // DB-degraded: keep static fallbacks.
  }
  const year = new Date().getFullYear();

  return {
    // `absolute` opts out of the layout title template so the brand suffix
    // doesn't get appended a second time.
    title: { absolute: `PMHNP Salary Guide ${year}: $${medK}K Median by State | PMHNP Hiring` },
    description: `Advertised PMHNP pay from live postings: national median $${medK}K, middle 50% up to $${p75K}K. All states with disclosed ranges, by practice setting, plus negotiation tips.`,
    keywords: ['pmhnp salary', 'psych np salary', 'psychiatric nurse practitioner salary', 'pmhnp salary by state', 'how much do pmhnps make', 'pmhnp pay', `pmhnp salary ${year}`, 'psychiatric np salary', 'pmhnp salary guide'],
    openGraph: {
      title: `PMHNP Salary Guide ${year}: $${medK}K Median Advertised Pay`,
      description: `Live advertised pay for psychiatric nurse practitioners: national median $${medK},000, state-by-state breakdown, and tips to maximize earnings.`,
      type: 'website',
      url: `${BASE_URL}/salary-guide`,
      images: [{ url: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/pmhnp-salary-guide-2026.webp', width: 1280, height: 900, alt: 'PMHNP salary guide showing psychiatric nurse practitioner pay by state with interactive salary comparison table' }],
    },
    twitter: { card: 'summary_large_image', images: ['https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/pmhnp-salary-guide-2026.webp'] },
    alternates: { canonical: `${brand.baseUrl}/salary-guide` },
  };
}

/* ═══ Clay Design Tokens ═══ */
const clayCard: React.CSSProperties = {
  background: '#FFFFFF', borderRadius: '20px',
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

/* ═══ Qualitative content: factors that move pay. No invented percentages
       or dollar figures; live numbers live in the data sections above. ═══ */
const factorCards = [
  { img: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/clay-icon-match.webp', title: 'Geographic Location', desc: 'High cost-of-living, high-demand states tend to advertise more. Compare states in the live table above rather than relying on rules of thumb.' },
  { img: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/employers/clay-calendar.webp', title: 'Experience Level', desc: 'Employers pay for autonomy: prescriptive experience, panel size, and supervision-free practice. Most postings advertise one range regardless of years, then negotiate within it.' },
  { img: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/employers/clay-briefcase.webp', title: 'Practice Setting', desc: 'Private practice and telehealth roles often advertise differently than hospital or community settings. See the live setting medians above.' },
  { img: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/employers/clay-people.webp', title: 'Employment Type', desc: '1099 contract rates usually look higher than W-2 salaries because they carry self-employment tax and no benefits. Run both through our 1099 vs W-2 calculator before comparing.' },
  { img: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/employers/clay-trending.webp', title: 'Specialization', desc: 'Niches with fewer qualified candidates (addiction, child and adolescent, forensic) are frequently in demand. Browse those categories to see what employers actually offer.' },
  { img: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/employers/clay-dollar.webp', title: 'Negotiation', desc: 'Knowing the advertised percentile of your offer is leverage. The Offer Analyzer shows exactly where an offer lands before you counter.' },
];

/* High-demand niches: qualitative, linked to live category pages instead of
   invented premium percentages. */
const nicheLinks = [
  { label: 'Addiction / MAT', href: '/jobs/addiction', note: 'MAT experience is scarce' },
  { label: 'Child & Adolescent', href: '/jobs/child-adolescent', note: 'Specialized training required' },
  { label: 'Correctional / Forensic', href: '/jobs/correctional', note: 'Facilities and courts' },
  { label: 'Crisis / Emergency', href: '/jobs/crisis', note: 'Acute settings' },
  { label: 'Geriatric', href: '/jobs/geriatric', note: 'Aging population' },
  { label: 'Private Practice', href: '/jobs/private-practice', note: 'Ownership upside' },
];

export default async function SalaryGuidePage() {
  const [market, hubStates, settingMedians, totalPublished, remoteCount] = await Promise.all([
    getOfferMarketData(),
    getHubStateSummaries(),
    getNationalSettingMedians(),
    prisma.job.count({ where: { isPublished: true } }),
    prisma.job.count({ where: { isPublished: true, isRemote: true } }),
  ]);

  // Total open jobs per state for the table's Jobs column (all published,
  // not just salary-bearing — labeled accordingly).
  const stateJobCounts = await prisma.job.groupBy({
    by: ['state'],
    where: { isPublished: true, state: { not: null } },
    _count: { id: true },
  });
  const jobsByState = new Map(stateJobCounts.map((r) => [r.state as string, r._count.id]));

  const national = summarizeMidpoints(market.national);
  const nationalFull = national.tier === 'full' ? national : null;
  const medianDisplay = nationalFull ? roundDisplayDollars(nationalFull.median) : null;

  const explorerStates: ExplorerState[] = hubStates.map((s) => ({
    state: s.state,
    stateCode: STATE_CODES[s.state] || '',
    slug: stateSlug(s.state),
    n: s.n,
    median: s.median,
    p25: s.p25,
    p75: s.p75,
  }));

  const topStates = hubStates.filter((s) => s.p25 != null).slice(0, 3);
  const remotePct = totalPublished > 0 ? Math.round((remoteCount / totalPublished) * 100) : 0;
  const remoteSummary = summarizeMidpoints(market.remote);

  const currentYear = new Date().getFullYear();
  const fmt = (n: number) => n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
  const fmtK = (n: number) => `$${Math.round(roundDisplayDollars(n) / 1000)}K`;

  // FAQ content is built from the SAME live figures the page renders, so
  // the answers can never contradict the data. Rendered as visible content
  // only — FAQPage rich results have been dead for non-government sites
  // since 2023, so no FAQPage JSON-LD is emitted.
  const faqData = [
    {
      q: `How much do PMHNPs make in ${currentYear}?`,
      a: nationalFull
        ? `Across ${nationalFull.n.toLocaleString()} live postings with disclosed ranges, the median advertised PMHNP salary is ${fmtK(nationalFull.median)} per year. The middle 50% of postings advertise between ${fmtK(nationalFull.p25)} and ${fmtK(nationalFull.p75)}. These are advertised figures from job postings, not self-reported earnings.`
        : 'We compute pay figures from live postings with disclosed ranges. Check the explorer above for the current numbers.',
    },
    {
      q: 'Which states advertise the highest PMHNP pay?',
      a: topStates.length >= 3
        ? `By median advertised pay in current postings (minimum 10 disclosed ranges): ${topStates.map((s, i) => `${i + 1}. ${s.state} (${fmtK(s.median)}, n=${s.n})`).join(', ')}. Rankings shift as postings change; the table above updates daily.`
        : 'See the live state table above; rankings update daily as postings change.',
    },
    {
      q: 'Do telehealth or remote PMHNPs make less than in-person?',
      a: (remoteSummary.tier === 'full' || remoteSummary.tier === 'median') && nationalFull
        ? `In current postings, fully remote roles advertise a median of ${fmtK(remoteSummary.median)} (n=${remoteSummary.n}) against an overall median of ${fmtK(nationalFull.median)}. Remote work trades some pay range for flexibility and a national job pool, and ${remotePct}% of live postings are remote.`
        : 'Remote medians appear in the setting table above whenever enough postings disclose a range.',
    },
    {
      q: 'How can I increase my PMHNP salary?',
      a: 'The levers with the strongest evidence: practice in a Full Practice Authority state (see our practice authority map), build experience in scarce niches like addiction or child and adolescent psychiatry, compare 1099 contract rates against W-2 packages honestly (our calculator does the tax math), and negotiate from data. The Offer Analyzer shows the exact percentile of any offer against live postings.',
    },
    {
      q: 'How much do travel or locum tenens PMHNPs make?',
      a: 'Locum and travel contracts are usually quoted hourly and can look much higher than salaried roles, but they typically exclude benefits and add self-employment tax. Browse current locum tenens postings for real rates, and use the salary converter to annualize an hourly quote under your actual schedule.',
    },
  ];

  // Article schema: honest description, real author attribution.
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": `${currentYear} PMHNP Salary Guide: Psychiatric NP Pay by State`,
    "description": `Advertised PMHNP pay computed from live job postings: national median, state-by-state medians and ranges, and practice-setting breakdowns. Every figure ships with its sample size.`,
    "image": "https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/pmhnp-salary-guide-2026.webp",
    "datePublished": "2026-01-01T00:00:00Z",
    "dateModified": new Date().toISOString(),
    "author": { "@type": "Person", "name": "Sathish Kumar", "jobTitle": "Creator, PMHNP Hiring", "url": "https://pmhnphiring.com/about" },
    "publisher": { "@type": "Organization", "name": "PMHNP Hiring", "url": "https://pmhnphiring.com", "logo": { "@type": "ImageObject", "url": "https://pmhnphiring.com/logo.svg" } },
    "mainEntityOfPage": { "@type": "WebPage", "@id": "https://pmhnphiring.com/salary-guide" }
  };

  return (
    <>
      <VideoJsonLd pathname="/salary-guide" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(articleSchema) }} />
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://pmhnphiring.com" },
        { name: "Salary Guide", url: "https://pmhnphiring.com/salary-guide" }
      ]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString({
        "@context": "https://schema.org", "@type": "WebPage",
        "name": `${currentYear} PMHNP Salary Guide`,
        "speakable": { "@type": "SpeakableSpecification", "cssSelector": [".quick-answer-box", "h1"] },
        "url": "https://pmhnphiring.com/salary-guide"
      }) }} />

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 1: HERO BENTO (warm cream bg)
          ═══════════════════════════════════════════════════════════════ */}
      <div style={{ background: 'linear-gradient(180deg, #FFF5EE 0%, #FDE8D8 40%, #FFF5EE 100%)', paddingBottom: '64px' }}>
        <section style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 20px 0' }}>
          {/* Title */}
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '8px' }}>
              {currentYear} Advertised Pay Data
            </p>
            <h1 className="font-lora" style={{
              fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 800, lineHeight: 1.15,
              color: '#1A2E35', marginBottom: '16px',
            }}>
              PMHNP Salary Guide
            </h1>
            <p style={{ fontSize: '17px', color: '#5A4A42', maxWidth: '640px', margin: '0 auto', lineHeight: 1.6 }}>
              {medianDisplay ? (
                <>National median <strong>${medianDisplay.toLocaleString()}</strong> per year, computed from live postings that disclose a range.</>
              ) : (
                <>Live advertised pay computed from postings that disclose a range.</>
              )}{' '}
              State-by-state medians, practice settings, and tools to pressure-test any offer.
            </p>
          </div>

          {/* ─── Bento Grid ─── */}
          <div className="sal-hero-bento" style={{ display: 'grid', gap: '14px' }}>

            {/* Explorer (8 cols on desktop, full row on mobile) */}
            <div className="sal-hero-calc" style={{ minWidth: 0 }}>
              {nationalFull && (
                <SalaryStateExplorer
                  states={explorerStates}
                  national={{ median: nationalFull.median, p25: nationalFull.p25, p75: nationalFull.p75, n: nationalFull.n }}
                />
              )}
            </div>

            {/* Right sidebar: Stats + PDF */}
            <div className="sal-hero-sidebar" style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* Stat pills, all live except the attributed BLS projection */}
              <div className="emp-bento-card" style={{
                ...clayCard, padding: '24px 22px', flex: 1,
                display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '14px',
              }}>
                <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Key Numbers</h3>
                {[
                  ...(nationalFull ? [
                    { value: fmtK(nationalFull.median), label: 'National Median', bg: '#D4F5E9', color: '#065F46' },
                    { value: `${fmtK(nationalFull.p25)} to ${fmtK(nationalFull.p75)}`, label: 'Middle 50%', bg: '#E0E7FF', color: '#3730A3' },
                    { value: nationalFull.n.toLocaleString(), label: 'Postings Analyzed', bg: '#FEF3C7', color: '#92400E' },
                  ] : []),
                  { value: '45%', label: 'NP Job Growth (BLS projection)', bg: '#FFE0D3', color: '#7C2D12' },
                ].map(s => (
                  <div key={s.label} className="sal-stat-pill" style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 16px', borderRadius: '14px',
                    background: s.bg,
                    boxShadow: '3px 3px 8px rgba(0,0,0,0.04), inset 1px 1px 2px rgba(255,255,255,0.5)',
                  }}>
                    <span style={{ fontSize: '18px', fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</span>
                    <span style={{ fontSize: '12px', color: s.color, opacity: 0.7, fontWeight: 500 }}>{s.label}</span>
                  </div>
                ))}
              </div>

              {/* PDF download card */}
              <div className="emp-bento-card" style={{
                ...clayCard, padding: '20px', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)',
                border: '1.5px solid rgba(13,148,136,0.12)',
              }}>
                <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#134E4A', margin: '0 0 10px' }}>📄 Download Free PDF Guide</h3>
                <SalaryGuideForm />
                <p style={{ fontSize: '10px', color: '#94A3B8', marginTop: '8px', marginBottom: 0 }}>
                  Figures computed from live postings on this site. Methodology below.
                </p>
              </div>
            </div>

            {/* Quick Answer (full-width 12 cols) */}
            <div className="quick-answer-box emp-bento-card" style={{
              ...clayCard, gridColumn: 'span 12', padding: '28px 32px',
              border: '2px solid rgba(13,148,136,0.10)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '20px' }}>
                <Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/employers/clay-dollar.webp" alt="Salary" width={44} height={44} style={{ width: '44px', height: '44px', borderRadius: '14px', flexShrink: 0 }} />
                <div>
                  <h2 className="font-lora" style={{ fontSize: '18px', fontWeight: 700, color: '#1A2E35', margin: '0 0 8px' }}>Quick Answer: PMHNP Salary in {currentYear}</h2>
                  <p style={{ fontSize: '14px', color: '#5A4A42', lineHeight: 1.7, margin: 0 }}>
                    {nationalFull ? (
                      <>
                        The median advertised PMHNP salary is <strong>${roundDisplayDollars(nationalFull.median).toLocaleString()} per year</strong> across{' '}
                        {nationalFull.n.toLocaleString()} live postings with disclosed ranges. The middle 50% of postings advertise{' '}
                        <strong>{fmtK(nationalFull.p25)} to {fmtK(nationalFull.p75)}</strong>.
                        {topStates.length >= 3 && (
                          <> The highest advertised medians right now: {topStates.map((s) => `${s.state} (${fmtK(s.median)})`).join(', ')}.</>
                        )}{' '}
                        These are advertised figures, not self-reported earnings, and they refresh daily.
                      </>
                    ) : (
                      <>Live advertised-pay figures appear here whenever enough postings disclose a range.</>
                    )}
                  </p>
                </div>
              </div>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px',
                paddingTop: '18px', borderTop: '1px solid rgba(0,0,0,0.06)',
              }} className="sal-quick-stats">
                {[
                  ...(nationalFull ? [
                    { value: fmtK(nationalFull.median), label: 'Median Advertised', color: '#0D9488' },
                    { value: `${fmtK(nationalFull.p25)} to ${fmtK(nationalFull.p75)}`, label: 'Middle 50%', color: '#0D9488' },
                    { value: nationalFull.n.toLocaleString(), label: 'Postings Analyzed', color: '#F59E0B' },
                  ] : []),
                  { value: `${remotePct}%`, label: 'Remote Share of Postings', color: '#F59E0B' },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                    <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </section>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 3: STATE SALARY TABLE (slate bg)
          ═══════════════════════════════════════════════════════════════ */}
      {hubStates.length > 0 && (
        <section style={{ background: 'linear-gradient(180deg, #F1F5F9 0%, #E8EDF2 50%, #F1F5F9 100%)', padding: '80px 20px' }}>
          <div style={{ maxWidth: '900px', margin: '0 auto' }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
              Salary by Location
            </p>
            <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.5vw, 32px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '8px' }}>
              PMHNP Salary by State
            </h2>
            <p style={{ fontSize: '15px', color: '#5A4A42', textAlign: 'center', maxWidth: '540px', margin: '0 auto 12px', lineHeight: 1.6 }}>
              Median advertised pay per state, ranked. Click any state for its full guide and open jobs.
            </p>

            {/* Note */}
            <div style={{
              ...clayCard, maxWidth: '680px', margin: '0 auto 28px', padding: '14px 20px',
              background: '#F0FDFA', border: '1px solid #99F6E4',
            }}>
              <p style={{ fontSize: '12px', color: '#134E4A', margin: 0, lineHeight: 1.5 }}>
                <strong>Note:</strong> live data from active postings that disclose a salary range.
                States appear once at least 5 postings disclose a range; the middle-50% column needs 10.
              </p>
            </div>

            {/* Table */}
            <div className="emp-compare-table" style={{ ...clayCard, padding: '0', overflow: 'hidden' }}>
              <table role="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', tableLayout: 'fixed' }}>
                <thead>
                  <tr style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.08), rgba(13,148,136,0.02))' }}>
                    <th style={{ width: '33%', padding: '14px 20px', textAlign: 'left', fontWeight: 600, color: '#64748B', borderBottom: '2px solid rgba(0,0,0,0.06)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>State</th>
                    <th style={{ width: '17%', padding: '14px 16px', textAlign: 'right', fontWeight: 600, color: '#64748B', borderBottom: '2px solid rgba(0,0,0,0.06)', fontSize: '11px', textTransform: 'uppercase' }}>Median</th>
                    <th className="sal-range-col" style={{ width: '25%', padding: '14px 16px', textAlign: 'right', fontWeight: 600, color: '#64748B', borderBottom: '2px solid rgba(0,0,0,0.06)', fontSize: '11px', textTransform: 'uppercase' }}>Middle 50%</th>
                    <th style={{ width: '15%', padding: '14px 16px', textAlign: 'right', fontWeight: 600, color: '#64748B', borderBottom: '2px solid rgba(0,0,0,0.06)', fontSize: '11px', textTransform: 'uppercase' }}>Open Jobs</th>
                    <th style={{ width: '10%', padding: '14px 16px', textAlign: 'right', borderBottom: '2px solid rgba(0,0,0,0.06)' }}><span style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {hubStates.map((state, i) => (
                    <tr key={state.state} style={{ background: i < 3 ? 'rgba(251,191,36,0.06)' : i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)' }}>
                      <td style={{ padding: '12px 20px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {i < 3 && (
                            <span style={{
                              width: '22px', height: '22px', borderRadius: '50%',
                              background: '#FEF3C7', color: '#92400E', fontSize: '11px', fontWeight: 700,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>{i + 1}</span>
                          )}
                          <div>
                            <Link href={`/salary-guide/${stateSlug(state.state)}`} style={{ fontWeight: 600, color: '#1A2E35', textDecoration: 'none' }}>{state.state}</Link>
                            <span style={{ fontSize: '11px', color: '#94A3B8', marginLeft: '6px' }}>{STATE_CODES[state.state] || ''}</span>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', borderBottom: '1px solid rgba(0,0,0,0.04)', fontWeight: 700, color: '#1A2E35' }}>
                        ${fmt(roundDisplayDollars(state.median))}
                        <span style={{ fontSize: '10.5px', fontWeight: 500, color: '#94A3B8' }}> n={state.n}</span>
                      </td>
                      <td className="sal-range-col" style={{ padding: '12px 16px', textAlign: 'right', borderBottom: '1px solid rgba(0,0,0,0.04)', fontSize: '12px', color: '#64748B' }}>
                        {state.p25 != null && state.p75 != null
                          ? `$${fmt(roundDisplayDollars(state.p25))} to $${fmt(roundDisplayDollars(state.p75))}`
                          : 'median only'}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', borderBottom: '1px solid rgba(0,0,0,0.04)', fontSize: '13px', color: '#64748B' }}>
                        {(jobsByState.get(state.state) ?? 0).toLocaleString()}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                        <Link href={`/jobs/state/${stateSlug(state.state)}`} style={{ fontSize: '12px', color: '#0D9488', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                          Jobs <ArrowUpRight size={12} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 4: SALARY BREAKDOWN BENTO (cream bg)
          ═══════════════════════════════════════════════════════════════ */}
      <div style={{ background: 'linear-gradient(180deg, #FFF5EE 0%, #FDE8D8 50%, #FFF5EE 100%)', padding: '80px 20px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
            Salary Breakdown
          </p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.5vw, 32px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '36px' }}>
            What Impacts Your Earnings
          </h2>

          <div className="sal-bento" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '14px' }}>

            {/* Experience honesty card (8 cols) */}
            <div className="sal-bento-exp emp-bento-card" style={{ ...clayCard, gridColumn: 'span 8', padding: '24px 28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                <Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/employers/clay-calendar.webp" alt="Experience" width={44} height={44} style={{ width: '44px', height: '44px', borderRadius: '14px' }} />
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#1A2E35', margin: 0 }}>Why We Don&apos;t Publish an Experience Table</h3>
              </div>
              <p style={{ fontSize: '14px', color: '#5A4A42', lineHeight: 1.7, margin: '0 0 12px' }}>
                Fewer than 1% of live postings state a required experience level alongside a salary
                range, so any &ldquo;new grad vs 10 years&rdquo; dollar table would be invented. What
                postings show instead: most employers advertise one range for the role and negotiate
                within it based on autonomy, panel size, and prescriptive experience.
              </p>
              <p style={{ fontSize: '14px', color: '#5A4A42', lineHeight: 1.7, margin: 0 }}>
                If you are negotiating, the honest move is to find where an offer lands in the
                advertised distribution for your state. The{' '}
                <Link href="/tools/offer-analyzer" style={{ color: '#0D9488', fontWeight: 600 }}>Offer Analyzer</Link>{' '}
                does that in your browser, and{' '}
                <Link href="/jobs/new-grad" style={{ color: '#0D9488', fontWeight: 600 }}>new grad friendly roles</Link>{' '}
                are tagged across the board.
              </p>
            </div>

            {/* Practice Setting: live medians (4 cols) */}
            <div className="sal-bento-setting emp-bento-card" style={{ ...clayCard, gridColumn: 'span 4', padding: '24px 22px', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/employers/clay-briefcase.webp" alt="Setting" width={44} height={44} style={{ width: '44px', height: '44px', borderRadius: '14px' }} />
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#1A2E35', margin: 0 }}>By Setting (Live)</h3>
              </div>
              <p style={{ fontSize: '11px', color: '#94A3B8', margin: '0 0 12px' }}>
                Median advertised pay, national. Settings need 5+ disclosed ranges to appear.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {settingMedians.length > 0 ? settingMedians.map((item) => (
                  <div key={item.setting} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', borderRadius: '12px',
                    background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.04)',
                  }}>
                    <div>
                      <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#1A2E35' }}>{item.setting}</div>
                      <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: '1px' }}>n={item.n}</div>
                    </div>
                    <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#0D9488', whiteSpace: 'nowrap', marginLeft: '8px' }}>{fmtK(item.median)}</span>
                  </div>
                )) : (
                  <p style={{ fontSize: '12px', color: '#94A3B8', margin: 0 }}>
                    No setting currently clears the 5-posting minimum.
                  </p>
                )}
              </div>
            </div>

            {/* High-demand niches (6 cols) */}
            <div className="sal-bento-spec emp-bento-card" style={{ ...clayCard, gridColumn: 'span 6', padding: '24px 28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                <Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/employers/clay-star.webp" alt="Specialty" width={44} height={44} style={{ width: '44px', height: '44px', borderRadius: '14px' }} />
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#1A2E35', margin: 0 }}>High-Demand Niches</h3>
              </div>
              <p style={{ fontSize: '11px', color: '#94A3B8', margin: '0 0 12px' }}>
                Scarce skills tend to command stronger offers. Browse live postings per niche
                instead of trusting invented premium percentages.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {nicheLinks.map((item) => (
                  <Link key={item.label} href={item.href} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '9px 14px', borderRadius: '12px', textDecoration: 'none',
                    background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.04)',
                  }}>
                    <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#1A2E35' }}>{item.label}</span>
                    <span style={{ fontSize: '11px', color: '#0D9488', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      {item.note} <ArrowUpRight size={11} />
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            {/* FPA Impact (6 cols), counts from the data module */}
            <div className="sal-bento-fpa emp-bento-card" style={{
              ...clayCard, gridColumn: 'span 6', padding: '24px 22px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                <Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/employers/clay-chart.webp" alt="Practice Authority" width={44} height={44} style={{ width: '44px', height: '44px', borderRadius: '14px' }} />
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#1A2E35', margin: 0 }}>Full Practice Authority</h3>
              </div>
              <p style={{ fontSize: '13px', color: '#5A4A42', lineHeight: 1.6, margin: '0 0 16px' }}>
                <strong>{getStatesByAuthority('full').length} states and DC</strong> grant Full Practice
                Authority. FPA opens independent practice and private-practice ownership, which widens
                your earning ceiling.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ padding: '14px 16px', borderRadius: '14px', background: '#F0FDFA', border: '1px solid #99F6E4' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#0D9488', margin: '0 0 8px' }}>✓ Full Practice Authority</h4>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '11.5px', color: '#5A4A42' }}>
                    <li style={{ marginBottom: '3px' }}>• Independent practice allowed</li>
                    <li style={{ marginBottom: '3px' }}>• Can own a practice outright</li>
                    <li>• Full prescriptive autonomy</li>
                  </ul>
                </div>
                <div style={{ padding: '14px 16px', borderRadius: '14px', background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.06)' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#64748B', margin: '0 0 8px' }}>Restricted / Reduced</h4>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '11.5px', color: '#5A4A42' }}>
                    <li style={{ marginBottom: '3px' }}>• Collaboration agreement needed</li>
                    <li style={{ marginBottom: '3px' }}>• Supervision costs reduce margin</li>
                    <li>• Ownership options limited</li>
                  </ul>
                </div>
              </div>
              <p style={{ fontSize: '12px', margin: '14px 0 0' }}>
                <Link href="/tools/practice-authority-map" style={{ color: '#0D9488', fontWeight: 600 }}>
                  See every state on the interactive map →
                </Link>
              </p>
            </div>

          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 5: LIVE MARKET SNAPSHOT (slate bg)
          ═══════════════════════════════════════════════════════════════ */}
      <section style={{ background: 'linear-gradient(180deg, #F1F5F9 0%, #E8EDF2 50%, #F1F5F9 100%)', padding: '80px 20px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
            Market Intelligence
          </p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.5vw, 32px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '36px' }}>
            Live Market Snapshot
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px', marginBottom: '20px' }}>
            {[
              { value: totalPublished.toLocaleString(), label: 'Live postings right now' },
              { value: `${remotePct}%`, label: 'Fully remote share' },
              { value: hubStates.length.toString(), label: 'States with salary data' },
              ...(topStates.length > 0 ? [{ value: `${topStates[0].state}`, label: `Top advertised median (${fmtK(topStates[0].median)})` }] : []),
            ].map((s) => (
              <div key={s.label} className="emp-bento-card" style={{ ...clayCard, padding: '22px 20px', textAlign: 'center' }}>
                <div className="font-lora" style={{ fontSize: '26px', fontWeight: 800, color: '#0D9488', lineHeight: 1.1 }}>{s.value}</div>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '6px' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Why Demand is High: public figures, attributed */}
          <div style={{ ...clayCard, padding: '22px 28px', background: '#F0FDFA', border: '1px solid #99F6E4' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#134E4A', margin: '0 0 10px' }}>Why Demand Stays High</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexWrap: 'wrap', gap: '8px 24px', fontSize: '13px', color: '#5A4A42' }}>
              <li>• Over <strong>120 million</strong> Americans live in mental health shortage areas (HRSA)</li>
              <li>• <strong>45%</strong> projected NP job growth through 2032 (BLS)</li>
              <li>• Psychiatric prescriber shortages persist in most states (HRSA)</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 6: FACTORS (cream bg)
          ═══════════════════════════════════════════════════════════════ */}
      <div style={{ background: 'linear-gradient(180deg, #FFF5EE 0%, #FDE8D8 50%, #FFF5EE 100%)', padding: '80px 20px' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
            Maximize Your Pay
          </p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.5vw, 32px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '36px' }}>
            Factors Affecting PMHNP Salary
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
            {factorCards.map(card => (
                <div key={card.title} className="emp-bento-card" style={{ ...clayCard, padding: '28px 24px' }}>
                  <Image src={card.img} alt={card.title} width={48} height={48} style={{ width: '48px', height: '48px', borderRadius: '14px', marginBottom: '16px' }} />
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', margin: '0 0 8px' }}>{card.title}</h3>
                  <p style={{ fontSize: '13px', color: '#5A4A42', lineHeight: 1.6, margin: 0 }}>{card.desc}</p>
                </div>
            ))}
          </div>

          <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '14px' }}>
            <Link href="/tools" style={{ color: '#0D9488', fontWeight: 700 }}>
              Run your own numbers with the free career tools →
            </Link>
          </p>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 7: FAQ (white bg) — visible content only, no FAQPage
          schema (dead for non-government sites since 2023)
          ═══════════════════════════════════════════════════════════════ */}
      <section style={{ padding: '80px 20px', background: '#fff' }}>
        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
            Common Questions
          </p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '32px' }}>
            Frequently Asked Questions
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {faqData.map(({ q, a }) => (
              <details key={q} style={{ ...clayCard, padding: 0, overflow: 'hidden' }}>
                <summary style={{
                  padding: '18px 24px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '12px',
                  fontSize: '15px', fontWeight: 600, color: '#1A2E35', listStyle: 'none',
                }}>
                  <Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/employers/clay-envelope.webp" alt="FAQ" width={28} height={28} style={{ width: '28px', height: '28px', borderRadius: '8px', flexShrink: 0 }} />
                  {q}
                </summary>
                <div style={{ padding: '0 24px 18px 64px', fontSize: '14px', color: '#5A4A42', lineHeight: 1.65 }}>{a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 8: CITATION + CTA (slate bg)
          ═══════════════════════════════════════════════════════════════ */}
      <section style={{ background: 'linear-gradient(180deg, #F1F5F9 0%, #E8EDF2 50%, #F1F5F9 100%)', padding: '80px 20px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          {/* Citation */}
          <div style={{ ...clayCard, padding: '24px 28px', marginBottom: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1A2E35', margin: '0 0 10px' }}>📋 Cite This Page</h3>
            <p style={{ fontSize: '13px', color: '#5A4A42', marginBottom: '14px' }}>Use the following citation when referencing data from this salary guide:</p>
            <CopyCitation citation={`PMHNP Hiring. "2026 PMHNP Salary Guide: Psychiatric NP Pay by State." PMHNP Hiring, ${currentYear}, pmhnphiring.com/salary-guide.`} />
            <p style={{ fontSize: '11px', color: '#94A3B8', marginTop: '10px' }}>
              Maintained by Sathish Kumar, creator of PMHNP Hiring. For media inquiries or custom data requests, contact press@pmhnphiring.com
            </p>
          </div>

          {/* Free tools cross-links */}
          <div style={{ ...clayCard, padding: '24px 28px', marginBottom: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1A2E35', margin: '0 0 10px' }}>🧰 Put This Data to Work</h3>
            <p style={{ fontSize: '13px', color: '#5A4A42', marginBottom: '14px' }}>
              Free tools built on the same live posting data:{' '}
              <Link href="/tools/offer-analyzer" style={{ color: '#0D9488', fontWeight: 600 }}>check whether your offer is competitive</Link>,{' '}
              <Link href="/tools/salary-converter" style={{ color: '#0D9488', fontWeight: 600 }}>convert hourly to annual</Link>,{' '}
              <Link href="/tools/1099-vs-w2-calculator" style={{ color: '#0D9488', fontWeight: 600 }}>compare 1099 vs W-2 take-home</Link>, or{' '}
              <Link href="/tools/practice-authority-map" style={{ color: '#0D9488', fontWeight: 600 }}>see practice authority by state</Link>.
            </p>
          </div>

          {/* Data Sources */}
          <div style={{ ...clayCard, padding: '16px 24px', background: 'rgba(0,0,0,0.02)', marginBottom: '24px', textAlign: 'center' }}>
            <p style={{ fontSize: '12px', color: '#64748B', margin: 0, lineHeight: 1.5 }}>
              <strong>Data Sources & Methodology:</strong> every dollar figure on this page is a
              median of advertised salary midpoints from the {totalPublished.toLocaleString()} live
              postings on this site. Employer-estimated ranges are excluded; defective ranges
              (implausible bounds, max more than 3× min, midpoints outside $50k to $500k) are
              quarantined; figures only publish when at least 5 postings disclose a range, and
              percentile ranges need 10. Labor-market context (job growth, shortage areas) is
              attributed to BLS and HRSA where cited. Figures refresh daily.
            </p>
          </div>

          {/* CTA */}
          <div className="sal-cta-grid emp-bento-card" style={{
            ...clayCard, padding: '0', overflow: 'hidden',
            display: 'grid', gridTemplateColumns: '1fr 320px', alignItems: 'center',
          }}>
            <div style={{ padding: '36px 32px' }}>
              <h2 className="font-lora" style={{ fontSize: '22px', fontWeight: 700, color: '#1A2E35', margin: '0 0 10px' }}>
                Find Your Next High-Paying{' '}
                <span style={{ color: '#0D9488' }}>PMHNP Job</span>
              </h2>
              <p style={{ fontSize: '14px', color: '#5A4A42', lineHeight: 1.6, margin: '0 0 20px', maxWidth: '380px' }}>
                Browse positions with competitive salaries. Filter by location, salary, and work type.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                <Link href="/jobs" className="emp-cta-primary" style={{
                  padding: '12px 24px', borderRadius: '12px', fontWeight: 700, fontSize: '14px',
                  background: 'linear-gradient(145deg, #0D9488, #10B981)', color: '#fff',
                  textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px',
                  boxShadow: '4px 4px 12px rgba(13,148,136,0.2), inset 1px 1px 2px rgba(255,255,255,0.15)',
                }}>
                  Browse All Jobs <ArrowRight size={15} />
                </Link>
                {[
                  { label: 'Remote', href: '/jobs/remote' },
                  { label: 'Telehealth', href: '/jobs/telehealth' },
                  { label: 'Travel', href: '/jobs/travel' },
                ].map(l => (
                  <Link key={l.label} href={l.href} className="emp-cta-secondary" style={{
                    padding: '12px 18px', borderRadius: '12px', fontWeight: 600, fontSize: '13px',
                    background: '#fff', color: '#1A2E35', textDecoration: 'none',
                    display: 'inline-flex', alignItems: 'center',
                    border: '1px solid rgba(0,0,0,0.08)',
                    boxShadow: '2px 2px 6px rgba(0,0,0,0.04)',
                  }}>
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)' }}>
              <Image
                src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/employers/cta-illustration.webp"
                alt="Find high-paying PMHNP jobs"
                width={280} height={220}
                style={{ width: '100%', maxWidth: '260px', height: 'auto', borderRadius: '14px' }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Responsive + Hover ═══ */}
      <style>{`
        /* Mobile-first: single column. Desktop bumps to 12-track bento via media query below. */
        .sal-hero-bento { grid-template-columns: 1fr; }
        .sal-hero-calc { grid-column: span 1; }
        .sal-hero-sidebar { grid-column: span 1; }
        @media (min-width: 769px) {
          .sal-hero-bento { grid-template-columns: repeat(12, 1fr); }
          .sal-hero-calc { grid-column: span 8; }
          .sal-hero-sidebar { grid-column: span 4; }
        }
        .emp-cta-primary {
          transition: transform 0.25s ease, box-shadow 0.25s ease, filter 0.25s ease;
        }
        .emp-cta-primary:hover {
          transform: translateY(-3px);
          box-shadow: 0 10px 32px rgba(13,148,136,0.35), inset 1px 1px 2px rgba(255,255,255,0.2) !important;
          filter: brightness(1.05);
        }
        .emp-cta-secondary {
          transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
        }
        .emp-cta-secondary:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0,0,0,0.08) !important;
          border-color: rgba(13,148,136,0.3) !important;
        }
        .emp-bento-card {
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .emp-bento-card:hover {
          transform: translateY(-4px);
          box-shadow: 8px 8px 24px rgba(0,0,0,0.1), -4px -4px 12px rgba(255,255,255,0.9), inset 1px 1px 2px rgba(255,255,255,0.6) !important;
        }
        .emp-compare-table tr {
          transition: background 0.2s ease;
        }
        .emp-compare-table tbody tr:hover {
          background: rgba(13,148,136,0.04) !important;
        }
        .sal-stat-pill {
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .sal-stat-pill:hover {
          transform: translateY(-2px) scale(1.02);
          box-shadow: 6px 6px 20px rgba(0,0,0,0.1), -3px -3px 10px rgba(255,255,255,0.9) !important;
        }

        @media (max-width: 768px) {
          .sal-hero-bento .quick-answer-box { grid-column: span 1 !important; }
          .sal-bento { grid-template-columns: 1fr !important; }
          .sal-bento > div { grid-column: span 1 !important; }
          .sal-cta-grid { grid-template-columns: 1fr !important; }
          .sal-quick-stats { grid-template-columns: repeat(2, 1fr) !important; }
          .sal-range-col { display: none; }
        }
        @media (min-width: 769px) and (max-width: 1024px) {
          .sal-hero-calc { grid-column: span 7 !important; }
          .sal-hero-sidebar { grid-column: span 5 !important; }
          .sal-bento { grid-template-columns: repeat(6, 1fr) !important; }
          .sal-bento-exp { grid-column: span 6 !important; }
          .sal-bento-setting { grid-column: span 6 !important; }
          .sal-bento-spec { grid-column: span 6 !important; }
          .sal-bento-fpa { grid-column: span 6 !important; }
        }
      `}</style>
    </>
  );
}
