/**
 * Setting Ã— State pSEO Template Factory
 * 
 * Shared server component used by all /jobs/[setting]/[state] pages.
 * Each setting page just provides the setting key and state slug;
 * this factory handles data fetching, rendering, and SEO metadata.
 */
import { cache } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getCitiesByState } from './city-data/cities';
import { Metadata } from 'next';
import { JOB_LISTING_OMIT } from './job-listing-omit';
import {
  TrendingUp, Building2, Bell, MapPin, Lightbulb,
  DollarSign, Users, ArrowRight,
} from 'lucide-react';
import { prisma } from '@/lib/prisma';
import JobCard from '@/components/JobCard';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import CategoryHero from '@/components/CategoryHero';
import CategoryFAQ from '@/components/CategoryFAQ';
import { Job } from '@/lib/types';
import { PseoPageViewTracker } from '@/components/analytics/ViewTrackers';
import {
  SettingConfig,
  SETTING_CONFIGS,
  resolveStateSlug,
  stateToSlug,
  NEIGHBORING_STATES,
  getAllStateSlugs,
  STATE_CODES,
} from './setting-state-config';
import { CATEGORY_ASSET_REGISTRY } from './category-asset-registry';
import { getStatePracticeAuthority, getAuthorityLabel } from '@/lib/state-practice-authority';
import { buildSettingStateNarrative } from './state-narrative';

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface EmployerGroupResult {
  employer: string;
  _count: { employer: number };
}

interface ProcessedEmployer {
  name: string;
  count: number;
}

interface Stats {
  totalJobs: number;
  avgSalary: number;
  topEmployers: ProcessedEmployer[];
}

// â”€â”€â”€ Data Fetching â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getJobs(config: SettingConfig, stateName: string, skip = 0, take = 20) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where = config.buildWhere(stateName) as any;
  return prisma.job.findMany({
    where,
    omit: JOB_LISTING_OMIT, // Perf1: don't pull the multi-KB description for cards
    orderBy: [
      { isFeatured: 'desc' },
      { qualityScore: 'desc' },
      { originalPostedAt: 'desc' },
      { createdAt: 'desc' },
    ],
    skip,
    take,
  });
}

