'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Mail, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

interface PreferencesData {
  email: string;
  isSubscribed: boolean;
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
        });
      } catch (err) {
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
        ? { method: 'GET' }
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          };

      const response = await fetch(endpoint, options);
      const data = await response.json();

      if (data.success) {
        setPreferences({
          ...preferences,
          isSubscribed: !preferences.isSubscribed,
        });
        setSuccessMessage(
          preferences.isSubscribed
            ? 'You have been unsubscribed from our emails.'
            : 'You have been resubscribed to our emails!'
        );
      } else {
        setError(data.message || 'Failed to update preferences');
      }
    } catch (err) {
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
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto mb-4"></div>
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
              className="block w-full bg-blue-500 text-white py-3 rounded-lg font-semibold hover:bg-blue-600 transition-colors"
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
          <Mail className="w-12 h-12 text-blue-500 mx-auto mb-4" />
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

        {/* Current Status */}
        <div className="bg-gray-50 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Current Status</p>
              <div className="flex items-center gap-2">
                {preferences?.isSubscribed ? (
                  <>
                    <CheckCircle className="text-green-500" size={20} />
                    <span className="font-semibold text-gray-900">Subscribed</span>
                  </>
                ) : (
                  <>
                    <XCircle className="text-gray-400" size={20} />
                    <span className="font-semibold text-gray-900">Unsubscribed</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Description */}
        <p className="text-gray-600 text-sm mb-6">
          {preferences?.isSubscribed
            ? "You're receiving weekly job alerts for PMHNP positions. Click below to unsubscribe."
            : "You're not receiving job alerts. Click below to resubscribe and get notified about new opportunities."}
        </p>

        {/* Toggle Button */}
        <button
          onClick={handleToggleSubscription}
          disabled={updating}
          className={`w-full py-3 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            preferences?.isSubscribed
              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300'
              : 'bg-blue-500 text-white hover:bg-blue-600'
          }`}
        >
          {updating
            ? 'Updating...'
            : preferences?.isSubscribed
            ? 'Unsubscribe from Emails'
            : 'Resubscribe to Emails'}
        </button>

        {/* Footer Link */}
        <div className="text-center mt-6">
          <Link
            href="/jobs"
            className="text-blue-500 hover:text-blue-600 text-sm transition-colors"
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
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto mb-4"></div>
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

