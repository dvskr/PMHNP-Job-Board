'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { MapPin, CheckCircle, Eye, Bookmark, ExternalLink } from 'lucide-react';
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
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-zA-Z]+;/g, ' ');

  // Then strip tags
  return decoded.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Helper to build a salary string when displaySalary is missing
function buildSalaryDisplay(job: Job): string | null {
  if (job.displaySalary) return job.displaySalary;
  const min = job.normalizedMinSalary;
  const max = job.normalizedMaxSalary;
  if (!min && !max) return job.salaryRange || null;
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

// Check if a job link goes directly to an employer's ATS career page
const ATS_PATTERNS = [
  /\.myworkdayjobs\.com/i, /greenhouse\.io/i, /lever\.co/i,
  /jobs\.ashbyhq\.com/i, /smartrecruiters\.com/i, /icims\.com/i,
  /jazz\.co/i, /bamboohr\.com/i, /usajobs\.gov/i,
  /apply\.workable\.com/i, /careers\./i, /jobs\./i,
];
function isDirectApply(url: string | null): boolean {
  if (!url) return false;
  return ATS_PATTERNS.some(p => p.test(url));
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
  const directApply = isDirectApply(job.applyLink);

  // Clean summary for display
  const cleanSummary = stripHtml(job.descriptionSummary);
  const salaryDisplay = buildSalaryDisplay(job);

  // Truncate long locations: take first part before semicolons, cap at 35 chars
  const shortLocation = (() => {
    if (!job.location) return 'Remote';
    const first = job.location.split(';')[0].split(',').slice(0, 2).join(',').trim();
    return first.length > 35 ? first.slice(0, 33) + '…' : first;
  })();

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

  // List view - Himalayas-style flat rows
  if (viewMode === 'list') {
    // Build dot-separated metadata
    const metaParts: string[] = [];
    if (job.employer) metaParts.push(job.employer);
    if (job.mode) metaParts.push(job.mode);
    if (job.location) metaParts.push(job.location);
    if (salaryDisplay) metaParts.push(salaryDisplay.startsWith('$') ? salaryDisplay : `$${salaryDisplay}`);
    metaParts.push(freshness);

    return (
      <Link href={jobUrl} className="block touch-manipulation w-full" onClick={handleCardClick}>
        <div
          className="jc-card"
          style={{
            display: 'flex', alignItems: 'flex-start', gap: '16px',
            padding: '18px 22px',
            backgroundColor: '#F7FBF8',
            borderRadius: '20px',
            border: job.isFeatured ? '2px solid var(--color-primary)' : '1px solid rgba(255,255,255,0.5)',
            boxShadow: '8px 8px 20px rgba(0,0,0,0.07), -4px -4px 12px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.6), inset -1px -1px 2px rgba(0,0,0,0.02)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            opacity: viewed ? 0.7 : 1,
            marginBottom: '12px',
          }}
        >
          {/* Company Logo / Avatar */}
          <div style={{ flexShrink: 0 }}>
            {job.companyLogoUrl ? (
              <img
                src={job.companyLogoUrl}
                alt={`${job.employer} logo`}
                style={{
                  width: '48px', height: '48px', borderRadius: '10px',
                  objectFit: 'contain', border: '1px solid var(--border-color)',
                  background: 'var(--bg-tertiary)',
                }}
              />
            ) : (
              <div style={{
                width: '48px', height: '48px', borderRadius: '10px',
                background: `hsl(${(job.employer || '').charCodeAt(0) * 7 % 360}, 40%, 50%)`,
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '18px', fontWeight: 700,
              }}>
                {(job.employer || '?')[0].toUpperCase()}
              </div>
            )}
          </div>

          {/* Middle: Title + Company + Badges */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Title */}
            <h3 style={{
              fontSize: '18px', fontWeight: 700,
              fontFamily: 'var(--font-lora), Georgia, serif',
              color: 'var(--text-primary)',
              margin: '0 0 3px', lineHeight: 1.3,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {job.title}
            </h3>
            {/* Company */}
            <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
              {job.employer}
            </p>

            {/* Salary + Location + Type */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              {salaryDisplay && (
                <Badge variant="salary" size="sm">
                  {salaryDisplay.startsWith('$') ? salaryDisplay : `$${salaryDisplay}`}
                </Badge>
              )}
              <Badge variant="outline" size="sm">
                <MapPin size={13} style={{ color: 'var(--color-primary)' }} />
                {shortLocation}
              </Badge>
              {job.jobType && <Badge variant="outline" size="sm">{job.jobType}</Badge>}
              {job.mode && <Badge variant="outline" size="sm">{job.mode}</Badge>}
            </div>

            {/* Status Badges */}
            {(isNew || (viewed && !applied) || applied || job.isFeatured || job.isVerifiedEmployer || directApply) && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
                {isNew && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, background: '#A7F3D0', color: '#065F46', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '4px 4px 10px rgba(16,185,129,0.12), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)' }}>● New</span>
                )}
                {viewed && !applied && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, background: '#E0E7E2', color: '#374151', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '4px 4px 10px rgba(0,0,0,0.06), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)' }}><Eye size={12} /> Viewed</span>
                )}
                {applied && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, background: '#A7F3D0', color: '#065F46', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '4px 4px 10px rgba(16,185,129,0.12), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)' }}>✓ Applied</span>
                )}
                {job.isFeatured && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, background: '#FDE68A', color: '#78350F', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '4px 4px 10px rgba(245,158,11,0.15), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)' }}>⚡ Featured</span>
                )}
                {job.isVerifiedEmployer && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, background: '#B2F5EA', color: '#0F766E', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '4px 4px 10px rgba(13,148,136,0.12), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)' }}><CheckCircle size={12} /> Verified</span>
                )}
                {directApply && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, background: '#BFDBFE', color: '#1E40AF', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '4px 4px 10px rgba(59,130,246,0.12), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)' }}>→ Direct Apply</span>
                )}
              </div>
            )}


          </div>

          {/* Right: Save + View Job */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={handleSaveClick}
                style={{
                  padding: '8px 16px', borderRadius: '14px',
                  fontSize: '13px', fontWeight: 600,
                  color: saved ? '#0F766E' : '#374151',
                  backgroundColor: saved ? '#B2F5EA' : '#EDF2EE',
                  border: '1px solid rgba(255,255,255,0.5)',
                  boxShadow: '4px 4px 10px rgba(0,0,0,0.06), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)',
                  cursor: 'pointer', transition: 'all 0.2s',
                  whiteSpace: 'nowrap',
                }}
                className="jc-save-btn"
                aria-label={saved ? 'Saved' : 'Save'}
              >
                {saved ? 'Saved' : 'Save'}
              </button>
              <span
                style={{
                  padding: '8px 16px', borderRadius: '14px',
                  fontSize: '13px', fontWeight: 600,
                  color: '#374151',
                  backgroundColor: '#EDF2EE',
                  border: '1px solid rgba(255,255,255,0.5)',
                  boxShadow: '4px 4px 10px rgba(0,0,0,0.06), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)',
                  whiteSpace: 'nowrap',
                }}
              >
                View Job →
              </span>
              {job.applyLink && (
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(job.applyLink!, '_blank', 'noopener,noreferrer'); }}
                  style={{
                    padding: '8px 16px', borderRadius: '14px',
                    fontSize: '13px', fontWeight: 600,
                    color: '#fff',
                    backgroundColor: '#0d9488',
                    whiteSpace: 'nowrap',
                    border: '1px solid rgba(255,255,255,0.3)',
                    boxShadow: '4px 4px 10px rgba(13,148,136,0.20), -2px -2px 6px rgba(255,255,255,0.2), inset 2px 2px 4px rgba(255,255,255,0.2), inset -1px -1px 2px rgba(0,0,0,0.06)',
                    cursor: 'pointer',
                  }}
                >
                  Apply
                </button>
              )}
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: 0 }}>{freshness}</p>
          </div>
        </div>

        {showShareMenu && (
          <ShareModal
            url={fullJobUrl}
            title={shareTitle}
            description={shareDescription}
            onClose={() => setShowShareMenu(false)}
          />
        )}

        <style>{`
          .jc-card:hover {
            box-shadow: 10px 10px 25px rgba(0,0,0,0.10), -5px -5px 15px rgba(255,255,255,0.9), inset 2px 2px 5px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.02) !important;
            transform: translateY(-4px);
          }
          .jc-save-btn:hover {
            color: var(--color-primary) !important;
            transform: translateY(-1px);
            box-shadow: 6px 6px 14px rgba(0,0,0,0.08), -3px -3px 8px rgba(255,255,255,0.9), inset 2px 2px 5px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03) !important;
          }
        `}</style>
      </Link>
    );
  }

  // Grid view - default vertical card layout
  return (
    <Link href={jobUrl} className="block touch-manipulation h-full" onClick={handleCardClick}>
      <div
        className="jc-card"
        style={{
          backgroundColor: '#F7FBF8',
          borderRadius: '22px',
          border: job.isFeatured ? '2px solid var(--color-primary)' : '1px solid rgba(255,255,255,0.5)',
          padding: '22px',
          display: 'flex', flexDirection: 'column', gap: '12px',
          width: '100%', height: '100%',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          opacity: viewed ? 0.75 : 1,
          position: 'relative',
          boxShadow: '8px 8px 20px rgba(0,0,0,0.07), -4px -4px 12px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.6), inset -1px -1px 2px rgba(0,0,0,0.02)',
        }}
      >
        {/* Row 1: Avatar + Title + Actions */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          {/* Company Avatar */}
          {job.companyLogoUrl ? (
            <img
              src={job.companyLogoUrl}
              alt={`${job.employer} logo`}
              style={{
                width: '44px', height: '44px', borderRadius: '10px',
                objectFit: 'contain', border: '1px solid var(--border-color)',
                flexShrink: 0, background: 'var(--bg-secondary)',
              }}
            />
          ) : (
            <div style={{
              width: '44px', height: '44px', borderRadius: '10px',
              background: `hsl(${(job.employer || '').charCodeAt(0) * 7 % 360}, 40%, 50%)`,
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '17px', fontWeight: 700, flexShrink: 0,
            }}>
              {(job.employer || '?')[0].toUpperCase()}
            </div>
          )}

          {/* Title + Company */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{
              fontSize: '18px', fontWeight: 700,
              fontFamily: 'var(--font-lora), Georgia, serif',
              color: 'var(--text-primary)',
              margin: '0 0 3px', lineHeight: 1.3,
              overflow: 'hidden', textOverflow: 'ellipsis',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
            }}>
              {job.title}
            </h3>
            <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)', margin: 0 }}>
              {job.employer}
            </p>
          </div>

          {/* Save + Share */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
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
              <Bookmark size={18} fill={saved ? 'currentColor' : 'none'} />
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
              <ShareIcon size={18} />
            </button>
          </div>
        </div>

        {/* Row 2: Salary — inline, not full width */}
        {salaryDisplay && (
          <div>
            <Badge variant="salary" size="sm">
              {salaryDisplay.startsWith('$') ? salaryDisplay : `$${salaryDisplay}`}
            </Badge>
          </div>
        )}

        {/* Row 3: Location + Type Badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
          <Badge variant="outline" size="sm">
            <MapPin size={13} style={{ color: 'var(--color-primary)' }} />
            {shortLocation}
          </Badge>
          {job.jobType && <Badge variant="outline" size="sm">{job.jobType}</Badge>}
          {job.mode && <Badge variant="outline" size="sm">{job.mode}</Badge>}
        </div>

        {/* Row 4: Status Badges */}
        {(isNew || (viewed && !applied) || applied || job.isFeatured || job.isVerifiedEmployer || directApply) && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {isNew && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                padding: '5px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                background: '#A7F3D0', color: '#065F46', border: '1px solid rgba(255,255,255,0.5)',
                boxShadow: '4px 4px 10px rgba(16,185,129,0.12), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)',
              }}>● New</span>
            )}
            {viewed && !applied && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                padding: '5px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                background: '#E0E7E2', color: '#374151', border: '1px solid rgba(255,255,255,0.5)',
                boxShadow: '4px 4px 10px rgba(0,0,0,0.06), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)',
              }}><Eye size={12} /> Viewed</span>
            )}
            {applied && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                padding: '5px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                background: '#A7F3D0', color: '#065F46', border: '1px solid rgba(255,255,255,0.5)',
                boxShadow: '4px 4px 10px rgba(16,185,129,0.12), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)',
              }}>✓ Applied</span>
            )}
            {job.isFeatured && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                padding: '5px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                background: '#FDE68A', color: '#78350F', border: '1px solid rgba(255,255,255,0.5)',
                boxShadow: '4px 4px 10px rgba(245,158,11,0.15), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)',
              }}>⚡ Featured</span>
            )}
            {job.isVerifiedEmployer && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                padding: '5px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                background: '#B2F5EA', color: '#0F766E', border: '1px solid rgba(255,255,255,0.5)',
                boxShadow: '4px 4px 10px rgba(13,148,136,0.12), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)',
              }}><CheckCircle size={12} /> Verified</span>
            )}
            {directApply && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                padding: '5px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                background: '#BFDBFE', color: '#1E40AF', border: '1px solid rgba(255,255,255,0.5)',
                boxShadow: '4px 4px 10px rgba(59,130,246,0.12), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)',
              }}>→ Direct Apply</span>
            )}
          </div>
        )}



        {/* Row 6: Footer — Date + CTA Button */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginTop: 'auto', paddingTop: '12px',
          borderTop: '1px solid rgba(0,0,0,0.05)',
        }}>
          <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-tertiary)', margin: 0 }}>
            {freshness}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              className="jc-cta"
              style={{
                fontSize: '13px', fontWeight: 700,
                color: '#374151',
                backgroundColor: '#EDF2EE',
                border: '1px solid rgba(255,255,255,0.5)',
                boxShadow: '4px 4px 10px rgba(0,0,0,0.06), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)',
                padding: '7px 16px', borderRadius: '14px',
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                transition: 'all 0.2s ease',
              }}
            >
              View Job <span className="jc-cta-arrow" style={{ transition: 'transform 0.2s ease' }}>→</span>
            </span>
            {job.applyLink && (
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(job.applyLink!, '_blank', 'noopener,noreferrer'); }}
                style={{
                  fontSize: '13px', fontWeight: 700, color: '#fff',
                  backgroundColor: '#0d9488',
                  padding: '7px 16px', borderRadius: '14px',
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  border: '1px solid rgba(255,255,255,0.3)',
                  boxShadow: '4px 4px 10px rgba(13,148,136,0.20), -2px -2px 6px rgba(255,255,255,0.2), inset 2px 2px 4px rgba(255,255,255,0.2), inset -1px -1px 2px rgba(0,0,0,0.06)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                Apply
              </button>
            )}
          </div>
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

      <style>{`
        .jc-card:hover {
          box-shadow: 10px 10px 25px rgba(0,0,0,0.10), -5px -5px 15px rgba(255,255,255,0.9), inset 2px 2px 5px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.02) !important;
          transform: translateY(-4px);
          position: relative;
          z-index: 1;
        }
        .jc-card:hover .jc-cta {
          gap: 8px !important;
          box-shadow: 6px 6px 14px rgba(0,0,0,0.08), -3px -3px 8px rgba(255,255,255,0.9), inset 2px 2px 5px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03) !important;
          transform: translateY(-1px);
        }
        .jc-card:hover .jc-cta-arrow {
          transform: translateX(3px);
        }
        .jc-share-btn:hover {
          color: var(--text-primary) !important;
          background: var(--bg-tertiary) !important;
          transform: translateY(-1px);
        }
        .jc-save-btn:hover {
          color: var(--color-primary) !important;
          transform: translateY(-1px);
          box-shadow: 6px 6px 14px rgba(0,0,0,0.08), -3px -3px 8px rgba(255,255,255,0.9), inset 2px 2px 5px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03) !important;
        }
      `}</style>
    </Link>
  );
}

// Memoize component to prevent unnecessary re-renders
export default React.memo(JobCard);
