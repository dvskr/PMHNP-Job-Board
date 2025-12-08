'use client';

import Link from 'next/link';
import { MapPin, CheckCircle } from 'lucide-react';
import { formatSalary, slugify, isNewJob, getJobFreshness } from '@/lib/utils';
import { Job } from '@prisma/client';
import useAppliedJobs from '@/lib/hooks/useAppliedJobs';
import Badge from '@/components/ui/Badge';

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
      <div className="group bg-white rounded-xl shadow-card hover:shadow-card-hover hover:-translate-y-1 transition-all duration-200 flex flex-col gap-3 w-full p-6">
        {/* Title and Badges Row */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-lg font-semibold text-gray-900 group-hover:text-primary-600 transition-colors duration-200 flex-1">
            {job.title}
          </h3>
          <div className="flex gap-2 flex-wrap">
            {isNew && (
              <span className="hover:brightness-105 transition-all duration-200">
                <Badge variant="warning" size="sm">
                  New
                </Badge>
              </span>
            )}
            {applied && (
              <span className="hover:brightness-105 transition-all duration-200">
                <Badge variant="success" size="sm">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  Applied
                </Badge>
              </span>
            )}
            {job.isFeatured && (
              <span className="hover:brightness-105 transition-all duration-200">
                <Badge variant="featured" size="md">
                  Featured
                </Badge>
              </span>
            )}
            {job.isVerifiedEmployer && (
              <span className="hover:brightness-105 transition-all duration-200">
                <Badge variant="success" size="sm">
                  <CheckCircle size={12} />
                  Verified
                </Badge>
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
            <span className="hover:brightness-105 transition-all duration-200">
              <Badge variant="primary" size="sm">
                {job.jobType}
              </Badge>
            </span>
          )}
          {job.mode && (
            <span className="hover:brightness-105 transition-all duration-200">
              <Badge variant="primary" size="sm">
                {job.mode}
              </Badge>
            </span>
          )}
        </div>

        {/* Salary */}
        {salary && (
          <p className="text-success-600 font-semibold text-base">{salary}</p>
        )}

        {/* Freshness */}
        <p className="text-gray-400 text-xs">{freshness}</p>
      </div>
    </Link>
  );
}

