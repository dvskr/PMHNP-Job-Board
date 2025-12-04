'use client';

import Link from 'next/link';
import { MapPin, CheckCircle } from 'lucide-react';
import { formatSalary, slugify, isNewJob, getJobFreshness } from '@/lib/utils';
import { Job } from '@prisma/client';
import useAppliedJobs from '@/lib/hooks/useAppliedJobs';

interface JobCardProps {
  job: Job;
}

export default function JobCard({ job }: JobCardProps) {
  const { isApplied } = useAppliedJobs();
  const applied = isApplied(job.id);
  const jobUrl = `/jobs/${slugify(job.title, job.id)}`;
  const salary = formatSalary(job.minSalary, job.maxSalary, job.salaryPeriod);
  const isNew = isNewJob(job.createdAt);
  const freshness = getJobFreshness(job.createdAt);

  return (
    <Link href={jobUrl}>
      <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow duration-200 flex flex-col gap-3 w-full">
        {/* Title and Badges Row */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-lg font-semibold text-gray-900 flex-1">
            {job.title}
          </h3>
          <div className="flex gap-1 flex-wrap">
            {isNew && (
              <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded font-medium whitespace-nowrap">
                New
              </span>
            )}
            {applied && (
              <span className="bg-emerald-500 text-white text-xs px-2 py-0.5 rounded flex items-center gap-1 whitespace-nowrap">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Applied
              </span>
            )}
            {job.isFeatured && (
              <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                Featured
              </span>
            )}
            {job.isVerifiedEmployer && (
              <span className="bg-green-600 text-white text-xs px-2 py-1 rounded flex items-center gap-1 whitespace-nowrap">
                <CheckCircle size={12} />
                Verified
              </span>
            )}
          </div>
        </div>

        {/* Company Name */}
        <p className="text-gray-600">{job.employer}</p>

        {/* Location */}
        <div className="flex items-center gap-1 text-gray-500 text-sm">
          <MapPin size={16} />
          <span>{job.location}</span>
        </div>

        {/* Job Type and Mode Badges */}
        <div className="flex gap-2 flex-wrap">
          {job.jobType && (
            <span className="inline-flex px-2 py-1 rounded bg-blue-100 text-blue-700 text-xs">
              {job.jobType}
            </span>
          )}
          {job.mode && (
            <span className="inline-flex px-2 py-1 rounded bg-blue-100 text-blue-700 text-xs">
              {job.mode}
            </span>
          )}
        </div>

        {/* Salary */}
        {salary && (
          <p className="text-green-600 font-semibold">{salary}</p>
        )}

        {/* Freshness */}
        <p className="text-gray-400 text-sm">{freshness}</p>
      </div>
    </Link>
  );
}

