'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { config } from '@/lib/config';

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const freeParam = searchParams.get('free');

  // Determine if this is a free posting
  const isFreeMode = freeParam === 'true' || !config.isPaidPostingEnabled;

  useEffect(() => {
    // Clear jobFormData from localStorage
    localStorage.removeItem('jobFormData');
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-4 py-16">
      <div className="text-center">
        {/* Success Icon */}
        <div className="flex justify-center mb-6">
          <CheckCircle className="w-16 h-16 text-green-600" />
        </div>

        {/* Heading */}
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          {isFreeMode ? 'Job Posted Successfully!' : 'Payment Successful!'}
        </h1>

        {/* Messages */}
        <div className="space-y-2 mb-8">
          <p className="text-gray-600 text-lg">
            {isFreeMode
              ? 'Your job listing is now live on PMHNP Hiring.'
              : 'Your job post is now live.'}
          </p>
          <p className="text-gray-500">
            {isFreeMode
              ? "We've sent a confirmation email with your edit link and dashboard access."
              : "We've sent a confirmation email with your edit link, receipt, and dashboard access."}
          </p>
        </div>

        {/* What's Next Section */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-8">
          <h2 className="font-semibold text-green-800 mb-2">What happens next?</h2>
          <ul className="text-sm text-green-700 space-y-1 text-left">
            <li>✓ Your job is now visible to candidates</li>
            <li>✓ You&apos;ll receive a confirmation email shortly</li>
            <li>✓ Your listing will appear in search results</li>
            <li>✓ Candidates can start applying immediately</li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-8">
          <Link
            href="/jobs"
            className="inline-block bg-teal-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-teal-700 transition-colors text-lg"
          >
            View All Jobs
          </Link>
          <Link
            href="/post-job"
            className="inline-block border-2 border-teal-600 text-teal-600 px-8 py-3 rounded-lg font-semibold hover:bg-teal-50 transition-colors text-lg"
          >
            Post Another Job
          </Link>
        </div>

        {/* Session ID (for debugging/reference) */}
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading...</p>
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
