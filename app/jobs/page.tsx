import { brand } from '@/config/brand';
import { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { buildWhereClause, parseFiltersFromParams } from '@/lib/filters';
import { slugify } from '@/lib/utils';
import JobsPageClient from './JobsPageClient';
import { Job } from '@/lib/types';

// Nav-only params do not constitute a user filter — paginated and sorted
// views of the unfiltered list should still be crawled (page>=2 is noindexed
// separately to avoid duplicate-content; sort variants canonical to /jobs).
const NAV_ONLY_PARAMS = new Set(['page', 'sort']);

// ISR: Revalidate every 60 seconds
export const revalidate = 60;

interface JobsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

/**
 * Generate dynamic metadata based on active filters
 */
export async function generateMetadata({ searchParams }: JobsPageProps): Promise<Metadata> {
  const params = await searchParams;
  const urlParams = new URLSearchParams();

  // Convert searchParams to URLSearchParams
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach(v => urlParams.append(key, v));
    } else if (value) {
      urlParams.set(key, value);
    }
  });

  const filters = parseFiltersFromParams(urlParams);

  // Get total job count
  const whereClause = buildWhereClause(filters);
  const totalJobs = await prisma.job.count({ where: whereClause });
  const jobCountDisplay = totalJobs > 1000
    ? `${(Math.floor(totalJobs / 100) * 100).toLocaleString()}+`
    : totalJobs.toLocaleString();

  // Build dynamic title and description based on filters
  let title = `Browse ${jobCountDisplay} PMHNP & Psychiatric NP Jobs Near Me`;
  // SEO Fix #7: trim default desc to ≤160 chars (Google SERP cap). Previous
  // 280-char default got truncated and lost the value-prop tail.
  let description = `Search ${jobCountDisplay} PMHNP & psychiatric NP jobs by state, salary, and type — remote, telehealth, in-person, travel, locum & per diem. Updated daily.`;

  // Customize based on active filters
  const titleParts: string[] = [];

  if (filters.workMode.includes('remote')) {
    titleParts.push('Remote');
  }
  if (filters.location) {
    titleParts.push(`in ${filters.location}`);
  }
  if (filters.jobType.length > 0) {
    titleParts.push(filters.jobType[0]);
  }

  if (titleParts.length > 0) {
    title = `${jobCountDisplay} ${titleParts.join(' ')} PMHNP Jobs`;
    description = `Find ${jobCountDisplay} ${titleParts.join(' ').toLowerCase()} psychiatric nurse practitioner positions. ${description}`;
  }

  // Distinguish user filters from nav params (?page, ?sort).
  //  - User filters → noindex,follow + canonical to /jobs (rolls signal into root)
  //  - page>=2     → noindex,follow + self-canonical (lets Googlebot crawl deep
  //                  pages to discover job-detail URLs without competing with /jobs)
  //  - sort variant → canonical to /jobs (sort is a UI affordance, not a new page)
  //  - totalJobs===0 → noindex,follow regardless of filters; an empty body at
  //                  HTTP 200 is a soft 404 in Google's classifier.
  //  - Page 1, no filters, totalJobs > 0 → index normally with canonical to /jobs
  const userFilterKeys = Object.keys(params).filter((k) => !NAV_ONLY_PARAMS.has(k));
  const hasUserFilters = userFilterKeys.length > 0;
  const pageNum = Math.max(1, parseInt((params.page as string) || '1'));
  const isPaginated = pageNum > 1;
  const isEmpty = totalJobs === 0;
  const shouldNoindex = hasUserFilters || isPaginated || isEmpty;

  if (isPaginated && !hasUserFilters) {
    title = `${title} — Page ${pageNum}`;
  }

  // Self-canonical for paginated views; otherwise root /jobs.
  const canonical = isPaginated && !hasUserFilters
    ? `${brand.baseUrl}/jobs?page=${pageNum}`
    : `${brand.baseUrl}/jobs`;

  return {
    title,
    description,
    openGraph: {
      title: `${title} - Find Your Next Position`,
      description,
      type: 'website',
      // SEO Fix C8: previously pointed at `pmhnp-job-board-og.webp` which
      // returns 404 from Supabase, breaking every social share of /jobs and
      // every filtered jobs URL. Pointing at the existing homepage asset
      // until a dedicated OG image is uploaded.
      images: [{ url: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/pmhnp-job-board-homepage.webp', width: 1280, height: 900, alt: 'PMHNP Job Board — Browse psychiatric nurse practitioner jobs' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/pmhnp-job-board-homepage.webp'],
    },
    alternates: {
      canonical,
    },
    ...(shouldNoindex && {
      robots: {
        index: false,
        follow: true,
      },
    }),
  };
}

