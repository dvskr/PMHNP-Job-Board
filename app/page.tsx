import { jsonLdString } from '@/lib/seo/json-ld';
import { Metadata } from 'next';

import { getSiteStats, getExtendedSiteStats } from '@/lib/site-stats';
import { roundedCountDisplay } from '@/lib/format-count';
import { brand } from '@/config/brand';
import { STAT_SOURCES } from '@/lib/stats-sources';
import EmployerTrustSection from '@/components/EmployerTrustSection';
import FeaturedJobsSection from '@/components/FeaturedJobsSection';
import TopStatesSection from '@/components/TopStatesSection';
import HomepageHero from '@/components/HomepageHero';
import VideoJsonLd from '@/components/VideoJsonLd';
import HomepageBlogSection from '@/components/HomepageBlogSection';
import EmployerHowItWorks from '@/components/EmployerHowItWorks';


// Revalidate every 60 seconds
export const revalidate = 60;

/**
 * Total job count for dynamic metadata. Reads the cached SiteStat snapshot
 * (refreshed hourly by the refresh-site-stats cron) instead of running a live
 * COUNT on every render of the hottest page on the site.
 */
async function getTotalJobCount(): Promise<number> {
  return (await getSiteStats()).totalJobs;
}

/**
 * Unique employer count for dynamic metadata — also from the cached snapshot
 * (avoids a `findMany({ distinct: ['employer'] })` per render).
 */
async function getUniqueEmployerCount(): Promise<number> {
  return (await getSiteStats()).totalCompanies;
}

/**
 * Generate dynamic metadata with job count
 */
