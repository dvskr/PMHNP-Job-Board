import { formatSalary, slugify, getJobFreshness, getExpiryStatus } from '@/lib/utils';
import { MapPin, Briefcase, Monitor, CheckCircle } from 'lucide-react';
import { Job } from '@/lib/types';
import SaveJobButton from '@/components/SaveJobButton';
import ApplyButton from '@/components/ApplyButton';
import ShareButtons from '@/components/ShareButtons';
import AnimatedContainer from '@/components/ui/AnimatedContainer';
import JobNotFound from '@/components/JobNotFound';
import JobStructuredData from '@/components/JobStructuredData';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

interface JobPageProps {
  params: { slug: string };
}

async function getJob(id: string): Promise<Job | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/jobs/${id}`, {
      cache: 'no-store',
    });
    const data = await response.json();
    
    if (data.error) {
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching job:', error);
    return null;
  }
}

export async function generateMetadata({ params }: JobPageProps) {
  const resolvedParams = await params;
  const slug = resolvedParams.slug;
  const id = slug.split('-').pop();
  if (!id) {
    return { title: 'Job Not Found' };
  }

  const job = await getJob(id);
  
  if (!job) {
    return { title: 'Job Not Found' };
  }

  const description = job.descriptionSummary || job.description.slice(0, 160);

  return {
    title: `${job.title} at ${job.employer} | PMHNP Jobs`,
    description,
    openGraph: {
      title: `${job.title} at ${job.employer}`,
      description,
      type: 'website',
      url: `${BASE_URL}/jobs/${slug}`,
      siteName: 'PMHNP Jobs',
      images: [
        {
          url: `${BASE_URL}/og-image.png`,
          width: 1200,
          height: 630,
          alt: job.title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${job.title} at ${job.employer}`,
      description,
    },
  };
}

export default async function JobPage({ params }: JobPageProps) {
  const resolvedParams = await params;
  const id = resolvedParams.slug.split('-').pop();
  
  if (!id) {
    return <JobNotFound />;
  }

  const job = await getJob(id);

  if (!job) {
    return <JobNotFound />;
  }

  const salary = formatSalary(job.minSalary, job.maxSalary, job.salaryPeriod);
  const freshness = getJobFreshness(job.createdAt);
  const expiryStatus = getExpiryStatus(job.expiresAt);

  return (
    <>
      <JobStructuredData 
        job={job} 
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 pb-24 lg:pb-8">
        <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-8">
          {/* Main Content */}
          <div>
            {/* Header Section */}
            <AnimatedContainer animation="fade-in-up" delay={0}>
              <div className="bg-white shadow-md rounded-lg p-5 md:p-6 lg:p-8 mb-4 lg:mb-6">
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2 leading-tight">{job.title}</h1>
                <p className="text-lg sm:text-xl text-gray-600 mb-3">{job.employer}</p>
                
                {/* Metadata Row */}
                <div className="flex flex-wrap gap-3 sm:gap-4 text-gray-600 text-sm sm:text-base mb-3">
                  <div className="flex items-center gap-2">
                    <MapPin size={18} className="shrink-0" />
                    <span>{job.location}</span>
                  </div>
                  {job.jobType && (
                    <div className="flex items-center gap-2">
                      <Briefcase size={18} className="shrink-0" />
                      <span>{job.jobType}</span>
                    </div>
                  )}
                  {job.mode && (
                    <div className="flex items-center gap-2">
                      <Monitor size={18} className="shrink-0" />
                      <span>{job.mode}</span>
                    </div>
                  )}
                </div>

                {/* Salary */}
                {salary && (
                  <p className="text-xl sm:text-2xl lg:text-3xl text-success-600 font-bold mb-3">{salary}</p>
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
                <h2 className="text-xl sm:text-2xl font-bold mb-4">About this role</h2>
                
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
                          <span className="text-gray-400 mt-1">•</span>
                          <span className="text-gray-700">{paragraph.trim().slice(1).trim()}</span>
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
                        <h3 key={index} className="text-lg font-semibold text-gray-900 mt-6 mb-2">
                          {paragraph.trim()}
                        </h3>
                      );
                    }
                    
                    // Regular paragraph
                    return (
                      <p key={index} className="text-gray-700 leading-relaxed mb-3">
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

        {/* Report Job Section */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <p className="text-sm text-gray-500">
            See something wrong with this listing?{' '}
            <a 
              href={`mailto:support@pmhnpjobs.com?subject=Report Job: ${job.title}&body=Job ID: ${job.id}%0AJob Title: ${job.title}%0ACompany: ${job.employer}%0A%0AReason for report:%0A`}
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

