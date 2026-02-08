'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { MapPin, CheckCircle, Eye } from 'lucide-react';
import { slugify, isNewJob, getJobFreshness } from '@/lib/utils';
import { Job } from '@/lib/types';
import useAppliedJobs from '@/lib/hooks/useAppliedJobs';
import { useViewedJobs } from '@/lib/hooks/useViewedJobs';
import Badge from '@/components/ui/Badge';
import ShareModal from '@/components/ShareModal';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com';

// Share icon component
const ShareIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
  </svg>
);

interface JobCardProps {
  job: Job;
  viewMode?: 'grid' | 'list';
}

// Helper to safely strip HTML (works on server and client)
function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  // Decode entities first
  const decoded = html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Then strip tags
  return decoded.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function JobCard({ job, viewMode = 'grid' }: JobCardProps) {
  const { isApplied } = useAppliedJobs();
  const { isViewed, markAsViewed, isHydrated } = useViewedJobs();
  const [showShareMenu, setShowShareMenu] = useState(false);
  const applied = isApplied(job.id);
  const jobSlug = slugify(job.title, job.id);
  const jobUrl = `/jobs/${jobSlug}`;
  const fullJobUrl = `${BASE_URL}/jobs/${jobSlug}`;
  const isNew = isNewJob(job);
  const freshness = getJobFreshness(job);
  const shareTitle = `${job.title} at ${job.employer}`;
  const shareDescription = `Check out this PMHNP job: ${job.title} at ${job.employer}`;
  const viewed = isHydrated && isViewed(jobSlug);

  // Clean summary for display
  const cleanSummary = stripHtml(job.descriptionSummary);

  // Mark job as viewed when card is clicked
  const handleCardClick = () => {
    markAsViewed(jobSlug);
  };

  const handleShareClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowShareMenu(true);
  };

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
      return { text: 'Recent', className: 'bg-blue-50 text-blue-900 text-xs px-2 py-1 rounded-full font-bold' };
    }
    return null;
  };

  const ageIndicator = getJobAgeIndicator();

  // List view - horizontal layout
  if (viewMode === 'list') {
    return (
      <Link href={jobUrl} className="block touch-manipulation w-full" onClick={handleCardClick}>
        <div className={`group !bg-white rounded-lg border-2 border-gray-200 hover:border-blue-300 shadow-sm hover:shadow-md transition-all duration-200 p-4 md:p-5 ${viewed ? 'opacity-80' : ''}`}>
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 md:gap-4">
            {/* Left Side - Main Info */}
            <div className="flex-1 min-w-0">
              {/* Title with Badges */}
              <div className="flex flex-col sm:flex-row sm:items-start gap-2 mb-2">
                <h3 className="text-base md:text-lg font-bold text-black group-hover:text-primary-800 transition-colors duration-200 leading-tight">
                  {job.title}
                </h3>
                <div className="flex gap-1.5 flex-wrap">
                  {isNew && (
                    <Badge variant="warning" size="sm">New</Badge>
                  )}
                  {viewed && !applied && (
                    <Badge variant="secondary" size="sm">
                      <Eye size={12} />
                      Viewed
                    </Badge>
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
              <p className="text-black font-medium text-sm mb-2">{job.employer}</p>

              {/* Location and Type */}
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <div className="flex items-center gap-1 text-black font-medium text-sm">
                  <MapPin size={14} className="text-black" />
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
              {cleanSummary && (
                <p className="hidden md:block text-black text-sm line-clamp-1 mt-2">
                  {cleanSummary}
                </p>
              )}

              {/* Freshness */}
              <div className="flex items-center gap-2 mt-2">
                <p className="text-black font-medium text-xs">{freshness}</p>
                {ageIndicator && (
                  <span className={ageIndicator.className}>
                    {ageIndicator.text}
                  </span>
                )}
              </div>
            </div>

            {/* Right Side - Salary and Share */}
            <div className="flex items-center gap-3 shrink-0">
              {job.displaySalary && (
                <div className="text-black font-bold text-lg md:text-xl md:text-right">
                  {job.displaySalary.startsWith('$') ? job.displaySalary : `$${job.displaySalary}`}
                </div>
              )}
              {/* Share Button */}
              <button
                onClick={handleShareClick}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                aria-label="Share job"
              >
                <ShareIcon size={18} />
              </button>
              {showShareMenu && (
                <ShareModal
                  url={fullJobUrl}
                  title={shareTitle}
                  description={shareDescription}
                  onClose={() => setShowShareMenu(false)}
                />
              )}
            </div>
          </div>
        </div>
      </Link>
    );
  }

  // Grid view - default vertical card layout
  return (
    <Link href={jobUrl} className="block touch-manipulation h-full" onClick={handleCardClick}>
      <div className={`group !bg-white rounded-xl border-2 border-gray-200 hover:border-blue-300 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200 flex flex-col gap-2 sm:gap-3 w-full h-full p-4 md:p-6 ${viewed ? 'opacity-80' : ''}`}>
        {/* Title and Badges Row */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
          <h3 className="text-lg md:text-xl font-bold text-black group-hover:text-primary-800 transition-colors duration-200 flex-1 leading-tight">
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
            {viewed && !applied && (
              <span className="hover:brightness-105 transition-all duration-200">
                <Badge variant="secondary" size="sm">
                  <Eye size={12} />
                  Viewed
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
        <p className="text-black font-medium text-sm sm:text-base">{job.employer}</p>

        {/* Location and Meta */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-1 text-black font-medium text-sm">
            <MapPin size={16} className="text-black" />
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
          <div className="text-black font-bold text-lg sm:text-xl mt-1">
            {job.displaySalary.startsWith('$') ? job.displaySalary : `$${job.displaySalary}`}
          </div>
        )}

        {/* Description Summary */}
        {cleanSummary && (
          <p className="text-black text-sm mt-2 line-clamp-2">
            {cleanSummary}
          </p>
        )}

        {/* Freshness and Share */}
        <div className="flex items-center justify-between gap-2 mt-auto">
          <div className="flex items-center gap-2">
            <p className="text-black font-medium text-xs">{freshness}</p>
            {ageIndicator && (
              <span className={ageIndicator.className}>
                {ageIndicator.text}
              </span>
            )}
          </div>
          {/* Share Button */}
          <button
            onClick={handleShareClick}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Share job"
          >
            <ShareIcon size={16} />
          </button>
          {showShareMenu && (
            <ShareModal
              url={fullJobUrl}
              title={shareTitle}
              description={shareDescription}
              onClose={() => setShowShareMenu(false)}
            />
          )}
        </div>
      </div>
    </Link>
  );
}

// Memoize component to prevent unnecessary re-renders
export default React.memo(JobCard);

