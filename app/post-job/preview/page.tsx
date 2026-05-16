'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Briefcase, Monitor, ExternalLink, ChevronLeft, ChevronRight, Loader2, Check, CheckCircle } from 'lucide-react';
import { formatSalary } from '@/lib/utils';
import { sanitizeHtmlContent } from '@/lib/sanitize';
import { config } from '@/lib/config';
import { trackFreePostLimitHit } from '@/lib/analytics';
import JobCard from '@/components/JobCard';
import type { Job } from '@/lib/types';
import { deriveExperienceLabel } from '@/lib/experience-label';

interface JobFormData {
  title: string;
  companyName: string;
  companyWebsite?: string;
  companyDescription?: string;
  location: string;
  mode?: string;
  jobType?: string;
  description: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryPeriod?: string;
  applyUrl?: string;
  applyOnPlatform?: boolean;
  contactEmail: string;
  pricingTier: 'pro';
  benefits?: string[];
  setting?: string;
  population?: string;
  companyLogoUrl?: string;
  // Phase 1 experience picker — see app/post-job/page.tsx Step 2.
  minYearsExperience?: number;
  maxYearsExperience?: number | null;
  newGradFriendly?: boolean;
  experienceQualifier?: string;
  screeningQuestions?: { text: string; type: string; options?: string[]; required?: boolean; knockout?: boolean; knockoutAnswer?: string }[];
}

interface QuotaStatus {
  eligible: boolean;
  willBeFree?: boolean;
  remaining?: number;
  limit?: number;
  durationDays?: number;
  paidDurationDays?: number;
  freeDurationDays?: number;
  reason?: string;
}

/* ═══ Clay Tokens ═══ */
const cardBase: React.CSSProperties = {
  background: '#FFFFFF',
  borderRadius: '20px',
  border: '1px solid rgba(0,0,0,0.06)',
  boxShadow: '6px 6px 16px rgba(0,0,0,0.06), -3px -3px 10px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6), inset -1px -1px 1px rgba(0,0,0,0.02)',
};

const clayBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '8px',
  padding: '14px 28px', borderRadius: '14px',
  fontSize: '14px', fontWeight: 600,
  border: '1px solid rgba(255,255,255,0.5)',
  boxShadow: '4px 4px 10px rgba(0,0,0,0.06), -2px -2px 6px rgba(255,255,255,0.7), inset 1px 1px 2px rgba(255,255,255,0.6)',
  cursor: 'pointer', transition: 'all 0.2s ease',
};

const clayPill: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '4px',
  padding: '5px 12px', borderRadius: '10px',
  fontSize: '12px', fontWeight: 500,
  boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.04), inset -1px -1px 2px rgba(255,255,255,0.4)',
};

