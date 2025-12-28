'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle } from 'lucide-react';

function UpgradeSuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    // In a real implementation, you could fetch the dashboard token from the session
    // For now, we'll just show a generic success message
    // The dashboard link will be in the confirmation email
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full">
        {/* Success Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          {/* Success Icon */}
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-r from-blue-100 to-purple-100">
            <CheckCircle className="h-12 w-12 text-blue-600" />
          </div>

          {/* Heading */}
          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            Job Upgraded Successfully!
          </h1>

          {/* Description */}
          <p className="text-lg text-gray-600 mb-2">
            Your job is now featured and will appear at the top of search results.
          </p>

          {/* Benefits List */}
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-4 mb-6 mt-6">
            <p className="text-sm font-semibold text-gray-900 mb-2">What you get with Featured:</p>
            <ul className="text-sm text-gray-700 space-y-1 text-left">
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">✓</span>
                <span>Pinned to the top of all search results</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">✓</span>
                <span>Featured badge for increased visibility</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">✓</span>
                <span>30 additional days of visibility (60 days total)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">✓</span>
                <span>Priority in email alerts to job seekers</span>
              </li>
            </ul>
          </div>

          {/* Dashboard Link */}
          <p className="text-sm text-gray-600 mb-6">
            Check your email for a confirmation and link to your dashboard.
          </p>

          {/* Action Button */}
          <Link
            href="/"
            className="inline-block w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 transition-all shadow-md hover:shadow-lg"
          >
            Go to Homepage
          </Link>

          {/* Alternative Link */}
          <p className="mt-4 text-sm text-gray-500">
            Need help?{' '}
            <a href="mailto:support@pmhnphiring.com" className="text-blue-600 hover:underline font-medium">
              Contact Support
            </a>
          </p>
        </div>

        {/* Additional Info */}
        <div className="mt-6 text-center text-sm text-gray-600">
          <p>
            Your upgraded listing is now live at{' '}
            <Link href="/jobs" className="text-blue-600 hover:underline font-medium">
              PMHNPHiring.com
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center px-4 py-12">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>
  );
}

export default function UpgradeSuccessPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <UpgradeSuccessContent />
    </Suspense>
  );
}
