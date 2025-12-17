'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle2, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface RenewalData {
  jobTitle: string;
  jobSlug: string;
  dashboardToken: string;
  tier: string;
}

function RenewalSuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get('session_id');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renewalData, setRenewalData] = useState<RenewalData | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setError('No session ID provided');
      setLoading(false);
      return;
    }

    // Fetch session details
    fetch(`/api/verify-renewal-session?session_id=${sessionId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setRenewalData(data);
        }
      })
      .catch((err) => {
        console.error('Error fetching session:', err);
        setError('Failed to verify renewal');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [sessionId]);

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
            className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition"
          >
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  const daysExtended = renewalData.tier === 'featured' ? 60 : 30;

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 via-white to-blue-50 flex items-center justify-center p-4">
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
          Your job posting has been extended for another {daysExtended} days.
          {renewalData.tier === 'featured' && (
            <span className="block mt-2 text-green-700 font-semibold">
              ✨ Featured placement activated!
            </span>
          )}
        </p>

        {/* Success Badge */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-8">
          <p className="text-green-800 text-sm">
            ✓ Your job is now live and visible to candidates
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href={`/employer/dashboard/${renewalData.dashboardToken}`}
            className="bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition shadow-md hover:shadow-lg"
          >
            Go to Dashboard
          </Link>
          <Link
            href={`/jobs/${renewalData.jobSlug}`}
            className="bg-white text-blue-600 border-2 border-blue-600 px-8 py-3 rounded-lg font-semibold hover:bg-blue-50 transition"
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
              href="mailto:support@pmhnpjobs.com"
              className="text-blue-600 hover:underline"
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
