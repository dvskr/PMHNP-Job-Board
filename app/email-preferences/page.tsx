'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Mail, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

interface PreferencesData {
  email: string;
  isSubscribed: boolean;
  newsletterOptIn: boolean;
}

function EmailPreferencesContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<PreferencesData | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchPreferences = async () => {
      if (!token) {
        setError('No token provided');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/email/preferences?token=${token}`);
        const data = await response.json();

        if (!response.ok || !data.success) {
          setError(data.message || 'Invalid or expired link');
          return;
        }

        setPreferences({
          email: data.email,
          isSubscribed: data.isSubscribed,
          newsletterOptIn: data.newsletterOptIn ?? false,
        });
      } catch {
        setError('Failed to load preferences');
      } finally {
        setLoading(false);
      }
    };

    fetchPreferences();
  }, [token]);

  const handleToggleSubscription = async () => {
    if (!token || !preferences) return;

    setUpdating(true);
    setSuccessMessage(null);

    try {
      const endpoint = preferences.isSubscribed
        ? `/api/email/unsubscribe?token=${token}`
        : '/api/email/unsubscribe';

      const options = preferences.isSubscribed
        ? { method: 'GET' as const }
        : {
          method: 'POST' as const,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        };

      const response = await fetch(endpoint, options);
      const data = await response.json();

      if (data.success) {
        const newSubscribed = !preferences.isSubscribed;
        setPreferences({
          ...preferences,
          isSubscribed: newSubscribed,
          // Unsubscribing also clears newsletter (backend does this)
          newsletterOptIn: newSubscribed ? preferences.newsletterOptIn : false,
        });
        setSuccessMessage(
          newSubscribed
            ? 'You have been resubscribed to job alerts!'
            : 'You have been unsubscribed from all emails.'
        );
      } else {
        setError(data.message || 'Failed to update preferences');
      }
    } catch {
      setError('Failed to update preferences');
    } finally {
      setUpdating(false);
    }
  };

  const handleToggleNewsletter = async () => {
    if (!token || !preferences) return;

    setUpdating(true);
    setSuccessMessage(null);

    try {
      const response = await fetch('/api/email/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newsletterOptIn: !preferences.newsletterOptIn }),
      });
      const data = await response.json();

      if (data.success) {
        setPreferences({
          ...preferences,
          newsletterOptIn: !preferences.newsletterOptIn,
        });
        setSuccessMessage(
          !preferences.newsletterOptIn
            ? 'You are now subscribed to the newsletter!'
            : 'You have been unsubscribed from the newsletter.'
        );
      } else {
        setError(data.message || 'Failed to update preferences');
      }
    } catch {
      setError('Failed to update preferences');
    } finally {
      setUpdating(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your preferences...</p>
        </div>
      </div>
    );
  }

  // Error state (invalid token)
  if (error && !preferences) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid Link</h1>
          <p className="text-gray-600 mb-6">
            This link is invalid or has expired. Please check your email for the correct link.
          </p>
          <div className="space-y-3">
            <Link
              href="/#subscribe"
              className="block w-full bg-teal-500 text-white py-3 rounded-lg font-semibold hover:bg-teal-600 transition-colors"
            >
              Sign Up for Alerts
            </Link>
            <Link
              href="/"
              className="block text-gray-500 hover:text-gray-700 transition-colors"
            >
              Go to Homepage
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Main content
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <Mail className="w-12 h-12 text-teal-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900">Email Preferences</h1>
          <p className="text-gray-500 text-sm mt-2">{preferences?.email}</p>
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 flex items-center gap-3">
            <CheckCircle className="text-green-500 flex-shrink-0" size={20} />
            <p className="text-green-700 text-sm">{successMessage}</p>
          </div>
        )}

        {/* Error Message */}
        {error && preferences && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {/* Subscription Toggles */}
        <div className="space-y-4 mb-6">
          {/* Job Alerts */}
          <div className="bg-gray-50 rounded-lg p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900 text-sm">Weekly Job Alerts</p>
                <p className="text-xs text-gray-500 mt-1">New PMHNP job listings delivered weekly</p>
              </div>
              <div className="flex items-center gap-2">
                {preferences?.isSubscribed ? (
                  <CheckCircle className="text-green-500" size={18} />
                ) : (
                  <XCircle className="text-gray-400" size={18} />
                )}
                <button
                  onClick={handleToggleSubscription}
                  disabled={updating}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${preferences?.isSubscribed
                      ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      : 'bg-teal-500 text-white hover:bg-teal-600'
                    }`}
                >
                  {preferences?.isSubscribed ? 'Unsubscribe' : 'Subscribe'}
                </button>
              </div>
            </div>
          </div>

          {/* Newsletter */}
          <div className="bg-gray-50 rounded-lg p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900 text-sm">Monthly Newsletter</p>
                <p className="text-xs text-gray-500 mt-1">PMHNP industry news, salary trends & career tips</p>
              </div>
              <div className="flex items-center gap-2">
                {preferences?.newsletterOptIn ? (
                  <CheckCircle className="text-green-500" size={18} />
                ) : (
                  <XCircle className="text-gray-400" size={18} />
                )}
                <button
                  onClick={handleToggleNewsletter}
                  disabled={updating}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${preferences?.newsletterOptIn
                      ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      : 'bg-teal-500 text-white hover:bg-teal-600'
                    }`}
                >
                  {preferences?.newsletterOptIn ? 'Unsubscribe' : 'Subscribe'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Unsubscribe All */}
        {(preferences?.isSubscribed || preferences?.newsletterOptIn) && (
          <button
            onClick={handleToggleSubscription}
            disabled={updating}
            className="w-full py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
          >
            Unsubscribe from All Emails
          </button>
        )}

        {/* Footer Link */}
        <div className="text-center mt-6">
          <Link
            href="/jobs"
            className="text-teal-500 hover:text-teal-600 text-sm transition-colors"
          >
            Browse Jobs →
          </Link>
        </div>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-500 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading your preferences...</p>
      </div>
    </div>
  );
}

export default function EmailPreferencesPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <EmailPreferencesContent />
    </Suspense>
  );
}

