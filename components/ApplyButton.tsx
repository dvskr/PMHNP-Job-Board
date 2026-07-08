'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ExternalLink, LogIn, Zap, Loader2 } from 'lucide-react';
import useAppliedJobs from '@/lib/hooks/useAppliedJobs';
import { shouldLabelDirectApply } from '@/lib/direct-apply';

import InPlatformApplyForm from '@/components/InPlatformApplyForm';
import CreateAlertForm from '@/components/CreateAlertForm';
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
  /** State + job type prefill the post-apply "similar jobs by email" alert offer. */
  state?: string | null;
  jobType?: string | null;
  /**
   * Compact mode for the mobile sticky bar: hides the secondary helper
   * rows (external-tab note, applied date, "mark as applied" link) so the
   * bar stays a single row and doesn't occlude the page content.
   */
  compact?: boolean;
}

// Cross-instance latch for the ?apply=1 auto-trigger. The detail page mounts
// TWO ApplyButtons (desktop sidebar + mobile sticky bar); each has a per-mount
// ref, but a viewport resize across the lg breakpoint while the auth check is
// in flight could otherwise fire the flow once per instance. Entries are
// removed on unmount so a later card-click navigation to the same job
// auto-triggers again.
const autoApplyHandled = new Set<string>();

function formatAppliedDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Derive a broad-but-relevant alert keyword from a job title. Uses the
 * segment before the first spaced delimiter so a title like
 * "Psychiatric Nurse Practitioner - Outpatient (Hybrid)" prefills the
 * alert with "Psychiatric Nurse Practitioner" instead of an over-narrow
 * exact-title match. Compound words ("Board-Certified") are unaffected
 * because they have no spaces around the dash.
 */
