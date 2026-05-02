'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, Loader2, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { trackSubmitFreePost } from '@/lib/analytics';

interface VerifiedSession {
  paid: boolean;
  processing?: boolean;
  jobTitle?: string;
  jobSlug?: string;
  dashboardToken?: string;
  isPublished?: boolean;
}

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const freeParam = searchParams.get('free');

  // Free-mode posts don't go through Stripe — they post directly via /api/jobs/post-free
  // and redirect here with ?free=true. Nothing to verify in that case.
  const isFreeMode = freeParam === 'true';

  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    session: VerifiedSession | null;
  }>({
    loading: !isFreeMode && !!sessionId,
    error: null,
    session: null,
  });

  useEffect(() => {
    // Always clean up the in-memory job draft regardless of path
    localStorage.removeItem('jobFormData');

    if (isFreeMode) {
      // P7: free post conversion event (no Stripe purchase event for free posts)
      const jobId = searchParams.get('jobId') ?? 'unknown';
      trackSubmitFreePost(jobId);
      return;
    }

    if (!sessionId) {
      // No session id and not free mode → user wandered here directly. Bounce.
      window.location.href = '/post-job';
      return;
    }

    // Verify the Stripe session server-side. Audit #1: don't trust the URL alone.
    // The webhook may not have processed yet, in which case we'll retry briefly.
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 6; // ~12 seconds total

    const tick = async () => {
      try {
        const res = await fetch(`/api/verify-checkout-session?session_id=${encodeURIComponent(sessionId)}`);
        const data = await res.json();

        if (cancelled) return;

        if (res.status === 402) {
          // Stripe says unpaid — final state, no point retrying.
          setState({ loading: false, error: 'Payment was not completed. Please try again.', session: null });
          return;
        }

        if (res.status === 202 || data.processing) {
          // Webhook not yet processed. Retry up to maxAttempts.
          attempts += 1;
          if (attempts >= maxAttempts) {
            setState({
              loading: false,
              error: 'Payment received but your job is still being activated. Refresh in a moment, or check your email for the confirmation link.',
              session: data,
            });
            return;
          }
          setTimeout(tick, 2000);
          return;
        }

        if (!res.ok || !data.paid) {
          setState({ loading: false, error: data.error || 'Could not verify payment.', session: null });
          return;
        }

        setState({ loading: false, error: null, session: data });
      } catch {
        if (cancelled) return;
        setState({ loading: false, error: 'Could not reach the server to verify payment.', session: null });
      }
    };

    tick();
    return () => { cancelled = true; };
  }, [sessionId, isFreeMode]);

  // ─── Clay design tokens (match post-job/preview/dashboard pages) ───
  const pageWrap: React.CSSProperties = {
    background: '#F5F0EB',
    minHeight: '100vh',
    padding: '0 16px 60px',
  };

  const clayCard: React.CSSProperties = {
    background: '#FFFFFF',
    borderRadius: '24px',
    border: '1px solid rgba(255,255,255,0.6)',
    boxShadow: '8px 8px 20px rgba(0,0,0,0.06), -4px -4px 12px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.6), inset -1px -1px 2px rgba(0,0,0,0.02)',
    padding: '40px 32px',
  };

  const clayBtnPrimary: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
    padding: '14px 28px', borderRadius: '14px',
    fontSize: '15px', fontWeight: 700, color: '#fff',
    background: 'linear-gradient(145deg, #0D9488, #10B981)',
    border: '1px solid rgba(255,255,255,0.3)',
    boxShadow: '4px 4px 12px rgba(13,148,136,0.25), -2px -2px 6px rgba(255,255,255,0.3), inset 1px 1px 2px rgba(255,255,255,0.15)',
    textDecoration: 'none', cursor: 'pointer', transition: 'all 0.2s ease',
    minWidth: '170px',
  };

  const clayBtnSecondary: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
    padding: '14px 28px', borderRadius: '14px',
    fontSize: '15px', fontWeight: 700, color: '#0D9488',
    background: '#FFFFFF',
    border: '1px solid rgba(13,148,136,0.25)',
    boxShadow: '4px 4px 10px rgba(0,0,0,0.05), -2px -2px 6px rgba(255,255,255,0.8), inset 1px 1px 2px rgba(255,255,255,0.6)',
    textDecoration: 'none', cursor: 'pointer', transition: 'all 0.2s ease',
    minWidth: '170px',
  };

  const clayBtnTertiary: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
    padding: '14px 28px', borderRadius: '14px',
    fontSize: '15px', fontWeight: 700, color: '#5A6B73',
    background: '#F5F0EB',
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.04), inset -1px -1px 2px rgba(255,255,255,0.5)',
    textDecoration: 'none', cursor: 'pointer', transition: 'all 0.2s ease',
    minWidth: '170px',
  };

  const headingStyle: React.CSSProperties = {
    fontSize: 'clamp(26px, 4vw, 34px)', fontWeight: 800,
    fontFamily: 'var(--font-lora), Georgia, serif',
    color: '#1A2E35', margin: '0 0 12px', lineHeight: 1.2,
  };

  if (state.loading) {
    return (
      <div style={pageWrap}>
        <div style={{ maxWidth: '640px', margin: '0 auto', paddingTop: '32px' }}>
          <div style={{ ...clayCard, textAlign: 'center' }}>
            <Loader2 style={{ width: '44px', height: '44px', margin: '0 auto 16px', color: '#0D9488', animation: 'spin 0.9s linear infinite' }} />
            <p style={{ fontSize: '16px', color: '#1A2E35', fontWeight: 600, margin: '0 0 4px' }}>Verifying your payment…</p>
            <p style={{ fontSize: '13px', color: '#8A9BA6', margin: 0 }}>This usually takes just a few seconds.</p>
          </div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (state.error) {
    return (
      <div style={pageWrap}>
        <div style={{ maxWidth: '640px', margin: '0 auto', paddingTop: '32px' }}>
          <div style={{ ...clayCard, textAlign: 'center' }}>
            <div style={{
              width: '72px', height: '72px', margin: '0 auto 20px',
              borderRadius: '20px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(145deg, #FEF3C7, #FDE68A)',
              boxShadow: '4px 4px 12px rgba(245,158,11,0.18), inset 1px 1px 2px rgba(255,255,255,0.5)',
            }}>
              <AlertTriangle size={32} color="#92400E" />
            </div>
            <h1 style={headingStyle}>We&apos;re still verifying your payment</h1>
            <p style={{ fontSize: '15px', color: '#5A6B73', margin: '0 0 28px', lineHeight: 1.6 }}>{state.error}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center' }}>
              <Link href="/employer/dashboard" style={clayBtnPrimary}>Go to Dashboard</Link>
              <Link href="/contact" style={clayBtnSecondary}>Contact Support</Link>
            </div>
            {sessionId && (
              <p style={{ marginTop: '24px', fontSize: '11px', color: '#B0BEC5', fontFamily: 'monospace' }}>
                Reference: {sessionId.slice(0, 20)}…
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={pageWrap}>
      <div style={{ maxWidth: '640px', margin: '0 auto', paddingTop: '32px' }}>
        <div style={{ ...clayCard, textAlign: 'center' }}>
          {/* Success icon — claymorphic green badge */}
          <div style={{
            width: '80px', height: '80px', margin: '0 auto 24px',
            borderRadius: '24px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(145deg, #10B981, #059669)',
            boxShadow: '6px 6px 16px rgba(16,185,129,0.28), -2px -2px 8px rgba(255,255,255,0.4), inset 1px 1px 2px rgba(255,255,255,0.25)',
          }}>
            <CheckCircle size={40} color="#fff" strokeWidth={2.5} />
          </div>

          <h1 style={headingStyle}>
            {isFreeMode ? 'Job Posted Successfully!' : 'Payment Successful!'}
          </h1>

          <p style={{ fontSize: '16px', color: '#5A6B73', margin: '0 0 6px', lineHeight: 1.6 }}>
            {state.session?.jobTitle
              ? <>Your job <strong style={{ color: '#1A2E35' }}>{state.session.jobTitle}</strong> is now live on PMHNP Hiring.</>
              : isFreeMode
                ? 'Your job listing is now live on PMHNP Hiring.'
                : 'Your job post is now live.'}
          </p>
          <p style={{ fontSize: '14px', color: '#8A9BA6', margin: '0 0 28px', lineHeight: 1.6 }}>
            {isFreeMode
              ? "We've sent a confirmation email with a link to your dashboard."
              : "We've sent a confirmation email with your receipt and a link to your dashboard."}
          </p>

          {/* "What happens next" — claymorphic teal panel */}
          <div style={{
            background: '#F0FDFA',
            border: '1px solid rgba(13,148,136,0.18)',
            borderRadius: '18px',
            padding: '20px 24px',
            marginBottom: '28px',
            boxShadow: 'inset 2px 2px 5px rgba(13,148,136,0.06), inset -1px -1px 3px rgba(255,255,255,0.5)',
            textAlign: 'left',
          }}>
            <h2 style={{
              fontSize: '13px', fontWeight: 700,
              color: '#0F766E', textTransform: 'uppercase', letterSpacing: '0.06em',
              margin: '0 0 12px', textAlign: 'center',
            }}>What happens next?</h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                'Your job is now visible to candidates',
                'Your listing will appear in search results',
                'Candidates can start applying immediately',
                'You can manage everything from your dashboard',
              ].map((item) => (
                <li key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '14px', color: '#115E59', lineHeight: 1.5 }}>
                  <span style={{
                    flexShrink: 0,
                    width: '20px', height: '20px', borderRadius: '50%',
                    background: 'linear-gradient(145deg, #10B981, #059669)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '2px 2px 4px rgba(16,185,129,0.2)',
                    marginTop: '1px',
                  }}>
                    <CheckCircle size={11} color="#fff" strokeWidth={3} />
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Action buttons — flex-wrap so they grid nicely on mobile/desktop */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center' }}>
            <Link
              href={state.session?.dashboardToken
                ? `/employer/dashboard/${state.session.dashboardToken}`
                : '/employer/dashboard'}
              style={clayBtnPrimary}
            >
              Go to Dashboard
            </Link>
            {state.session?.jobSlug && (
              <Link href={`/jobs/${state.session.jobSlug}`} style={clayBtnSecondary}>
                View Your Job
              </Link>
            )}
            <Link href="/post-job" style={clayBtnTertiary}>
              Post Another Job
            </Link>
          </div>

          {sessionId && (
            <p style={{ marginTop: '24px', fontSize: '11px', color: '#B0BEC5', fontFamily: 'monospace' }}>
              Reference: {sessionId.slice(0, 20)}…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div style={{ background: '#F5F0EB', minHeight: '100vh', padding: '32px 16px' }}>
      <div style={{
        maxWidth: '640px', margin: '0 auto',
        background: '#FFFFFF', borderRadius: '24px',
        border: '1px solid rgba(255,255,255,0.6)',
        boxShadow: '8px 8px 20px rgba(0,0,0,0.06), -4px -4px 12px rgba(255,255,255,0.9), inset 2px 2px 4px rgba(255,255,255,0.6)',
        padding: '40px 32px', textAlign: 'center',
      }}>
        <Loader2 style={{ width: '44px', height: '44px', margin: '0 auto 16px', color: '#0D9488', animation: 'spin 0.9s linear infinite' }} />
        <p style={{ fontSize: '16px', color: '#1A2E35', fontWeight: 600, margin: 0 }}>Loading…</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <SuccessContent />
    </Suspense>
  );
}
