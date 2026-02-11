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

  console.log(`generateMetadata called for slug: ${slug}`);

  // Extract UUID from end of slug (format: title-words-UUID)
  // UUID format: 8-4-4-4-12 characters (36 chars total with dashes)
  const uuidMatch = slug.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i);
  const id = uuidMatch ? uuidMatch[1] : null;

  if (!id) {
    notFound();
  }

  const job = await getJob(id);

  if (!job) {
    notFound();
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

  // Ensure valid canonical URL (https, no www, no trailing slash)
  const canonicalUrl = `https://pmhnphiring.com/jobs/${slug}`;

  return {
    title: `${job.title} at ${job.employer} | PMHNP Jobs`,
    description,
    openGraph: {
      title: `${job.title} at ${job.employer}`,
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
      title: `${job.title} at ${job.employer}`,
      description,
      images: [ogImageUrl.toString()],
    },
    alternates: {
      canonical: canonicalUrl,
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
        <div className="lg:grid lg:grid-cols-[1fr_340px] lg:gap-8">
          {/* Main Content */}
          <div>
            {/* Header Section */}
            <AnimatedContainer animation="fade-in-up" delay={0}>
              <div className="rounded-2xl p-5 md:p-6 lg:p-8 mb-4 lg:mb-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                {/* Badges Row - Top */}
                {(job.isFeatured || job.isVerifiedEmployer) && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                    {job.isFeatured && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                        padding: '4px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                        background: 'linear-gradient(135deg, #f59e0b, #ea580c)', color: '#fff',
                        letterSpacing: '0.02em',
                      }}>
                        ⭐ Featured
                      </span>
                    )}
                    {job.isVerifiedEmployer && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                        padding: '4px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                        background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff',
                      }}>
                        <CheckCircle size={13} /> Verified Employer
                      </span>
                    )}
                  </div>
                )}

                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 leading-tight" style={{ color: 'var(--text-primary)' }}>{job.title}</h1>
                <p className="text-lg sm:text-xl mb-4 font-medium" style={{ color: 'var(--text-secondary)' }}>{job.employer}</p>

                {/* Salary */}
                {salary && (
                  <p style={{
                    fontSize: 'clamp(20px, 4vw, 30px)', fontWeight: 800,
                    color: 'var(--salary-color, #1d4ed8)',
                    margin: '0 0 16px',
                  }}>{salary}</p>
                )}

                {/* Metadata Tags - Vertical Stack */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* Location */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 14px', borderRadius: '10px',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                  }}>
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '8px',
                      backgroundColor: 'var(--color-primary)', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <MapPin size={16} style={{ color: '#fff' }} />
                    </div>
                    <div>
                      <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Location</p>
                      <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{job.location}</p>
                    </div>
                  </div>

                  {/* Job Type & Work Mode Row */}
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {job.jobType && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '10px 14px', borderRadius: '10px', flex: '1 1 auto',
                        backgroundColor: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                      }}>
                        <div style={{
                          width: '32px', height: '32px', borderRadius: '8px',
                          backgroundColor: 'var(--color-primary)', display: 'flex',
                          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          <Briefcase size={16} style={{ color: '#fff' }} />
                        </div>
                        <div>
                          <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Job Type</p>
                          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{job.jobType}</p>
                        </div>
                      </div>
                    )}
                    {job.mode && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '10px 14px', borderRadius: '10px', flex: '1 1 auto',
                        backgroundColor: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                      }}>
                        <div style={{
                          width: '32px', height: '32px', borderRadius: '8px',
                          backgroundColor: 'var(--color-primary)', display: 'flex',
                          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          <Monitor size={16} style={{ color: '#fff' }} />
                        </div>
                        <div>
                          <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Work Mode</p>
                          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{job.mode}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </AnimatedContainer>



            {/* Description Section */}
            <AnimatedContainer animation="fade-in-up" delay={200}>
              <div className="rounded-2xl p-5 md:p-6 lg:p-8 mb-4 lg:mb-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                <h2 className="text-xl sm:text-2xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>About this role</h2>

                {/* Note for external jobs */}
                {job.sourceType === 'external' && job.sourceProvider && (
                  <div className="rounded-lg p-4 mb-4" style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
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
                          <span className="mt-1 font-bold" style={{ color: 'var(--color-primary)' }}>•</span>
                          <span style={{ color: 'var(--text-primary)' }}>{paragraph.trim().slice(1).trim()}</span>
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
                        <h3 key={index} className="text-lg font-bold mt-6 mb-2" style={{ color: 'var(--text-primary)' }}>
                          {paragraph.trim()}
                        </h3>
                      );
                    }

                    // Regular paragraph
                    return (
                      <p key={index} className="leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
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
            <div className="text-sm px-1 mt-6" style={{ color: 'var(--text-tertiary)' }}>
              <p>{freshness}</p>
              {job.sourceType === 'external' && job.sourceProvider && (
                <p className="mt-1">Posted via {job.sourceProvider}</p>
              )}
            </div>
          </div>

          {/* Sidebar - Desktop / Below content on mobile */}
          <AnimatedContainer animation="slide-in-right" delay={300}>
            <div className="mt-6 lg:mt-0">
              <div className="hidden lg:block lg:sticky lg:top-24 rounded-2xl p-6" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                {/* Expiry Notice - Desktop */}
                {!expiryStatus.isExpired && expiryStatus.text && (
                  <div className={`flex items-center gap-2 mb-4 pb-4 ${expiryStatus.isUrgent ? 'text-orange-500' : ''}`} style={{ borderBottom: '1px solid var(--border-color)', color: expiryStatus.isUrgent ? undefined : 'var(--text-tertiary)' }}>
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
                <div className="pt-4" style={{ borderTop: '1px solid var(--border-color)' }}>
                  <p className="text-sm mb-3" style={{ color: 'var(--text-tertiary)' }}>Share this job:</p>
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

        {/* Report Job Section */}
        <div className="mt-8 pt-6" style={{ borderTop: '1px solid var(--border-color)' }}>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            See something wrong with this listing?{' '}
            <a
              href={`mailto:support@pmhnphiring.com?subject=Report Job: ${job.title}&body=Job ID: ${job.id}%0AJob Title: ${job.title}%0ACompany: ${job.employer}%0A%0AReason for report:%0A`}
              className="text-red-500 hover:text-red-400 hover:underline"
            >
              Report this job
            </a>
          </p>
        </div>
      </div>

      {/* Sticky Apply Button - Mobile Only */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-[60] shadow-lg safe-bottom" style={{ backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border-color)' }}>
        <div className="px-4 py-3 pb-safe">
          <ApplyButton jobId={job.id} applyLink={job.applyLink} jobTitle={job.title} />
        </div>
      </div>
    </>
  );
}

