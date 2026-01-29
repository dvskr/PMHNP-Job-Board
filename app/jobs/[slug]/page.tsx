import { formatSalary, slugify, getJobFreshness, getExpiryStatus } from '@/lib/utils';
import { MapPin, Briefcase, Monitor, CheckCircle } from 'lucide-react';
import { Job } from '@/lib/types';
import SaveJobButton from '@/components/SaveJobButton';
import ApplyButton from '@/components/ApplyButton';
import ShareButtons from '@/components/ShareButtons';
import AnimatedContainer from '@/components/ui/AnimatedContainer';
import JobNotFound from '@/components/JobNotFound';
import JobStructuredData from '@/components/JobStructuredData';
import Breadcrumbs from '@/components/Breadcrumbs';
import RelatedJobs from '@/components/RelatedJobs';
import { prisma } from '@/lib/prisma';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com';

interface JobPageProps {
  params: { slug: string };
}

async function getJob(id: string): Promise<Job | null> {
  try {
    // Query database directly instead of HTTP fetch to avoid Vercel deployment protection issues
    const job = await prisma.job.findUnique({
      where: { id },
    });

    if (!job) {
      return null;
    }

    // Increment view count
    await prisma.job.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });

    return job as Job;
  } catch (error) {
    console.error('Error fetching job:', error);
    return null;
  }
}

interface RelatedJobsParams {
  currentJobId: string;
  employer: string;
  city?: string | null;
  state?: string | null;
  mode?: string | null;
  limit?: number;
}

async function getRelatedJobs({
  currentJobId,
  employer,
  city,
  state,
  mode,
  limit = 4,
}: RelatedJobsParams) {
  const existingIds = [currentJobId];
  let relatedJobs: Job[] = [];

  // Priority 1: Same employer
  const sameEmployerJobs = await prisma.job.findMany({
    where: {
      id: { notIn: existingIds },
      employer: employer,
      isPublished: true,
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
  });
  relatedJobs = [...relatedJobs, ...sameEmployerJobs];
  existingIds.push(...sameEmployerJobs.map(j => j.id));

  if (relatedJobs.length >= limit) {
    return relatedJobs.slice(0, limit) as Job[];
  }

  // Priority 2: Same city
  if (city && relatedJobs.length < limit) {
    const sameCityJobs = await prisma.job.findMany({
      where: {
        id: { notIn: existingIds },
        city: { equals: city, mode: 'insensitive' },
        isPublished: true,
      },
      take: limit - relatedJobs.length,
      orderBy: { createdAt: 'desc' },
    });
    relatedJobs = [...relatedJobs, ...sameCityJobs];
    existingIds.push(...sameCityJobs.map(j => j.id));
  }

  // Priority 3: Same state
  if (state && relatedJobs.length < limit) {
    const sameStateJobs = await prisma.job.findMany({
      where: {
        id: { notIn: existingIds },
        state: { equals: state, mode: 'insensitive' },
        isPublished: true,
      },
      take: limit - relatedJobs.length,
      orderBy: { createdAt: 'desc' },
    });
    relatedJobs = [...relatedJobs, ...sameStateJobs];
    existingIds.push(...sameStateJobs.map(j => j.id));
  }

  // Priority 4: Same work mode (Remote, Hybrid, etc.)
  if (mode && relatedJobs.length < limit) {
    const sameModeJobs = await prisma.job.findMany({
      where: {
        id: { notIn: existingIds },
        mode: { equals: mode, mode: 'insensitive' },
        isPublished: true,
      },
      take: limit - relatedJobs.length,
      orderBy: { createdAt: 'desc' },
    });
    relatedJobs = [...relatedJobs, ...sameModeJobs];
  }

  return relatedJobs as Job[];
}

export async function generateMetadata({ params }: JobPageProps) {
  const resolvedParams = await params;
  const slug = resolvedParams.slug;

  // Extract UUID from end of slug (format: title-words-UUID)
  // UUID format: 8-4-4-4-12 characters (36 chars total with dashes)
  const uuidMatch = slug.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i);
  const id = uuidMatch ? uuidMatch[1] : null;

  if (!id) {
    return { title: 'Job Not Found' };
  }

  const job = await getJob(id);

  if (!job) {
    return { title: 'Job Not Found' };
  }

  const description = job.descriptionSummary || job.description.slice(0, 160);

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

  return {
    title: `${job.title} at ${job.employer} | PMHNP Jobs`,
    description,
    openGraph: {
      title: `${job.title} at ${job.employer}`,
      description,
      type: 'website',
      url: `${BASE_URL}/jobs/${slug}`,
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
      title: `${job.title} at ${job.employer}`,
      description,
      images: [ogImageUrl.toString()],
    },
  };
}

