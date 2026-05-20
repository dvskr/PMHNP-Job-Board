'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { MapPin, CheckCircle, Eye, Bookmark, ExternalLink, BadgeCheck, Zap, Mail } from 'lucide-react';
import { slugify, getJobFreshness } from '@/lib/utils';
import { Job } from '@/lib/types';
import useAppliedJobs from '@/lib/hooks/useAppliedJobs';
import useSavedJobs from '@/lib/hooks/useSavedJobs';
import { useViewedJobs } from '@/lib/hooks/useViewedJobs';
import Badge from '@/components/ui/Badge';
import MessageEmployerModal from '@/components/jobs/MessageEmployerModal';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com';

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

// Direct-apply detection moved to lib/direct-apply.ts so the detail
// page's ApplyButton uses the exact same logic — no more mismatch
// between "Direct Apply" on the card and "Apply Now" on the detail.
import { isDirectApplyUrl } from '@/lib/direct-apply';
// Render-time experience-label override so residency/fellowship/
// training-program jobs always show "New grad welcome" — even when
// the inference regex previously mis-extracted "5 years" from
// "5 years of accredited training" in the description.
import { effectiveExperienceLabel, effectiveNewGradFriendly } from '@/lib/experience-label';

function JobCard({ job, viewMode = 'grid' }: JobCardProps) {
  const { isApplied } = useAppliedJobs();
  const { isSaved, saveJob, removeJob } = useSavedJobs();
  const { isViewed, markAsViewed, isHydrated } = useViewedJobs();
  const router = useRouter();
  const [showMessageModal, setShowMessageModal] = useState(false);
  // Only employer-posted jobs can be messaged — aggregated rows have no
  // recipient in our system. Computed once per render.
  const canMessageEmployer = job.sourceType === 'employer';
  const saved = isSaved(job.id);
  const applied = isApplied(job.id);
  // Prefer the stored, immutable slug. Recomputing from title every render
  // means a future title edit would silently change the URL the card points
  // at — slugify is the legacy-row fallback only.
  const jobSlug = job.slug || slugify(job.title, job.id);
  const jobUrl = `/jobs/${jobSlug}`;
  const fullJobUrl = `${BASE_URL}/jobs/${jobSlug}`;
  // Compose a descriptive accessible name for the outer Link wrapper. The
  // visible <h3> carries the job title, but employer and location only live
  // in styled badge spans — screen readers and Google's accessibility-tree
  // parser miss them. The aria-label fills in city/state context so the
  // link's purpose is clear (audit 07 M-1).
  const cardLocation = job.isRemote
    ? 'Remote'
    : (job.city && job.state ? `${job.city}, ${job.state}` : (job.state || job.location || ''));
  const cardAriaLabel = `${job.title} at ${job.employer}${cardLocation ? ` — ${cardLocation}` : ''}`;
  const freshness = getJobFreshness(job);
  const shareTitle = `${job.title} at ${job.employer}`;
  const shareDescription = `Check out this PMHNP job: ${job.title} at ${job.employer}`;
  const viewed = isHydrated && isViewed(jobSlug);
  const easyApply = job.applyOnPlatform === true;
  // "Direct Apply" = employer posted the job here AND links to their own
  // ATS, OR an aggregated job whose apply URL matches a known ATS pattern.
  // Either way, the user is going straight to the employer (no aggregator
  // middleman) so the "Direct Apply" label is honest.
  const directApply =
    !easyApply &&
    !!job.applyLink &&
    (job.sourceType === 'employer' || isDirectApplyUrl(job.applyLink));

  // Card "Easy Apply" → navigate to job detail with ?apply=1 so the apply
  // popup auto-opens. Stops the surrounding card-link from firing too.
  const handleEasyApplyClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    markAsViewed(jobSlug);
    router.push(`${jobUrl}?apply=1`);
  };

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

  const handleMessageClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowMessageModal(true);
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

  // Derive correct display mode from boolean fields (mode field can be stale/wrong)
  const displayMode = job.isRemote ? 'Remote' : job.isHybrid ? 'Hybrid' : (job.mode || 'In-Person');

  // List view - Himalayas-style flat rows
  if (viewMode === 'list') {
    // Build dot-separated metadata
    const metaParts: string[] = [];
    if (job.employer) metaParts.push(job.employer);
    if (displayMode) metaParts.push(displayMode);
    if (job.location) metaParts.push(job.location);
    if (salaryDisplay) metaParts.push(salaryDisplay.startsWith('$') ? salaryDisplay : `$${salaryDisplay}`);
    metaParts.push(freshness);

    return (
      <Link href={jobUrl} aria-label={cardAriaLabel} className="block touch-manipulation w-full" onClick={handleCardClick}>
        <div
          // jc-list-card is the hook for the mobile media query in globals.css
          // (jc-list-card responsive overrides) which collapses the row layout
          // to a vertical stack so title + company stay readable when the
          // right-column action buttons would otherwise eat all the row width.
          className="jc-card jc-list-card"
          style={{
            display: 'flex', alignItems: 'flex-start', gap: '16px',
            padding: '18px 22px',
            backgroundColor: '#F7FBF8',
            borderRadius: '20px',
            border: '1px solid rgba(255,255,255,0.5)',
            boxShadow: '8px 8px 20px rgba(0,0,0,0.07), -4px -4px 12px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.6), inset -1px -1px 2px rgba(0,0,0,0.02)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            opacity: viewed ? 0.7 : 1,
            marginBottom: '12px',
          }}
        >
          {/* Company Logo / Avatar — next/image routes through Next's
              /_next/image proxy so retina screens get a 96/144px AVIF/WebP
              variant generated from the source, regardless of whether the
              employer uploaded a giant PNG or a small WebP. quality=90
              keeps logos crisp; raw <img> + CSS scale produced visible
              softness at 48px on 2x/3x displays. */}
          <div style={{ flexShrink: 0, position: 'relative' }}>
            {job.companyLogoUrl ? (
              <Image
                src={job.companyLogoUrl}
                alt={`${job.employer} logo`}
                width={48}
                height={48}
                quality={90}
                sizes="48px"
                loading="lazy"
                style={{
                  width: '48px', height: '48px', borderRadius: '50%',
                  objectFit: 'contain', border: '1px solid var(--border-color)',
                  background: 'var(--bg-tertiary)',
                }}
              />
            ) : (
              <div style={{
                width: '48px', height: '48px', borderRadius: '50%',
                background: `hsl(${(job.employer || '').charCodeAt(0) * 7 % 360}, 40%, 50%)`,
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '18px', fontWeight: 700,
              }}>
                {(job.employer || '?')[0].toUpperCase()}
              </div>
            )}
            {job.isVerifiedEmployer && (
              <div style={{
                position: 'absolute', bottom: '-2px', right: '-2px',
                background: '#fff', borderRadius: '50%', width: '16px', height: '16px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}>
                <BadgeCheck size={16} fill="#1d9bf0" color="#ffffff" style={{ margin: 0, padding: 0 }} />
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
            {/* Company · Location. Inline on one line so the row reads
                "Sol Mental Health · Washington, DC". Both halves truncate
                with ellipsis if they overflow the available width — the
                middle-dot separator only renders when we actually have a
                location to show. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '0 0 8px', minWidth: 0 }}>
              <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1, minWidth: 0 }}>
                {job.employer}
              </p>
              {shortLocation && (
                <>
                  <span aria-hidden style={{ color: 'var(--text-tertiary, #8A9BA6)', fontSize: '14px', flexShrink: 0 }}>·</span>
                  <p style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1, minWidth: 0 }}>
                    <MapPin size={12} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                    {shortLocation}
                  </p>
                </>
              )}
            </div>

            {/* Salary + Type + Mode + Experience. Location moved up beside
                the company name (above), so it's no longer a chip here. */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              {salaryDisplay && (
                <Badge variant="salary" size="sm">
                  {salaryDisplay.startsWith('$') ? salaryDisplay : `$${salaryDisplay}`}
                </Badge>
              )}
              {job.jobType && <Badge variant="outline" size="sm">{job.jobType}</Badge>}
              {displayMode && <Badge variant="outline" size="sm">{displayMode}</Badge>}
              {(() => {
                const label = effectiveExperienceLabel(job);
                if (!label) return null;
                return (
                  <Badge variant={effectiveNewGradFriendly(job) ? 'success' : 'outline'} size="sm">
                    {label}
                  </Badge>
                );
              })()}
            </div>

            {/* Status Badges — "New" badge intentionally removed (was visual
                noise at our scale; recency is already implied by the
                "Posted X ago" label). The Applied badge stays as a clear
                state signal for the candidate. */}
            {applied && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, background: '#A7F3D0', color: '#065F46', border: '1px solid rgba(255,255,255,0.5)', boxShadow: '4px 4px 10px rgba(16,185,129,0.12), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)' }}>✓ Applied</span>
              </div>
            )}


          </div>

          {/* Right: Save + View Job */}
          <div className="jc-list-actions" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', flexShrink: 0 }}>
            <div className="jc-list-action-row" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {viewed && !applied && <span title="Viewed" className="flex"><Eye size={18} color="var(--text-tertiary)" /></span>}
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
              {easyApply ? (
                <button
                  className="jc-easy-apply-btn"
                  onClick={handleEasyApplyClick}
                  style={{
                    padding: '8px 16px', borderRadius: '14px',
                    fontSize: '13px', fontWeight: 700, color: '#fff',
                    background: 'linear-gradient(135deg, #2DD4BF, #0D9488)',
                    whiteSpace: 'nowrap',
                    border: '1px solid rgba(255,255,255,0.3)',
                    boxShadow: '4px 4px 10px rgba(13,148,136,0.25), -2px -2px 6px rgba(255,255,255,0.3), inset 2px 2px 4px rgba(255,255,255,0.25), inset -1px -1px 2px rgba(0,0,0,0.08)',
                    cursor: 'pointer', transition: 'all 0.2s ease',
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                  }}
                >
                  <Zap size={13} fill="currentColor" />
                  Easy Apply
                </button>
              ) : job.applyLink && (
                <button
                  className={directApply ? "jc-direct-apply-btn" : "jc-apply-btn"}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(job.applyLink!, '_blank', 'noopener,noreferrer'); }}
                  style={directApply ? {
                    padding: '8px 16px', borderRadius: '14px',
                    fontSize: '13px', fontWeight: 600, color: '#1E40AF',
                    backgroundColor: '#BFDBFE', whiteSpace: 'nowrap',
                    border: '1px solid rgba(255,255,255,0.5)',
                    boxShadow: '4px 4px 10px rgba(59,130,246,0.12), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)',
                    cursor: 'pointer', transition: 'all 0.2s ease',
                  } : {
                    padding: '8px 16px', borderRadius: '14px',
                    fontSize: '13px', fontWeight: 600, color: '#fff',
                    backgroundColor: '#0d9488', whiteSpace: 'nowrap',
                    border: '1px solid rgba(255,255,255,0.3)',
                    boxShadow: '4px 4px 10px rgba(13,148,136,0.20), -2px -2px 6px rgba(255,255,255,0.2), inset 2px 2px 4px rgba(255,255,255,0.2), inset -1px -1px 2px rgba(0,0,0,0.06)',
                    cursor: 'pointer', transition: 'all 0.2s ease',
                  }}
                >
                  {directApply ? 'Direct Apply' : 'Apply'}
                </button>
              )}
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: 0 }}>{freshness}</p>
          </div>
        </div>

        {canMessageEmployer && (
          <MessageEmployerModal
            isOpen={showMessageModal}
            jobId={job.id}
            jobTitle={job.title}
            employerName={job.employer}
            onClose={() => setShowMessageModal(false)}
          />
        )}

        <style>{`
          .jc-save-btn:hover {
            color: var(--color-primary) !important;
            transform: translateY(-1px);
            box-shadow: 6px 6px 14px rgba(0,0,0,0.08), -3px -3px 8px rgba(255,255,255,0.9), inset 2px 2px 5px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03) !important;
          }
          .jc-apply-btn:hover {
            background-color: #0F766E !important;
            transform: translateY(-2px);
            box-shadow: 6px 6px 16px rgba(13,148,136,0.30), -3px -3px 8px rgba(255,255,255,0.3), inset 2px 2px 4px rgba(255,255,255,0.25), inset -1px -1px 2px rgba(0,0,0,0.08) !important;
          }
          .jc-apply-btn:active {
            transform: translateY(1px);
            box-shadow: inset 3px 3px 6px rgba(0,0,0,0.15), inset -2px -2px 4px rgba(255,255,255,0.1) !important;
          }
        `}</style>
      </Link>
    );
  }

  // Grid view - default vertical card layout
  return (
    <Link href={jobUrl} aria-label={cardAriaLabel} className="block touch-manipulation h-full" onClick={handleCardClick}>
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
          {/* Company Avatar — see grid-view block above for rationale on
              using next/image; same logic applies to the list-view 44px
              variant. */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            {job.companyLogoUrl ? (
              <Image
                src={job.companyLogoUrl}
                alt={`${job.employer} logo`}
                width={44}
                height={44}
                quality={90}
                sizes="44px"
                loading="lazy"
                style={{
                  width: '44px', height: '44px', borderRadius: '50%',
                  objectFit: 'contain', border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)',
                }}
              />
            ) : (
              <div style={{
                width: '44px', height: '44px', borderRadius: '50%',
                background: `hsl(${(job.employer || '').charCodeAt(0) * 7 % 360}, 40%, 50%)`,
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '17px', fontWeight: 700,
              }}>
                {(job.employer || '?')[0].toUpperCase()}
              </div>
            )}
            {job.isVerifiedEmployer && (
              <div style={{
                position: 'absolute', bottom: '-2px', right: '-2px',
                background: '#fff', borderRadius: '50%', width: '16px', height: '16px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}>
                <BadgeCheck size={16} fill="#1d9bf0" color="#ffffff" style={{ margin: 0, padding: 0 }} />
              </div>
            )}
          </div>

          {/* Title + Company */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* paddingRight reserves space for the absolutely-positioned
                Save/Mail icon stack so the title doesn't run under it.
                Salary pill moved to the chip row below 2026-05-22, so this
                only needs to clear the icons (~30-60px) instead of ~110px. */}
            <h3 style={{
              fontSize: '18px', fontWeight: 700,
              fontFamily: 'var(--font-lora), Georgia, serif',
              color: 'var(--text-primary)',
              margin: '0 0 3px', lineHeight: 1.3,
              paddingRight: '70px',
              overflow: 'hidden', textOverflow: 'ellipsis',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
            }}>
              {job.title}
            </h3>
            {/* Company on line 1, Location on line 2. Inline-with-dot
                pattern fought for width and produced ugly mid-token cuts
                ("Carson City, N\"") on cards with long company names.
                Stacking matches LinkedIn / Indeed and keeps each piece
                cleanly truncatable on its own line. paddingRight reserves
                space for the absolute Save/Mail icons. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, paddingRight: '50px' }}>
              <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {job.employer}
              </p>
              {shortLocation && (
                <p style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                  <MapPin size={12} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{shortLocation}</span>
                </p>
              )}
            </div>
          </div>

          {/* Save + Message icons — top-right corner. Salary moved out of
              this stack and into the chip row below so it can never sit
              over the company/location row when the title wraps to one
              line (caused truncation on single-line-title cards). */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0, flexShrink: 0, position: 'absolute', top: '14px', right: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginTop: '-8px', marginBottom: '-6px' }}>
              {viewed && !applied && <span title="Viewed" className="flex"><Eye size={18} color="var(--text-tertiary)" /></span>}
              <button
                onClick={handleSaveClick}
                className="jc-save-btn jc-icon-btn"
                style={{
                  // Tightened 2026-05-16 — vertical padding stays 13px to
                  // keep height at 44px (WCAG 2.5.8 touch target). Horizontal
                  // padding compressed to 6px so the icons sit close.
                  padding: '13px 6px', borderRadius: '50%',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  color: saved ? 'var(--color-primary)' : 'var(--text-tertiary)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                aria-label={saved ? 'Unsave job' : 'Save job'}
                title={saved ? 'Unsave job' : 'Save job'}
              >
                <Bookmark size={18} fill={saved ? 'currentColor' : 'none'} />
              </button>
              {canMessageEmployer && (
                <button
                  onClick={handleMessageClick}
                  className="jc-message-btn jc-icon-btn"
                  style={{
                    padding: '13px 6px', borderRadius: '50%',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-tertiary)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  aria-label={`Message ${job.employer}`}
                  title={`Message ${job.employer}`}
                >
                  <Mail size={18} strokeWidth={2} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Row 3: Salary + Type + Mode + Experience + Status Badges. Salary
            leads so it stays the most prominent chip even though it's no
            longer floating in the top-right corner. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
          {salaryDisplay && (
            <Badge variant="salary" size="sm">
              {salaryDisplay.startsWith('$') ? salaryDisplay : `$${salaryDisplay}`}
            </Badge>
          )}
          {job.jobType && <Badge variant="outline" size="sm">{job.jobType}</Badge>}
          {displayMode && <Badge variant="outline" size="sm">{displayMode}</Badge>}
          {(() => {
            const label = effectiveExperienceLabel(job);
            if (!label) return null;
            return (
              <Badge variant={effectiveNewGradFriendly(job) ? 'success' : 'outline'} size="sm">
                {label}
              </Badge>
            );
          })()}
          {/* "New" badge intentionally removed — recency is already implied
              by the "Posted X ago" label and was visual noise at our scale. */}
          {applied && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              padding: '5px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
              background: '#A7F3D0', color: '#065F46', border: '1px solid rgba(255,255,255,0.5)',
              boxShadow: '4px 4px 10px rgba(16,185,129,0.12), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)',
            }}>✓ Applied</span>
          )}
        </div>



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
            {easyApply ? (
              <button
                className="jc-easy-apply-btn"
                onClick={handleEasyApplyClick}
                style={{
                  fontSize: '13px', fontWeight: 700, color: '#fff',
                  background: 'linear-gradient(135deg, #2DD4BF, #0D9488)',
                  padding: '7px 16px', borderRadius: '14px',
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  border: '1px solid rgba(255,255,255,0.3)',
                  boxShadow: '4px 4px 10px rgba(13,148,136,0.25), -2px -2px 6px rgba(255,255,255,0.3), inset 2px 2px 4px rgba(255,255,255,0.25), inset -1px -1px 2px rgba(0,0,0,0.08)',
                  cursor: 'pointer', transition: 'all 0.2s ease',
                }}
              >
                <Zap size={13} fill="currentColor" />
                Easy Apply
              </button>
            ) : job.applyLink && (
              <button
                className={directApply ? "jc-direct-apply-btn" : "jc-apply-btn"}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(job.applyLink!, '_blank', 'noopener,noreferrer'); }}
                style={directApply ? {
                  fontSize: '13px', fontWeight: 700, color: '#1E40AF',
                  backgroundColor: '#BFDBFE',
                  padding: '7px 16px', borderRadius: '14px',
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  border: '1px solid rgba(255,255,255,0.5)',
                  boxShadow: '4px 4px 10px rgba(59,130,246,0.12), -2px -2px 6px rgba(255,255,255,0.8), inset 2px 2px 4px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.03)',
                  cursor: 'pointer', transition: 'all 0.2s ease',
                } : {
                  fontSize: '13px', fontWeight: 700, color: '#fff',
                  backgroundColor: '#0d9488',
                  padding: '7px 16px', borderRadius: '14px',
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  border: '1px solid rgba(255,255,255,0.3)',
                  boxShadow: '4px 4px 10px rgba(13,148,136,0.20), -2px -2px 6px rgba(255,255,255,0.2), inset 2px 2px 4px rgba(255,255,255,0.2), inset -1px -1px 2px rgba(0,0,0,0.06)',
                  cursor: 'pointer', transition: 'all 0.2s ease',
                }}
              >
                {directApply ? 'Direct Apply' : 'Apply'}
              </button>
            )}
          </div>
        </div>

        {canMessageEmployer && (
          <MessageEmployerModal
            isOpen={showMessageModal}
            jobId={job.id}
            jobTitle={job.title}
            employerName={job.employer}
            onClose={() => setShowMessageModal(false)}
          />
        )}
      </div>

      <style>{`
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
        .jc-apply-btn:hover {
          background-color: #0F766E !important;
          transform: translateY(-2px);
          box-shadow: 6px 6px 16px rgba(13,148,136,0.30), -3px -3px 8px rgba(255,255,255,0.3), inset 2px 2px 4px rgba(255,255,255,0.25), inset -1px -1px 2px rgba(0,0,0,0.08) !important;
        }
        .jc-easy-apply-btn:hover {
          background: linear-gradient(135deg, #14B8A6, #0F766E) !important;
          transform: translateY(-2px);
          box-shadow: 6px 6px 16px rgba(13,148,136,0.35), -3px -3px 8px rgba(255,255,255,0.3), inset 2px 2px 4px rgba(255,255,255,0.3), inset -1px -1px 2px rgba(0,0,0,0.08) !important;
        }
        .jc-easy-apply-btn:active {
          transform: translateY(1px);
          box-shadow: inset 3px 3px 6px rgba(0,0,0,0.15), inset -2px -2px 4px rgba(255,255,255,0.15) !important;
        }
        .jc-direct-apply-btn:hover {
          background-color: #93C5FD !important;
          transform: translateY(-2px);
          box-shadow: 6px 6px 16px rgba(59,130,246,0.20), -3px -3px 8px rgba(255,255,255,0.6), inset 2px 2px 4px rgba(255,255,255,0.5), inset -1px -1px 2px rgba(0,0,0,0.05) !important;
        }
        .jc-direct-apply-btn:active {
          transform: translateY(1px);
          box-shadow: inset 3px 3px 6px rgba(0,0,0,0.1), inset -2px -2px 4px rgba(255,255,255,0.1) !important;
        }
        .jc-apply-btn:active {
          transform: translateY(1px);
          box-shadow: inset 3px 3px 6px rgba(0,0,0,0.15), inset -2px -2px 4px rgba(255,255,255,0.1) !important;
        }
      `}</style>
    </Link>
  );
}

// Memoize component to prevent unnecessary re-renders
export default React.memo(JobCard);
