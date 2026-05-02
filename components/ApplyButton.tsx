'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { ExternalLink, LogIn, Zap } from 'lucide-react';
import useAppliedJobs from '@/lib/hooks/useAppliedJobs';

import InPlatformApplyForm from '@/components/InPlatformApplyForm';
import { trackJobApply, buildJobItem } from '@/lib/analytics';
import Link from 'next/link';

interface ApplyButtonProps {
  jobId: string;
  applyLink: string | null;
  jobTitle: string;
  isAuthenticated?: boolean;
  applyOnPlatform?: boolean;
  /**
   * Whether the job was posted directly by an employer on this platform
   * (vs aggregated from an external source). Used to label external
   * applies as "Direct Apply" instead of generic "Apply Now".
   */
  sourceType?: string | null;
}

function formatAppliedDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export default function ApplyButton({ jobId, applyLink, jobTitle, isAuthenticated = false, applyOnPlatform = false, sourceType = null }: ApplyButtonProps) {
  const { isApplied, markApplied, getAppliedDate } = useAppliedJobs();
  const searchParams = useSearchParams();
  const directApply = !applyOnPlatform && !!applyLink && sourceType === 'employer';

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showPlatformApply, setShowPlatformApply] = useState(false);
  const [serverApplied, setServerApplied] = useState<{ applied: boolean; appliedAt?: string; status?: string } | null>(null);
  const autoOpened = useRef(false);

  // Check server for existing application (for platform-apply jobs)
  useEffect(() => {
    if (!isAuthenticated || !applyOnPlatform) return;
    fetch(`/api/applications/check?jobId=${jobId}`)
      .then(r => r.json())
      .then(data => setServerApplied(data))
      .catch(() => { });
  }, [isAuthenticated, applyOnPlatform, jobId]);

  // Auto-open the apply popup when arriving via ?apply=1 from a job card.
  // Fires once per mount; only for in-platform jobs to avoid popping a new
  // tab on external links without a user gesture.
  useEffect(() => {
    if (autoOpened.current) return;
    if (searchParams?.get('apply') !== '1') return;
    if (!applyOnPlatform) return;
    autoOpened.current = true;
    if (!isAuthenticated) {
      setShowAuthModal(true);
    } else {
      setShowPlatformApply(true);
    }
  }, [searchParams, applyOnPlatform, isAuthenticated]);

  const applied = isApplied(jobId) || serverApplied?.applied;
  const appliedDate = getAppliedDate(jobId);

  // Fire the click-tracker. Used by both apply paths (external link + platform
  // form). Previously only external clicks were tracked, so platform-apply
  // jobs always reported 0 clicks even when they had real applications —
  // employer dashboards showed misleading "0 clicks · N applicants" rows.
  const fireApplyClick = () => {
    try {
      fetch(`/api/jobs/${jobId}/track-apply`, {
        method: 'POST',
      }).catch(() => { });
    } catch { }
  };

  const handleApply = () => {
    // If user is not authenticated, show auth gate
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }

    // Platform apply: show inline form (and bump the click counter — opening
    // the form is the equivalent intent-to-apply moment as clicking external)
    if (applyOnPlatform) {
      fireApplyClick();
      setShowPlatformApply(true);
      return;
    }

    // External apply: open link in new tab
    if (applyLink) {
      // Track apply click (fire and forget — internal analytics)
      fireApplyClick();

      // Track in Google Analytics (GA4 conversion event)
      trackJobApply(buildJobItem({ id: jobId, title: jobTitle }), 'external');

      // Open apply link in new tab
      window.open(applyLink, '_blank', 'noopener,noreferrer');

      // Mark as applied directly
      if (!isApplied(jobId)) {
        markApplied(jobId);

        // Also persist to database (fire-and-forget)
        try {
          fetch('/api/applications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId, sourceUrl: applyLink }),
          }).catch(() => { });
        } catch { }
      }
    }
  };

  const handlePlatformApplySuccess = () => {
    markApplied(jobId);
    setShowPlatformApply(false);
  };

  const handleSignIn = () => {
    const returnUrl = window.location.pathname;
    window.location.href = `/login?redirectTo=${encodeURIComponent(returnUrl)}`;
  };

  const handleSignUp = () => {
    const returnUrl = window.location.pathname;
    window.location.href = `/signup?redirectTo=${encodeURIComponent(returnUrl)}`;
  };

  return (
    <div className="flex flex-col w-full">
      {/* Already Applied Notice (server-verified for platform apply jobs) */}
      {applyOnPlatform && serverApplied?.applied && !showPlatformApply && (
        <div
          className="rounded-xl p-4 mb-3"
          style={{
            backgroundColor: 'rgba(34,197,94,0.08)',
            border: '1px solid rgba(34,197,94,0.2)',
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              You&apos;ve already applied
            </span>
            {serverApplied.status && serverApplied.status !== 'applied' && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium capitalize"
                style={{ backgroundColor: 'rgba(13,148,136,0.1)', color: '#0d9488' }}
              >
                {serverApplied.status}
              </span>
            )}
          </div>
          <p className="text-xs ml-7" style={{ color: 'var(--text-secondary)' }}>
            Applied on {serverApplied.appliedAt ? formatAppliedDate(new Date(serverApplied.appliedAt)) : 'recently'}.{' '}
            <Link href="/my-applications" className="underline font-medium" style={{ color: '#0d9488' }}>
              View your applications →
            </Link>
          </p>
        </div>
      )}

      {/* In-Platform Apply Modal — renders as overlay, doesn't replace button */}
      {showPlatformApply && (
        <InPlatformApplyForm
          jobId={jobId}
          jobTitle={jobTitle}
          onClose={() => setShowPlatformApply(false)}
          onSuccess={handlePlatformApplySuccess}
        />
      )}

      {showAuthModal ? (
        /* Inline Auth Gate — replaces button area when triggered */
        <div className="w-full">
          {/* Title */}
          <div className="flex items-center gap-2 mb-3">
            <LogIn size={18} style={{ color: '#0d9488' }} />
            <h3
              className="text-base font-bold"
              style={{ color: 'var(--text-primary)' }}
            >
              Sign in to apply
            </h3>
          </div>

          {/* Description */}
          <p
            className="text-sm mb-4 leading-relaxed"
            style={{ color: 'var(--text-secondary)' }}
          >
            Create a free account to apply and unlock these benefits:
          </p>

          {/* Benefits */}
          <div className="space-y-2 mb-4">
            {[
              { icon: '👀', text: 'Get noticed by employers hiring PMHNPs' },
              { icon: '💬', text: 'Receive direct messages from recruiters' },
              { icon: '⚡', text: 'Auto-fill applications with our Chrome extension (Coming soon)' },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-2.5">
                <span className="text-sm flex-shrink-0">{item.icon}</span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {item.text}
                </span>
              </div>
            ))}
          </div>

          {/* Buttons */}
          <div className="space-y-2">
            <button
              onClick={handleSignUp}
              className="w-full py-3 rounded-xl font-bold text-white transition-all text-sm"
              style={{
                background: '#0d9488',
                borderRadius: '16px',
                border: '1px solid rgba(255,255,255,0.3)',
                boxShadow: '6px 6px 16px rgba(13,148,136,0.30), -3px -3px 10px rgba(255,255,255,0.2), inset 2px 2px 4px rgba(255,255,255,0.25), inset -1px -1px 2px rgba(0,0,0,0.08)',
              }}
            >
              Create Free Account
            </button>
            <button
              onClick={handleSignIn}
              className="w-full py-2.5 rounded-xl font-semibold transition-all text-sm"
              style={{
                backgroundColor: '#EDF2EE',
                color: 'var(--text-primary)',
                border: '1px solid rgba(255,255,255,0.5)',
                borderRadius: '16px',
                boxShadow: '5px 5px 12px rgba(0,0,0,0.08), -3px -3px 8px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.6), inset -1px -1px 2px rgba(0,0,0,0.03)',
              }}
            >
              Sign In
            </button>
          </div>

          {/* Dismiss */}
          <button
            onClick={() => setShowAuthModal(false)}
            className="w-full text-center text-xs mt-3 py-1"
            style={{ color: 'var(--text-tertiary)' }}
          >
            ← Back
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <button
              onClick={handleApply}
              className="apply-btn inline-flex items-center justify-center gap-2 text-white px-8 py-4 lg:py-3 font-bold transition-all text-lg w-full lg:w-auto touch-manipulation"
              style={{
                minHeight: '52px',
                borderRadius: '18px',
                background: '#0d9488',
                border: '1px solid rgba(255,255,255,0.3)',
                boxShadow: '6px 6px 16px rgba(13,148,136,0.30), -3px -3px 10px rgba(255,255,255,0.2), inset 2px 2px 4px rgba(255,255,255,0.25), inset -1px -1px 2px rgba(0,0,0,0.08)',
              }}
            >
              {applyOnPlatform && <Zap size={18} fill="currentColor" />}
              {applied ? 'Apply Again' : applyOnPlatform ? 'Easy Apply' : directApply ? 'Direct Apply' : 'Apply Now'}
              {!applyOnPlatform && <ExternalLink size={20} />}
            </button>

            {applied && (
              <span className="hidden lg:inline-flex items-center gap-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-3 py-1.5 rounded-full text-sm font-medium">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 12.75l6 6 9-13.5"
                  />
                </svg>
                Applied
              </span>
            )}
          </div>

          {applied && appliedDate && (
            <p className="text-sm mt-2 text-center lg:text-left" style={{ color: 'var(--text-tertiary)' }}>
              Applied on {formatAppliedDate(appliedDate)}
            </p>
          )}

          {!applied && (
            <button
              onClick={() => markApplied(jobId)}
              className="text-sm hover:underline mt-2 text-center lg:text-left py-2 touch-manipulation"
              style={{ color: 'var(--text-tertiary)' }}
            >
              Already applied? Mark as applied
            </button>
          )}
        </>
      )}



      <style>{`
        .apply-btn:hover {
          transform: translateY(-3px);
          box-shadow: 8px 8px 20px rgba(13,148,136,0.35), -4px -4px 12px rgba(255,255,255,0.25), inset 2px 2px 5px rgba(255,255,255,0.3), inset -1px -1px 2px rgba(0,0,0,0.08) !important;
        }
        .apply-btn:active {
          transform: translateY(1px);
          box-shadow: 2px 2px 6px rgba(13,148,136,0.2), inset 3px 3px 6px rgba(0,0,0,0.12), inset -2px -2px 4px rgba(255,255,255,0.15) !important;
        }
      `}
      </style>
    </div>
  );
}