export default async function JobPage({ params }: JobPageProps) {
  const resolvedParams = await params;

  // Extract UUID from end of slug (format: title-words-UUID)
  // UUID format: 8-4-4-4-12 characters (36 chars total with dashes)
  const uuidMatch = resolvedParams.slug.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i);
  const id = uuidMatch ? uuidMatch[1] : null;

  if (!id) {
    return <JobNotFound />;
  }

  const job = await getJob(id);

  if (!job) {
    return <JobNotFound />;
  }

  // Fetch related jobs in parallel with main job
  const relatedJobs = await getRelatedJobs({
    currentJobId: job.id,
    employer: job.employer,
    city: job.city,
    state: job.state,
    mode: job.mode,
    limit: 4,
  });

  const salary = formatSalary(job.minSalary, job.maxSalary, job.salaryPeriod);
  const freshness = getJobFreshness(job.createdAt);
  const expiryStatus = getExpiryStatus(job.expiresAt);

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

  // Add city if available
  if (job.city) {
    breadcrumbItems.push({
      label: job.city,
      href: `/jobs/city/${job.city.toLowerCase().replace(/\s+/g, '-')}`,
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 pb-24 lg:pb-8">
        {/* Breadcrumbs */}
        <Breadcrumbs items={breadcrumbItems} />
        <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-8">
          {/* Main Content */}
          <div>
            {/* Header Section */}
            <AnimatedContainer animation="fade-in-up" delay={0}>
              <div className="bg-white shadow-md rounded-lg p-5 md:p-6 lg:p-8 mb-4 lg:mb-6">
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 leading-tight text-black">{job.title}</h1>
                <p className="text-lg sm:text-xl text-gray-900 mb-3 font-medium">{job.employer}</p>

                {/* Metadata Row */}
                <div className="flex flex-wrap gap-3 sm:gap-4 text-gray-900 text-sm sm:text-base mb-3 font-medium">
                  <div className="flex items-center gap-2">
                    <MapPin size={18} className="shrink-0 text-gray-700" />
                    <span>{job.location}</span>
                  </div>
                  {job.jobType && (
                    <div className="flex items-center gap-2">
                      <Briefcase size={18} className="shrink-0 text-gray-700" />
                      <span>{job.jobType}</span>
                    </div>
                  )}
                  {job.mode && (
                    <div className="flex items-center gap-2">
                      <Monitor size={18} className="shrink-0 text-gray-700" />
                      <span>{job.mode}</span>
                    </div>
                  )}
                </div>

                {/* Salary */}
                {salary && (
                  <p className="text-xl sm:text-2xl lg:text-3xl text-black font-bold mb-3">{salary}</p>
                )}

                {/* Badges Row */}
                <div className="flex gap-2 flex-wrap">
                  {job.isFeatured && (
                    <span className="bg-primary-600 text-white px-3 py-1 rounded-full text-xs sm:text-sm font-medium">
                      Featured
                    </span>
                  )}
                  {job.isVerifiedEmployer && (
                    <span className="bg-success-600 text-white px-3 py-1 rounded-full text-xs sm:text-sm font-medium flex items-center gap-1">
                      <CheckCircle size={14} />
                      Verified Employer
                    </span>
                  )}
                </div>
              </div>
            </AnimatedContainer>

            {/* Expiry Warning */}
            {expiryStatus.isExpired && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 lg:mb-6 flex items-start gap-3">
                <svg className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <p className="text-amber-800 text-sm font-medium">
                  {expiryStatus.text}
                </p>
              </div>
            )}

            {/* Description Section */}
            <AnimatedContainer animation="fade-in-up" delay={200}>
              <div className="bg-white shadow-md rounded-lg p-5 md:p-6 lg:p-8 mb-4 lg:mb-6">
                <h2 className="text-xl sm:text-2xl font-bold mb-4 text-black">About this role</h2>

                {/* Note for external jobs */}
                {job.sourceType === 'external' && job.sourceProvider && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <p className="text-sm text-blue-800">
                      <span className="font-semibold">Preview:</span> This is a summary from {job.sourceProvider}. Click <strong>&quot;Apply Now&quot;</strong> below to view the complete job description and application details.
                    </p>
                  </div>
                )}

                <div className="prose prose-gray max-w-none">
                  {job.description.split('\n').map((paragraph: string, index: number) => {
                    // Empty line = spacing
                    if (!paragraph.trim()) {
                      return <div key={index} className="h-4" />;
                    }

                    // Bullet point line
                    if (paragraph.trim().startsWith('•')) {
                      return (
                        <div key={index} className="flex items-start gap-2 ml-4 my-1">
                          <span className="text-gray-900 mt-1 font-bold">•</span>
                          <span className="text-black">{paragraph.trim().slice(1).trim()}</span>
                        </div>
                      );
                    }

                    // Check if it looks like a header (ALL CAPS or ends with colon)
                    const isHeader = paragraph.trim() === paragraph.trim().toUpperCase() &&
                      paragraph.trim().length < 50 &&
                      paragraph.trim().length > 2;
                    const endsWithColon = paragraph.trim().endsWith(':');

                    if (isHeader || endsWithColon) {
                      return (
                        <h3 key={index} className="text-lg font-bold text-black mt-6 mb-2">
                          {paragraph.trim()}
                        </h3>
                      );
                    }

                    // Regular paragraph
                    return (
                      <p key={index} className="text-black leading-relaxed mb-3">
                        {paragraph.trim()}
                      </p>
                    );
                  })}
                </div>
              </div>
            </AnimatedContainer>

            {/* Footer Info */}
            <div className="text-sm text-gray-500 px-1">
              <p>{freshness}</p>
              {job.sourceType === 'external' && job.sourceProvider && (
                <p className="mt-1">Posted via {job.sourceProvider}</p>
              )}
            </div>
          </div>

          {/* Sidebar - Desktop / Below content on mobile */}
          <AnimatedContainer animation="slide-in-right" delay={300}>
            <div className="mt-6 lg:mt-0">
              <div className="hidden lg:block lg:sticky lg:top-24 bg-white rounded-lg shadow-md p-6">
                {/* Expiry Notice - Desktop */}
                {!expiryStatus.isExpired && expiryStatus.text && (
                  <div className={`flex items-center gap-2 mb-4 pb-4 border-b border-gray-200 ${expiryStatus.isUrgent ? 'text-orange-600' : 'text-gray-500'}`}>
                    <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm font-medium">
                      {expiryStatus.text}{expiryStatus.isUrgent && ' — Apply soon!'}
                    </p>
                  </div>
                )}

                <div className="space-y-3 mb-5">
                  <ApplyButton jobId={job.id} applyLink={job.applyLink} jobTitle={job.title} />
                  <SaveJobButton jobId={job.id} />
                </div>

                {/* Share Section - Desktop */}
                <div className="pt-4 border-t border-gray-200">
                  <p className="text-sm text-gray-500 mb-3">Share this job:</p>
                  <div className="flex flex-wrap gap-2">
                    <ShareButtons
                      url={`${BASE_URL}/jobs/${slugify(job.title, job.id)}`}
                      title={job.title}
                      company={job.employer}
                    />
                  </div>
                </div>
              </div>

              {/* Mobile-only share section below content */}
              <div className="lg:hidden bg-white rounded-lg shadow-md p-5 mb-4">
                <p className="text-sm text-gray-500 mb-3">Share this job:</p>
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

        {/* Report Job Section */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <p className="text-sm text-gray-500">
            See something wrong with this listing?{' '}
            <a
              href={`mailto:support@pmhnphiring.com?subject=Report Job: ${job.title}&body=Job ID: ${job.id}%0AJob Title: ${job.title}%0ACompany: ${job.employer}%0A%0AReason for report:%0A`}
              className="text-red-600 hover:text-red-700 hover:underline"
            >
              Report this job
            </a>
          </p>
        </div>
      </div>

      {/* Sticky Apply Button - Mobile Only */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-[60] bg-white border-t border-gray-200 shadow-lg safe-bottom">
        <div className="px-4 py-3 pb-safe">
          <ApplyButton jobId={job.id} applyLink={job.applyLink} jobTitle={job.title} />
        </div>
      </div>
    </>
  );
}