function deriveAlertKeyword(title: string): string {
  const head = title.split(/\s[-–—|:]\s|\s\(/)[0].trim();
  const keyword = head.length >= 4 ? head : title.trim();
  return keyword.slice(0, 60).trim();
}

export default function ApplyButton({ jobId, applyLink, jobTitle, isAuthenticated, applyOnPlatform = false, sourceType = null, state = null, jobType = null, compact = false }: ApplyButtonProps) {
  const { isApplied, markApplied, getAppliedDate } = useAppliedJobs();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Strip ?apply=1 from the URL once the auto-trigger has HANDLED it for an
  // authenticated user. Without this the param survives reloads/bookmarks and
  // every remount re-fires track-apply — inflating applyClickCount, the exact
  // metric the card→detail routing exists to keep honest. Deliberately NOT
  // called when the auth wall is shown: the param must survive the login/
  // signup round-trip so the apply flow resumes afterwards.
  const consumeApplyParam = () => {
    if (searchParams?.get('apply') !== '1') return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete('apply');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Auth is resolved CLIENT-SIDE so the parent job-detail page can stay
  // statically cached (ISR). The server no longer reads cookies to pass
  // isAuthenticated — if a caller still provides it we honor it as the initial
  // value, otherwise we detect via /api/auth/me on mount.
  //
  // Auth-race fix: the in-flight check is kept as a promise so handleApply
  // can AWAIT the real answer instead of branching on the `authed` default
  // (false). Before this, a fast click right after mount flashed the
  // sign-in wall at already-authenticated users. The wall must appear only
  // for genuinely-unauthenticated users.
  const [authed, setAuthed] = useState<boolean>(isAuthenticated ?? false);
  const [checkingAuth, setCheckingAuth] = useState(false);
  const authPromiseRef = useRef<Promise<boolean> | null>(
    typeof isAuthenticated === 'boolean' ? Promise.resolve(isAuthenticated) : null,
  );
  const authResolvedRef = useRef<boolean>(typeof isAuthenticated === 'boolean');
  useEffect(() => {
    if (typeof isAuthenticated === 'boolean') {
      authPromiseRef.current = Promise.resolve(isAuthenticated);
      authResolvedRef.current = true;
      return; // caller supplied it
    }
    let active = true;
    authPromiseRef.current = fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        const ok = !!d?.id;
        if (active) setAuthed(ok);
        return ok;
      })
      .catch(() => false)
      .finally(() => { authResolvedRef.current = true; });
    return () => { active = false; };
  }, [isAuthenticated]);
  // Use the shared detection so the detail-page button matches the
  // card's label exactly — both consider both `sourceType === 'employer'`
  // AND known ATS URL patterns (greenhouse, lever, workday, etc.).
  // Before this, a Greenhouse-aggregated job got "Direct Apply" on the
  // card but "Apply Now" on the detail page, which looked broken.
  const directApply = shouldLabelDirectApply({ applyLink, sourceType, applyOnPlatform });

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showPlatformApply, setShowPlatformApply] = useState(false);
  const [serverApplied, setServerApplied] = useState<{ applied: boolean; appliedAt?: string; status?: string } | null>(null);
  // Tracks whether the user just clicked an EXTERNAL apply link. Drives the
  // "Did you apply?" confirmation prompt — we don't auto-mark applied because
  // a click only signals intent, not a completed application. Returning to
  // the tab without applying (e.g. expired listing, changed mind) shouldn't
  // pollute /my-applications or the dashboard.
  const [awaitingApplyConfirm, setAwaitingApplyConfirm] = useState(false);
  // Success panel shown right after the user confirms "Yes, I applied";
  // offers an optional, dismissible job-alert prefilled from this job.
  const [postApplySuccess, setPostApplySuccess] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const autoOpened = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Check server for existing application (for platform-apply jobs)
  useEffect(() => {
    if (!authed || !applyOnPlatform) return;
    fetch(`/api/applications/check?jobId=${jobId}`)
      .then(r => r.json())
      .then(data => setServerApplied(data))
      .catch(() => { });
  }, [authed, applyOnPlatform, jobId]);

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

  // Opens the external application in a new tab (opener nulled to prevent
  // reverse tabnabbing) and fires the tracking calls. Returns false when a
  // popup blocker ate the open — callers skip the "Did you apply?" prompt
  // in that case so a blocked popup can't create a phantom confirm panel.
  // We open about:blank first and then navigate because `noopener` in the
  // features string makes window.open return null even on success, which
  // would make popup-block detection impossible.
  const openExternalApply = (): boolean => {
    if (!applyLink) return false;
    const win = window.open('', '_blank');
    if (!win) return false;
    win.opener = null;
    win.location.href = applyLink;
    fireApplyClick();
    trackJobApply(buildJobItem({ id: jobId, title: jobTitle }), 'external');
    return true;
  };

  // Auto-trigger the apply flow when arriving via ?apply=1 from a job card.
  // Awaits the auth check first so the wall only ever shows to genuinely-
  // unauthenticated users, then routes by job kind: platform jobs open the
  // inline form, external jobs open the employer link in a new tab (skipped
  // silently when a popup blocker intervenes — the user just taps Apply).
  //
  // Runs only in the instance that is actually visible: the detail page
  // mounts two ApplyButtons (desktop sidebar + mobile sticky bar), each
  // display:none'd at the other breakpoint. offsetParent is null inside
  // display:none, so the hidden twin skips and side effects (track-apply,
  // window.open) fire exactly once.
  useEffect(() => {
    if (autoOpened.current) return;
    if (searchParams?.get('apply') !== '1') return;
    if (rootRef.current && rootRef.current.offsetParent === null) return;
    if (autoApplyHandled.has(jobId)) return; // the twin instance already fired
    autoApplyHandled.add(jobId);
    autoOpened.current = true;
    let cancelled = false;
    Promise.resolve(authPromiseRef.current ?? authed).then((isAuthed) => {
      if (cancelled) return;
      if (!isAuthed) {
        // Keep ?apply=1 in the URL: it rides through login/signup so the
        // flow resumes when the user lands back here authenticated.
        setShowAuthModal(true);
        return;
      }
      if (applyOnPlatform) {
        fireApplyClick();
        setShowPlatformApply(true);
        consumeApplyParam();
        return;
      }
      if (applyLink) {
        if (openExternalApply() && !isApplied(jobId)) {
          setAwaitingApplyConfirm(true);
        }
        // Consumed even when a popup blocker ate the open — the visible
        // Apply button is the natural retry, and leaving the param would
        // re-attempt (and re-track) on every reload.
        consumeApplyParam();
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, applyOnPlatform, applyLink, authed, jobId]);

  // Release the cross-instance latch on unmount so navigating back to this
  // job later (fresh ?apply=1 from a card) auto-triggers again.
  useEffect(() => {
    return () => { autoApplyHandled.delete(jobId); };
  }, [jobId]);

  const handleApply = async () => {
    // Await the in-flight auth check instead of trusting the initial state.
    // `authed` defaults to false until /api/auth/me resolves, so a fast
    // click used to flash the sign-in wall at authenticated users. The
    // brief loading state below covers the (rare) sub-second wait.
    // Only await when the check is genuinely still in flight. Once resolved,
    // `authed` state is authoritative — and staying synchronous here keeps
    // the click's transient activation alive for window.open below (an
    // awaited microtask hop is safe in modern browsers, but there is no
    // reason to spend it).
    let isAuthed = authed;
    if (authPromiseRef.current && !authResolvedRef.current) {
      setCheckingAuth(true);
      try {
        isAuthed = await authPromiseRef.current;
      } finally {
        setCheckingAuth(false);
      }
    }

    // If user is not authenticated, show auth gate
    if (!isAuthed) {
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

    // External apply: open link in new tab. Track the click for engagement
    // analytics, but do NOT mark applied — clicking the link only signals
    // intent. The "Did you apply?" confirmation prompt below captures the
    // actual outcome once the user returns from the employer's site.
    if (applyLink) {
      if (openExternalApply()) {
        if (!isApplied(jobId)) setAwaitingApplyConfirm(true);
      } else {
        // Popup blocked (strict blocker, or the auth await outlived the
        // click's transient activation). The primary CTA must never be a
        // silent no-op: fall back to same-tab navigation, tracking first.
        fireApplyClick();
        trackJobApply(buildJobItem({ id: jobId, title: jobTitle }), 'external');
        window.location.assign(applyLink);
      }
    }
  };

  /** User explicitly confirms they completed the application on the employer's site. */
  const handleConfirmApplied = () => {
    // The hook handles both localStorage and server persistence (when the
    // user is authenticated), so we don't fire a separate POST here.
    markApplied(jobId, applyLink ?? undefined);
    setAwaitingApplyConfirm(false);
    setPostApplySuccess(true);
  };

  /** User dismisses the prompt — they didn't apply (yet). Reverts to Apply Now. */
  const handleDismissApplyConfirm = () => {
    setAwaitingApplyConfirm(false);
  };

  const handlePlatformApplySuccess = () => {
    markApplied(jobId);
    setShowPlatformApply(false);
  };

  // Carry the apply intent through the auth round-trip: landing back on the
  // job with ?apply=1 lets the auto-trigger resume the flow (and then consume
  // the param), so users don't have to find the Apply button a second time.
  const handleSignIn = () => {
    const returnUrl = `${window.location.pathname}?apply=1`;
    window.location.href = `/login?redirectTo=${encodeURIComponent(returnUrl)}`;
  };

  const handleSignUp = () => {
    const returnUrl = `${window.location.pathname}?apply=1`;
    window.location.href = `/signup?redirectTo=${encodeURIComponent(returnUrl)}`;
  };

  const alertOfferLabel = `Get similar ${state ? `${state} ` : ''}PMHNP jobs by email`;

  return (
    <div ref={rootRef} className="flex flex-col w-full">
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

      {/* Post-apply job-alert modal — optional offer, prefilled from this job.
          Opened from the "Added to your applications" success panel below. */}
      {showAlertModal && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(26,46,53,0.45)' }}
          role="dialog"
          aria-modal="true"
          aria-label={alertOfferLabel}
          onClick={() => setShowAlertModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6 max-h-[85vh] overflow-y-auto"
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid rgba(255,255,255,0.6)',
              boxShadow: '8px 8px 24px rgba(0,0,0,0.18), inset 1px 1px 2px rgba(255,255,255,0.6)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                {alertOfferLabel}
              </h3>
              <button
                onClick={() => setShowAlertModal(false)}
                aria-label="Close"
                className="text-xl leading-none px-2 py-1 rounded-lg"
                style={{ color: 'var(--text-tertiary)' }}
              >
                ×
              </button>
            </div>
            <CreateAlertForm
              initialFilters={{
                keyword: deriveAlertKeyword(jobTitle),
                location: state ?? undefined,
                jobType: jobType ?? undefined,
              }}
            />
          </div>
        </div>
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
              { icon: '📋', text: 'Track all your applications in one place' },
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
      ) : awaitingApplyConfirm ? (
        /* Inline confirmation — user just clicked the external apply link.
           Click alone doesn't prove they applied; ask explicitly so we don't
           pollute /my-applications with phantom records. */
        <div
          className="w-full rounded-2xl p-4"
          style={{
            backgroundColor: 'rgba(13,148,136,0.06)',
            border: '1px solid rgba(13,148,136,0.18)',
          }}
        >
          <p
            className="text-sm font-semibold mb-1"
            style={{ color: 'var(--text-primary)' }}
          >
            Did you finish applying?
          </p>
          <p
            className="text-xs mb-3"
            style={{ color: 'var(--text-secondary)' }}
          >
            Confirm only after you submit on the employer&apos;s site. We&apos;ll add it
            to your applications.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={handleConfirmApplied}
              className="apply-btn flex-1 inline-flex items-center justify-center gap-2 text-white px-4 py-2.5 font-semibold text-sm touch-manipulation"
              style={{
                borderRadius: '14px',
                background: '#0d9488',
                border: '1px solid rgba(255,255,255,0.3)',
                boxShadow: '4px 4px 12px rgba(13,148,136,0.25), inset 1px 1px 2px rgba(255,255,255,0.2)',
              }}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Yes, I applied
            </button>
            <button
              onClick={handleDismissApplyConfirm}
              className="flex-1 inline-flex items-center justify-center px-4 py-2.5 font-semibold text-sm touch-manipulation"
              style={{
                borderRadius: '14px',
                backgroundColor: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid rgba(90,74,66,0.18)',
              }}
            >
              Not yet
            </button>
          </div>
          {applyLink && (
            <button
              onClick={() => window.open(applyLink, '_blank', 'noopener,noreferrer')}
              className="text-xs hover:underline mt-3"
              style={{ color: 'var(--text-tertiary)' }}
            >
              ↗ Re-open the apply link
            </button>
          )}
        </div>
      ) : postApplySuccess ? (
        /* Post-apply success — the application was recorded. Offers an
           optional job alert prefilled from this job; dismissible and
           never blocking. */
        <div
          className="w-full rounded-2xl p-4"
          style={{
            backgroundColor: 'rgba(34,197,94,0.08)',
            border: '1px solid rgba(34,197,94,0.2)',
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <svg className="h-5 w-5 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              Added to your applications.
            </p>
          </div>
          <p className="text-xs mb-3 ml-7" style={{ color: 'var(--text-secondary)' }}>
            You can review it anytime in{' '}
            <Link href="/my-applications" className="underline font-medium" style={{ color: '#0d9488' }}>
              your applications
            </Link>
            .
          </p>
          <button
            onClick={() => setShowAlertModal(true)}
            className="w-full py-2.5 rounded-xl font-semibold text-white transition-all text-sm"
            style={{
              background: '#0d9488',
              borderRadius: '14px',
              border: '1px solid rgba(255,255,255,0.3)',
              boxShadow: '4px 4px 12px rgba(13,148,136,0.25), inset 1px 1px 2px rgba(255,255,255,0.2)',
            }}
          >
            {alertOfferLabel}
          </button>
          <button
            onClick={() => setPostApplySuccess(false)}
            className="w-full text-center text-xs mt-2 py-1"
            style={{ color: 'var(--text-tertiary)' }}
          >
            Dismiss
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <button
              onClick={handleApply}
              disabled={checkingAuth}
              className="apply-btn inline-flex items-center justify-center gap-2 text-white px-8 py-4 lg:py-3 font-bold transition-all text-lg w-full lg:w-auto touch-manipulation"
              style={{
                minHeight: '52px',
                borderRadius: '18px',
                background: '#0d9488',
                border: '1px solid rgba(255,255,255,0.3)',
                boxShadow: '6px 6px 16px rgba(13,148,136,0.30), -3px -3px 10px rgba(255,255,255,0.2), inset 2px 2px 4px rgba(255,255,255,0.25), inset -1px -1px 2px rgba(0,0,0,0.08)',
                opacity: checkingAuth ? 0.75 : 1,
                cursor: checkingAuth ? 'wait' : 'pointer',
              }}
            >
              {checkingAuth ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  One moment…
                </>
              ) : (
                <>
                  {applyOnPlatform && <Zap size={18} fill="currentColor" />}
                  {applied ? 'Apply Again' : applyOnPlatform ? 'Easy Apply' : directApply ? 'Direct Apply' : 'Apply Now'}
                  {!applyOnPlatform && <ExternalLink size={20} />}
                </>
              )}
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

          {/* External-handoff microcopy — sets the expectation that the
              application finishes on the employer's site. Hidden in the
              compact sticky bar to keep it a single row. */}
          {!applyOnPlatform && applyLink && !compact && (
            <p className="text-xs mt-2 text-center lg:text-left" style={{ color: 'var(--text-tertiary)' }}>
              Opens the employer&apos;s application in a new tab.
            </p>
          )}

          {applied && appliedDate && !compact && (
            <p className="text-sm mt-2 text-center lg:text-left" style={{ color: 'var(--text-tertiary)' }}>
              Applied on {formatAppliedDate(appliedDate)}
            </p>
          )}

          {!applied && !compact && (
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