// Perf2: cache() dedupes the duplicate call within a render (generateMetadata +
// the page component both call getStats with the same module-level config ref).
const getStats = cache(async function getStats(config: SettingConfig, stateName: string, stateSlug: string): Promise<Stats> {
  const pseo = await prisma.pseoStats.findUnique({
    where: {
      type_categorySlug_locationSlug: {
        type: 'setting-state',
        categorySlug: config.slug,
        locationSlug: stateSlug,
      }
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where = config.buildWhere(stateName) as any;

  // Use cached stats if available
  let totalJobs = pseo?.totalJobs ?? 0;
  let avgSalary = pseo?.rawAvgSalary ?? 0;

  // Fallback: live count when pseoStats cache is empty/stale
  if (totalJobs === 0) {
    const liveCount = await prisma.job.count({ where });
    if (liveCount > 0) {
      totalJobs = liveCount;
      // Quick salary estimate from live data
      const salaryData = await prisma.job.aggregate({
        where: { ...where, minSalary: { gt: 0 } },
        _avg: { minSalary: true, maxSalary: true },
      });
      const rawAvg = salaryData._avg?.maxSalary || salaryData._avg?.minSalary || 0;
      avgSalary = rawAvg > 1000 ? Math.round(rawAvg / 1000) : Math.round(rawAvg);
    }
  }

  if (totalJobs === 0) {
    return { totalJobs: 0, avgSalary: 0, topEmployers: [] };
  }

  // Only run the heavy groupBy query if we know jobs exist
  const topEmployers = await prisma.job.groupBy({
    by: ['employer'],
    where,
    _count: { employer: true },
    orderBy: { _count: { employer: 'desc' } },
    take: 8,
  });

  return {
    totalJobs,
    avgSalary,
    topEmployers: topEmployers.map((e: EmployerGroupResult) => ({
      name: e.employer,
      count: e._count.employer,
    })),
  };
});

// â”€â”€â”€ Metadata Generator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function buildSettingStateMetadata(
  settingKey: string,
  stateSlug: string,
  page: number,
): Promise<Metadata> {
  const config = SETTING_CONFIGS[settingKey];
  const stateName = resolveStateSlug(stateSlug);
  if (!config || !stateName) return { title: 'Not Found' };

  const stats = await getStats(config, stateName, stateSlug);
  const basePath = `/jobs/${config.slug}/${stateSlug}`;

  return {
    title: `${stats.totalJobs} ${config.label} PMHNP Jobs in ${stateName} (${config.salaryRange})`,
    description: `Find ${stats.totalJobs} ${config.label.toLowerCase()} PMHNP jobs in ${stateName} paying ${config.salaryRange}. ${config.heroSubtitle}. Browse ${config.label.toLowerCase()} psychiatric nurse practitioner positions in ${stateName} updated daily.`,
    keywords: [
      ...config.keywords,
      `${config.label.toLowerCase()} pmhnp jobs ${stateName.toLowerCase()}`,
      `${stateName.toLowerCase()} ${config.label.toLowerCase()} psychiatric nurse practitioner`,
    ],
    openGraph: {
      title: `${stats.totalJobs} ${config.label} PMHNP Jobs in ${stateName}`,
      description: `Browse ${config.label.toLowerCase()} psychiatric nurse practitioner positions in ${stateName}. ${config.heroSubtitle}.`,
      type: 'website',
      images: [{
        url: `/api/og?type=page&title=${encodeURIComponent(`${stats.totalJobs} ${config.label} PMHNP Jobs in ${stateName}`)}&subtitle=${encodeURIComponent(config.heroSubtitle)}`,
        width: 1200,
        height: 630,
        alt: `${config.label} PMHNP Jobs in ${stateName}`,
      }],
    },
    alternates: {
      canonical: `https://pmhnphiring.com${basePath}`,
    },
    // SEO Fix #9: noindex thin state pages with 1-2 jobs (mirrors the
    // category-city-template MIN_JOBS_FOR_INDEX=3 gate). 0-job pages still
    // return 404 in the component below; pages with 1-2 jobs render with
    // noindex,follow so PageRank flows through but the page doesn't compete
    // for SERP space as a thin doorway. Paginated views (page > 1) are
    // always noindexed.
    ...((page > 1 || stats.totalJobs < 3) && {
      robots: { index: false, follow: true },
    }),
  };
}

// â”€â”€â”€ Static Params Generator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function buildSettingStateStaticParams() {
  return getAllStateSlugs().map((slug) => ({ state: slug }));
}

// â”€â”€â”€ Page Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface SettingStatePageProps {
  settingKey: string;
  stateSlug: string;
  page: number;
}