export default function PreviewPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<JobFormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotaStatus, setQuotaStatus] = useState<QuotaStatus | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('jobFormData');
    if (!stored) { router.push('/post-job'); return; }
    try {
      const data = JSON.parse(stored) as JobFormData;
      try {
        const storedQuestions = localStorage.getItem('jobScreeningQuestions');
        if (storedQuestions) data.screeningQuestions = JSON.parse(storedQuestions);
      } catch { /* ignore */ }
      setFormData(data);
    } catch (error) {
      console.error('Error parsing form data:', error);
      router.push('/post-job');
      return;
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/employer/free-quota-status');
        if (!res.ok) return;
        const data = (await res.json()) as QuotaStatus;
        if (!cancelled) setQuotaStatus(data);
      } catch {
        /* leave quotaStatus null — falls back to neutral copy */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleBack = () => { router.push('/post-job'); };

  const handleContinue = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Always try free posting first — API checks if employer has free posts remaining
      if (!formData) return;
      const response = await fetch('/api/jobs/post-free', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title,
          employer: formData.companyName,
          location: formData.location,
          mode: formData.mode,
          jobType: formData.jobType,
          description: formData.description,
          applyLink: formData.applyOnPlatform ? null : formData.applyUrl,
          applyOnPlatform: formData.applyOnPlatform || false,
          contactEmail: formData.contactEmail,
          minSalary: formData.salaryMin,
          maxSalary: formData.salaryMax,
          salaryPeriod: formData.salaryPeriod || 'annual',
          companyWebsite: formData.companyWebsite,
          pricing: 'pro',
          benefits: formData.benefits,
          setting: formData.setting,
          population: formData.population,
          companyLogoUrl: formData.companyLogoUrl,
          minYearsExperience: formData.minYearsExperience ?? null,
          maxYearsExperience: formData.maxYearsExperience ?? null,
          newGradFriendly: formData.newGradFriendly ?? false,
          experienceQualifier: formData.experienceQualifier?.trim() || null,
          screeningQuestions: formData.screeningQuestions || [],
        }),
      });
      const result = await response.json();
      if (result.success) {
        localStorage.removeItem('jobFormData');
        localStorage.removeItem('jobScreeningQuestions');
        // Wipe the server-side draft so it doesn't show up in the
        // employer dashboard's "Continue an unfinished post" list
        // after the job is published. Best-effort.
        try {
          await fetch('/api/job-draft', { method: 'DELETE' });
        } catch {
          // Non-fatal — the dashboard list is a UX nicety, not data
          // integrity; a stale draft can be cleared from the dashboard.
        }
        router.push('/success?free=true');
      } else if (result.requiresPayment) {
        // Free posts exhausted — fire P7 limit-hit event then redirect to checkout
        const domain = (formData.contactEmail || '').split('@')[1] || 'unknown';
        trackFreePostLimitHit(
          domain,
          result.freePostsUsed ?? config.freePostsPerEmail,
          result.freePostsLimit ?? config.freePostsPerEmail
        );
        router.push('/post-job/checkout');
      } else {
        setError(result.error || 'Failed to post job');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (loading || !formData) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '50%',
          border: '3px solid #E5E7EB', borderTopColor: '#0D9488',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const salary = formatSalary(formData.salaryMin, formData.salaryMax, formData.salaryPeriod);
  const isFeatured = true; // All posts are featured in single-tier model

  // Build a Job-shaped object from form data so we can render the REAL <JobCard>
  // for the listing-card preview. This guarantees pixel parity with what the
  // candidate will see — no hand-rolled re-implementation that drifts.
  // ID is a placeholder (`preview`) since the job doesn't exist yet; the card's
  // save/applied/viewed hooks read from localStorage by ID and will simply
  // return false. The wrapping <div pointerEvents:none> below blocks navigation
  // on the inner <Link>.
  const previewJob: Job = {
    id: 'preview',
    title: formData.title || 'Untitled Job',
    slug: 'preview',
    employer: formData.companyName || 'Your Company',
    location: formData.location || 'Remote',
    jobType: formData.jobType || null,
    mode: formData.mode || null,
    experienceLevel: null,
    minYearsExperience: formData.minYearsExperience ?? null,
    maxYearsExperience: formData.maxYearsExperience ?? null,
    newGradFriendly: formData.newGradFriendly ?? false,
    experienceQualifier: formData.experienceQualifier?.trim() || null,
    experienceLabel: deriveExperienceLabel({
      minYearsExperience: formData.minYearsExperience ?? null,
      maxYearsExperience: formData.maxYearsExperience ?? null,
      newGradFriendly: formData.newGradFriendly ?? false,
    }),
    description: formData.description || '',
    descriptionSummary: null,
    salaryRange: null,
    minSalary: formData.salaryMin ?? null,
    maxSalary: formData.salaryMax ?? null,
    salaryPeriod: formData.salaryPeriod || null,
    city: null,
    state: null,
    stateCode: null,
    country: 'US',
    isRemote: formData.mode === 'Remote',
    isHybrid: formData.mode === 'Hybrid',
    normalizedMinSalary: formData.salaryMin ?? null,
    normalizedMaxSalary: formData.salaryMax ?? null,
    salaryIsEstimated: false,
    salaryConfidence: null,
    displaySalary: salary,
    applyLink: formData.applyOnPlatform ? null : (formData.applyUrl || null),
    applyOnPlatform: !!formData.applyOnPlatform,
    isFeatured,
    isPublished: true,
    isVerifiedEmployer: true,
    sourceType: 'employer',
    sourceProvider: null,
    sourceSite: null,
    externalId: null,
    originalPostedAt: new Date(),
    viewCount: 0,
    applyClickCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: null,
    companyId: null,
    companyLogoUrl: formData.companyLogoUrl || null,
  };

  const willBeFree = quotaStatus?.eligible === true && quotaStatus.willBeFree === true;
  const packageHeadline = willBeFree
    ? `Free trial post — live for ${quotaStatus?.freeDurationDays ?? config.freeDurationDays} days`
    : quotaStatus?.eligible === true
      ? `Live for ${quotaStatus?.paidDurationDays ?? config.durationDays} days`
      : `Live for ${config.durationDays} days`;
  const packageDetails = `Featured badge · Top placement · ${config.limits.candidateUnlocksPerPosting} candidate unlocks · ${config.limits.inmailsPerPosting} InMails · Applicant analytics`;

  return (
    <div style={{ background: '#F5F0EB', minHeight: '100vh', padding: '0 16px 80px' }}>
      <div style={{ maxWidth: '780px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: '20px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'var(--font-lora), Georgia, serif', color: '#1A2E35', margin: '0 0 4px' }}>
            Preview Your Job Post
          </h1>
          <p style={{ fontSize: '14px', color: '#8A9BA6', margin: 0 }}>Review how your job will appear to candidates</p>
        </div>

        {/* Section 1: Card Preview — uses the REAL <JobCard> component so this
            is pixel-identical to what candidates see in jobs listings.
            pointerEvents:none disables the card's <Link>/buttons in preview. */}
        <div style={{ ...cardBase, padding: '24px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', margin: 0 }}>How it appears in listings</h2>
            <span style={{ ...clayPill, background: '#F5F6F8', color: '#B0BEC5', fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px' }}>PREVIEW</span>
          </div>

          <div style={{
            padding: '20px', borderRadius: '16px',
            background: '#F5F0EB',
            border: '2px dashed rgba(0,0,0,0.08)',
            overflow: 'hidden',
          }}>
            <div style={{ pointerEvents: 'none' }}>
              <JobCard job={previewJob} viewMode="grid" />
            </div>
          </div>
        </div>

        {/* Section 2: Job detail page — mirrors `app/jobs/[slug]/page.tsx` main column.
            Keep this in visual sync when the detail page changes. The chrome is
            identical (typography, logo size, badge styles, salary color, "About
            this role" card) so what employers see here is what candidates will see. */}
        <div style={{ ...cardBase, padding: '24px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', margin: 0 }}>Job detail page</h2>
            <span style={{ ...clayPill, background: '#F5F6F8', color: '#B0BEC5', fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px' }}>PREVIEW</span>
          </div>

          {/* Faux-window framed exactly like the live page background */}
          <div style={{
            borderRadius: '16px',
            backgroundColor: '#F5F0EB', // matches live page (and navbar)
            border: '2px dashed rgba(0,0,0,0.08)',
            padding: '20px',
            overflow: 'hidden',
          }}>
            {/* ─── Header card ─── */}
            <div style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid rgba(0,0,0,0.06)',
              borderRadius: '20px',
              boxShadow: '6px 6px 12px rgba(0,0,0,0.06), -2px -2px 8px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)',
              padding: '24px 24px 28px',
              marginBottom: '20px',
              position: 'relative',
            }}>
              {/* Title */}
              <h1 style={{
                fontSize: 'clamp(24px, 4vw, 36px)',
                fontWeight: 800,
                fontFamily: 'var(--font-lora), Georgia, serif',
                color: '#1A2E35',
                marginBottom: '16px',
                marginTop: 0,
                lineHeight: 1.2,
                paddingRight: '40px',
              }}>{formData.title}</h1>

              {/* Company Info Row: Logo + Name + Location */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
                {formData.companyLogoUrl && (
                  <img
                    src={formData.companyLogoUrl}
                    alt={`${formData.companyName} logo`}
                    style={{
                      width: '52px', height: '52px',
                      borderRadius: '14px',
                      objectFit: 'contain',
                      border: '1px solid rgba(0,0,0,0.06)',
                      flexShrink: 0,
                      boxShadow: '2px 2px 6px rgba(0,0,0,0.05)',
                    }}
                  />
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '20px', fontWeight: 600, color: '#5A6B73' }}>{formData.companyName}</span>
                  <span style={{ color: '#B0BEC5', fontSize: '18px', lineHeight: 1 }}>·</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '14px', color: '#5A6B73' }}>
                    <MapPin size={14} style={{ color: '#0D9488', flexShrink: 0 }} />
                    {formData.location}
                  </span>
                </div>
              </div>

              {/* Badges Row */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  padding: '4px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                  background: '#FEF3C7', color: '#92400E',
                }}>
                  ⚡ Featured
                </span>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  padding: '4px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                  background: '#CCFBF1', color: '#0F766E',
                }}>
                  <CheckCircle size={13} /> Verified Employer
                </span>
                {formData.jobType && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                    backgroundColor: '#F3F4F6', color: '#374151',
                    border: '1px solid rgba(0,0,0,0.08)',
                  }}>
                    <Briefcase size={12} /> {formData.jobType}
                  </span>
                )}
                {formData.mode && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                    backgroundColor: '#F3F4F6', color: '#374151',
                    border: '1px solid rgba(0,0,0,0.08)',
                  }}>
                    <Monitor size={12} /> {formData.mode}
                  </span>
                )}
              </div>

              {/* Salary */}
              {salary && (
                <p style={{
                  fontSize: 'clamp(20px, 4vw, 30px)',
                  fontWeight: 800,
                  color: '#1d4ed8',
                  margin: 0,
                }}>{salary}</p>
              )}
            </div>

            {/* ─── Description card ─── */}
            <div style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '20px',
              border: '1px solid rgba(0,0,0,0.06)',
              boxShadow: '6px 6px 12px rgba(0,0,0,0.06), -2px -2px 8px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)',
              padding: '24px 28px',
              marginBottom: '20px',
              overflow: 'hidden',
            }}>
              <h2 style={{
                fontSize: '22px',
                fontWeight: 700,
                fontFamily: 'var(--font-lora), Georgia, serif',
                color: '#1A2E35',
                marginBottom: '16px',
                marginTop: 0,
              }}>About this role</h2>

              <div className="prose prose-gray max-w-none">
                <div
                  className="job-description-html"
                  style={{ color: '#4A5568', wordBreak: 'break-word', overflowWrap: 'anywhere', overflow: 'hidden' }}
                  dangerouslySetInnerHTML={{ __html: sanitizeHtmlContent(formData.description) }}
                />
              </div>

              {formData.benefits && formData.benefits.length > 0 && (
                <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                  <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#1A2E35', margin: '0 0 10px' }}>Benefits & Perks</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {formData.benefits.map((b) => (
                      <span key={b} style={{ ...clayPill, background: '#D1FAE5', color: '#059669', fontSize: '12px' }}>✓ {b}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ─── Apply card (mimics sidebar on detail page) ─── */}
            <div style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '24px',
              border: '1px solid rgba(255,255,255,0.6)',
              boxShadow: '8px 8px 20px rgba(0,0,0,0.08), -4px -4px 12px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.6), inset -1px -1px 2px rgba(0,0,0,0.02)',
              padding: '24px',
            }}>
              {formData.applyOnPlatform ? (
                <div>
                  <div style={{
                    ...clayBtn,
                    width: '100%', justifyContent: 'center',
                    background: 'linear-gradient(145deg, #0D9488, #10B981)', color: '#fff',
                    boxShadow: '4px 4px 10px rgba(13,148,136,0.2), inset 1px 1px 2px rgba(255,255,255,0.15)',
                  }}>Apply Now</div>
                  <div style={{
                    marginTop: '12px', padding: '10px 14px', borderRadius: '12px',
                    background: '#F0FDFA', border: '1px solid #99F6E4',
                    display: 'flex', alignItems: 'flex-start', gap: '8px',
                  }}>
                    <span style={{ color: '#0D9488', fontSize: '14px' }}>✅</span>
                    <p style={{ fontSize: '12px', color: '#115E59', margin: 0, lineHeight: 1.5 }}>
                      Candidates apply directly on this platform. Applications appear in your dashboard.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <a href={formData.applyUrl} target="_blank" rel="noopener noreferrer" style={{
                    ...clayBtn,
                    width: '100%', justifyContent: 'center',
                    background: 'linear-gradient(145deg, #0D9488, #10B981)', color: '#fff',
                    boxShadow: '4px 4px 10px rgba(13,148,136,0.2), inset 1px 1px 2px rgba(255,255,255,0.15)',
                    textDecoration: 'none',
                  }}>
                    Apply Now <ExternalLink size={16} />
                  </a>
                  <p style={{ marginTop: '8px', fontSize: '11px', color: '#B0BEC5', textAlign: 'center' }}>Opens in a new tab — verify your link works.</p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Section 3: Features Summary */}
        <div style={{ ...cardBase, padding: '20px', marginBottom: '24px', background: '#F0FDFA', border: '1px solid #99F6E4' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '12px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(145deg, #0D9488, #10B981)',
              boxShadow: '3px 3px 8px rgba(13,148,136,0.2)',
            }}>
              <Check size={18} color="#fff" />
            </div>
            <div>
              <p style={{ fontSize: '15px', fontWeight: 700, color: '#1A2E35', margin: 0 }}>{packageHeadline}</p>
              <p style={{ fontSize: '12px', color: '#6B7F8A', margin: '2px 0 0' }}>{packageDetails}</p>
              {willBeFree && typeof quotaStatus?.remaining === 'number' && (
                <p style={{ fontSize: '11px', color: '#0D9488', margin: '4px 0 0', fontWeight: 600 }}>
                  {quotaStatus.remaining} of {quotaStatus.limit} free posts remaining for your domain
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ ...cardBase, padding: '14px 18px', marginBottom: '16px', background: '#FEF2F2', border: '1px solid #FECACA' }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#DC2626', margin: 0 }}>{error}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{
          ...cardBase, padding: '16px 20px',
          display: 'flex', flexDirection: 'row', gap: '12px',
          position: 'sticky', bottom: '16px',
        }}>
          <button onClick={handleBack} disabled={isLoading} className="preview-btn" style={{
            ...clayBtn, flex: 1, justifyContent: 'center',
            background: '#F5F6F8', color: '#6B7F8A',
          }}>
            <ChevronLeft size={16} /> Back to Edit
          </button>
          <button onClick={handleContinue} disabled={isLoading} className="preview-btn-primary" style={{
            ...clayBtn, flex: 1, justifyContent: 'center',
            background: 'linear-gradient(145deg, #0D9488, #10B981)', color: '#fff',
            boxShadow: '4px 4px 12px rgba(13,148,136,0.25), inset 1px 1px 2px rgba(255,255,255,0.15)',
            opacity: isLoading ? 0.6 : 1,
          }}>
            {isLoading ? (
              <><Loader2 size={16} className="animate-spin" /> Processing...</>
            ) : (
              <>Looks Good — Post Job <ChevronRight size={16} /></>
            )}
          </button>
        </div>
      </div>

      <style>{`
        .preview-btn:hover { transform: translateY(-1px); }
        .preview-btn-primary:hover { transform: translateY(-1px); box-shadow: 6px 6px 16px rgba(13,148,136,0.3), inset 1px 1px 2px rgba(255,255,255,0.15) !important; }
      `}</style>
    </div>
  );
}
