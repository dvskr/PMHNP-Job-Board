import { cache } from 'react';
import Image from 'next/image';
import { formatSalary, slugify, getJobFreshness, getExpiryStatus, expandInlineBullets, splitAtSectionMarkers } from '@/lib/utils';
import { sanitizeHtmlContent } from '@/lib/sanitize';
import { MapPin, Briefcase, Monitor, BadgeCheck, ArrowRight, Search } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import { Job, Company } from '@/lib/types';
import SaveJobButton from '@/components/SaveJobButton';
import ApplyButton from '@/components/ApplyButton';
import { effectiveExperienceLabel, effectiveNewGradFriendly } from '@/lib/experience-label';
import ReportJobButton from '@/components/ReportJobButton';
import MessageEmployerButton from '@/components/jobs/MessageEmployerButton';

import ShareButtons from '@/components/ShareButtons';
import AnimatedContainer from '@/components/ui/AnimatedContainer';
import JobNotFound from '@/components/JobNotFound';
import JobStructuredData from '@/components/JobStructuredData';
import Breadcrumbs from '@/components/Breadcrumbs';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';
import RelatedJobs from '@/components/RelatedJobs';
import AboutEmployer from '@/components/AboutEmployer';
import SalaryInsights from '@/components/SalaryInsights';
import { JobViewTracker } from '@/components/analytics/ViewTrackers';
import SalaryComparisonWidget from '@/components/SalaryComparisonWidget';
import RelatedBlogPosts, { getRelevantBlogSlugs } from '@/components/RelatedBlogPosts';
import InternalLinks from '@/components/InternalLinks';
import { CareerPulseCard, ApplicationTipsCard } from '@/components/jobs/SidebarVisualCards';
import { prisma } from '@/lib/prisma';
import { getPostBySlug } from '@/lib/blog';
import { getCurrentUser } from '@/lib/auth/protect';
import Link from 'next/link';
import { notFound } from 'next/navigation';

// ISR: Cache job detail pages for 1 hour.
// Each job page runs 10-12 DB queries (relatedJobs, companyInfo, salaryData, blogPosts, etc.).
// Without caching, Googlebot crawling thousands of pages simultaneously exhausts the DB
// connection pool → 5xx errors. 3600s trades freshness for stability.
export const revalidate = 3600;

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com';

interface JobPageProps {
  params: { slug: string };
}

type JobResult =
  | { status: 'found'; job: Job }
  | { status: 'expired'; employer?: string; title?: string }
  | { status: 'gone' };

const getJob = cache(async function getJob(id: string): Promise<JobResult> {
  try {
    // First check if job exists at all (any status)
    const anyJob = await prisma.job.findUnique({
      where: { id },
      select: { id: true, isPublished: true, employer: true, title: true },
    });

    if (!anyJob) {
      // Job was deleted from DB entirely — return 410 Gone so Google stops recrawling
      return { status: 'gone' };
    }

    // Job exists but is unpublished/expired → 410 Gone
    if (!anyJob.isPublished) {
      return { status: 'expired', employer: anyJob.employer, title: anyJob.title };
    }

    // Job is published — fetch full data with employer info
    const jobWithRelation = await prisma.job.findUnique({
      where: { id },
      include: {
        employerJobs: {
          select: { companyLogoUrl: true, companyWebsite: true, userId: true },
        },
      },
    });
    if (!jobWithRelation) return { status: 'gone' };

    // Increment view count AND create view event for analytics funnel
    Promise.all([
      prisma.job.update({
        where: { id },
        data: { viewCount: { increment: 1 } },
      }),
      prisma.jobViewEvent.create({
        data: { jobId: id },
      }),
    ]).catch(() => { });

    // Attach employer logo to the job object for rendering
    const jobData = {
      ...jobWithRelation,
      companyLogoUrl: jobWithRelation.employerJobs?.companyLogoUrl || null,
      companyWebsite: jobWithRelation.employerJobs?.companyWebsite || null,
      employerUserId: jobWithRelation.employerJobs?.userId || null,
    };

    return { status: 'found', job: jobData as Job };
  } catch (error) {
    console.error('Error fetching job:', error);
    return { status: 'gone' };
  }
});

interface RelatedJobsParams {
  currentJobId: string;
  employer: string;
  city?: string | null;
  state?: string | null;
  mode?: string | null;
  limit?: number;
}

/**
 * Phase 3 #20 — three explicit internal-linking buckets surfaced as
 * separate sections on the JD page (more from this employer, more in
 * city, more new-grad jobs). Distinct from getRelatedJobs which mixes
 * everything into a single "Similar PMHNP jobs" feed. SEO impact:
 * named anchor links into category/employer/city pages compound the
 * pSEO surface area.
 */
export async function getInternalLinkBuckets(params: {
  currentJobId: string;
  employer: string;
  city?: string | null;
  state?: string | null;
  newGradFriendly?: boolean;
}) {
  const { currentJobId, employer, city, state, newGradFriendly } = params;
  const baseWhere = { id: { not: currentJobId }, isPublished: true } as const;
  const baseOrder = { createdAt: 'desc' as const };

  const [moreFromEmployer, moreInCity, moreNewGrad] = await Promise.all([
    prisma.job.findMany({ where: { ...baseWhere, employer }, take: 3, orderBy: baseOrder }),
    city
      ? prisma.job.findMany({
          where: { ...baseWhere, city: { equals: city, mode: 'insensitive' } },
          take: 3,
          orderBy: baseOrder,
        })
      : Promise.resolve([] as Job[]),
    newGradFriendly
      ? prisma.job.findMany({
          where: { ...baseWhere, newGradFriendly: true },
          take: 3,
          orderBy: baseOrder,
        })
      : Promise.resolve([] as Job[]),
  ]);

  return {
    moreFromEmployer: moreFromEmployer as Job[],
    moreInCity: moreInCity as Job[],
    moreNewGrad: moreNewGrad as Job[],
    cityName: city ?? null,
    stateName: state ?? null,
  };
}

