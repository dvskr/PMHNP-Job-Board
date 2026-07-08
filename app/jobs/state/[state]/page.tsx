import { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { MapPin, TrendingUp, Building2, Bell, Navigation, Shield, MapPinned, DollarSign, Users, ArrowRight } from 'lucide-react';
import CategoryHero from '@/components/CategoryHero';
import { prisma } from '@/lib/prisma';
import { JOB_LISTING_OMIT } from '@/lib/pseo/job-listing-omit';
import { BEST_SORT_ORDER_BY } from '@/lib/utils/job-sort';
import JobCard from '@/components/JobCard';
import Breadcrumbs from '@/components/Breadcrumbs';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import { stateToSlug } from '@/lib/pseo/setting-state-config';
import StateFAQ from '@/components/StateFAQ';
import { Job } from '@/lib/types';
import {
  getStatePracticeAuthority,
  getAuthorityColor,
  PracticeAuthority
} from '@/lib/state-practice-authority';

// Force dynamic rendering - don't try to statically generate during build
// force-dynamic removed: it overrides revalidate and defeats ISR caching
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

// State name to code mappings
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

// Code to state name mappings
const CODE_TO_STATE: Record<string, string> = Object.entries(STATE_CODES)
  .reduce((acc, [state, code]) => ({ ...acc, [code]: state }), {} as Record<string, string>);

// URL-friendly state name to proper state name
const URL_TO_STATE: Record<string, string> = Object.keys(STATE_CODES)
  .reduce((acc, state) => {
    const urlFriendly = stateToSlug(state);
    acc[urlFriendly] = state;
    return acc;
  }, {} as Record<string, string>);

// Neighboring states for helpful suggestions when a state has 0 jobs
const NEIGHBORING_STATES: Record<string, string[]> = {
  'Alabama': ['Florida', 'Georgia', 'Tennessee', 'Mississippi'],
  'Alaska': ['Washington', 'California', 'Oregon'],
  'Arizona': ['California', 'Nevada', 'Utah', 'Colorado', 'New Mexico'],
  'Arkansas': ['Texas', 'Oklahoma', 'Missouri', 'Tennessee', 'Mississippi', 'Louisiana'],
  'California': ['Oregon', 'Nevada', 'Arizona', 'Washington'],
  'Colorado': ['Utah', 'Wyoming', 'Nebraska', 'Kansas', 'Oklahoma', 'New Mexico', 'Arizona'],
  'Connecticut': ['New York', 'Massachusetts', 'Rhode Island'],
  'Delaware': ['Pennsylvania', 'New Jersey', 'Maryland'],
  'Florida': ['Georgia', 'Alabama'],
  'Georgia': ['Florida', 'Alabama', 'Tennessee', 'North Carolina', 'South Carolina'],
  'Hawaii': ['California', 'Washington', 'Oregon'],
  'Idaho': ['Washington', 'Oregon', 'Montana', 'Wyoming', 'Utah', 'Nevada'],
  'Illinois': ['Wisconsin', 'Indiana', 'Kentucky', 'Missouri', 'Iowa'],
  'Indiana': ['Michigan', 'Ohio', 'Kentucky', 'Illinois'],
  'Iowa': ['Minnesota', 'Wisconsin', 'Illinois', 'Missouri', 'Nebraska', 'South Dakota'],
  'Kansas': ['Nebraska', 'Missouri', 'Oklahoma', 'Colorado'],
  'Kentucky': ['Indiana', 'Ohio', 'West Virginia', 'Virginia', 'Tennessee', 'Missouri', 'Illinois'],
  'Louisiana': ['Texas', 'Arkansas', 'Mississippi'],
  'Maine': ['New Hampshire', 'Massachusetts'],
  'Maryland': ['Pennsylvania', 'Delaware', 'Virginia', 'West Virginia', 'District of Columbia'],
  'Massachusetts': ['New Hampshire', 'Vermont', 'New York', 'Connecticut', 'Rhode Island'],
  'Michigan': ['Ohio', 'Indiana', 'Wisconsin'],
  'Minnesota': ['Wisconsin', 'Iowa', 'South Dakota', 'North Dakota'],
  'Mississippi': ['Louisiana', 'Arkansas', 'Tennessee', 'Alabama'],
  'Missouri': ['Iowa', 'Illinois', 'Kentucky', 'Tennessee', 'Arkansas', 'Oklahoma', 'Kansas', 'Nebraska'],
  'Montana': ['North Dakota', 'South Dakota', 'Wyoming', 'Idaho'],
  'Nebraska': ['South Dakota', 'Iowa', 'Missouri', 'Kansas', 'Colorado', 'Wyoming'],
  'Nevada': ['California', 'Oregon', 'Idaho', 'Utah', 'Arizona'],
  'New Hampshire': ['Maine', 'Vermont', 'Massachusetts'],
  'New Jersey': ['New York', 'Pennsylvania', 'Delaware'],
  'New Mexico': ['Arizona', 'Utah', 'Colorado', 'Oklahoma', 'Texas'],
  'New York': ['Vermont', 'Massachusetts', 'Connecticut', 'New Jersey', 'Pennsylvania'],
  'North Carolina': ['Virginia', 'Tennessee', 'Georgia', 'South Carolina'],
  'North Dakota': ['Montana', 'South Dakota', 'Minnesota'],
  'Ohio': ['Michigan', 'Indiana', 'Kentucky', 'West Virginia', 'Pennsylvania'],
  'Oklahoma': ['Kansas', 'Missouri', 'Arkansas', 'Texas', 'New Mexico', 'Colorado'],
  'Oregon': ['Washington', 'California', 'Nevada', 'Idaho'],
  'Pennsylvania': ['New York', 'New Jersey', 'Delaware', 'Maryland', 'West Virginia', 'Ohio'],
  'Rhode Island': ['Massachusetts', 'Connecticut'],
  'South Carolina': ['North Carolina', 'Georgia'],
  'South Dakota': ['North Dakota', 'Minnesota', 'Iowa', 'Nebraska', 'Wyoming', 'Montana'],
  'Tennessee': ['Kentucky', 'Virginia', 'North Carolina', 'Georgia', 'Alabama', 'Mississippi', 'Arkansas', 'Missouri'],
  'Texas': ['New Mexico', 'Oklahoma', 'Arkansas', 'Louisiana'],
  'Utah': ['Idaho', 'Wyoming', 'Colorado', 'New Mexico', 'Arizona', 'Nevada'],
  'Vermont': ['New Hampshire', 'Massachusetts', 'New York'],
  'Virginia': ['Maryland', 'West Virginia', 'Kentucky', 'Tennessee', 'North Carolina', 'District of Columbia'],
  'Washington': ['Oregon', 'Idaho'],
  'West Virginia': ['Pennsylvania', 'Maryland', 'Virginia', 'Kentucky', 'Ohio'],
  'Wisconsin': ['Michigan', 'Minnesota', 'Iowa', 'Illinois'],
  'Wyoming': ['Montana', 'South Dakota', 'Nebraska', 'Colorado', 'Utah', 'Idaho'],
  'District of Columbia': ['Maryland', 'Virginia'],
};

interface StatePageProps {
  params: Promise<{ state: string }>;
  searchParams: Promise<{ page?: string }>;
}

/**
 * Parse state from URL parameter
 * Handles: "california", "ca", "new-york", "ny"
 */
function parseStateParam(stateParam: string): { name: string; code: string } | null {
  const normalized = stateParam.toLowerCase().trim();

  // Try as state code (e.g., "ca")
  const upperCode = normalized.toUpperCase();
  if (CODE_TO_STATE[upperCode]) {
    return {
      name: CODE_TO_STATE[upperCode],
      code: upperCode,
    };
  }

  // Try as URL-friendly name (e.g., "california", "new-york")
  if (URL_TO_STATE[normalized]) {
    const stateName = URL_TO_STATE[normalized];
    return {
      name: stateName,
      code: STATE_CODES[stateName],
    };
  }

  // Try direct match with state name
  const directMatch = Object.keys(STATE_CODES).find(
    state => state.toLowerCase() === normalized
  );
  if (directMatch) {
    return {
      name: directMatch,
      code: STATE_CODES[directMatch],
    };
  }

  return null;
}

/**
 * Fetch jobs for a specific state
 */
async function getStateJobs(stateName: string, stateCode: string, skip = 0, take = 10) {
  return prisma.job.findMany({
    where: {
      isPublished: true,
      OR: [
        { state: stateName },
        { stateCode: stateCode },
      ],
    },
    omit: JOB_LISTING_OMIT, // Perf1: cards don't use the full description body
    orderBy: BEST_SORT_ORDER_BY,
    skip,
    take,
  });
}

/**
 * Fetch state statistics
 */
async function getStateStats(stateName: string, stateCode: string) {
  // Total jobs
  const totalJobs = await prisma.job.count({
    where: {
      isPublished: true,
      OR: [
        { state: stateName },
        { stateCode: stateCode },
      ],
    },
  });

  // Average salary
  const salaryData = await prisma.job.aggregate({
    where: {
      isPublished: true,
      OR: [
        { state: stateName },
        { stateCode: stateCode },
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
  const avgSalary = Math.round((avgMinSalary + avgMaxSalary) / 2 / 1000); // Convert to thousands

  // Top employers
  const topEmployers = await prisma.job.groupBy({
    by: ['employer'],
    where: {
      isPublished: true,
      OR: [
        { state: stateName },
        { stateCode: stateCode },
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
    take: 5,
  });

  // Process with explicit typing
  const processedEmployers = topEmployers.map((e: EmployerGroupResult) => ({
    name: e.employer,
    count: e._count.employer,
  }));

  // Unique employer count (for hero stat — not limited to top 5)
  const uniqueEmployerCount = await prisma.job.findMany({
    where: {
      isPublished: true,
      OR: [
        { state: stateName },
        { stateCode: stateCode },
      ],
    },
    distinct: ['employer'],
    select: { employer: true },
  });

  return {
    totalJobs,
    avgSalary,
    topEmployers: processedEmployers,
    uniqueEmployerCount: uniqueEmployerCount.length,
  };
}

/**
 * Fetch nearby states with job counts for zero-jobs scenario
 */
async function getNearbyStatesWithJobs(stateName: string): Promise<{ name: string; code: string; count: number; slug: string }[]> {
  const neighbors = NEIGHBORING_STATES[stateName] || [];

  if (neighbors.length === 0) return [];

  const results = await Promise.all(
    neighbors.slice(0, 6).map(async (neighborState) => {
      const code = STATE_CODES[neighborState];
      const count = await prisma.job.count({
        where: {
          isPublished: true,
          OR: [
            { state: neighborState },
            { stateCode: code },
          ],
        },
      });
      return {
        name: neighborState,
        code,
        count,
        slug: stateToSlug(neighborState),
      };
    })
  );

  // Return only states with jobs, sorted by count
  return results
    .filter(s => s.count > 0)
    .sort((a, b) => b.count - a.count);
}

/**
 * Fetch cities with job counts within a state
 */
async function getCitiesWithJobs(stateName: string, stateCode: string): Promise<{ name: string; count: number; slug: string }[]> {
  const cityData = await prisma.job.groupBy({
    by: ['city'],
    where: {
      isPublished: true,
      city: { not: null },
      OR: [
        { state: stateName },
        { stateCode: stateCode },
      ],
    },
    _count: {
      city: true,
    },
    orderBy: {
      _count: {
        city: 'desc',
      },
    },
    take: 8,
  });

  return cityData
    .filter(c => c.city && c.city.trim().length > 0)
    .map(c => {
      const sanitizedCity = (c.city as string).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      return {
        name: c.city as string,
        count: c._count.city,
        slug: sanitizedCity ? `${sanitizedCity}-${stateCode.toLowerCase()}` : '',
      };
    })
    .filter(c => c.slug.length > 0);
}

/**
 * Generate metadata for SEO
 */
export async function generateMetadata({ params, searchParams }: StatePageProps): Promise<Metadata> {
  try {
    const [{ state: stateParam }, sp] = await Promise.all([params, searchParams]);
    const page = Math.max(1, parseInt(sp.page || '1'));
    const stateInfo = parseStateParam(stateParam);

    if (!stateInfo) {
      return {
        title: 'State Not Found',
      };
    }

    const { name: stateName, code: stateCode } = stateInfo;
    const stats = await getStateStats(stateName, stateCode);

    const title = stats.avgSalary > 0
      ? `${stats.totalJobs} PMHNP Jobs in ${stateName} (${stateCode}) — $${stats.avgSalary}K Avg Salary`
      : `${stats.totalJobs} PMHNP Jobs in ${stateName} (${stateCode}) — Apply Today`;

    const description = stats.avgSalary > 0
      ? `Find ${stats.totalJobs} psychiatric nurse practitioner jobs in ${stateName}. Average PMHNP salary: $${stats.avgSalary}K. Telehealth, inpatient, outpatient, and private practice positions. New jobs added daily.`
      : `Find ${stats.totalJobs} psychiatric nurse practitioner jobs in ${stateName}. Telehealth, inpatient, outpatient, and private practice PMHNP positions. New jobs added daily.`;

    return {
      title,
      description,
      openGraph: {
        title: stats.avgSalary > 0
          ? `${stats.totalJobs} PMHNP Jobs in ${stateName} | $${stats.avgSalary}k Average`
          : `${stats.totalJobs} PMHNP Jobs in ${stateName}`,
        description,
        type: 'website',
        images: [{
          url: `/api/og?type=page&title=${encodeURIComponent(`PMHNP Jobs in ${stateName}`)}&subtitle=${encodeURIComponent(`${stats.totalJobs} psychiatric NP positions in ${stateCode}`)}`,
          width: 1200,
          height: 630,
          alt: `PMHNP Jobs in ${stateName}`,
        }],
      },
      alternates: {
        // Canonical always points to page 1 (no ?page query) — paginated
        // views are not indexable on their own (P3.5).
        // Canonical anchored on the normalized slug, NOT the request param.
        // /jobs/state/ny, /jobs/state/CA, /jobs/state/New%20York all resolve to
        // the same state but each would emit a different canonical if we used
        // the raw param — splintering the indexed forms.
        canonical: `https://pmhnphiring.com/jobs/state/${stateToSlug(stateName)}`,
      },
      // GSC Fix (P3.1 + P3.5): noindex empty-state pages AND any paginated view.
      // Empty state → soft 404 risk; paginated view → duplicate-canonical risk.
      ...((stats.totalJobs === 0 || page > 1) && {
        robots: {
          index: false,
          follow: true,
        },
      }),
    };
  } catch (error) {
    console.error('Error generating metadata:', error);
    return {
      title: 'PMHNP Jobs by State',
      description: 'Find psychiatric mental health nurse practitioner jobs by state. Browse PMHNP positions with salary data, practice authority info, and top employers across all 50 states.',
    };
  }
}

/**
 * State-specific job listings page
 */
export default async function StateJobsPage({ params, searchParams }: StatePageProps) {
  const [{ state: stateParam }, sp] = await Promise.all([params, searchParams]);
  const stateInfo = parseStateParam(stateParam);

  if (!stateInfo) {
    notFound();
  }

  const { name: stateName, code: stateCode } = stateInfo;

  // 308 redirect any non-canonical form (state code, mixed case, encoded
  // space) to the canonical hyphenated lowercase slug. parseStateParam
  // accepts ny / CA / New%20York all as valid; without this redirect each
  // form would render its own copy of the page with conflicting canonicals.
  const canonicalStateSlug = stateToSlug(stateName);
  if (stateParam !== canonicalStateSlug) {
    const qs = new URLSearchParams(sp as Record<string, string>).toString();
    permanentRedirect(`/jobs/state/${canonicalStateSlug}${qs ? `?${qs}` : ''}`);
  }
  const page = Math.max(1, parseInt(sp.page || '1'));
  const limit = 10;
  const skip = (page - 1) * limit;

  // Fetch all data in parallel for content enrichment
  const [jobs, stats, citiesWithJobs, nearbyStates] = await Promise.all([
    getStateJobs(stateName, stateCode, skip, limit),
    getStateStats(stateName, stateCode),
    getCitiesWithJobs(stateName, stateCode),
    getNearbyStatesWithJobs(stateName),
  ]);

  // GSC Fix: empty-state guard. Metadata-level noindex (line 392) is not
  // enough on its own — the page would still render a $0/$0 + "0 active
  // positions" shell that Google classifies as soft 404. Pull the plug
  // entirely when there's nothing to show. Mirrors the pattern in
  // lib/pseo/setting-state-template.tsx for category × state pages.
  if (stats.totalJobs === 0) {
    notFound();
  }

  // GSC Fix (P1.5): only render setting pills for setting×state combos that
  // actually have ≥1 active job. Linking to empty pages generated thousands
  // of "Discovered — currently not indexed" entries.
  const stateSlugForLookup = stateToSlug(stateName);
  const validSettingRows = await prisma.pseoStats.findMany({
    where: {
      type: 'setting-state',
      locationSlug: stateSlugForLookup,
      totalJobs: { gte: 1 },
    },
    select: { categorySlug: true },
  });
  const validSettingSlugs = new Set(validSettingRows.map(r => r.categorySlug));

  const totalPages = Math.ceil(stats.totalJobs / limit);

  // Get practice authority information for this state
  const practiceAuthority = getStatePracticeAuthority(stateName);
  const authorityColors = practiceAuthority ? getAuthorityColor(practiceAuthority.authority) : null;

  const stateSlug = stateToSlug(stateName);
  const basePath = `/jobs/state/${stateSlug}`;

  /* Design Tokens */
  const clayCard: React.CSSProperties = {
    background: '#FFFFFF', borderRadius: '20px',
    border: '1px solid rgba(255,255,255,0.5)',
    boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FDFBF7' }}>
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://pmhnphiring.com' },
        { name: 'Jobs', url: 'https://pmhnphiring.com/jobs' },
        { name: stateName, url: `https://pmhnphiring.com/jobs/state/${stateSlug}` },
      ]} />
      {jobs.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          '@context': 'https://schema.org', '@type': 'ItemList',
          name: `PMHNP Jobs in ${stateName}`, numberOfItems: stats.totalJobs,
          itemListElement: jobs.slice(0, 10).map((job: Job, idx: number) => ({
            '@type': 'ListItem', position: idx + 1, name: job.title,
            url: `https://pmhnphiring.com/jobs/${job.slug || job.id}`,
          })),
        }) }} />
      )}
      {/* AggregateOffer schema — shows salary range in SERPs */}
      {stats.avgSalary > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'AggregateOffer',
          name: `PMHNP Jobs in ${stateName}`,
          offerCount: stats.totalJobs,
          lowPrice: Math.round(stats.avgSalary * 0.8) * 1000,
          highPrice: Math.round(stats.avgSalary * 1.2) * 1000,
          priceCurrency: 'USD',
          url: `https://pmhnphiring.com/jobs/state/${stateSlug}`,
        }) }} />
      )}

      {/* ═══ HERO ═══ */}
      <CategoryHero
        bgColor="#0D9488"
        heroImage="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/hero_wc_states.webp"
        heroAlt={`PMHNP Jobs in ${stateName}`}
        badgeText={`${stats.totalJobs} live roles`}
        breadcrumbs={['Careers', 'By State', stateName]}
        headlineLine1="PMHNP"
        headlineLine2="Jobs"
        headlineSub={`in ${stateName}.`}
        stats={[
          { value: `${stats.totalJobs}`, label: 'positions' },
          { value: stats.avgSalary > 0 ? `$${stats.avgSalary}k` : '$130K+', label: 'avg salary' },
          { value: `${stats.uniqueEmployerCount}`, label: 'employers' },
        ]}
        description={`Browse all psychiatric NP positions in ${stateName}. Remote telehealth, outpatient clinics, inpatient facilities, and private practice opportunities.`}
        ctaLabel={`Browse ${stateName} Jobs`}
        ctaHref="#listings"
        secondaryCtaLabel="Set Alert"
        secondaryCtaHref="/job-alerts"
      />

      {/* ═══ JOB LISTINGS — 4-col grid ═══ */}
      <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '32px 24px' }}>
        <div className="grid lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3">
            <div className="flex items-center justify-between mb-6">
              <h2 id="listings" className="font-lora" style={{ fontSize: '20px', fontWeight: 700, color: '#1A2E35' }}>
                Positions in {stateName} ({stats.totalJobs})
              </h2>
              <Link href="/jobs" className="text-sm font-medium hover:opacity-80 transition-opacity" style={{ color: '#0D9488' }}>View All Jobs →</Link>
            </div>
            {jobs.length === 0 ? (
              <div className="text-center py-12 rounded-xl" style={{ ...clayCard, padding: '48px 24px' }}>
                <MapPin className="h-12 w-12 mx-auto mb-4" style={{ color: '#7A6A62' }} />
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#1A2E35', marginBottom: '8px' }}>No positions in {stateName} right now</h3>
                <p style={{ fontSize: '14px', color: '#5A4A42', marginBottom: '16px' }}>New jobs are added daily. Check nearby states:</p>
                {nearbyStates.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-2 mb-6">
                    {nearbyStates.slice(0, 4).map((s) => (
                      <Link key={s.code} href={`/jobs/state/${s.slug}`} className="cat-bento-card"
                        style={{ padding: '6px 14px', borderRadius: '12px', backgroundColor: '#F0FDFA', color: '#0D9488', fontWeight: 600, fontSize: '13px', textDecoration: 'none' }}>
                        {s.name} ({s.count})
                      </Link>
                    ))}
                  </div>
                )}
                <Link href="/jobs/remote" className="cat-cta-primary" style={{ padding: '12px 28px', borderRadius: '14px', fontWeight: 700, fontSize: '14px', background: '#0D9488', color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px', boxShadow: '4px 4px 12px rgba(13,148,136,0.2)' }}>Browse Remote Jobs <ArrowRight size={16} /></Link>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                  {jobs.map((job: Job) => (<JobCard key={job.id} job={job} />))}
                </div>

                {totalPages > 1 && (
                  <div className="mt-8 flex items-center justify-center gap-4">
                    {page > 1 ? (
                      <Link href={`${basePath}?page=${page - 1}`} className="px-4 py-2 text-sm font-medium rounded-lg" style={{ ...clayCard, color: '#1A2E35', padding: '8px 16px' }}>
                        ← Previous
                      </Link>
                    ) : (
                      <span className="px-4 py-2 text-sm rounded-lg cursor-not-allowed" style={{ color: '#7A6A62', backgroundColor: '#F5F0EB' }}>← Previous</span>
                    )}
                    <span className="text-sm" style={{ color: '#5A4A42' }}>Page {page} of {totalPages}</span>
                    {page < totalPages ? (
                      <Link href={`${basePath}?page=${page + 1}`} className="px-4 py-2 text-sm font-medium rounded-lg" style={{ ...clayCard, color: '#1A2E35', padding: '8px 16px' }}>
                        Next →
                      </Link>
                    ) : (
                      <span className="px-4 py-2 text-sm rounded-lg cursor-not-allowed" style={{ color: '#7A6A62', backgroundColor: '#F5F0EB' }}>Next →</span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="cat-bento-card" style={{ ...clayCard, padding: '0', overflow: 'hidden', marginBottom: '20px', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', border: '2px solid rgba(13,148,136,0.15)' }}>
              <div style={{ padding: '24px' }}>
                <Bell size={28} style={{ color: '#0D9488', marginBottom: '12px' }} />
                <h3 className="font-lora" style={{ fontSize: '18px', fontWeight: 700, color: '#134E4A', margin: '0 0 8px' }}>{stateName} Alerts</h3>
                <p style={{ fontSize: '13px', color: '#0D9488', marginBottom: '16px', lineHeight: 1.6, fontWeight: 500 }}>New {stateName} listings delivered daily.</p>
                <Link href={`/job-alerts?location=${encodeURIComponent(stateName)}`} className="cat-cta-primary" style={{ display: 'block', width: '100%', textAlign: 'center', padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '13px', background: '#0D9488', color: '#fff', textDecoration: 'none', boxShadow: '3px 3px 8px rgba(13,148,136,0.15)' }}>Create Alert</Link>
              </div>
            </div>
            {stats.topEmployers.length > 0 && (
              <div className="cat-bento-card" style={{ ...clayCard, padding: '24px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <Building2 size={20} style={{ color: '#0D9488' }} />
                  <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1A2E35', margin: 0 }}>Top Employers</h3>
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {stats.topEmployers.map((employer: ProcessedEmployer, index: number) => (
                    <li key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: index < stats.topEmployers.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}>
                      <span style={{ fontSize: '13px', color: '#5A4A42', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{employer.name}</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#0D9488', marginLeft: '8px', whiteSpace: 'nowrap' }}>{employer.count} {employer.count === 1 ? 'job' : 'jobs'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {stats.avgSalary > 0 && (
              <div className="cat-bento-card" style={{ ...clayCard, padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <TrendingUp size={20} style={{ color: '#34D399' }} />
                  <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1A2E35', margin: 0 }}>Salary Insights</h3>
                </div>
                <div style={{ fontSize: '32px', fontWeight: 800, color: '#1A2E35', lineHeight: 1 }}>${stats.avgSalary}k</div>
                <div style={{ fontSize: '13px', color: '#7A6A62', marginTop: '4px' }}>Average annual salary</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ BENTO — State Overview ═══ */}
      <div style={{ background: 'linear-gradient(180deg, #FFF8F0 0%, #FDFBF7 100%)', padding: '48px 0' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#E86C2C', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>{stateName} Overview</p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(26px, 3.5vw, 38px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '8px' }}>Working as a PMHNP in {stateName}</h2>
          <p style={{ fontSize: '15px', color: '#5A4A42', textAlign: 'center', maxWidth: '480px', margin: '0 auto 48px', lineHeight: 1.6 }}>Key information for psychiatric nurse practitioners practicing in {stateName}.</p>

          <div className="cat-bento-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '14px' }}>
            {/* ROW 1: Practice Authority (8col) + Salary (4col) */}
            <div className="cat-bento-hero-1" style={{ ...clayCard, gridColumn: 'span 8', padding: '0', overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center' }}>
              <div style={{ padding: '32px 28px' }}>
                <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#1A2E35', margin: '0 0 8px' }}>Practice Authority</h3>
                <p style={{ fontSize: '14px', color: '#5A4A42', margin: '0 0 12px', lineHeight: 1.6 }}>
                  {practiceAuthority ? practiceAuthority.details : `${stateName} offers opportunities for PMHNPs across multiple practice settings.`}
                </p>
                {practiceAuthority && (
                  <span style={{ display: 'inline-block', padding: '4px 14px', borderRadius: '12px', fontSize: '12px', fontWeight: 700, background: practiceAuthority.authority === 'full' ? '#D1FAE5' : practiceAuthority.authority === 'reduced' ? '#FEF3C7' : '#FEE2E2', color: practiceAuthority.authority === 'full' ? '#065F46' : practiceAuthority.authority === 'reduced' ? '#92400E' : '#991B1B' }}>
                    {practiceAuthority.description}
                  </span>
                )}
              </div>
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', padding: '16px' }}>
                <Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/bento_state_practice.webp" alt={`PMHNP practice in ${stateName}`} width={280} height={200} style={{ width: '100%', maxWidth: '280px', height: 'auto', borderRadius: '12px' }} />
              </div>
            </div>

            <div className="cat-bento-hero-2" style={{ ...clayCard, gridColumn: 'span 4', padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: '0 0 auto', background: 'linear-gradient(145deg, #FFFBEB, #FEF3C7)', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/bento_state_salary.webp" alt="Salary data" width={200} height={140} style={{ width: '100%', maxWidth: '200px', height: 'auto', borderRadius: '10px' }} />
              </div>
              <div style={{ padding: '24px 22px', flex: 1 }}>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#1A2E35', margin: '0 0 6px' }}>Salary & Compensation</h3>
                <p style={{ fontSize: '12.5px', color: '#7A6A62', margin: 0, lineHeight: 1.5 }}>
                  PMHNPs in {stateName} earn {stats.avgSalary > 0 ? `$${stats.avgSalary}k` : '$130K–$200K+'} annually.
                </p>
              </div>
            </div>

            {/* ROW 2: Job type icon cards */}
            {[
              { icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_telehealth.webp', title: 'Telehealth', desc: 'Virtual psychiatric care from anywhere in the state' },
              { icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_outpatient.webp', title: 'Outpatient', desc: 'Clinic-based roles with standard weekday hours' },
              { icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_inpatient.webp', title: 'Inpatient', desc: 'Hospital and residential facility positions' },
              { icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_privatepractice.webp', title: 'Private Practice', desc: 'Independent practice and group opportunities' },
            ].map((b, i) => (
              <div key={i} className="cat-bento-card" style={{ ...clayCard, gridColumn: 'span 3', padding: '24px 18px', textAlign: 'center' }}>
                <Image src={b.icon} alt="" width={48} height={48} style={{ width: '48px', height: '48px', objectFit: 'contain', margin: '0 auto 14px', display: 'block' }} />
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', margin: '0 0 6px' }}>{b.title}</h3>
                <p style={{ fontSize: '12px', color: '#7A6A62', margin: 0, lineHeight: 1.55 }}>{b.desc}</p>
              </div>
            ))}

            {/* ROW 3: Growth (8col) + Alert CTA (4col) */}
            <div className="cat-bento-hero-3" style={{ ...clayCard, gridColumn: 'span 8', padding: '0', overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center' }}>
              <div style={{ padding: '32px 28px' }}>
                <TrendingUp size={28} style={{ color: '#0D9488', marginBottom: '16px' }} />
                <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#1A2E35', margin: '0 0 8px' }}>Growth & Outlook</h3>
                <p style={{ fontSize: '14px', color: '#5A4A42', margin: 0, lineHeight: 1.6 }}>
                  PMHNP demand in {stateName} continues to grow with {stats.totalJobs} active positions.
                </p>
              </div>
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(145deg, #FFF7ED, #FFEDD5)', padding: '16px' }}>
                <Image src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/bento_state_growth.webp" alt="Career growth" width={280} height={200} style={{ width: '100%', maxWidth: '280px', height: 'auto', borderRadius: '12px' }} />
              </div>
            </div>

            <div className="cat-bento-cta" style={{ ...clayCard, gridColumn: 'span 4', padding: '28px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'linear-gradient(145deg, #F0FDFA, #CCFBF1)', border: '2px solid rgba(13,148,136,0.15)' }}>
              <Bell size={32} style={{ color: '#0D9488', marginBottom: '14px' }} />
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#134E4A', margin: '0 0 6px' }}>{stateName} Alerts</h3>
              <p style={{ fontSize: '13px', color: '#0D9488', margin: '0 0 16px', lineHeight: 1.6, fontWeight: 500 }}>New listings in {stateName} — delivered daily.</p>
              <Link href={`/job-alerts?location=${encodeURIComponent(stateName)}`} className="cat-cta-primary" style={{ padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '13px', background: '#0D9488', color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', width: 'fit-content', boxShadow: '3px 3px 8px rgba(13,148,136,0.15)' }}>
                Create Alert <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ EXPLORE — Top Cities + Cross-Links ═══ */}
      <div style={{ background: 'linear-gradient(180deg, #FDFBF7 0%, #FFF8F0 50%, #FDFBF7 100%)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '56px 20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#E86C2C', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>Explore</p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '40px' }}>More PMHNP Opportunities in {stateName}</h2>

          {/* Top Cities */}
          {citiesWithJobs.length > 0 && (
            <div style={{ marginBottom: '28px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#7A6A62', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '14px' }}>
                Top Cities
              </h3>
              <div className="cat-explore-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
                {citiesWithJobs.map((c) => (
                  <Link key={c.slug} href={`/jobs/city/${c.slug}`}
                    className="pseo-pill"
                    style={{ ...clayCard, display: 'block', padding: '14px 10px', textAlign: 'center', textDecoration: 'none' }}>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: '#1A2E35' }}>{c.name}</div>
                    <div style={{ fontSize: '11px', marginTop: '3px', color: '#7A6A62' }}>{c.count} {c.count === 1 ? 'job' : 'jobs'}</div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Cross-Links Card */}
          <div style={{ ...clayCard, padding: '28px 32px' }}>

            {/* Nearby States — clay pills */}
            {nearbyStates.length > 0 && (
              <div style={{ marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#7A6A62', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
                  PMHNP Jobs Nearby
                </h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {nearbyStates.map((s) => (
                    <Link key={s.code} href={`/jobs/state/${s.slug}`}
                      className="pseo-pill"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '7px 16px', borderRadius: '12px', textDecoration: 'none', fontSize: '13px', fontWeight: 600, color: '#1A2E35', background: '#FFFFFF', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '3px 3px 8px rgba(0,0,0,0.05), -2px -2px 6px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)' }}>
                      {s.name} <ArrowRight size={12} style={{ color: '#0D9488' }} />
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Job Types — clay pills */}
            <div style={{ marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#7A6A62', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
                Job Types in {stateName}
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {/* GSC Fix (P1.5): only render settings that have a state-eligible
                    page AND ≥1 active job in this state. Removed the city-only
                    taxonomies (substance-abuse, child-adolescent, private-practice,
                    per-diem) from this list because they have no /jobs/{cat}/{state}
                    page — those URLs would 410. */}
                {[
                  { slug: 'remote', label: 'Remote' },
                  { slug: 'telehealth', label: 'Telehealth' },
                  { slug: 'outpatient', label: 'Outpatient' },
                  { slug: 'inpatient', label: 'Inpatient' },
                  { slug: 'travel', label: 'Travel' },
                  { slug: 'new-grad', label: 'New Grad' },
                  { slug: 'full-time', label: 'Full-Time' },
                  { slug: 'part-time', label: 'Part-Time' },
                  { slug: 'contract', label: 'Contract' },
                  { slug: 'addiction', label: 'Addiction' },
                  { slug: 'behavioral-health', label: 'Behavioral Health' },
                  { slug: 'correctional', label: 'Correctional' },
                  { slug: '1099', label: '1099' },
                ].filter((setting) => validSettingSlugs.has(setting.slug)).map((setting) => (
                  <Link key={setting.slug} href={`/jobs/${setting.slug}/${stateSlug}`}
                    className="pseo-pill"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '7px 16px', borderRadius: '12px', textDecoration: 'none', fontSize: '13px', fontWeight: 600, color: '#1A2E35', background: '#FFFFFF', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '3px 3px 8px rgba(0,0,0,0.05), -2px -2px 6px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)' }}>
                    {setting.label} <ArrowRight size={12} style={{ color: '#0D9488' }} />
                  </Link>
                ))}
              </div>
            </div>

            {/* Resources — clay row */}
            <div>
              <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#7A6A62', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
                Explore More
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                <Link href={`/salary-guide/${stateSlug}`}
                  className="pseo-resource"
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', borderRadius: '14px', textDecoration: 'none', background: '#FFFFFF', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '4px 4px 10px rgba(0,0,0,0.05), -2px -2px 6px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)' }}>
                  <DollarSign size={18} style={{ color: '#0D9488', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1A2E35' }}>{stateName} Salary Guide</div>
                    <div style={{ fontSize: '11px', color: '#7A6A62', marginTop: '2px' }}>Comp data by setting</div>
                  </div>
                </Link>
                <Link href="/jobs/locations"
                  className="pseo-resource"
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', borderRadius: '14px', textDecoration: 'none', background: '#FFFFFF', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '4px 4px 10px rgba(0,0,0,0.05), -2px -2px 6px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)' }}>
                  <MapPin size={18} style={{ color: '#0D9488', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1A2E35' }}>All Locations</div>
                    <div style={{ fontSize: '11px', color: '#7A6A62', marginTop: '2px' }}>Browse all 50 states</div>
                  </div>
                </Link>
                <Link href="/jobs"
                  className="pseo-resource"
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', borderRadius: '14px', textDecoration: 'none', background: '#FFFFFF', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '4px 4px 10px rgba(0,0,0,0.05), -2px -2px 6px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)' }}>
                  <Users size={18} style={{ color: '#0D9488', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1A2E35' }}>All PMHNP Jobs</div>
                    <div style={{ fontSize: '11px', color: '#7A6A62', marginTop: '2px' }}>Nationwide listings</div>
                  </div>
                </Link>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ═══ FAQ ═══ */}
      <div style={{ background: 'linear-gradient(180deg, #F0FDFA 0%, #E6FAF5 50%, #F0FDFA 100%)' }}>
        <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '56px 20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '8px' }}>FAQ</p>
          <h2 className="font-lora" style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 700, color: '#1A2E35', textAlign: 'center', marginBottom: '40px' }}>PMHNP Jobs in {stateName}</h2>
          <div style={{ display: 'grid', gap: '12px' }}>
            {[
              { q: `How many PMHNP jobs are in ${stateName}?`, a: `There are currently ${stats.totalJobs} psychiatric nurse practitioner positions available in ${stateName}${stats.avgSalary > 0 ? `, with an average salary of $${stats.avgSalary}K/year` : ''}. New positions are added daily.` },
              { q: `What is the practice authority in ${stateName}?`, a: practiceAuthority ? practiceAuthority.details : `Practice authority in ${stateName} varies. Check state-specific NP practice regulations for the most current requirements.` },
              { q: `What is the average PMHNP salary in ${stateName}?`, a: stats.avgSalary > 0 ? `The average PMHNP salary in ${stateName} is $${stats.avgSalary}K/year. Salaries vary based on experience, setting, and whether the role is W-2 or 1099.` : `PMHNP salaries in ${stateName} typically range from $130K to $200K+ depending on setting and experience level.` },
              { q: `Which cities in ${stateName} have the most PMHNP jobs?`, a: citiesWithJobs.length > 0 ? `Top cities for PMHNP jobs in ${stateName} include ${citiesWithJobs.slice(0, 4).map(c => `${c.name} (${c.count} jobs)`).join(', ')}.` : `PMHNP positions in ${stateName} are distributed across multiple cities and include remote telehealth options.` },
              { q: `Can I work remotely as a PMHNP in ${stateName}?`, a: `Yes, many telehealth and remote PMHNP positions allow you to practice from ${stateName}. You'll need an active NP license in the state where your patient resides.` },
            ].map((faq, idx) => (
              <details key={idx} className="faq-accordion" style={{ ...clayCard, overflow: 'hidden' }}>
                <summary style={{ padding: '20px 28px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', listStyle: 'none', fontSize: '16px', fontWeight: 700, color: '#1A2E35', lineHeight: 1.4 }}>
                  <span>{faq.q}</span>
                  <span className="faq-chevron" style={{ flexShrink: 0, width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', background: '#F0FDFA', color: '#0D9488', fontSize: '18px', fontWeight: 700 }}>+</span>
                </summary>
                <div style={{ padding: '0 28px 20px', fontSize: '14px', color: '#5A4A42', lineHeight: 1.7 }}>{faq.a}</div>
              </details>
            ))}
          </div>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [
            { q: `How many PMHNP jobs are in ${stateName}?`, a: `There are currently ${stats.totalJobs} positions available in ${stateName}.` },
            { q: `What is the practice authority in ${stateName}?`, a: practiceAuthority?.details || `Practice authority varies by state.` },
            { q: `What is the average PMHNP salary in ${stateName}?`, a: stats.avgSalary > 0 ? `$${stats.avgSalary}K/year` : `$130K-$200K+` },
            { q: `Which cities in ${stateName} have the most PMHNP jobs?`, a: citiesWithJobs.slice(0, 4).map(c => c.name).join(', ') || 'Multiple cities' },
            { q: `Can I work remotely as a PMHNP in ${stateName}?`, a: `Yes, many telehealth positions are available.` },
          ].map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }) }} />
        </section>
      </div>

      {/* ═══ RESPONSIVE CSS ═══ */}
      <style>{`
        .cat-cta-primary { transition: transform 0.25s ease, box-shadow 0.25s ease, filter 0.25s ease; }
        .cat-cta-primary:hover { transform: translateY(-3px); box-shadow: 0 10px 32px rgba(13,148,136,0.35) !important; filter: brightness(1.05); }
        .cat-bento-card { transition: transform 0.3s ease, box-shadow 0.3s ease; }
        .cat-bento-card:hover { transform: translateY(-4px); box-shadow: 8px 8px 24px rgba(0,0,0,0.1), -4px -4px 12px rgba(255,255,255,0.9), inset 1px 1px 2px rgba(255,255,255,0.6) !important; }
        .pseo-pill { transition: transform 0.25s ease, box-shadow 0.25s ease; }
        .pseo-pill:hover { transform: translateY(-3px); box-shadow: 6px 6px 20px rgba(0,0,0,0.1), -3px -3px 10px rgba(255,255,255,0.9), inset 1px 1px 2px rgba(255,255,255,0.6) !important; }
        .pseo-pill:active { transform: translateY(-1px); }
        .pseo-resource { transition: transform 0.25s ease, box-shadow 0.25s ease; }
        .pseo-resource:hover { transform: translateY(-4px); box-shadow: 8px 8px 24px rgba(0,0,0,0.1), -4px -4px 12px rgba(255,255,255,0.9), inset 1px 1px 2px rgba(255,255,255,0.6) !important; }
        .pseo-resource:active { transform: translateY(-1px); }
        .faq-accordion { transition: box-shadow 0.3s ease; }
        .faq-accordion:hover { box-shadow: 8px 8px 24px rgba(0,0,0,0.08), -4px -4px 12px rgba(255,255,255,0.9), inset 1px 1px 2px rgba(255,255,255,0.6) !important; }
        .faq-accordion summary::-webkit-details-marker { display: none; }
        .faq-accordion summary::marker { display: none; content: ''; }
        .faq-accordion[open] .faq-chevron { transform: rotate(45deg); background: #0D9488; color: #fff; }
        .faq-chevron { transition: transform 0.3s ease, background 0.3s ease, color 0.3s ease; }
        .cat-stat-pill { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .cat-stat-pill:hover { transform: translateY(-2px) scale(1.02); box-shadow: 6px 6px 20px rgba(0,0,0,0.1), -3px -3px 10px rgba(255,255,255,0.9) !important; }
        @media (max-width: 768px) {
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
