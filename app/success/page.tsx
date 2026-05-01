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

  if (state.loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-teal-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Verifying your payment…</p>
          <p className="text-sm text-gray-400 mt-2">This usually takes just a few seconds.</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <AlertTriangle className="w-16 h-16 text-amber-500 mx-auto mb-6" />
        <h1 className="text-2xl font-bold text-gray-900 mb-4">We&apos;re still verifying your payment</h1>
        <p className="text-gray-600 mb-8">{state.error}</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/employer/dashboard"
            className="inline-block bg-teal-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-teal-700"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/contact"
            className="inline-block border-2 border-teal-600 text-teal-600 px-6 py-3 rounded-lg font-semibold hover:bg-teal-50"
          >
            Contact Support
          </Link>
        </div>
        {sessionId && (
          <p className="mt-8 text-xs text-gray-400">Reference: {sessionId.slice(0, 20)}…</p>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-16">
      <div className="text-center">
        <div className="flex justify-center mb-6">
          <CheckCircle className="w-16 h-16 text-green-600" />
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          {isFreeMode ? 'Job Posted Successfully!' : 'Payment Successful!'}
        </h1>

        <div className="space-y-2 mb-8">
          <p className="text-gray-600 text-lg">
            {state.session?.jobTitle
              ? <>Your job <strong>{state.session.jobTitle}</strong> is now live on PMHNP Hiring.</>
              : isFreeMode
                ? 'Your job listing is now live on PMHNP Hiring.'
                : 'Your job post is now live.'}
          </p>
          <p className="text-gray-500">
            {isFreeMode
              ? "We've sent a confirmation email with your edit link and dashboard access."
              : "We've sent a confirmation email with your edit link, receipt, and dashboard access."}
          </p>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-8">
          <h2 className="font-semibold text-green-800 mb-2">What happens next?</h2>
          <ul className="text-sm text-green-700 space-y-1 text-left">
            <li>✓ Your job is now visible to candidates</li>
            <li>✓ You&apos;ll receive a confirmation email shortly</li>
            <li>✓ Your listing will appear in search results</li>
            <li>✓ Candidates can start applying immediately</li>
          </ul>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-8">
          <Link
            href={state.session?.dashboardToken
              ? `/employer/dashboard/${state.session.dashboardToken}`
              : '/employer/dashboard'}
            className="inline-block bg-teal-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-teal-700 transition-colors text-lg"
          >
            Go to Dashboard
          </Link>
          {state.session?.jobSlug && (
            <Link
              href={`/jobs/${state.session.jobSlug}`}
              className="inline-block border-2 border-teal-600 text-teal-600 px-8 py-3 rounded-lg font-semibold hover:bg-teal-50 transition-colors text-lg"
            >
              View Your Job
            </Link>
          )}
          <Link
            href="/post-job"
            className="inline-block border-2 border-gray-300 text-gray-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-50 transition-colors text-lg"
          >
            Post Another Job
          </Link>
        </div>

        {sessionId && (
          <p className="mt-8 text-xs text-gray-400">
            Reference: {sessionId.slice(0, 20)}...
          </p>
        )}
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-16">
      <div className="text-center">
        <Loader2 className="w-12 h-12 text-teal-600 animate-spin mx-auto mb-4" />
        <p className="text-gray-600">Loading…</p>
      </div>
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