async function getRelatedJobs({
  currentJobId,
  employer,
  city,
  state,
  mode,
  limit = 4,
}: RelatedJobsParams) {
  // All four candidate queries run in parallel (audit 18 M-3). Previously
  // they were sequential because each `notIn` clause filtered out IDs
  // returned by the prior query, making four DB round-trips on every job
  // detail render. Parallelizing fetches up to `limit` candidates per
  // bucket (slightly more bytes) but cuts wall-clock latency by ~3x on
  // a typical render. Dedup happens in-memory below in priority order.
  const baseWhere = { id: { not: currentJobId }, isPublished: true } as const;
  const baseOrder = { createdAt: 'desc' as const };

  const [sameEmployerJobs, sameCityJobs, sameStateJobs, sameModeJobs] = await Promise.all([
    prisma.job.findMany({ where: { ...baseWhere, employer }, take: limit, orderBy: baseOrder }),
    city ? prisma.job.findMany({
      where: { ...baseWhere, city: { equals: city, mode: 'insensitive' } },
      take: limit, orderBy: baseOrder,
    }) : Promise.resolve([] as Awaited<ReturnType<typeof prisma.job.findMany>>),
    state ? prisma.job.findMany({
      where: { ...baseWhere, state: { equals: state, mode: 'insensitive' } },
      take: limit, orderBy: baseOrder,
    }) : Promise.resolve([] as Awaited<ReturnType<typeof prisma.job.findMany>>),
    mode ? prisma.job.findMany({
      where: { ...baseWhere, mode: { equals: mode, mode: 'insensitive' } },
      take: limit, orderBy: baseOrder,
    }) : Promise.resolve([] as Awaited<ReturnType<typeof prisma.job.findMany>>),
  ]);

  // Merge in priority order, deduplicating by id. Stops as soon as we
  // have `limit` items so we don't pay for sorting beyond the budget.
  const seen = new Set<string>([currentJobId]);
  const result: Job[] = [];
  for (const bucket of [sameEmployerJobs, sameCityJobs, sameStateJobs, sameModeJobs]) {
    for (const job of bucket) {
      if (result.length >= limit) break;
      if (seen.has(job.id)) continue;
      seen.add(job.id);
      result.push(job as Job);
    }
    if (result.length >= limit) break;
  }
  return result;
}

/**
 * Fetch company information for employer section.
 *
 * H8 fix: previously this issued up to 5 sequential DB round-trips
 * (company by id → employerJob by jobId → company by name → employerJob
 * again → job.count) for each cache-miss render of a job page. Now the
 * three independent lookups fan out in parallel, the EmployerJob is
 * fetched once with all the columns we might read, and the count only
 * runs in the fall-through "no Company row" branch.
 */
async function getCompanyInfo(companyId: string | null, employerName: string, jobId?: string) {
  const normalizedName = employerName.toLowerCase().trim();

  // Fan out all three independent reads in parallel. Each one may be
  // null; we pick based on availability below.
  const [companyById, companyByName, employerJobRow] = await Promise.all([
    companyId
      ? prisma.company.findUnique({ where: { id: companyId } })
      : Promise.resolve(null),
    prisma.company.findFirst({
      where: {
        OR: [
          { normalizedName },
          { name: { equals: employerName, mode: 'insensitive' } },
        ],
      },
    }),
    jobId
      ? prisma.employerJob.findUnique({
          where: { jobId },
          select: {
            companyLogoUrl: true,
            companyWebsite: true,
            companyDescription: true,
            employerName: true,
          },
        })
      : Promise.resolve(null),
  ]);

  const company = companyById ?? companyByName;
  if (company) {
    if (!company.logoUrl && employerJobRow?.companyLogoUrl) {
      return { ...company, logoUrl: employerJobRow.companyLogoUrl } as Company;
    }
    return company as Company;
  }

  // No Company record — synthesize one from the EmployerJob fields.
  if (employerJobRow && (employerJobRow.companyLogoUrl || employerJobRow.companyDescription)) {
    const jobCount = await prisma.job.count({
      where: { employer: employerName, isPublished: true },
    });
    return {
      id: 'employer-' + (jobId ?? 'unknown'),
      name: employerJobRow.employerName || employerName,
      description: employerJobRow.companyDescription,
      website: employerJobRow.companyWebsite,
      logoUrl: employerJobRow.companyLogoUrl,
      jobCount,
      isVerified: false,
      normalizedName,
    } as Company;
  }

  return null;
}

/**
 * Get count of other jobs from the same employer
 */
async function getEmployerJobCount(employerName: string, currentJobId: string) {
  const count = await prisma.job.count({
    where: {
      employer: { equals: employerName, mode: 'insensitive' },
      isPublished: true,
      id: { not: currentJobId },
    },
  });
  return count;
}

/**
 * Get average salary for a state
 */
async function getStateSalaryAverage(stateName: string | null, stateCode: string | null) {
  if (!stateName && !stateCode) return 0;

  const salaryData = await prisma.job.aggregate({
    where: {
      isPublished: true,
      OR: [
        ...(stateName ? [{ state: stateName }] : []),
        ...(stateCode ? [{ stateCode: stateCode }] : []),
      ],
      normalizedMinSalary: { not: null, gte: 30000 },
      normalizedMaxSalary: { not: null, gte: 30000 },
    },
    _avg: {
      normalizedMinSalary: true,
      normalizedMaxSalary: true,
    },
  });

  const avgMin = salaryData._avg.normalizedMinSalary || 0;
  const avgMax = salaryData._avg.normalizedMaxSalary || 0;

  if (avgMin === 0 && avgMax === 0) return 0;

  return Math.round((avgMin + avgMax) / 2 / 1000);
}

/**
 * Get relevant blog posts for this job
 */
