import { notFound } from 'next/navigation';
import { formatSalary, formatDate } from '@/lib/utils';
import { MapPin, Briefcase, Monitor, CheckCircle } from 'lucide-react';
import { Job } from '@prisma/client';
import SaveJobButton from '@/components/SaveJobButton';
import ApplyButton from '@/components/ApplyButton';

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
  const id = resolvedParams.slug.split('-').pop();
  if (!id) {
    return { title: 'Job Not Found' };
  }

  const job = await getJob(id);
  
  if (!job) {
    return { title: 'Job Not Found' };
  }

  return {
    title: `${job.title} at ${job.employer} | PMHNP Jobs`,
    description: job.descriptionSummary || job.description.slice(0, 160),
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

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header Section */}
      <div className="bg-white shadow-md rounded-lg p-6 md:p-8">
        <h1 className="text-3xl md:text-4xl font-bold mb-2">{job.title}</h1>
        <p className="text-xl text-gray-600 mb-4">{job.employer}</p>

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

      {/* Description Section */}
      <div className="bg-white shadow-md rounded-lg p-6 md:p-8 mt-6">
        <h2 className="text-2xl font-bold mb-4">About this role</h2>
        <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
          {job.description}
        </div>
      </div>

      {/* Apply Section */}
      <div className="bg-gray-50 rounded-lg p-6 mt-8 shadow-md">
        <div className="flex flex-wrap items-center gap-4">
          <ApplyButton jobId={job.id} applyLink={job.applyLink} jobTitle={job.title} />
          <SaveJobButton jobId={job.id} />
        </div>
      </div>

      {/* Footer Info */}
      <div className="mt-8 text-sm text-gray-500">
        <p>Posted {formatDate(job.createdAt)}</p>
        {job.sourceType === 'external' && job.sourceProvider && (
          <p className="mt-1">Posted via {job.sourceProvider}</p>
        )}
      </div>
    </div>
  );
}

