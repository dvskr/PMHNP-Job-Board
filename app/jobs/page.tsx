import { brand } from '@/config/brand';
import { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { buildWhereClause, parseFiltersFromParams } from '@/lib/filters';
import JobsPageClient from './JobsPageClient';
import { Job } from '@/lib/types';
import BreadcrumbSchema from '@/components/BreadcrumbSchema';

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

  // Determine if this is a filtered/paginated view that should NOT be indexed
  const hasFilters = Object.keys(params).length > 0;

  return {
    title,
    description,
    openGraph: {
      title: `${title} - Find Your Next Position`,
      description,
      type: 'website',
      images: [{ url: 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/site-assets/images/pages/pmhnp-job-board-og.webp', width: 1200, height: 630, alt: 'PMHNP Job Board — Browse psychiatric nurse practitioner jobs' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    alternates: {
      canonical: `${brand.baseUrl}/jobs`,
    },
    // Prevent Google from indexing filtered/paginated variants as separate pages
    // This fixes the "Duplicate without user-selected canonical" GSC issue
    ...(hasFilters && {
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
      itemListElement: jobs.slice(0, 10).map((job, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: job.title,
        url: `https://pmhnphiring.com/jobs/${(job as Record<string, unknown>).id}`,
      })),
    };

    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jobListSchema).replace(/</g, '\\u003c').replace(/>/g, '\\u003e') }}
        />
        <BreadcrumbSchema items={[
          { name: "Home", url: "https://pmhnphiring.com" },
          { name: "Jobs", url: "https://pmhnphiring.com/jobs" }
        ]} />
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
        <BreadcrumbSchema items={[
          { name: "Home", url: "https://pmhnphiring.com" },
          { name: "Jobs", url: "https://pmhnphiring.com/jobs" }
        ]} />
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
