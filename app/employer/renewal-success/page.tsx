'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { config } from '@/lib/config';

interface RenewalData {
  jobTitle: string;
  jobSlug: string;
  dashboardToken: string;
  tier: string;
  /** True while the Stripe webhook has not yet recorded the renewal charge. */
  processing?: boolean;
  /** The expiry the webhook actually wrote, ISO 8601, or null for legacy rows. */
  expiresAt?: string | null;
}

function RenewalSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');

  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    renewalData: RenewalData | null;
  }>({
    loading: true,
    error: null,
    renewalData: null,
  });

  useEffect(() => {
    if (!sessionId) {
      // Use a timeout to defer state update to avoid setting state during render
      const timer = setTimeout(() => {
        setState({
          loading: false,
          error: 'No session ID provided',
          renewalData: null,
        });
      }, 0);
      return () => clearTimeout(timer);
    }

    // Stripe reporting the session as paid is not the renewal having been
    // applied: the webhook is what extends expiresAt, and it can be delayed or
    // retried. The endpoint answers `processing: true` until it has recorded
    // the charge, so poll for it the way /success does for a new post rather
    // than asserting success the moment the first 200 comes back.
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 6; // roughly 12 seconds

    const tick = async () => {
      try {
        const res = await fetch(`/api/verify-renewal-session?session_id=${encodeURIComponent(sessionId)}`);
        const data = await res.json();

        if (cancelled) return;

        if (data.error) {
          setState({ loading: false, error: data.error, renewalData: null });
          return;
        }

        if (data.processing) {
          attempts += 1;
          if (attempts >= maxAttempts) {
            setState({
              loading: false,
              error: 'Payment received, but the renewal is still being applied. Refresh in a moment, or check your email for the confirmation.',
              renewalData: null,
            });
            return;
          }
          setTimeout(tick, 2000);
          return;
        }

        setState({ loading: false, error: null, renewalData: data });
      } catch {
        if (cancelled) return;
        setState({
          loading: false,
          error: 'Failed to verify renewal',
          renewalData: null,
        });
      }
    };

    tick();
    return () => { cancelled = true; };
  }, [sessionId]);

  const { loading, error, renewalData } = state;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-green-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Verifying renewal...</p>
        </div>
      </div>
    );
  }

  if (error || !renewalData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-red-600 text-3xl">✕</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Error</h1>
          <p className="text-gray-600 mb-6">{error || 'Something went wrong'}</p>
          <Link
            href="/"
            className="inline-block bg-teal-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-teal-700 transition"
          >
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  // The real expiry the webhook wrote, not a fixed term. The 365-day cap can
  // truncate a renewal to less than a full cycle, in which case "extended for
  // another 60 days" would simply be untrue.
  const expiresAt = renewalData.expiresAt ? new Date(renewalData.expiresAt) : null;
  const expiryLabel = expiresAt && !Number.isNaN(expiresAt.getTime())
    ? expiresAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 via-white to-teal-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 md:p-12 max-w-2xl w-full text-center">
        {/* Success Icon */}
        <div className="mb-6">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full">
            <CheckCircle2 className="w-12 h-12 text-green-600" />
          </div>
        </div>

        {/* Heading */}
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
          Job Renewed Successfully! 🎉
        </h1>

        {/* Job Title */}
        <p className="text-xl font-semibold text-gray-700 mb-6">
          {renewalData.jobTitle}
        </p>

        {/* Description */}
        <p className="text-lg text-gray-600 mb-8">
          {expiryLabel
            ? `Your renewal is confirmed. This listing now runs through ${expiryLabel}.`
            : `Your renewal is confirmed and this listing has been extended by up to ${config.durationDays} days.`}
          <span className="block mt-2 text-green-700 font-semibold">
            ✨ Featured placement re-activated.
          </span>
        </p>

        {/* Success Badge. Deliberately does not assert that the listing is
            live: this endpoint reports the charge and the expiry, not the
            publish state, and a paused posting stays paused through a
            renewal. The dashboard below is where that is visible. */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-8">
          <p className="text-green-800 text-sm">
            ✓ Payment received and applied to this posting.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          {/* Straight to the dashboard, never the /employer/dashboard/<token>
              route: that route exists only to carry renew intent through login,
              so it reopened the renew modal for the posting just paid for and
              put a second charge one click away. The token is not a credential,
              so nothing is lost by dropping it. */}
          <Link
            href="/employer/dashboard"
            className="bg-teal-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-teal-700 transition shadow-md hover:shadow-lg"
          >
            Go to Dashboard
          </Link>
          <Link
            href={`/jobs/${renewalData.jobSlug}`}
            className="bg-white text-teal-600 border-2 border-teal-600 px-8 py-3 rounded-lg font-semibold hover:bg-teal-50 transition"
          >
            View Your Job
          </Link>
        </div>

        {/* Additional Info */}
        <div className="mt-10 pt-8 border-t border-gray-200">
          <p className="text-sm text-gray-500 mb-2">
            A confirmation email has been sent to your inbox.
          </p>
          <p className="text-sm text-gray-500">
            Need help?{' '}
            <a
              href="mailto:support@pmhnphiring.com"
              className="text-teal-600 hover:underline"
            >
              Contact support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
      <div className="text-center">
        <Loader2 className="w-12 h-12 text-green-600 animate-spin mx-auto mb-4" />
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>
  );
}

export default function RenewalSuccessPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <RenewalSuccessContent />
    </Suspense>
  );
}
