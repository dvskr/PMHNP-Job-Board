'use client';

import Link from 'next/link';
import { MapPin, CheckCircle } from 'lucide-react';
import { slugify, isNewJob, getJobFreshness } from '@/lib/utils';
import { Job } from '@/lib/types';
import useAppliedJobs from '@/lib/hooks/useAppliedJobs';
import Badge from '@/components/ui/Badge';

interface JobCardProps {
  job: Job;
  viewMode?: 'grid' | 'list';
}

export default function JobCard({ job, viewMode = 'grid' }: JobCardProps) {
  const { isApplied } = useAppliedJobs();
  const applied = isApplied(job.id);
  const jobUrl = `/jobs/${slugify(job.title, job.id)}`;
  const isNew = isNewJob(job.createdAt);
  const freshness = getJobFreshness(job.createdAt);

  // Calculate job age for freshness indicator
  const getJobAgeIndicator = () => {
    const now = new Date();
    const createdAt = new Date(job.createdAt);
    const ageInMs = now.getTime() - createdAt.getTime();
    const ageInDays = ageInMs / (1000 * 60 * 60 * 24);

    // Skip indicator for jobs < 3 days (the existing "New" badge handles this)
    if (ageInDays < 3) {
      return null;
    } else if (ageInDays < 7) {
      return { text: 'Recent', className: 'bg-blue-50 text-blue-600 text-xs px-2 py-1 rounded-full font-medium' };
    } else if (ageInDays >= 30) {
      return { text: '⚠️ May be filled', className: 'text-yellow-600 text-xs italic' };
    }
    return null;
  };

  const ageIndicator = getJobAgeIndicator();

  // List view - horizontal layout
  if (viewMode === 'list') {
    return (
      <Link href={jobUrl} className="block touch-manipulation w-full">
        <div className="group bg-white rounded-lg border-2 border-gray-200 hover:border-blue-300 shadow-sm hover:shadow-md transition-all duration-200 p-4 md:p-5">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 md:gap-4">
            {/* Left Side - Main Info */}
            <div className="flex-1 min-w-0">
              {/* Title with Badges */}
              <div className="flex flex-col sm:flex-row sm:items-start gap-2 mb-2">
                <h3 className="text-base md:text-lg font-semibold text-gray-900 group-hover:text-primary-600 transition-colors duration-200 leading-tight">
                  {job.title}
                </h3>
                <div className="flex gap-1.5 flex-wrap">
                  {isNew && (
                    <Badge variant="warning" size="sm">New</Badge>
                  )}
                  {applied && (
                    <Badge variant="success" size="sm">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      Applied
                    </Badge>
                  )}
                  {job.isFeatured && (
                    <Badge variant="featured" size="sm">Featured</Badge>
                  )}
                  {job.isVerifiedEmployer && (
                    <Badge variant="success" size="sm">
                      <CheckCircle size={12} />
                      Verified
                    </Badge>
                  )}
                </div>
              </div>

              {/* Company */}
              <p className="text-gray-600 text-sm mb-2">{job.employer}</p>

              {/* Location and Type */}
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <div className="flex items-center gap-1 text-gray-500 text-sm">
                  <MapPin size={14} />
                  <span>{job.location}</span>
                </div>
                {job.jobType && (
                  <Badge variant="primary" size="sm">{job.jobType}</Badge>
                )}
                {job.mode && (
                  <Badge variant="primary" size="sm">{job.mode}</Badge>
                )}
              </div>

              {/* Description - hidden on mobile */}
              {job.descriptionSummary && (
                <p className="hidden md:block text-gray-600 text-sm line-clamp-1 mt-2">
                  {job.descriptionSummary}
                </p>
              )}

              {/* Freshness */}
              <div className="flex items-center gap-2 mt-2">
                <p className="text-gray-400 text-xs">{freshness}</p>
                {ageIndicator && (
                  <span className={ageIndicator.className}>
                    {ageIndicator.text}
                  </span>
                )}
              </div>
            </div>

            {/* Right Side - Salary */}
            {job.displaySalary && (
              <div className="text-teal-700 font-bold text-lg md:text-xl md:text-right shrink-0">
                {job.displaySalary.startsWith('$') ? job.displaySalary : `$${job.displaySalary}`}
              </div>
            )}
          </div>
        </div>
      </Link>
    );
  }

  // Grid view - default vertical card layout
  return (
    <Link href={jobUrl} className="block touch-manipulation h-full">
      <div className="group bg-white rounded-xl border-2 border-gray-200 hover:border-blue-300 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200 flex flex-col gap-2 sm:gap-3 w-full h-full p-4 md:p-6">
        {/* Title and Badges Row */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
          <h3 className="text-lg md:text-xl font-semibold text-gray-900 group-hover:text-primary-600 transition-colors duration-200 flex-1 leading-tight">
            {job.title}
          </h3>
          <div className="flex gap-2 flex-wrap shrink-0">
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
        <p className="text-gray-600 text-sm sm:text-base">{job.employer}</p>

        {/* Location and Meta */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
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
        </div>

        {/* Salary - Prominent display */}
        {job.displaySalary && (
          <div className="text-teal-700 font-bold text-lg sm:text-xl mt-1">
            {job.displaySalary.startsWith('$') ? job.displaySalary : `$${job.displaySalary}`}
          </div>
        )}

        {/* Description Summary */}
        {job.descriptionSummary && (
          <p className="text-gray-600 text-sm mt-2 line-clamp-2">
            {job.descriptionSummary}
          </p>
        )}

        {/* Freshness */}
        <div className="flex items-center gap-2 mt-auto">
          <p className="text-gray-400 text-xs">{freshness}</p>
          {ageIndicator && (
            <span className={ageIndicator.className}>
              {ageIndicator.text}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