/**
 * Server Component: Fetches filtered jobs based on URL params
 */
export default async function JobsPage({ searchParams }: JobsPageProps) {
  const params = await searchParams;

  // Convert to URLSearchParams for filter parsing
  const urlParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach(v => urlParams.append(key, v));
    } else if (value) {
      urlParams.set(key, value);
    }
  });

  // Parse filters from URL (same logic as API)
  const filters = parseFiltersFromParams(urlParams);
  const where = buildWhereClause(filters);

  // Get page and sort from params
  const page = parseInt((params.page as string) || '1');
  const sort = (params.sort as string) || 'best';
  const limit = 50;
  const skip = (page - 1) * limit;

  // Build orderBy based on sort param
  let orderBy: Record<string, unknown>[] = [
    { isFeatured: 'desc' },
    { qualityScore: 'desc' },
    { originalPostedAt: 'desc' },
    { createdAt: 'desc' },
  ];
  if (sort === 'newest') {
    orderBy = [
      { originalPostedAt: { sort: 'desc', nulls: 'last' } },
      { createdAt: 'desc' },
    ];
  } else if (sort === 'salary') {
    orderBy = [
      { normalizedMaxSalary: { sort: 'desc', nulls: 'last' } },
      { normalizedMinSalary: { sort: 'desc', nulls: 'last' } },
      { createdAt: 'desc' },
    ];
  }

  try {
    // Fetch jobs with same logic as API route
    const [rawJobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          id: true,
          slug: true,
          title: true,
          employer: true,
          location: true,
          city: true,
          state: true,
          jobType: true,
          isRemote: true,
          isHybrid: true,
          displaySalary: true,
          normalizedMinSalary: true,
          normalizedMaxSalary: true,
          salaryPeriod: true,
          description: true,
          descriptionSummary: true,
          createdAt: true,
          isFeatured: true,
          isVerifiedEmployer: true,
          originalPostedAt: true,
          mode: true,
          applyLink: true,
          applyOnPlatform: true,
          sourceType: true,
          employerJobs: { select: { companyLogoUrl: true } },
        },
      }),
      prisma.job.count({ where }),
    ]);

    // Map employer logo onto job objects
    const jobs = rawJobs.map(j => ({ ...j, companyLogoUrl: j.employerJobs?.companyLogoUrl || null, employerJobs: undefined }));

    // Build ItemList schema for job carousel rich results
    const jobListSchema = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'PMHNP & Psychiatric Nurse Practitioner Jobs',
      numberOfItems: total,
      itemListElement: jobs.slice(0, 10).map((job, i) => {
        const j = job as { id: string; slug?: string | null; title: string };
        const slug = j.slug || slugify(j.title, j.id);
        return {
          '@type': 'ListItem',
          position: i + 1,
          name: job.title,
          url: `https://pmhnphiring.com/jobs/${slug}`,
        };
      }),
    };

    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jobListSchema).replace(/</g, '\\u003c').replace(/>/g, '\\u003e') }}
        />
        {/* Breadcrumb renders INSIDE JobsPageClient, in the right-hand main
            column above the H1 — that puts it at the top-right corner of
            the FILTERS panel (not above it, where the fixed sidebar would
            paint over it). Same JSON-LD BreadcrumbList serializes inline
            regardless of where the component lives, so SEO is unchanged. */}
        <JobsPageClient
          initialJobs={jobs as unknown as Job[]}
          initialTotal={total}
          initialPage={page}
          initialTotalPages={Math.ceil(total / limit)}
        />
      </>
    );
  } catch (error) {
    console.error('Error fetching jobs on server:', error);

    // Fallback: render client with empty data
    return (
      <>
        <JobsPageClient
          initialJobs={[]}
          initialTotal={0}
          initialPage={1}
          initialTotalPages={0}
        />
      </>
    );
  }
}
