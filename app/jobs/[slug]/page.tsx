import { formatSalary, slugify, getJobFreshness, getExpiryStatus } from '@/lib/utils';
import { MapPin, Briefcase, Monitor, CheckCircle } from 'lucide-react';
import { Job, Company } from '@/lib/types';
import SaveJobButton from '@/components/SaveJobButton';
import ApplyButton from '@/components/ApplyButton';
import ShareButtons from '@/components/ShareButtons';
import AnimatedContainer from '@/components/ui/AnimatedContainer';
import JobNotFound from '@/components/JobNotFound';
import JobStructuredData from '@/components/JobStructuredData';
import Breadcrumbs from '@/components/Breadcrumbs';
import RelatedJobs from '@/components/RelatedJobs';
import AboutEmployer from '@/components/AboutEmployer';
import SalaryInsights from '@/components/SalaryInsights';
import RelatedBlogPosts, { getRelevantBlogSlugs } from '@/components/RelatedBlogPosts';
import InternalLinks from '@/components/InternalLinks';
import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { getPostBySlug } from '@/lib/blog';
import Link from 'next/link';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com';

interface JobPageProps {
  params: { slug: string };
}

async function getJob(id: string): Promise<Job | null> {
  try {
    // Query database directly instead of HTTP fetch to avoid Vercel deployment protection issues
    // Only return published jobs - unpublished/expired jobs should return 404
    const job = await prisma.job.findFirst({
      where: {
        id,
        isPublished: true,
      },
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

/**
 * Fetch company information for employer section
 */
async function getCompanyInfo(companyId: string | null, employerName: string) {
  // Try to get company from companyId first
  if (companyId) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (company) return company as Company;
  }

  // Try to find by normalized name
  const normalizedName = employerName.toLowerCase().trim();
  const company = await prisma.company.findFirst({
    where: {
      OR: [
        { normalizedName: normalizedName },
        { name: { equals: employerName, mode: 'insensitive' } },
      ],
    },
  });

  return company as Company | null;
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
function getRelevantBlogPosts(job: Job) {
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

  const posts = [];
  for (const slug of slugs) {
    try {
      const post = getPostBySlug(slug);
      posts.push({
        slug: post.slug,
        title: post.title,
        description: post.description,
        category: post.category,
      });
    } catch {
      // Skip if blog post doesn't exist
    }
  }
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
          width: 2400,  // 2x resolution for sharper image
          height: 1260, // 2x resolution
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
    alternates: {
      canonical: `/jobs/${slug}`,
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
    notFound();
  }

  const job = await getJob(id);

  if (!job) {
    notFound();
  }

  // Fetch all additional data in parallel for content enrichment
  const [relatedJobs, companyInfo, employerJobCount, stateAvgSalary] = await Promise.all([
    getRelatedJobs({
      currentJobId: job.id,
      employer: job.employer,
      city: job.city,
      state: job.state,
      mode: job.mode,
      limit: 5, // Increased from 4 to 5 for more related content
    }),
    getCompanyInfo(job.companyId, job.employer),
    getEmployerJobCount(job.employer, job.id),
    getStateSalaryAverage(job.state, job.stateCode),
  ]);

  // Get relevant blog posts (sync operation, reads from filesystem)
  const relevantBlogPosts = getRelevantBlogPosts(job);

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

            {/* About Employer Section */}
            <AnimatedContainer animation="fade-in-up" delay={250}>
              <AboutEmployer
                employerName={job.employer}
                company={companyInfo}
                otherJobsCount={employerJobCount}
              />
            </AnimatedContainer>

            {/* Salary Insights Section */}
            {stateAvgSalary > 0 && (
              <AnimatedContainer animation="fade-in-up" delay={300}>
                <SalaryInsights
                  stateName={job.state}
                  stateAvgSalary={stateAvgSalary}
                  jobMinSalary={job.normalizedMinSalary}
                  jobMaxSalary={job.normalizedMaxSalary}
                />
              </AnimatedContainer>
            )}

            {/* Related Blog Posts */}
            {relevantBlogPosts.length > 0 && (
              <AnimatedContainer animation="fade-in-up" delay={350}>
                <RelatedBlogPosts
                  posts={relevantBlogPosts}
                  title="Career Resources for This Role"
                  context="job"
                />
              </AnimatedContainer>
            )}

            {/* Internal Links for SEO */}
            <AnimatedContainer animation="fade-in-up" delay={400}>
              <InternalLinks
                state={job.state}
                stateCode={job.stateCode}
                city={job.city}
                isRemote={job.isRemote}
                isTelehealth={isTelehealth}
                jobType={job.jobType}
                mode={job.mode}
              />
            </AnimatedContainer>

            {/* Footer Info */}
            <div className="text-sm text-gray-500 px-1 mt-6">
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