async function getRelevantBlogPosts(job: Job) {
  const slugs = getRelevantBlogSlugs({
    isRemote: job.isRemote,
    isTelehealth: job.mode?.toLowerCase().includes('telehealth') ||
      job.title.toLowerCase().includes('telehealth') ||
      job.description.toLowerCase().includes('telehealth'),
    isNewGrad: job.title.toLowerCase().includes('new grad') ||
      job.description.toLowerCase().includes('new grad'),
    state: job.state,
    jobType: job.jobType,
  });

  const results = await Promise.allSettled(slugs.map(slug => getPostBySlug(slug)));
  const posts = results
    .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof getPostBySlug>>> => r.status === 'fulfilled' && r.value !== null)
    .map(r => ({
      slug: r.value!.slug,
      title: r.value!.title,
      description: r.value!.meta_description || '',
      category: r.value!.category,
    }));
  return posts;
}

export async function generateMetadata({ params }: JobPageProps) {
  const resolvedParams = await params;
  const slug = resolvedParams.slug;


  // Extract UUID from end of slug (format: title-words-UUID)
  // UUID format: 8-4-4-4-12 characters (36 chars total with dashes)
  const uuidMatch = slug.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i);
  const id = uuidMatch ? uuidMatch[1] : null;

  if (!id) {
    // Malformed slug with no UUID — this is a 404 (wrong/guessed URL),
    // not a 410 (deleted job). Use generic page-not-found metadata.
    return {
      title: 'Page Not Found',
      description: 'The page you are trying to access doesn’t exist. Browse current PMHNP jobs on PMHNP Hiring.',
      robots: { index: false, follow: true },
    };
  }

  const result = await getJob(id);

  // Job completely deleted from DB → 410 Gone
  if (result.status === 'gone') {
    return {
      title: 'Position No Longer Available',
      description: 'This PMHNP position is no longer available. Browse current job openings on PMHNP Hiring.',
      robots: { index: false, follow: true },
      other: { 'X-Status': '410' },
    };
  }

  // GSC Fix: Expired jobs → noindex page with rich content instead of bare 404.
  // Previously used notFound() which inflated the 2,682 "Not found (404)" count in GSC.
  // A 200 + noindex + rich content (links to similar jobs) tells Google to de-index
  // the URL without wasting crawl budget re-crawling 404s.
  if (result.status === 'expired') {
    const expiredTitle = result.title || 'PMHNP Position';
    const expiredEmployer = result.employer || 'Employer';
    return {
      title: `${expiredTitle} — Position Filled`,
      description: `This ${expiredTitle} position at ${expiredEmployer} is no longer available. Browse similar PMHNP jobs on PMHNP Hiring.`,
      robots: {
        index: false,
        follow: true,
      },
    };
  }

  const job = result.job;

  // Strip HTML tags before slicing — Quill-edited employer postings and many
  // scraped descriptions arrive as HTML, and slicing raw HTML stuffs <p>/<ul>
  // tags into the meta description, which Google then renders as literal
  // text in SERP snippets. descriptionSummary (when present) is plain text,
  // but we apply the stripper unconditionally so a future raw value can't leak.
  const stripHtmlForMeta = (s: string): string =>
    s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const description = stripHtmlForMeta(job.descriptionSummary || job.description).slice(0, 158);

  // Format salary for OG image - DON'T include if $0k or empty
  const formatOGSalary = (): string | null => {
    // Get salary values, defaulting to 0 if null/undefined
    const min = Number(job.normalizedMinSalary) || Number(job.minSalary) || 0;
    const max = Number(job.normalizedMaxSalary) || Number(job.maxSalary) || 0;

    // Must have REAL non-zero values (at least 1000 to be valid)
    if (min >= 1000 && max >= 1000) {
      return `$${Math.round(min / 1000)}k-$${Math.round(max / 1000)}k`;
    }
    if (min >= 1000) return `$${Math.round(min / 1000)}k+`;
    if (max >= 1000) return `Up to $${Math.round(max / 1000)}k`;

    return null; // Return null, NOT empty string
  };

  // Format location for OG image
  const formatOGLocation = () => {
    if (job.isRemote) return 'Remote';
    if (job.city && job.state) return `${job.city}, ${job.state}`;
    if (job.state) return job.state;
    if (job.location) return job.location;
    return '';
  };

  // Check if job is new (less than 7 days old)
  const isNew = job.createdAt
    ? (Date.now() - new Date(job.createdAt).getTime()) < 7 * 24 * 60 * 60 * 1000
    : false;

  // Build dynamic OG image URL
  const ogImageUrl = new URL('/api/og', BASE_URL);
  ogImageUrl.searchParams.set('title', job.title);
  ogImageUrl.searchParams.set('company', job.employer);

  // ONLY add salary if formatOGSalary returns a valid value
  const salary = formatOGSalary();
  if (salary && salary.length > 0 && !salary.includes('$0k')) {
    ogImageUrl.searchParams.set('salary', salary);
  }

  const location = formatOGLocation();
  if (location) ogImageUrl.searchParams.set('location', location);

  if (job.jobType) ogImageUrl.searchParams.set('jobType', job.jobType);
  if (isNew) ogImageUrl.searchParams.set('isNew', 'true');
  // Phase 1 #19 — surface experience label in social previews so the
  // "New grad welcome" / "5+ yrs" chip is visible at share time. Read
  // by the OG route's optional `experience` param.
  // Use the effective label so social shares of residency / fellowship
  // jobs show "New grad welcome" instead of the mis-extracted "5+ yrs".
  const ogExperienceLabel = effectiveExperienceLabel(job);
  if (ogExperienceLabel) ogImageUrl.searchParams.set('experience', ogExperienceLabel);

  // Canonical comes from the row's stored slug, NOT the request param.
  //   - The page resolves a job by extracting the trailing UUID from the
  //     incoming slug, so /jobs/anything-${uuid} all hit the same job.
  //   - Without anchoring the canonical on the stored value, every variant
  //     URL (typos, old title-derived prefixes from before a title edit,
  //     truncated copies in shares) would emit a different canonical and
  //     splinter the indexed forms.
  //   - Falling back to slugify(title, id) covers legacy rows ingested
  //     before the slug column was being written; the backfill script at
  //     scripts/backfill-job-slugs.ts converts those over time.
  const canonicalSlug = job.slug || slugify(job.title, job.id);
  const canonicalUrl = `https://pmhnphiring.com/jobs/${canonicalSlug}`;

  // Title includes location when available so SERP listings differentiate
  // identical job titles posted in multiple cities. Capped at ~60 chars so
  // Google doesn't truncate; falls back to "{title} at {employer}" only.
  const titleLocation = job.isRemote
    ? 'Remote'
    : (job.city && job.stateCode ? `${job.city}, ${job.stateCode}` : (job.state || ''));
  const fullTitle = titleLocation
    ? `${job.title} at ${job.employer} — ${titleLocation}`
    : `${job.title} at ${job.employer}`;
  const titleWithLocation = fullTitle.length > 65
    ? `${job.title} — ${titleLocation || job.employer}`.slice(0, 65)
    : fullTitle;

  return {
    title: titleWithLocation,
    description,
    openGraph: {
      title: titleWithLocation,
      description,
      type: 'article',
      url: canonicalUrl,
      siteName: 'PMHNP Hiring',
      images: [
        {
          url: ogImageUrl.toString(),
          width: 1200,
          height: 630,
          alt: `${job.title} at ${job.employer}`,
          type: 'image/png',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: titleWithLocation,
      description,
      images: [ogImageUrl.toString()],
    },
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

/**
 * Render a "410 Gone" page for jobs that have been permanently removed.
 * Google honors the noindex meta tag set in generateMetadata() and the
 * X-Robots-Tag header set in middleware. The rich content with internal
 * links preserves link equity while signaling permanent removal.
 */
function renderGonePage() {
  return renderRemovedPage({ badge: 'Position Removed', badgeGradient: 'linear-gradient(135deg, #6b7280, #4b5563)', heading: 'This Position Is No Longer Available', subtext: 'This job listing has been permanently removed.' });
}

function renderRemovedPage({ badge, badgeGradient, heading, subtext, title, employer }: { badge: string; badgeGradient: string; heading: string; subtext: string; title?: string; employer?: string }) {
  const clayCard: React.CSSProperties = {
    background: '#FFFFFF', borderRadius: '20px',
    border: '1px solid rgba(255,255,255,0.5)',
    boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
  };

  const actionCards = [
    { href: '/jobs', label: 'Browse All Jobs', sub: 'View all open positions', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_location.webp' },
    { href: '/jobs/remote', label: 'Remote Jobs', sub: 'Work from anywhere', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_remote.webp' },
    { href: '/jobs/telehealth', label: 'Telehealth Jobs', sub: 'Virtual psychiatric care', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_telehealth.webp' },
    { href: '/jobs/travel', label: 'Travel Jobs', sub: 'Explore new locations', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_travel.webp' },
    { href: '/jobs/outpatient', label: 'Outpatient Jobs', sub: 'Clinic-based roles', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_outpatient.webp' },
    { href: '/jobs/inpatient', label: 'Inpatient Jobs', sub: 'Hospital settings', icon: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_inpatient.webp' },
  ];

  return (
    <div style={{ backgroundColor: '#F5F0EB', minHeight: '100vh' }}>
      {/* Inline hover styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        .gone-card { transition: transform 0.25s ease, box-shadow 0.25s ease; cursor: pointer; }
        .gone-card:hover { transform: translateY(-4px) !important; box-shadow: 8px 8px 24px rgba(0,0,0,0.1), -4px -4px 12px rgba(255,255,255,0.9), inset 1px 1px 2px rgba(255,255,255,0.6) !important; }
        .gone-card:active { transform: translateY(-1px) !important; }
        .gone-cta { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .gone-cta:hover { transform: translateY(-2px) !important; box-shadow: 0 8px 20px rgba(13,148,136,0.3) !important; }
      `}} />

      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '60px 20px 80px' }}>

        {/* Hero Clay Card */}
        <div style={{ ...clayCard, padding: '40px 32px', textAlign: 'center', marginBottom: '24px' }}>
          {/* Badge */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '6px 18px', borderRadius: '20px', fontSize: '13px', fontWeight: 700, letterSpacing: '0.03em',
            background: badgeGradient, color: '#fff',
          }}>
            {badge}
          </span>

          {/* Heading */}
          <h1 className="font-lora" style={{ fontSize: '28px', fontWeight: 800, color: '#1A2E35', margin: '20px 0 12px', lineHeight: 1.3 }}>
            {heading}
          </h1>

          {/* Job details if expired */}
          {title && employer && (
            <p style={{ fontSize: '16px', color: '#5A4A42', marginBottom: '8px' }}>
              <strong>{title}</strong> at <strong>{employer}</strong>
            </p>
          )}

          <p style={{ fontSize: '15px', color: '#7A6A62', marginBottom: '0', lineHeight: 1.6 }}>
            {subtext}
          </p>
          <p style={{ fontSize: '14px', color: '#7A6A62', marginTop: '8px' }}>
            Don&apos;t worry — we have hundreds of similar PMHNP positions available right now.
          </p>
        </div>

        {/* Action Cards — 3×2 Grid */}
        <div style={{ ...clayCard, padding: '24px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '13px', fontWeight: 700, color: '#7A6A62', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '16px' }}>
            Explore Open Positions
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            {actionCards.map((card) => (
              <a key={card.href} href={card.href}
                className="gone-card"
                style={{
                  ...clayCard, display: 'flex', flexDirection: 'column', alignItems: 'center',
                  padding: '20px 12px', textAlign: 'center', textDecoration: 'none',
                }}>
                <img src={card.icon} alt="" width={40} height={40} loading="lazy" decoding="async" style={{ marginBottom: '10px', objectFit: 'contain' }} />
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#1A2E35', marginBottom: '3px' }}>{card.label}</div>
                <div style={{ fontSize: '11px', color: '#7A6A62' }}>{card.sub}</div>
              </a>
            ))}
          </div>
        </div>

        {/* Salary Guide CTA */}
        <div style={{ ...clayCard, padding: '28px 32px', textAlign: 'center' }}>
          <p style={{ fontSize: '14px', color: '#7A6A62', marginBottom: '16px' }}>
            While you&apos;re here, check out the latest PMHNP salary data:
          </p>
          <a href="/salary-guide"
            className="gone-cta"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '12px 28px', borderRadius: '14px', fontSize: '15px', fontWeight: 700,
              color: '#fff', textDecoration: 'none',
              background: 'linear-gradient(135deg, #0D9488, #0F766E)',
              boxShadow: '4px 4px 12px rgba(13,148,136,0.2), -2px -2px 6px rgba(255,255,255,0.3), inset 1px 1px 2px rgba(255,255,255,0.2)',
            }}>
            <img src="https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/categories/clay_icon_salary.webp" alt="" width={22} height={22} loading="lazy" decoding="async" style={{ objectFit: 'contain' }} />
            2026 PMHNP Salary Guide →
          </a>
        </div>

      </div>
    </div>
  );
}

export default async function JobPage({ params }: JobPageProps) {
  const resolvedParams = await params;

  // Extract UUID from end of slug (format: title-words-UUID)
  // UUID format: 8-4-4-4-12 characters (36 chars total with dashes)
  const uuidMatch = resolvedParams.slug.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i);
  const id = uuidMatch ? uuidMatch[1] : null;

  if (!id) {
    // Malformed slug with no UUID — this is a wrong/guessed URL, not a deleted job.
    // Render proper 404 instead of the misleading "Position No Longer Available" template.
    notFound();
  }

  const result = await getJob(id);

  // Job completely deleted → render 410 Gone page
  if (result.status === 'gone') {
    return renderGonePage();
  }

  // Job exists but expired/unpublished → render rich expired page
  // (not notFound() — see generateMetadata for rationale)
  if (result.status === 'expired') {
    const expiredTitle = result.title || 'PMHNP Position';
    const expiredEmployer = result.employer || 'an employer';

    return renderRemovedPage({
      badge: 'Position Filled',
      badgeGradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
      heading: 'This Position Has Been Filled',
      subtext: 'This job has been filled or the listing has expired.',
      title: expiredTitle,
      employer: expiredEmployer,
    });
  }

  const job = result.job;

  // H9 fix: previously `getRelevantBlogPosts` was awaited AFTER this
  // Promise.all, adding 50-100ms of pure serial latency to every cache
  // miss render of the hottest page on the site. Pulled into the same
  // fan-out so all six independent reads start at the same tick.
  const [
    relatedJobs,
    companyInfo,
    employerJobCount,
    stateAvgSalary,
    currentUser,
    relevantBlogPosts,
    internalLinkBuckets,
  ] = await Promise.all([
    getRelatedJobs({
      currentJobId: job.id,
      employer: job.employer,
      city: job.city,
      state: job.state,
      mode: job.mode,
      limit: 5, // Increased from 4 to 5 for more related content
    }),
    getCompanyInfo(job.companyId, job.employer, job.id),
    getEmployerJobCount(job.employer, job.id),
    getStateSalaryAverage(job.state, job.stateCode),
    getCurrentUser(),
    getRelevantBlogPosts(job),
    getInternalLinkBuckets({
      currentJobId: job.id,
      employer: job.employer,
      city: job.city,
      state: job.state,
      newGradFriendly: job.newGradFriendly,
    }),
  ]);
  const isAuthenticated = !!currentUser;
  const isOwnJob = !!(currentUser && (job as unknown as Record<string, unknown>).employerUserId === currentUser.user.id);

  const salary = formatSalary(job.minSalary, job.maxSalary, job.salaryPeriod);
  const freshness = getJobFreshness(job.createdAt);
  const expiryStatus = getExpiryStatus(job.expiresAt);

  // Determine if job is telehealth/remote for internal linking
  const isTelehealth = job.mode?.toLowerCase().includes('telehealth') ||
    job.title.toLowerCase().includes('telehealth') ||
    job.description.toLowerCase().includes('telehealth');

  // Build breadcrumb items
  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: 'Jobs', href: '/jobs' },
  ];

  // Add state if available
  if (job.state) {
    breadcrumbItems.push({
      label: job.state,
      href: `/jobs/state/${job.state.toLowerCase().replace(/\s+/g, '-')}`,
    });
  }

  // Add city if available (with state code for proper routing)
  if (job.city && job.stateCode) {
    const citySlug = `${job.city.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')}-${job.stateCode.toLowerCase()}`;
    breadcrumbItems.push({
      label: job.city,
      href: `/jobs/city/${citySlug}`,
    });
  } else if (job.city) {
    // Fallback: no state code, use resolveAmbiguousSlug-compatible format
    breadcrumbItems.push({
      label: job.city,
      href: `/jobs/city/${job.city.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')}`,
    });
  }

  // Current page (no link)
  breadcrumbItems.push({
    label: `${job.title} at ${job.employer}`,
    href: '',
  });

  return (
    <>
      <JobStructuredData
        job={job}
      />
      <BreadcrumbSchema items={[
        { name: 'Home', url: 'https://pmhnphiring.com' },
        { name: 'Jobs', url: 'https://pmhnphiring.com/jobs' },
        ...(job.state ? [{ name: job.state, url: `https://pmhnphiring.com/jobs/state/${job.state.toLowerCase().replace(/\s+/g, '-')}` }] : []),
        { name: job.title, url: `https://pmhnphiring.com/jobs/${job.slug || job.id}` },
      ]} />
      <JobViewTracker job={{ id: job.id, title: job.title, employer: job.employer, jobType: job.jobType || undefined, stateCode: job.stateCode || undefined, sourceProvider: job.sourceProvider || undefined, normalizedMinSalary: job.normalizedMinSalary }} />
      <div style={{ backgroundColor: '#F5F0EB', minHeight: '100vh', paddingTop: '1px', paddingBottom: '40px' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 pb-24 lg:pb-8">
        {/* Breadcrumbs */}
        <Breadcrumbs items={breadcrumbItems} />
        <div className="lg:grid lg:grid-cols-[1fr_340px] lg:gap-8">
          {/* Main Content */}
          <div className="min-w-0">
            {/* Header Section.
                Audit 18 C-1 (CWV): AnimatedContainer is 'use client', so
                wrapping the LCP card in it gated paint behind hydration —
                even with delay={0}, the fade-in-up animation can't run
                until React hydrates the boundary, leaving the h1 + hero
                content invisible (opacity:0) on cold loads. Replaced
                with a plain <div> so the LCP element renders
                immediately. AnimatedContainer is still used for
                below-the-fold cards (where the hydration gap is
                imperceptible). */}
            <div className="job-detail-hero-card">
              <div className="rounded-2xl overflow-hidden mb-5 lg:mb-6" style={{ backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.06)', borderRadius: '20px', boxShadow: '6px 6px 12px rgba(0,0,0,0.06), -2px -2px 8px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)', position: 'relative', padding: '24px 24px 28px', }}>
                {/* Report Button - Top Right */}
                <div style={{ position: 'absolute', top: '16px', right: '16px' }}>
                  <ReportJobButton jobId={job.id} jobTitle={job.title} />
                </div>

                {/* Title */}
                <h1 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 800, fontFamily: 'var(--font-lora), Georgia, serif', color: 'var(--text-primary)', marginBottom: '16px', lineHeight: 1.2, paddingRight: '40px' }}>{job.title}</h1>

                {/* Company Info Row: Avatar + Name + Location.
                    Avatar always renders (logo if available, else a
                    deterministic-color letter fallback), with the
                    verified bluecheck overlaid on its bottom-right
                    corner. Mirrors the JobCard avatar treatment so the
                    bluecheck attaches to the company "identity puck"
                    rather than floating next to the text. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    {job.companyLogoUrl ? (
                      // Reserving 52x52 prevents the row from shifting when the image
                      // resolves -- this is above-the-fold so any CLS counts.
                      // Routed through Next's /_next/image proxy so the
                      // browser receives a retina-sized AVIF/WebP variant
                      // (vs. the raw source). `unoptimized` was previously
                      // set here, which delivered the full-size upload and
                      // produced visible softness at 52px on 2x/3x screens.
                      <Image
                        src={job.companyLogoUrl}
                        alt={`${job.employer} logo`}
                        width={52}
                        height={52}
                        quality={90}
                        sizes="52px"
                        style={{
                          width: '52px', height: '52px', borderRadius: '50%',
                          objectFit: 'contain', border: '1px solid rgba(0,0,0,0.06)',
                          background: '#FFFFFF',
                          boxShadow: '2px 2px 6px rgba(0,0,0,0.05)',
                        }}
                      />
                    ) : (
                      // Letter-initial fallback. Same deterministic-hue scheme
                      // as JobCard so the same employer gets the same avatar
                      // color across card + detail page.
                      <div
                        aria-hidden
                        style={{
                          width: '52px', height: '52px', borderRadius: '50%',
                          background: `hsl(${(job.employer || '').charCodeAt(0) * 7 % 360}, 40%, 50%)`,
                          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '22px', fontWeight: 700,
                        }}
                      >
                        {(job.employer || '?')[0].toUpperCase()}
                      </div>
                    )}
                    {job.isVerifiedEmployer && (
                      // White-disc background under the bluecheck so it
                      // reads cleanly on any avatar color. Same treatment
                      // as the JobCard avatar bluecheck.
                      <div
                        aria-label="Verified employer"
                        style={{
                          position: 'absolute', bottom: '-2px', right: '-2px',
                          background: '#fff', borderRadius: '50%',
                          width: '20px', height: '20px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        }}
                      >
                        <BadgeCheck size={18} fill="#1d9bf0" color="#ffffff" />
                      </div>
                    )}
                  </div>
                  {/* Two stacked rows beside the avatar:
                        Row 1 — employer name
                        Row 2 — location (map pin + text)
                      Mirrors the LinkedIn / Indeed identity puck style:
                      avatar on the left, two-line text to the right. */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                    {companyInfo ? (
                      <Link href={`/companies/${companyInfo.normalizedName}`} className="text-lg sm:text-xl font-semibold hover:text-teal-500 transition-colors" style={{ color: 'var(--text-secondary)' }}>
                        {job.employer}
                      </Link>
                    ) : (
                      <span className="text-lg sm:text-xl font-semibold" style={{ color: 'var(--text-secondary)' }}>{job.employer}</span>
                    )}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                      <MapPin size={14} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                      {job.location}
                    </span>
                  </div>
                </div>

                {/* Badges Row — claymorphic chips matching the JobCard
                    so the detail page reads as the same family. Uses
                    the shared Badge component (variants: featured /
                    success / outline) for visual consistency. */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' }}>
                  {salary && (
                    <Badge variant="salary" size="md">{salary}</Badge>
                  )}
                  {job.jobType && (
                    <Badge variant="outline" size="md">
                      <Briefcase size={12} /> {job.jobType}
                    </Badge>
                  )}
                  {job.mode && (
                    <Badge variant="outline" size="md">
                      <Monitor size={12} /> {job.mode}
                    </Badge>
                  )}
                  {(() => {
                    const expLabel = effectiveExperienceLabel(job);
                    if (!expLabel) return null;
                    return (
                      <Badge variant={effectiveNewGradFriendly(job) ? 'success' : 'outline'} size="md">
                        {expLabel}
                      </Badge>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Description Section */}
            <AnimatedContainer animation="fade-in-up" delay={200}>
              <div style={{ backgroundColor: '#FFFFFF', borderRadius: '20px', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '6px 6px 12px rgba(0,0,0,0.06), -2px -2px 8px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)', padding: '24px 28px', marginBottom: '20px', overflow: 'hidden' }}>
                <h2 style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: 'var(--text-primary)', marginBottom: '16px' }}>About this role</h2>

                {/* Note for external jobs */}
                {job.sourceType === 'external' && job.sourceProvider && (
                  <div className="rounded-lg p-4 mb-4" style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      <span className="font-semibold">Preview:</span> This is a summary from {job.sourceProvider}. Click <strong>&quot;Apply Now&quot;</strong> below to view the complete job description and application details.
                    </p>
                  </div>
                )}

                <div className="prose prose-gray max-w-none">
                  {/* Check if description contains HTML tags (from Quill editor) */}
                  {/<[a-z][\s\S]*>/i.test(job.description) ? (
                    <div
                      className="job-description-html"
                      style={{ color: 'var(--text-secondary)' }}
                      dangerouslySetInnerHTML={{ __html: sanitizeHtmlContent(job.description) }}
                    />
                  ) : (
                    // Plain text fallback for external/aggregated jobs.
                    // Render-time fix-ups for legacy aggregator data:
                    //   1. expandInlineBullets reflows " - X - Y" into bullets
                    //   2. splitAtSectionMarkers breaks long blobs at section
                    //      headers ("Our history", "E-Verify", etc.)
                    //   3. Empty bullets ("•" alone) get filtered out
                    //   4. Blank lines immediately before a bullet get
                    //      removed so siblings list items render flush
                    (() => {
                      const lines = splitAtSectionMarkers(expandInlineBullets(job.description))
                        // Legacy rows can carry 3+ consecutive newlines that
                        // render as stacked h-4 gaps. Collapse to a single
                        // blank line before splitting.
                        .replace(/\n{3,}/g, '\n\n')
                        .split('\n')
                        // Drop empty-bullet lines so they don't render as
                        // standalone "•" with no content (the Pharia/TMS JD
                        // showed these at the end of every section).
                        .filter((line) => !/^•\s*$/.test(line.trim()));
                      // Drop blank lines that sit directly before a bullet —
                      // when source has <li><p>...</p></li>, my </p> rule
                      // injects \n\n inside the <li>, which renders as an
                      // h-4 gap between siblings (LifeStance bullets had
                      // ~24px gaps).
                      const cleaned: string[] = [];
                      for (let i = 0; i < lines.length; i += 1) {
                        const line = lines[i];
                        const prev = cleaned[cleaned.length - 1];
                        const next = lines[i + 1];
                        // Drop blank line immediately before a bullet (closes
                        // h-4 gap that <p>-inside-<li> sources create).
                        if (!line.trim() && next && next.trim().startsWith('•')) continue;
                        // Clamp consecutive blank lines to a single break —
                        // sources like fantastic-jobs-db leave 4+ \n runs in
                        // descriptions, which render as stacked h-4 spacers
                        // (Dominican University JD had 7 such pairs).
                        if (!line.trim() && prev !== undefined && !prev.trim()) continue;
                        cleaned.push(line);
                      }
                      // Group consecutive bullet lines into a single <ul> so
                      // the browser's native list-marker handles vertical
                      // alignment (the previous manual "<span>•</span>" with
                      // mt-1 sat the dot at the line-height midpoint, not
                      // baseline-aligned with the text — LifeStance JDs made
                      // the misalignment obvious).
                      type Block =
                        | { kind: 'bullets'; items: string[] }
                        | { kind: 'header'; text: string }
                        | { kind: 'para'; text: string }
                        | { kind: 'spacer' };
                      const blocks: Block[] = [];
                      let pendingBullets: string[] = [];
                      const flushBullets = (): void => {
                        if (pendingBullets.length === 0) return;
                        blocks.push({ kind: 'bullets', items: pendingBullets });
                        pendingBullets = [];
                      };
                      for (let i = 0; i < cleaned.length; i += 1) {
                        const trimmed = cleaned[i].trim();
                        if (!trimmed) {
                          // If we're mid-bullet-group and the next non-blank
                          // line is also a bullet, swallow the blank line so
                          // the list stays one <ul>. Otherwise flush + spacer.
                          if (pendingBullets.length > 0) {
                            const nextNonBlank = cleaned.slice(i + 1).find((l) => l.trim());
                            if (nextNonBlank && nextNonBlank.trim().startsWith('•')) continue;
                          }
                          flushBullets();
                          blocks.push({ kind: 'spacer' });
                          continue;
                        }
                        if (trimmed.startsWith('•')) {
                          const content = trimmed.slice(1).trim();
                          if (content) pendingBullets.push(content);
                          continue;
                        }
                        flushBullets();
                        const isHeader = trimmed === trimmed.toUpperCase() && trimmed.length < 50 && trimmed.length > 2;
                        const endsWithColon = trimmed.endsWith(':');
                        if (isHeader || endsWithColon) blocks.push({ kind: 'header', text: trimmed });
                        else blocks.push({ kind: 'para', text: trimmed });
                      }
                      flushBullets();
                      return blocks.map((block, index) => {
                        if (block.kind === 'spacer') return <div key={index} className="h-4" />;
                        if (block.kind === 'bullets') {
                          return (
                            <ul key={index} className="list-disc pl-6 my-2 space-y-1" style={{ color: 'var(--text-primary)' }}>
                              {block.items.map((item, i) => (
                                <li key={i} className="leading-relaxed pl-1" style={{ color: 'var(--text-primary)' }}>
                                  <span style={{ color: 'var(--text-secondary)' }}>{item}</span>
                                </li>
                              ))}
                            </ul>
                          );
                        }
                        if (block.kind === 'header') {
                          return (
                            <h3 key={index} className="text-lg font-bold mt-6 mb-2" style={{ color: 'var(--text-primary)' }}>
                              {block.text}
                            </h3>
                          );
                        }
                        return (
                          <p key={index} className="leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
                            {block.text}
                          </p>
                        );
                      });
                    })()
                  )}
                </div>
              </div>
            </AnimatedContainer>

            {/* Salary Comparison Widget (A21) */}
            {stateAvgSalary > 0 && job.state && (
              <AnimatedContainer animation="fade-in-up" delay={220}>
                <SalaryComparisonWidget
                  stateName={job.state}
                  stateAvgSalary={Math.round(stateAvgSalary / 1000)}
                  jobMinSalary={job.normalizedMinSalary}
                  jobMaxSalary={job.normalizedMaxSalary}
                />
              </AnimatedContainer>
            )}

            {/* Footer Info */}
            <div className="text-sm px-1 mt-6" style={{ color: 'var(--text-tertiary)' }}>
              <p>{freshness}</p>
              {job.updatedAt && (
                <p className="mt-1">
                  Last updated: {new Date(job.updatedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              )}
              {job.sourceType === 'external' && job.sourceProvider && (
                <p className="mt-1">Posted via {job.sourceProvider}</p>
              )}
            </div>
          </div>

          {/* Sidebar - Desktop / Below content on mobile */}
          <AnimatedContainer animation="slide-in-right" delay={300}>
            <div className="mt-6 lg:mt-0" style={{ position: 'relative', zIndex: 1 }}>
              <div className="hidden lg:block lg:sticky lg:top-24" style={{ backgroundColor: '#FFFFFF', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.6)', boxShadow: '8px 8px 20px rgba(0,0,0,0.08), -4px -4px 12px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.6), inset -1px -1px 2px rgba(0,0,0,0.02)', padding: '24px' }}>
                {/* Expiry Notice - Desktop */}
                {!expiryStatus.isExpired && expiryStatus.text && (
                  <div className={`flex items-center gap-2 mb-4 pb-3 ${expiryStatus.isUrgent ? 'text-orange-500' : ''}`} style={{ borderBottom: '1px solid var(--border-color)', color: expiryStatus.isUrgent ? undefined : 'var(--text-tertiary)' }}>
                    <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm font-medium">
                      {expiryStatus.text}{expiryStatus.isUrgent && ' — Apply soon!'}
                    </p>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
                  <ApplyButton jobId={job.id} applyLink={job.applyLink} jobTitle={job.title} isAuthenticated={isAuthenticated} applyOnPlatform={job.applyOnPlatform} sourceType={job.sourceType} />
                  <div style={{ display: 'grid', gridTemplateColumns: job.sourceType === 'employer' ? '1fr 1fr' : '1fr', gap: '8px' }}>
                    <SaveJobButton jobId={job.id} />
                    {job.sourceType === 'employer' && (
                      <MessageEmployerButton jobId={job.id} jobTitle={job.title} employerName={job.employer} disabled={isOwnJob} />
                    )}
                  </div>
                </div>

                {/* Share Section - Desktop */}
                <div className="pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.3)' }}>
                  <p className="text-xs font-semibold mb-3" style={{ color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Share this job</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShareButtons
                      url={`${BASE_URL}/jobs/${slugify(job.title, job.id)}`}
                      title={job.title}
                      company={job.employer}
                    />
                  </div>
                </div>
              </div>


              {/* About Employer — separate card */}
              <div className="hidden lg:block mt-4">
                <AboutEmployer
                  employerName={job.employer}
                  company={companyInfo}
                  otherJobsCount={employerJobCount}
                  companyWebsite={job.companyWebsite ?? undefined}
                />
              </div>

              {/* 3D Visual Cards */}
              <div className="hidden lg:block mt-4">
                <ApplicationTipsCard
                  isRemote={job.isRemote ?? false}
                  isTelehealth={job.mode?.toLowerCase().includes('telehealth')}
                  jobType={job.jobType}
                  mode={job.mode}
                />
              </div>

              <div className="hidden lg:block mt-4">
                <CareerPulseCard />
              </div>

              {/* Career Resources — separate card */}
              {relevantBlogPosts.length > 0 && (
                <div className="hidden lg:block mt-4">
                  <RelatedBlogPosts
                    posts={relevantBlogPosts}
                    title="Career Resources"
                    context="job"
                  />
                </div>
              )}

              {/* Explore More — separate card */}
              <div className="hidden lg:block mt-4">
                <InternalLinks
                  state={job.state}
                  stateCode={job.stateCode}
                  city={job.city}
                  isRemote={job.isRemote}
                  isTelehealth={isTelehealth}
                  jobType={job.jobType}
                  mode={job.mode}
                />
              </div>

              {/* Mobile-only share section below content */}
              <div className="lg:hidden rounded-2xl p-5 mb-4" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <p className="text-sm mb-3" style={{ color: 'var(--text-tertiary)' }}>Share this job:</p>
                <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
                  <ShareButtons
                    url={`${BASE_URL}/jobs/${slugify(job.title, job.id)}`}
                    title={job.title}
                    company={job.employer}
                  />
                </div>
              </div>
            </div>
          </AnimatedContainer>
        </div>

        {/* Related Jobs Section */}
        {relatedJobs.length > 0 && (
          <RelatedJobs
            jobs={relatedJobs}
            currentJobId={job.id}
            title="Similar PMHNP Jobs"
          />
        )}

        {/* Phase 3 #20 — three named internal-linking sections. Each
            renders only when it has content, so we never show empty
            "More from X" boxes. */}
        {internalLinkBuckets.moreFromEmployer.length > 0 && (
          <RelatedJobs
            jobs={internalLinkBuckets.moreFromEmployer}
            currentJobId={job.id}
            title={`More from ${job.employer}`}
          />
        )}
        {internalLinkBuckets.moreInCity.length > 0 && internalLinkBuckets.cityName && (
          <RelatedJobs
            jobs={internalLinkBuckets.moreInCity}
            currentJobId={job.id}
            title={`More PMHNP jobs in ${internalLinkBuckets.cityName}`}
          />
        )}
        {internalLinkBuckets.moreNewGrad.length > 0 && (
          <RelatedJobs
            jobs={internalLinkBuckets.moreNewGrad}
            currentJobId={job.id}
            title="More new-grad-friendly PMHNP jobs"
          />
        )}


      </div>
      </div>

      {/* Sticky Apply Button - Mobile Only */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-[60] shadow-lg safe-bottom" style={{ backgroundColor: '#FFFFFF', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
        <div className="px-4 py-2 pb-safe">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <ApplyButton jobId={job.id} applyLink={job.applyLink} jobTitle={job.title} isAuthenticated={isAuthenticated} applyOnPlatform={job.applyOnPlatform} sourceType={job.sourceType} />
            <div style={{ display: 'grid', gridTemplateColumns: job.sourceType === 'employer' ? '1fr 1fr' : '1fr', gap: '8px' }}>
              <SaveJobButton jobId={job.id} />
              {job.sourceType === 'employer' && (
                <MessageEmployerButton jobId={job.id} jobTitle={job.title} employerName={job.employer} disabled={isOwnJob} />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