export default async function SettingStatePage({ settingKey, stateSlug, page }: SettingStatePageProps) {
  const config = SETTING_CONFIGS[settingKey];
  const stateName = resolveStateSlug(stateSlug);

  if (!config || !stateName) {
    const { notFound } = await import('next/navigation');
    notFound();
  }

  const limit = 10;
  const skip = (page - 1) * limit;

  // 1. Fetch fast pre-calculated stats
  const stats = await getStats(config, stateName!, stateSlug);

  // SEO Fix: Return real 404 for categoryÃ—state combos with no matching jobs.
  // Stops the server from trying to fetch jobs that don't exist.
  if (stats.totalJobs === 0) {
    const { notFound: notFoundFn } = await import('next/navigation');
    notFoundFn();
  }

  // 2. Fetch jobs only if they exist
  const jobs = await getJobs(config, stateName!, skip, limit);

  const totalPages = Math.ceil(stats.totalJobs / limit);
  const rawNeighbors = NEIGHBORING_STATES[stateName!] || [];
  const basePath = `/jobs/${config.slug}/${stateSlug}`;

  // GSC Fix (P1.5): gate cross-links by pseoStats.totalJobs ≥ 1 so we never
  // link Googlebot to empty pages. Empty cross-links generated thousands of
  // "Discovered — currently not indexed" entries before. One pseoStats fan-out
  // query per concern; all rows pre-aggregated, so this is fast.
  //
  // SEO Fix #18: also gate on pseoStats freshness (36h, 3x the 12h aggregator
  // cadence). If the aggregator silently fails, stale rows can advertise
  // pages whose underlying jobs already expired — same root cause as the
  // sitemap freshness gate.
  const PSEO_STALENESS_HOURS = 36;
  const pseoFreshnessThreshold = new Date(Date.now() - PSEO_STALENESS_HOURS * 60 * 60 * 1000);

  // Other-settings for THIS state with ≥1 job
  const otherSettingRows = await prisma.pseoStats.findMany({
    where: {
      type: 'setting-state',
      locationSlug: stateSlug,
      totalJobs: { gte: 1 },
      categorySlug: { not: config.slug },
      updatedAt: { gte: pseoFreshnessThreshold },
    },
    select: { categorySlug: true },
  });
  const otherSettingSlugs = new Set(otherSettingRows.map(r => r.categorySlug));
  const otherSettings = Object.values(SETTING_CONFIGS).filter(
    (s) => s.slug !== config.slug && otherSettingSlugs.has(s.slug),
  );

  // Neighbor states where THIS setting has ≥1 job
  const neighborSlugs = rawNeighbors.map(n => stateToSlug(n));
  const validNeighborRows = neighborSlugs.length > 0
    ? await prisma.pseoStats.findMany({
        where: {
          type: 'setting-state',
          categorySlug: config.slug,
          locationSlug: { in: neighborSlugs },
          totalJobs: { gte: 1 },
          updatedAt: { gte: pseoFreshnessThreshold },
        },
        select: { locationSlug: true },
      })
    : [];
  const validNeighborSlugs = new Set(validNeighborRows.map(r => r.locationSlug));
  const neighbors = rawNeighbors.filter(n => validNeighborSlugs.has(stateToSlug(n)));

  // Top cities in this state where THIS setting has ≥1 city-level job
  const stateCode = STATE_CODES[stateName!];
  const candidateCities = stateCode
    ? getCitiesByState(stateCode)
        .sort((a, b) => b.population - a.population)
        .slice(0, 30) // overshoot — we'll filter then trim to 10
    : [];
  const candidateSlugs = candidateCities.map(c => c.slug);
  const validCityRows = candidateSlugs.length > 0
    ? await prisma.pseoStats.findMany({
        where: {
          type: 'category-city',
          categorySlug: config.slug,
          locationSlug: { in: candidateSlugs },
          totalJobs: { gte: 1 },
          updatedAt: { gte: pseoFreshnessThreshold },
        },
        select: { locationSlug: true },
      })
    : [];
  const validCitySlugs = new Set(validCityRows.map(r => r.locationSlug));
  const topCities = candidateCities.filter(c => validCitySlugs.has(c.slug)).slice(0, 10);
  const assets = CATEGORY_ASSET_REGISTRY[config.slug];
  const practiceAuthority = getStatePracticeAuthority(stateName!);

  // Compute average COL for top cities in this state
  const avgCOL = topCities.length > 0
    ? Math.round(topCities.reduce((sum, c) => sum + c.costOfLivingIndex, 0) / topCities.length)
    : 100;
  const shortageCount = topCities.filter(c => c.mentalHealthShortage).length;

  /* Design Tokens â€” matched to category-city-template */
  const clayCard: React.CSSProperties = {
    background: '#FFFFFF', borderRadius: '20px',
    border: '1px solid rgba(255,255,255,0.5)',
    boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
  };

  return (
    <div style={{ backgroundColor: '#FDFBF7' }}>
      {/* Hover effects — inline to guarantee they load */}
      <style dangerouslySetInnerHTML={{ __html: `
        .pseo-pill { transition: transform 0.25s ease, box-shadow 0.25s ease; cursor: pointer; }
        .pseo-pill:hover { transform: translateY(-3px) !important; box-shadow: 6px 6px 16px rgba(0,0,0,0.1), -3px -3px 10px rgba(255,255,255,0.9), inset 1px 1px 2px rgba(255,255,255,0.6) !important; }
        .pseo-pill:active { transform: translateY(-1px) !important; }
        .pseo-resource { transition: transform 0.25s ease, box-shadow 0.25s ease; cursor: pointer; }
        .pseo-resource:hover { transform: translateY(-4px) !important; box-shadow: 8px 8px 20px rgba(0,0,0,0.1), -4px -4px 12px rgba(255,255,255,0.9), inset 1px 1px 2px rgba(255,255,255,0.6) !important; }
        .pseo-resource:active { transform: translateY(-1px) !important; }
      `}} />
      {/* Schemas */}
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://pmhnphiring.com' },
        { name: 'Jobs', url: 'https://pmhnphiring.com/jobs' },
        { name: config.label, url: `https://pmhnphiring.com/jobs/${config.slug}` },
        { name: stateName!, url: `https://pmhnphiring.com${basePath}` },
      ]} />
      {/* ItemList schema */}
      {jobs.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'ItemList',
              name: `${config.label} PMHNP Jobs in ${stateName}`,
              numberOfItems: stats.totalJobs,
              itemListElement: jobs.slice(0, 10).map((job: Job, idx: number) => ({
                '@type': 'ListItem',
                position: idx + 1,
                name: job.title,
                url: `https://pmhnphiring.com/jobs/${job.slug || job.id}`,
              })),
            }),
          }}
        />
      )}
      {/* Analytics */}
      <PseoPageViewTracker
        pageType="setting_state"
        category={config.slug}
        state={stateName!}
        jobCount={stats.totalJobs}
      />

      {/* Hero */}
      <CategoryHero
        bgColor={assets?.bgColor || '#0D9488'}
        heroImage={assets?.heroImage || 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/hero_wc_remote.webp'}
        heroAlt={`${config.label} PMHNP jobs in ${stateName}`}
        badgeText={`${stats.totalJobs} live roles Â· updated today`}
        breadcrumbs={['Careers', config.label, stateName!]}
        headlineLine1={config.label}
        headlineLine2="PMHNP"
        headlineSub={`jobs in ${stateName}.`}
        stats={[
          { value: `${stats.totalJobs}`, label: 'positions' },
          { value: stats.avgSalary > 0 ? `$${stats.avgSalary}k` : config.salaryRange.split('â€“')[0] || '$130K+', label: 'avg salary' },
          { value: `${stats.topEmployers.length}`, label: 'employers' },
        ]}
        description={`${config.label} psychiatric NP positions in ${stateName}. ${config.heroSubtitle}.`}
        ctaLabel={`Browse ${config.label} Jobs`}
        ctaHref={`/jobs/${config.slug}`}
        secondaryCtaLabel="Set Alert"
        secondaryCtaHref="/job-alerts"
      />

      <div className="container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-7xl mx-auto">
          {/* Job Listings */}
          <div className="grid lg:grid-cols-4 gap-8">
            <div className="lg:col-span-3">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                <h2 className="font-lora" style={{ fontSize: '20px', fontWeight: 700, color: '#1A2E35' }}>
                  {config.label} Positions in {stateName} ({stats.totalJobs})
                </h2>
                <Link href={`/jobs/${config.slug}`} style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textDecoration: 'none' }}>
                  View All Jobs â†’
                </Link>
              </div>

              {jobs.length === 0 ? (
                <div className="text-center py-12 rounded-xl" style={{ ...clayCard, padding: '48px 24px' }}>
                  <MapPin className="h-12 w-12 mx-auto mb-4" style={{ color: '#7A6A62' }} />
                  <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#1A2E35', marginBottom: '8px' }}>
                    No {config.label.toLowerCase()} positions in {stateName} right now
                  </h3>
                  <p style={{ fontSize: '14px', color: '#5A4A42', marginBottom: '16px' }}>
                    Check back soon or browse nearby states:
                  </p>
                  {neighbors.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-2 mb-6">
                      {neighbors.slice(0, 4).map((neighbor) => (
                        <Link key={neighbor} href={`/jobs/${config.slug}/${stateToSlug(neighbor)}`}
                          className="px-3 py-1.5 text-sm rounded-lg" style={{ backgroundColor: '#F0FDFA', color: '#0D9488', fontWeight: 600 }}>
                          {neighbor}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                    {jobs.map((job: Job) => (
                      <JobCard key={job.id} job={job} />
                    ))}
                  </div>

                  {totalPages > 1 && (
                    <div className="mt-8 flex items-center justify-center gap-4">
                      {page > 1 ? (
                        <Link href={`${basePath}?page=${page - 1}`} className="px-4 py-2 text-sm font-medium rounded-lg" style={{ ...clayCard, color: '#1A2E35', padding: '8px 16px' }}>
                          â† Previous
                        </Link>
                      ) : (
                        <span className="px-4 py-2 text-sm rounded-lg cursor-not-allowed" style={{ color: '#7A6A62', backgroundColor: '#F5F0EB' }}>â† Previous</span>
                      )}
                      <span className="text-sm" style={{ color: '#5A4A42' }}>Page {page} of {totalPages}</span>
                      {page < totalPages ? (
                        <Link href={`${basePath}?page=${page + 1}`} className="px-4 py-2 text-sm font-medium rounded-lg" style={{ ...clayCard, color: '#1A2E35', padding: '8px 16px' }}>
                          Next â†’
                        </Link>
                      ) : (
                        <span className="px-4 py-2 text-sm rounded-lg cursor-not-allowed" style={{ color: '#7A6A62', backgroundColor: '#F5F0EB' }}>Next â†’</span>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-1">
              {/* Alert CTA */}
              <div style={{ ...clayCard, padding: '0', overflow: 'hidden', marginBottom: '20px', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', border: '2px solid rgba(13,148,136,0.15)' }}>
                <div style={{ padding: '24px' }}>
                  <Bell size={28} style={{ color: '#0D9488', marginBottom: '12px' }} />
                  <h3 className="font-lora" style={{ fontSize: '18px', fontWeight: 700, color: '#134E4A', margin: '0 0 8px' }}>
                    {config.label} Alerts
                  </h3>
                  <p style={{ fontSize: '13px', color: '#0D9488', marginBottom: '16px', lineHeight: 1.6, fontWeight: 500 }}>
                    New {config.label.toLowerCase()} PMHNP positions in {stateName} â€” delivered daily.
                  </p>
                  <Link href="/job-alerts" style={{
                    display: 'block', width: '100%', textAlign: 'center',
                    padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '13px',
                    background: '#0D9488', color: '#fff', textDecoration: 'none',
                    boxShadow: '3px 3px 8px rgba(13,148,136,0.15)',
                  }}>
                    Create Alert
                  </Link>
                </div>
              </div>

              {/* Top Employers */}
              {stats.topEmployers.length > 0 && (
                <div style={{ ...clayCard, padding: '24px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <Building2 size={20} style={{ color: '#0D9488' }} />
                    <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1A2E35', margin: 0 }}>Top Employers</h3>
                  </div>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {stats.topEmployers.map((emp: ProcessedEmployer, i: number) => (
                      <li key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < stats.topEmployers.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}>
                        <span style={{ fontSize: '13px', color: '#5A4A42' }}>{emp.name}</span>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488' }}>{emp.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Tips */}
              <div style={{ ...clayCard, padding: '24px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <Lightbulb size={20} style={{ color: '#0D9488' }} />
                  <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1A2E35', margin: 0 }}>{config.label} Tips</h3>
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {config.tips.map((tip, i) => (
                    <li key={i} style={{ display: 'flex', gap: '8px', padding: '6px 0', borderBottom: i < config.tips.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none', fontSize: '13px', color: '#5A4A42', lineHeight: 1.5 }}>
                      <span style={{ color: '#0D9488', fontWeight: 700 }}>â€¢</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Benefits */}
              <div style={{ ...clayCard, padding: '24px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1A2E35', marginBottom: '16px' }}>Why {config.label}?</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {config.benefits.map((b, i) => (
                    <div key={i}>
                      <div style={{ fontWeight: 700, fontSize: '13px', color: '#1A2E35' }}>{b.title}</div>
                      <p style={{ fontSize: '12px', marginTop: '4px', color: '#5A4A42', lineHeight: 1.5 }}>{b.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bento Grid */}
      {assets && (
        <section style={{ background: 'linear-gradient(180deg, #FFF8F0 0%, #FDFBF7 100%)', padding: '48px 0' }}>
          <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '0 20px' }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#E86C2C', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>
              {assets.bentoSectionLabel}
            </p>
            <h2 className="font-lora" style={{ fontSize: 'clamp(26px, 3.5vw, 38px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '8px' }}>
              {config.label} Careers in {stateName}
            </h2>
            <p style={{ fontSize: '15px', color: '#5A4A42', textAlign: 'center', maxWidth: '480px', margin: '0 auto 48px', lineHeight: 1.6 }}>
              {config.heroSubtitle}
            </p>

            <div className="state-bento-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '14px' }}>
              {/* ROW 1: Hero card (8col) + Side card (4col) */}
              <div style={{ ...clayCard, gridColumn: 'span 8', padding: '0', overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center' }}>
                <div style={{ padding: '32px 28px' }}>
                  <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#1A2E35', margin: '0 0 8px' }}>
                    {config.label} in {stateName}
                  </h3>
                  <p style={{ fontSize: '14px', color: '#5A4A42', margin: 0, lineHeight: 1.6 }}>
                    {config.heroSubtitle}. {config.tips[0] || ''}
                  </p>
                </div>
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', padding: '16px' }}>
                  <Image src={assets.bentoImages[0]} alt={`${config.label} PMHNP`} width={280} height={200} style={{ width: '100%', maxWidth: '280px', height: 'auto', borderRadius: '12px' }} />
                </div>
              </div>

              <div style={{ ...clayCard, gridColumn: 'span 4', padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ flex: '0 0 auto', background: 'linear-gradient(145deg, #FFFBEB, #FEF3C7)', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Image src={assets.bentoImages[1]} alt={`${config.label} growth`} width={200} height={140} style={{ width: '100%', maxWidth: '200px', height: 'auto', borderRadius: '10px' }} />
                </div>
                <div style={{ padding: '24px 22px', flex: 1 }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#1A2E35', margin: '0 0 6px' }}>
                    Salary & Compensation
                  </h3>
                  <p style={{ fontSize: '12.5px', color: '#7A6A62', margin: 0, lineHeight: 1.5 }}>
                    {config.label} PMHNPs in {stateName} earn {stats.avgSalary > 0 ? `$${stats.avgSalary}k` : config.salaryRange} annually.
                  </p>
                </div>
              </div>

              {/* ROW 2: Icon cards */}
              {config.benefits.map((benefit, i) => (
                <div key={`icon-${i}`} style={{ ...clayCard, gridColumn: `span ${Math.floor(12 / config.benefits.length)}`, padding: '24px 18px', textAlign: 'center' }}>
                  {assets.bentoIcons[i] && <Image src={assets.bentoIcons[i]} alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />}
                  <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>{benefit.title}</h3>
                  <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>{benefit.description}</p>
                </div>
              ))}

              {/* ROW 3: Salary card (8col) + Alert CTA (4col) */}
              {assets.bentoImages[2] && (
                <div style={{ ...clayCard, gridColumn: 'span 8', padding: '0', overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center' }}>
                  <div style={{ padding: '32px 28px' }}>
                    <TrendingUp size={28} style={{ color: '#0D9488', marginBottom: '16px' }} />
                    <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#1A2E35', margin: '0 0 8px' }}>Growth & Outlook</h3>
                    <p style={{ fontSize: '14px', color: '#5A4A42', margin: 0, lineHeight: 1.6 }}>
                      {config.label} PMHNP demand in {stateName} continues to grow with {stats.totalJobs} active positions.
                    </p>
                  </div>
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(145deg, #FFF7ED, #FFEDD5)', padding: '16px' }}>
                    <Image src={assets.bentoImages[2]} alt="Career growth" width={280} height={200} style={{ width: '100%', maxWidth: '280px', height: 'auto', borderRadius: '12px' }} />
                  </div>
                </div>
              )}

              <div style={{ ...clayCard, gridColumn: 'span 4', padding: '28px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', border: '2px solid rgba(13,148,136,0.15)' }}>
                <Bell size={32} style={{ color: '#0D9488', marginBottom: '14px' }} />
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#134E4A', margin: '0 0 6px' }}>{config.label} Alerts</h3>
                <p style={{ fontSize: '13px', color: '#0D9488', margin: '0 0 16px', lineHeight: 1.6, fontWeight: 500 }}>
                  New {config.label.toLowerCase()} listings in {stateName} â€” delivered daily.
                </p>
                <Link href="/job-alerts" style={{
                  padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '13px',
                  background: '#0D9488', color: '#fff', textDecoration: 'none',
                  display: 'inline-flex', alignItems: 'center', gap: '6px', width: 'fit-content',
                  boxShadow: '3px 3px 8px rgba(13,148,136,0.15)',
                }}>
                  Create Alert <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* State Market Insights — Practice Authority + COL + Shortage */}
      <section style={{ background: 'linear-gradient(180deg, #FFF8F0 0%, #FDFBF7 100%)', padding: '40px 0', marginTop: '8px' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '0 20px' }}>
          <p className="font-lora" style={{ fontSize: '13px', fontWeight: 600, color: '#E86C2C', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '6px' }}>State Insights</p>
          <h2 className="font-lora" style={{ fontSize: '22px', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '24px' }}>{stateName} at a Glance</h2>

          {/* SEO Fix #8: per-(setting, state) narrative — defeats the
              "Crawled — currently not indexed" thin-content flag by giving
              every state page 2-3 sentences of facts that vary by setting AND
              by state (practice authority, COL, shortage count, demand tier).
              Layer 1 deterministic templates (lib/pseo/state-narrative.ts);
              future Layer 2 can override per-pair via DB. */}
          <p
            className="font-lora"
            style={{
              fontSize: '15px',
              lineHeight: 1.7,
              color: '#3A4A53',
              maxWidth: '760px',
              margin: '0 auto 28px',
              textAlign: 'center',
            }}
          >
            {buildSettingStateNarrative(
              config.slug,
              stateName!,
              stateCode || '',
              avgCOL,
              shortageCount,
              stats.totalJobs,
            )}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
            {/* Practice Authority */}
            {practiceAuthority && (
              <div className="pseo-pill" style={{ ...clayCard, padding: '20px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: '#7A6A62', marginBottom: '6px' }}>Practice Authority</div>
                <div style={{
                  fontSize: '16px', fontWeight: 700,
                  color: practiceAuthority.authority === 'full' ? '#22c55e' : practiceAuthority.authority === 'reduced' ? '#f59e0b' : '#ef4444',
                }}>{getAuthorityLabel(practiceAuthority.authority)}</div>
                <p style={{ fontSize: '11px', color: '#7A6A62', marginTop: '8px', lineHeight: 1.4 }}>{practiceAuthority.details}</p>
              </div>
            )}
            {/* Cost of Living */}
            <div className="pseo-pill" style={{ ...clayCard, padding: '20px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#7A6A62', marginBottom: '6px' }}>Avg Cost of Living</div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: avgCOL > 110 ? '#ef4444' : avgCOL > 100 ? '#f59e0b' : '#22c55e' }}>{avgCOL}</div>
              <div style={{ fontSize: '11px', color: '#7A6A62', marginTop: '4px' }}>
                {avgCOL > 110 ? 'Above national avg' : avgCOL > 100 ? 'Near national avg' : 'Below national avg'} (100 = US avg)
              </div>
            </div>
            {/* Shortage Areas */}
            <div className="pseo-pill" style={{ ...clayCard, padding: '20px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#7A6A62', marginBottom: '6px' }}>MH Shortage Areas</div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: shortageCount > 0 ? '#ef4444' : '#22c55e' }}>{shortageCount}/{topCities.length}</div>
              <div style={{ fontSize: '11px', color: '#7A6A62', marginTop: '4px' }}>
                top cities with HPSA designation
              </div>
            </div>
            {/* Salary */}
            {stats.avgSalary > 0 && (
              <div className="pseo-pill" style={{ ...clayCard, padding: '20px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: '#7A6A62', marginBottom: '6px' }}>Avg {config.label} Salary</div>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#1A2E35' }}>${stats.avgSalary}K</div>
                <div style={{ fontSize: '11px', color: '#7A6A62', marginTop: '4px' }}>
                  across {stats.totalJobs} active positions
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 7.3: Top Cities in State */}
      {topCities.length > 0 && (
        <section style={{ maxWidth: '1000px', margin: '0 auto', padding: '32px 20px 0' }}>
          <h2 className="font-lora" style={{ fontSize: '20px', fontWeight: 700, color: '#1A2E35', marginBottom: '16px', textAlign: 'center' }}>
            Top Cities for {config.label} Jobs in {stateName}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
            {topCities.map((c) => (
              <Link key={c.slug} href={`/jobs/${config.slug}/city/${c.slug}`}
                className="pseo-pill"
                style={{ ...clayCard, display: 'block', padding: '14px 10px', textAlign: 'center', textDecoration: 'none' }}>
                <div style={{ fontWeight: 700, fontSize: '13px', color: '#1A2E35' }}>{c.name}</div>
                <div style={{ fontSize: '11px', marginTop: '3px', color: '#7A6A62' }}>{c.stateCode} · Pop {Math.round(c.population / 1000)}K</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Cross-Links — Consolidated */}
      <section style={{ background: 'linear-gradient(180deg, #FFF8F0 0%, #FDFBF7 100%)', padding: '40px 0' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '0 20px' }}>
          <div style={{ ...clayCard, padding: '28px 32px' }}>

            {/* Nearby States — clay pills */}
            {neighbors.length > 0 && (
              <div style={{ marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#7A6A62', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
                  {config.label} Jobs Nearby
                </h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {neighbors.map((neighbor) => (
                    <Link key={neighbor} href={`/jobs/${config.slug}/${stateToSlug(neighbor)}`}
                      className="pseo-pill"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '7px 16px', borderRadius: '12px', textDecoration: 'none', fontSize: '13px', fontWeight: 600, color: '#1A2E35', background: '#FFFFFF', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '3px 3px 8px rgba(0,0,0,0.05), -2px -2px 6px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)' }}>
                      {neighbor} <ArrowRight size={12} style={{ color: '#0D9488' }} />
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Other Job Types — clay pills */}
            <div style={{ marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#7A6A62', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
                More Job Types in {stateName}
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {otherSettings.slice(0, 12).map((setting) => (
                  <Link key={setting.slug} href={`/jobs/${setting.slug}/${stateSlug}`}
                    className="pseo-pill"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '7px 16px', borderRadius: '12px', textDecoration: 'none', fontSize: '13px', fontWeight: 600, color: '#1A2E35', background: '#FFFFFF', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '3px 3px 8px rgba(0,0,0,0.05), -2px -2px 6px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)' }}>
                    {setting.label} <ArrowRight size={12} style={{ color: '#0D9488' }} />
                  </Link>
                ))}
                <Link href={`/jobs/state/${stateSlug}`}
                  className="pseo-pill"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '7px 16px', borderRadius: '12px', textDecoration: 'none', fontSize: '13px', fontWeight: 700, color: '#0D9488', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', border: '1px solid rgba(13,148,136,0.15)', boxShadow: '3px 3px 8px rgba(13,148,136,0.1), -2px -2px 6px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)' }}>
                  All {stateName} Jobs <ArrowRight size={12} />
                </Link>
              </div>
            </div>

            {/* Resources — clay row */}
            <div>
              <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#7A6A62', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
                Explore More
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                <Link href={`/salary-guide/${stateSlug}`}
                  className="pseo-resource"
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', borderRadius: '14px', textDecoration: 'none', background: '#FFFFFF', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '4px 4px 10px rgba(0,0,0,0.05), -2px -2px 6px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)' }}>
                  <DollarSign size={18} style={{ color: '#0D9488', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1A2E35' }}>{stateName} Salary Guide</div>
                    <div style={{ fontSize: '11px', color: '#7A6A62', marginTop: '2px' }}>Comp data by setting</div>
                  </div>
                </Link>
                <Link href={`/jobs/state/${stateSlug}`}
                  className="pseo-resource"
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', borderRadius: '14px', textDecoration: 'none', background: '#FFFFFF', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '4px 4px 10px rgba(0,0,0,0.05), -2px -2px 6px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)' }}>
                  <MapPin size={18} style={{ color: '#0D9488', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1A2E35' }}>All {stateName} Jobs</div>
                    <div style={{ fontSize: '11px', color: '#7A6A62', marginTop: '2px' }}>Browse all positions</div>
                  </div>
                </Link>
                <Link href={`/jobs/${config.slug}`}
                  className="pseo-resource"
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', borderRadius: '14px', textDecoration: 'none', background: '#FFFFFF', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '4px 4px 10px rgba(0,0,0,0.05), -2px -2px 6px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)' }}>
                  <Users size={18} style={{ color: '#0D9488', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1A2E35' }}>All {config.label} Jobs</div>
                    <div style={{ fontSize: '11px', color: '#7A6A62', marginTop: '2px' }}>Nationwide listings</div>
                  </div>
                </Link>
              </div>
            </div>

          </div>
        </div>
      </section>



      {/* FAQ */}
      <CategoryFAQ category={config.faqCategory as 'remote' | 'telehealth' | 'travel' | 'new-grad' | 'per-diem' | 'inpatient' | 'outpatient' | 'substance-abuse' | 'child-adolescent' | 'addiction'} totalJobs={stats.totalJobs} />
    </div>
  );
}
