'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCircle, AlertCircle, ChevronDown } from 'lucide-react';

// US States for dropdown
const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
  'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
  'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
  'Wisconsin', 'Wyoming'
];

export default function HomepageJobAlertForm() {
  const [email, setEmail] = useState('');
  const [location, setLocation] = useState('');
  const [frequency, setFrequency] = useState('daily');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showOptions, setShowOptions] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email)) {
      setMessage({ type: 'error', text: 'Please enter a valid email address' });
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch('/api/job-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          location: location || undefined,
          frequency,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setMessage({ type: 'success', text: 'Job alert created! Check your email to confirm.' });
        setEmail('');
        setLocation('');
        setFrequency('daily');
        setShowOptions(false);
      } else {
        setMessage({ type: 'error', text: data.error || 'Something went wrong. Please try again.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      {/* Success State */}
      {message?.type === 'success' ? (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-emerald-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">You&apos;re all set!</p>
              <p className="text-sm text-gray-600">{message.text}</p>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <Link
              href="/jobs"
              className="flex-1 text-center px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors"
            >
              Browse Jobs Now
            </Link>
            <Link
              href="/job-alerts"
              className="flex-1 text-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              Create Another Alert
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Main Row: Email + Submit */}
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              className="flex-1 px-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-3 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Creating...
                </>
              ) : (
                <>
                  <Bell className="w-4 h-4" />
                  Get Job Alerts
                </>
              )}
            </button>
          </div>

          {/* Toggle Options */}
          <button
            type="button"
            onClick={() => setShowOptions(!showOptions)}
            className="text-sm text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1 mx-auto"
          >
            {showOptions ? 'Hide options' : 'Customize alert'}
            <ChevronDown className={`w-4 h-4 transition-transform ${showOptions ? 'rotate-180' : ''}`} />
          </button>

          {/* Optional Fields */}
          {showOptions && (
            <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
              {/* Location */}
              <div>
                <label htmlFor="homepage-location" className="block text-sm font-medium text-gray-700 mb-1">
                  Location
                </label>
                <select
                  id="homepage-location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                >
                  <option value="">Any Location</option>
                  <option value="Remote">Remote Only</option>
                  <optgroup label="US States">
                    {US_STATES.map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* Frequency */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Alert Frequency
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="homepage-frequency"
                      value="daily"
                      checked={frequency === 'daily'}
                      onChange={(e) => setFrequency(e.target.value)}
                      className="w-4 h-4 text-teal-600 border-gray-300 focus:ring-teal-500"
                    />
                    <span className="text-sm text-gray-700">Daily</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="homepage-frequency"
                      value="weekly"
                      checked={frequency === 'weekly'}
                      onChange={(e) => setFrequency(e.target.value)}
                      className="w-4 h-4 text-teal-600 border-gray-300 focus:ring-teal-500"
                    />
                    <span className="text-sm text-gray-700">Weekly</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {message?.type === 'error' && (
            <div className="flex items-center gap-2 text-red-600 text-sm justify-center">
              <AlertCircle className="w-4 h-4" />
              {message.text}
            </div>
          )}

          {/* Privacy Note */}
          <p className="text-xs text-gray-500 text-center">
            No spam, unsubscribe anytime.{' '}
            <Link href="/job-alerts" className="text-teal-600 hover:underline">
              More options →
            </Link>
          </p>
        </form>
      )}
    </div>
  );
}
