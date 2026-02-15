'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { MapPin, CheckCircle, Eye, Bookmark } from 'lucide-react';
import { slugify, isNewJob, getJobFreshness } from '@/lib/utils';
import { Job } from '@/lib/types';
import useAppliedJobs from '@/lib/hooks/useAppliedJobs';
import useSavedJobs from '@/lib/hooks/useSavedJobs';
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

// Helper to build a salary string when displaySalary is missing
function buildSalaryDisplay(job: Job): string | null {
  if (job.displaySalary) return job.displaySalary;
  const min = job.normalizedMinSalary;
  const max = job.normalizedMaxSalary;
  if (!min && !max) return null;
  const fmt = (n: number) => {
    if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
    return `$${n.toLocaleString()}`;
  };
  const period = job.salaryPeriod === 'hourly' ? '/hr' : '/yr';
  if (min && max && min !== max) return `${fmt(min)} - ${fmt(max)}${period}`;
  if (min) return `${fmt(min)}${period}`;
  if (max) return `${fmt(max)}${period}`;
  return null;
}


function JobCard({ job, viewMode = 'grid' }: JobCardProps) {
  const { isApplied } = useAppliedJobs();
  const { isSaved, saveJob, removeJob } = useSavedJobs();
  const { isViewed, markAsViewed, isHydrated } = useViewedJobs();
  const [showShareMenu, setShowShareMenu] = useState(false);
  const saved = isSaved(job.id);
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
  const salaryDisplay = buildSalaryDisplay(job);

  // Mark job as viewed when card is clicked
  const handleCardClick = () => {
    markAsViewed(jobSlug);
  };

  const handleShareClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowShareMenu(true);
  };

  const handleSaveClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (saved) {
      removeJob(job.id);
    } else {
      saveJob(job.id);
    }
  };

  const getJobAgeIndicator = () => {
    const now = new Date();
    // Use original posted date when available, fall back to createdAt
    const postedDate = new Date((job.originalPostedAt || job.createdAt) as unknown as string);
    const ageInMs = now.getTime() - postedDate.getTime();
    const ageInDays = ageInMs / (1000 * 60 * 60 * 24);

    // Skip indicator for jobs < 3 days (the existing "New" badge handles this)
    if (ageInDays < 3) {
      return null;
    } else if (ageInDays < 7) {
      return { text: 'Recent', color: 'var(--bg-tertiary)', textColor: 'var(--color-primary)' };
    }
    return null;
  };

  const ageIndicator = getJobAgeIndicator();

  // List view - horizontal layout
  if (viewMode === 'list') {
    return (
      <Link href={jobUrl} className="block touch-manipulation w-full" onClick={handleCardClick}>
        <div
          className="jc-card"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: '14px',
            border: '1px solid var(--border-color)',
            padding: '18px 22px',
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            opacity: viewed ? 0.75 : 1,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
              {/* Left Side - Main Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Title with Badges */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <h3 style={{
                    fontSize: '16px', fontWeight: 700,
                    color: 'var(--text-primary)',
                    margin: 0, lineHeight: 1.3,
                  }}>
                    {job.title}
                  </h3>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {isNew && <Badge variant="warning" size="sm">New</Badge>}
                    {viewed && !applied && (
                      <Badge variant="secondary" size="sm"><Eye size={12} /> Viewed</Badge>
                    )}
                    {applied && (
                      <Badge variant="success" size="sm">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        Applied
                      </Badge>
                    )}
                    {job.isFeatured && <Badge variant="featured" size="sm">Featured</Badge>}
                    {job.isVerifiedEmployer && (
                      <Badge variant="success" size="sm"><CheckCircle size={12} /> Verified</Badge>
                    )}
                  </div>
                </div>

                {/* Company */}
                <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)', margin: '0 0 6px' }}>{job.employer}</p>

                {/* Location and Type */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    <MapPin size={14} style={{ color: '#2DD4BF' }} />
                    <span>{job.location}</span>
                  </div>
                  {job.jobType && <Badge variant="primary" size="sm">{job.jobType}</Badge>}
                  {job.mode && <Badge variant="primary" size="sm">{job.mode}</Badge>}
                </div>

                {/* Description */}
                {cleanSummary && (
                  <p className="hidden md:block" style={{
                    fontSize: '13px', color: 'var(--text-tertiary)',
                    margin: '8px 0 0', lineHeight: 1.5,
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical',
                  }}>
                    {cleanSummary}
                  </p>
                )}

                {/* Freshness */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                  <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-tertiary)', margin: 0 }}>{freshness}</p>
                  {ageIndicator && (
                    <span style={{
                      fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '10px',
                      backgroundColor: ageIndicator.color, color: ageIndicator.textColor,
                    }}>
                      {ageIndicator.text}
                    </span>
                  )}
                </div>
              </div>

              {/* Right Side - Salary and Share */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                {salaryDisplay && (
                  <div style={{ fontSize: '17px', fontWeight: 700, color: '#2DD4BF', textAlign: 'right' }}>
                    {salaryDisplay.startsWith('$') ? salaryDisplay : `$${salaryDisplay}`}
                  </div>
                )}
                <button
                  onClick={handleSaveClick}
                  className="jc-save-btn"
                  style={{
                    padding: '8px', borderRadius: '50%',
                    color: saved ? 'var(--color-primary)' : 'var(--text-tertiary)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  aria-label={saved ? 'Unsave job' : 'Save job'}
                  title={saved ? 'Unsave job' : 'Save job'}
                >
                  <Bookmark size={18} fill={saved ? 'currentColor' : 'none'} />
                </button>
                <button
                  onClick={handleShareClick}
                  className="jc-share-btn"
                  style={{
                    padding: '8px', borderRadius: '50%',
                    color: 'var(--text-tertiary)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
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
        </div>
      </Link>
    );
  }

  // Grid view - default vertical card layout
  return (
    <Link href={jobUrl} className="block touch-manipulation h-full" onClick={handleCardClick}>
      <div
        className="jc-card"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: '16px',
          border: '1px solid var(--border-color)',
          padding: '22px 24px',
          display: 'flex', flexDirection: 'column', gap: '10px',
          width: '100%', height: '100%',
          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          opacity: viewed ? 0.75 : 1,
          position: 'relative',
        }}
      >
        {/* Badges – top right corner */}
        {(isNew || (viewed && !applied) || applied || job.isFeatured || job.isVerifiedEmployer) && (
          <div style={{ position: 'absolute', top: '16px', right: '16px', display: 'flex', gap: '5px', flexWrap: 'nowrap' }}>
            {isNew && <Badge variant="warning" size="sm">New</Badge>}
            {viewed && !applied && (
              <Badge variant="secondary" size="sm"><Eye size={12} /> Viewed</Badge>
            )}
            {applied && (
              <Badge variant="success" size="sm">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Applied
              </Badge>
            )}
            {job.isFeatured && <Badge variant="featured" size="sm">Featured</Badge>}
            {job.isVerifiedEmployer && (
              <Badge variant="success" size="sm"><CheckCircle size={12} /> Verified</Badge>
            )}
          </div>
        )}

        {/* Title */}
        <h3 style={{
          fontSize: '17px', fontWeight: 700,
          color: 'var(--text-primary)',
          margin: 0, lineHeight: 1.3,
          paddingRight: '140px',
        }}>
          {job.title}
        </h3>

        {/* Company Name */}
        <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)', margin: 0 }}>{job.employer}</p>

        {/* Location and Meta */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: 'var(--text-secondary)' }}>
            <MapPin size={15} style={{ color: 'var(--color-primary)' }} />
            <span>{job.location}</span>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {job.jobType && <Badge variant="primary" size="sm">{job.jobType}</Badge>}
            {job.mode && <Badge variant="primary" size="sm">{job.mode}</Badge>}
          </div>
        </div>

        {/* Salary - Prominent display */}
        {salaryDisplay && (
          <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--salary-color, #1d4ed8)', marginTop: '2px' }}>
            {salaryDisplay.startsWith('$') ? salaryDisplay : `$${salaryDisplay}`}
          </div>
        )}

        {/* Description Summary */}
        {cleanSummary && (
          <p style={{
            fontSize: '14px', color: 'rgba(var(--text-primary-rgb), 0.78)',
            margin: '4px 0 0', lineHeight: 1.6,
            overflow: 'hidden', textOverflow: 'ellipsis',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {cleanSummary}
          </p>
        )}

        {/* Freshness and Share */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', margin: 0 }}>{freshness}</p>
            {ageIndicator && (
              <span style={{
                fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '10px',
                backgroundColor: ageIndicator.color, color: ageIndicator.textColor,
              }}>
                {ageIndicator.text}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            <button
              onClick={handleSaveClick}
              className="jc-save-btn"
              style={{
                padding: '6px', borderRadius: '50%',
                color: saved ? 'var(--color-primary)' : 'var(--text-tertiary)',
                background: 'none', border: 'none', cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              aria-label={saved ? 'Unsave job' : 'Save job'}
              title={saved ? 'Unsave job' : 'Save job'}
            >
              <Bookmark size={16} fill={saved ? 'currentColor' : 'none'} />
            </button>
            <button
              onClick={handleShareClick}
              className="jc-share-btn"
              style={{
                padding: '6px', borderRadius: '50%',
                color: 'var(--text-tertiary)',
                background: 'none', border: 'none', cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              aria-label="Share job"
            >
              <ShareIcon size={16} />
            </button>
          </div>
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

      <style>{`
        .jc-card:hover {
          border-color: var(--color-primary) !important;
          box-shadow: 0 4px 16px var(--shadow-color, rgba(0,0,0,0.1));
          position: relative;
          z-index: 1;
        }
        .jc-share-btn:hover {
          color: var(--text-primary) !important;
          background: var(--bg-tertiary) !important;
        }
        .jc-save-btn:hover {
          color: var(--color-primary) !important;
          background: var(--bg-tertiary) !important;
        }
      `}</style>
    </Link>
  );
}

// Memoize component to prevent unnecessary re-renders
export default React.memo(JobCard);
