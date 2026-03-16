'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  // Log error to console for debugging (not shown to user)
  useEffect(() => {
    // Note: logger is server-only, so we use console.error here (client side)
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-16">
      <div className="max-w-lg w-full text-center">
        {/* Icon */}
        <div className="mb-6">
          <div className="w-24 h-24 mx-auto bg-amber-100 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-12 h-12 text-amber-600" />
          </div>
        </div>

        {/* Heading */}
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
          Something went wrong
        </h1>

        {/* Subtext */}
        <p className="text-lg text-gray-600 mb-8">
          We&apos;re sorry, an unexpected error occurred. Please try again or return to the homepage.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
          <Button
            variant="primary"
            size="lg"
            onClick={reset}
            className="w-full sm:w-auto"
          >
            <RefreshCw size={20} />
            Try Again
          </Button>
          <Link href="/">
            <Button
              variant="outline"
              size="lg"
              className="w-full sm:w-auto"
            >
              <Home size={20} />
              Go to Homepage
            </Button>
          </Link>
        </div>

        {/* Error Details Card (Optional - for debugging) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-lg text-left">
            <p className="text-xs font-mono text-red-900 break-words">
              <strong>Dev Mode Error:</strong><br />
              {error.message}
            </p>
            {error.digest && (
              <p className="text-xs font-mono text-red-700 mt-2">
                Error ID: {error.digest}
              </p>
            )}
          </div>
        )}

        {/* Support Text */}
        <div className="pt-6 border-t border-gray-200">
          <p className="text-sm text-gray-500">
            If this keeps happening, please{' '}
            <Link
              href="/contact"
              className="text-primary-600 hover:text-primary-700 underline"
            >
              contact us
            </Link>
            {' '}and let us know what you were doing when the error occurred.
          </p>
        </div>

        {/* Quick Links */}
        <div className="mt-6">
          <p className="text-xs text-gray-400 mb-2">
            Or try these pages:
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/jobs"
              className="text-sm text-primary-600 hover:text-primary-700 underline"
            >
              Browse Jobs
            </Link>
            <span className="text-gray-400">·</span>
            <Link
              href="/faq"
              className="text-sm text-primary-600 hover:text-primary-700 underline"
            >
              FAQ
            </Link>
            <span className="text-gray-400">·</span>
            <Link
              href="/about"
              className="text-sm text-primary-600 hover:text-primary-700 underline"
            >
              About
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

