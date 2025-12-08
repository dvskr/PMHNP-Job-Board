import { notFound } from 'next/navigation';
import { formatSalary, slugify, getJobFreshness, getExpiryStatus } from '@/lib/utils';
import { MapPin, Briefcase, Monitor, CheckCircle } from 'lucide-react';
import { Job } from '@prisma/client';
import SaveJobButton from '@/components/SaveJobButton';
import ApplyButton from '@/components/ApplyButton';
import ShareButtons from '@/components/ShareButtons';
import AnimatedContainer from '@/components/ui/AnimatedContainer';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

interface JobPageProps {
  params: { slug: string };
}

async function getJob(id: string): Promise<Job | null> {
  try {
    const response = await fetch(`http://localhost:3000/api/jobs/${id}`, {
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
    notFound();
  }

  const job = await getJob(id);

  if (!job) {
    notFound();
  }

  const salary = formatSalary(job.minSalary, job.maxSalary, job.salaryPeriod);
  const freshness = getJobFreshness(job.createdAt);
  const expiryStatus = getExpiryStatus(job.expiresAt);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header Section */}
      <AnimatedContainer animation="fade-in-up" delay={0}>
        <div className="bg-white shadow-md rounded-lg p-6 md:p-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">{job.title}</h1>
          <p className="text-xl text-gray-600 mb-4">{job.employer}</p>
        </div>
      </AnimatedContainer>

      {/* Meta Section */}
      <AnimatedContainer animation="fade-in-up" delay={100}>
        <div className="bg-white shadow-md rounded-lg p-6 md:p-8 mt-6">
          {/* Metadata Row */}
          <div className="flex flex-wrap gap-4 text-gray-600">
          <div className="flex items-center gap-2">
            <MapPin size={20} />
            <span>{job.location}</span>
          </div>
          {job.jobType && (
            <div className="flex items-center gap-2">
              <Briefcase size={20} />
              <span>{job.jobType}</span>
            </div>
          )}
          {job.mode && (
            <div className="flex items-center gap-2">
              <Monitor size={20} />
              <span>{job.mode}</span>
            </div>
          )}
        </div>

        {/* Salary */}
        {salary && (
          <div className="mt-4">
            <p className="text-2xl md:text-3xl text-green-600 font-bold">{salary}</p>
          </div>
        )}

          {/* Badges Row */}
          <div className="flex gap-2 mt-4 flex-wrap">
            {job.isFeatured && (
              <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm">
                Featured
              </span>
            )}
            {job.isVerifiedEmployer && (
              <span className="bg-green-600 text-white px-3 py-1 rounded-full text-sm flex items-center gap-1">
                <CheckCircle size={16} />
                Verified Employer
              </span>
            )}
          </div>
        </div>
      </AnimatedContainer>

      {/* Description Section */}
      <AnimatedContainer animation="fade-in-up" delay={200}>
        <div className="bg-white shadow-md rounded-lg p-6 md:p-8 mt-6">
          <h2 className="text-2xl font-bold mb-4">About this role</h2>
          <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
            {job.description}
          </div>
        </div>
      </AnimatedContainer>

      {/* Expiry Warning */}
      {expiryStatus.isExpired && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-8 flex items-center gap-3">
          <svg className="h-5 w-5 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <p className="text-amber-800 text-sm font-medium">
            {expiryStatus.text}
          </p>
        </div>
      )}

      {/* Apply Section */}
      <AnimatedContainer animation="slide-in-right" delay={300}>
        <div className="bg-gray-50 rounded-lg p-6 mt-8 shadow-md">
          {/* Urgent Expiry Notice */}
          {!expiryStatus.isExpired && expiryStatus.isUrgent && expiryStatus.text && (
            <div className="flex items-center gap-2 mb-4 pb-4 border-b border-gray-200">
              <svg className="h-4 w-4 text-orange-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-orange-600 text-sm font-medium">
                {expiryStatus.text} — Apply soon!
              </p>
            </div>
          )}

          {/* Non-urgent Expiry Notice */}
          {!expiryStatus.isExpired && !expiryStatus.isUrgent && expiryStatus.text && (
            <div className="flex items-center gap-2 mb-4 pb-4 border-b border-gray-200">
              <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-gray-500 text-sm">
                {expiryStatus.text}
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <ApplyButton jobId={job.id} applyLink={job.applyLink} jobTitle={job.title} />
            <SaveJobButton jobId={job.id} />
          </div>

          {/* Share Section */}
          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-200">
            <span className="text-sm text-gray-500">Share this job:</span>
            <ShareButtons
              url={`${BASE_URL}/jobs/${slugify(job.title, job.id)}`}
              title={job.title}
              company={job.employer}
            />
          </div>
        </div>
      </AnimatedContainer>

      {/* Footer Info */}
      <div className="mt-8 text-sm text-gray-500">
        <p>{freshness}</p>
        {job.sourceType === 'external' && job.sourceProvider && (
          <p className="mt-1">Posted via {job.sourceProvider}</p>
        )}
      </div>
    </div>
  );
}