export async function generateMetadata(): Promise<Metadata> {
  const [totalJobs, uniqueEmployerCount] = await Promise.all([
    getTotalJobCount(),
    getUniqueEmployerCount(),
  ]);
  const jobCountDisplay = roundedCountDisplay(totalJobs);

  return {
    // SEO Fix #7: trim title to ≤60 chars (Google SERP cap). Previous title
    // ran 77 chars and got truncated mid-phrase, costing CTR.
    title: `${jobCountDisplay} PMHNP Jobs — Psychiatric NP Job Board`,
    description: `Browse ${jobCountDisplay} PMHNP jobs updated daily. Remote, telehealth & in-person psychiatric NP positions with salary transparency. Free for job seekers.`,
    openGraph: {
      title: `${jobCountDisplay} PMHNP Jobs - Find Your Next Position`,
      description: `Browse ${jobCountDisplay} psychiatric nurse practitioner jobs. Remote, hybrid, and in-person positions with salary transparency.`,
      images: [
        {
          url: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/pmhnp-job-board-homepage.webp',
          width: 1280,
          height: 900,
          alt: `PMHNP Hiring job board homepage showing ${jobCountDisplay} psychiatric nurse practitioner jobs from ${uniqueEmployerCount}+ companies across 50 states`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      images: ['https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/pmhnp-job-board-homepage.webp'],
    },
    alternates: {
      canonical: brand.baseUrl,
    },
  };
}

export default async function Home() {
  const [stats, extended] = await Promise.all([
    getSiteStats(),
    getExtendedSiteStats(),
  ]);
  const totalJobs = stats.totalJobs;
  // Same formatter as generateMetadata, so the hero body and the <title>
  // can never disagree on how the rounded count renders.
  const jobCountDisplay = roundedCountDisplay(totalJobs);

  // Homepage FAQ single source of truth (audit 2026-08 C3): the visible FAQ
  // section AND the FAQPage JSON-LD both map over this exact array — schema
  // without matching visible content is a structured-data policy violation.
  // Every figure is either cited from STAT_SOURCES or written number-free;
  // the old schema-only block carried invented stats (an unsourced remote
  // share percentage and per-state opening counts) that had no source
  // anywhere. tests/seo/faq-schema-parity.test.ts locks both properties.
  const homepageFaqs: Array<{ q: string; a: string }> = [
    {
      q: 'What is a PMHNP?',
      a: 'A PMHNP (Psychiatric Mental Health Nurse Practitioner) is an advanced practice registered nurse who specializes in mental health care. PMHNPs, also called psych NPs or behavioral health nurse practitioners, can diagnose and treat mental health conditions, prescribe medications, and provide psychotherapy. They hold a Master\'s or Doctoral degree in psychiatric nursing and are certified by the ANCC as PMHNP-BC.',
    },
    {
      q: 'How much do PMHNPs make?',
      a: `PMHNPs earn an average annual salary of ${STAT_SOURCES.averageSalary.formatted} based on the ${STAT_SOURCES.averageSalary.source} (${STAT_SOURCES.averageSalary.asOf}). Actual pay varies by state, practice setting, experience, and whether a role is W-2 or 1099. Listings on PMHNP Hiring show the advertised range whenever the employer discloses one.`,
    },
    {
      q: 'What is the PMHNP job outlook?',
      a: `The PMHNP job outlook is strong: ${STAT_SOURCES.blsGrowthProjection.source} projects ${STAT_SOURCES.blsGrowthProjection.formatted} employment growth for nurse practitioners from ${STAT_SOURCES.blsGrowthProjection.projectionWindow}, much faster than average. Roughly ${STAT_SOURCES.hrsaShortagePopulation.formatted} Americans live in mental-health Health Professional Shortage Areas (${STAT_SOURCES.hrsaShortagePopulation.source}, ${STAT_SOURCES.hrsaShortagePopulation.asOf}), so demand for psychiatric NPs continues to expand alongside telehealth access.`,
    },
    {
      q: 'How long does it take to become a PMHNP?',
      a: 'The typical path is a four-year BSN, licensure and experience as an RN, then a Master\'s or DNP program with a psychiatric mental health specialization, which adds two to four years depending on the degree and enrollment pace. Accelerated BSN-to-DNP programs can shorten the timeline. After graduation, you must pass the ANCC PMHNP-BC certification exam.',
    },
    {
      q: 'Can PMHNPs prescribe medication?',
      a: `Yes. PMHNPs can prescribe medications, including controlled substances, in all 50 states. In full practice authority states (${STAT_SOURCES.fullPracticeStates.formatted}, per the ${STAT_SOURCES.fullPracticeStates.source}), PMHNPs prescribe independently; in reduced or restricted practice states, a collaborative agreement with a physician may be required. PMHNPs commonly prescribe antidepressants, anxiolytics, antipsychotics, mood stabilizers, and stimulants.`,
    },
    {
      q: 'What is the difference between a PMHNP and a psychiatrist?',
      a: 'PMHNPs hold a graduate nursing degree with a psychiatric specialization, while psychiatrists complete medical school plus a multi-year residency. Both can diagnose mental health conditions and prescribe medications, and in full practice authority states PMHNPs practice independently. PMHNPs reach full practice sooner and with less educational debt, while psychiatrists train longer and generally earn more.',
    },
    {
      q: 'What does a psychiatric nurse practitioner do on a typical workday?',
      a: 'A typical PMHNP workday includes conducting psychiatric evaluations, diagnosing mental health conditions such as depression, anxiety, PTSD, bipolar disorder, and schizophrenia, prescribing and managing psychotropic medications, providing psychotherapy, collaborating with interdisciplinary teams, and documenting in EHR systems. Outpatient roles center on scheduled medication management visits, while inpatient roles involve rounding on hospitalized patients.',
    },
    {
      q: 'Are there remote psych NP jobs?',
      a: 'Yes. Remote and telehealth PMHNP roles are a large and growing part of the market, including video-based medication management, telepsychiatry, utilization review, and clinical documentation positions. Browse the remote jobs page on PMHNP Hiring for current openings with advertised salaries.',
    },
    {
      q: 'Can PMHNPs own a private practice?',
      a: 'Yes. PMHNPs can own a private practice in every state, though the level of independence varies. In full practice authority states, PMHNPs can practice and prescribe without physician oversight, while restricted states may require a collaborative agreement. Practice owners take on business operations, insurance credentialing, and overhead in exchange for schedule control and higher earning potential.',
    },
    {
      q: 'Which states have the highest demand for psychiatric nurse practitioners?',
      a: 'Demand for PMHNPs is strong nationwide, and populous states tend to post the most openings at any given time. Full practice authority states often see especially active hiring because fewer practice restrictions apply. For live job counts by state, browse the jobs by location page on PMHNP Hiring.',
    },
    {
      q: 'What are the most in-demand PMHNP specializations?',
      a: 'Frequently requested PMHNP specializations include addiction and substance use treatment, child and adolescent psychiatry, forensic and correctional psychiatry, geriatric psychiatry, crisis and emergency psychiatry, and telehealth-focused medication management. Specialized training, such as addiction medicine certification, can strengthen both candidacy and compensation.',
    },
    {
      q: 'Are PMHNPs eligible for loan forgiveness or incentive programs?',
      a: 'Yes. PMHNPs working in designated Health Professional Shortage Areas may qualify for National Health Service Corps loan repayment through HRSA. VA psychiatric NPs may qualify for the Education Debt Reduction Program (EDRP), and many states run their own loan forgiveness programs for mental health providers in community and rural settings. Check each program\'s current terms for award amounts and service commitments.',
    },
  ];

  return (
    <>
      {/* Structured data — outside content div to prevent hydration mismatch */}
      {/* Note: Organization schema is rendered site-wide in layout.tsx @graph.
          Removed standalone duplicate here to prevent conflicting signals in GSC. */}
      <VideoJsonLd pathname="/" />
      {/* Single-item BreadcrumbList deliberately removed (audit 2026-08 C3):
          a homepage-only breadcrumb carries no trail and no rich-result value. */}
      {/* FAQPage schema mapped 1:1 from the SAME homepageFaqs array the
          visible FAQ section at the bottom of the page renders. Do not add
          schema-only questions here — Google's FAQ policy requires the
          content to be visible on the page. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: homepageFaqs.map((faq) => ({
              '@type': 'Question',
              name: faq.q,
              acceptedAnswer: { '@type': 'Answer', text: faq.a },
            })),
          }),
        }}
      />

      {/* SEO Fix #10: WebSite + SearchAction is already emitted globally
          from app/layout.tsx (lines 215-232) inside the @graph block.
          Re-emitting it here produced duplicate WebSite nodes that conflict
          on the same URL. Removed. */}
      {/* Main content */}
      <div style={{ background: 'linear-gradient(180deg, #FDFBF7 0%, #F5D5C4 15%, #F0C4AF 50%, #FDFBF7 100%)' }}>
        {/* 1. Hero — above the fold. Real-stats subtitle renders only when
            the extended stats are available (never fabricated fallbacks). */}
        <HomepageHero
          jobCountDisplay={jobCountDisplay}
          totalCompanies={stats.totalCompanies}
          salaryTransparencyPct={extended?.salaryTransparencyPct}
        />

        {/* 2. Employer Clay Dough Strip */}
        <EmployerTrustSection />


        {/* ── Remaining sections (being redesigned) ── */}
        <FeaturedJobsSection />

        {/* 4. Top States */}
        <TopStatesSection />

        {/* 5. Employer How It Works */}
        <EmployerHowItWorks />

        <HomepageBlogSection />

        {/* 7. FAQ — visible accordion; the FAQPage schema above maps 1:1
            from this same homepageFaqs array (schema-visible parity). */}
        <section aria-labelledby="homepage-faq-heading" style={{ maxWidth: '900px', margin: '0 auto', padding: '56px 20px 72px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
            Common Questions
          </p>
          <h2 id="homepage-faq-heading" className="font-lora" style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '40px' }}>
            PMHNP Careers and Jobs, Answered
          </h2>
          <div style={{ display: 'grid', gap: '12px' }}>
            {homepageFaqs.map((faq, idx) => (
              <details key={idx} className="home-faq" style={{ background: '#FFFFFF', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '4px 4px 12px rgba(0,0,0,0.04), -2px -2px 8px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)', overflow: 'hidden' }}>
                <summary style={{ padding: '18px 24px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', listStyle: 'none', fontSize: '15px', fontWeight: 600, color: '#1A2E35', lineHeight: 1.4 }}>
                  <span>{faq.q}</span>
                  <span className="home-faq-chevron" style={{ flexShrink: 0, width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', background: '#F0FDFA', color: '#0D9488', fontSize: '17px', fontWeight: 700 }}>+</span>
                </summary>
                <div style={{ padding: '0 24px 18px', fontSize: '14px', color: '#5A4A42', lineHeight: 1.7 }}>{faq.a}</div>
              </details>
            ))}
          </div>
          <style>{`
            .home-faq summary::-webkit-details-marker { display: none; }
            .home-faq summary::marker { content: ''; }
            .home-faq[open] .home-faq-chevron { transform: rotate(45deg); background: #0D9488; color: #fff; }
            .home-faq-chevron { transition: transform 0.3s ease, background 0.3s ease, color 0.3s ease; }
          `}</style>
        </section>
      </div>
    </>
  );
}
