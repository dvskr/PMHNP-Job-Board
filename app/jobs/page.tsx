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
    ? `${Math.floor(totalJobs / 100) * 100}+`
    : totalJobs.toLocaleString();

  // Build dynamic title and description based on filters
  let title = `Browse ${jobCountDisplay} PMHNP Jobs`;
  let description = `Search ${jobCountDisplay} PMHNP jobs. Find remote, full-time, part-time, and contract psychiatric nurse practitioner positions updated daily.`;

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

  return {
    title: `${title} | PMHNP Hiring`,
    description,
    openGraph: {
      title: `${title} - Find Your Next Position`,
      description,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    alternates: {
      canonical: 'https://pmhnphiring.com/jobs',
    },
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

  // Get page from params
  const page = parseInt((params.page as string) || '1');
  const limit = 50;
  const skip = (page - 1) * limit;

  try {
    // Fetch jobs with same logic as API route
    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: [
          { isFeatured: 'desc' },
          { originalPostedAt: 'desc' },
          { createdAt: 'desc' },
        ],
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
        },
      }),
      prisma.job.count({ where }),
    ]);

    return (
      <>
        <BreadcrumbSchema items={[
          { name: "Home", url: "https://pmhnphiring.com" },
          { name: "Jobs", url: "https://pmhnphiring.com/jobs" }
        ]} />
        <JobsPageClient
          initialJobs={jobs as Job[]}
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
