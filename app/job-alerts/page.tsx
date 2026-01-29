'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Bell, MapPin, Briefcase, Zap, CheckCircle, AlertCircle } from 'lucide-react';

// US States array for dropdown
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

// Work mode options
const WORK_MODES = ['Remote', 'Hybrid', 'In-Person'];

// Job type options
const JOB_TYPES = ['Full-Time', 'Part-Time', 'Contract', 'Per Diem'];

function JobAlertsContent() {
  const searchParams = useSearchParams();

  // Pre-fill from URL params
  const [email, setEmail] = useState('');
  const [location, setLocation] = useState(searchParams.get('location') || '');
  const [mode, setMode] = useState(searchParams.get('mode') || '');
  const [jobType, setJobType] = useState(searchParams.get('jobType') || '');
  const [frequency, setFrequency] = useState('weekly');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | ''; text: string }>({ type: '', text: '' });
  const [emailError, setEmailError] = useState('');

  // Watch for searchParams changes (e.g., from quick links)
  useEffect(() => {
    setLocation(searchParams.get('location') || '');
    setMode(searchParams.get('mode') || '');
    setJobType(searchParams.get('jobType') || '');
  }, [searchParams]);

  // Email validation
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Form submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError('');
    setMessage({ type: '', text: '' });

    // Validate email
    if (!email.trim()) {
      setEmailError('Email is required');
      return;
    }
    if (!validateEmail(email)) {
      setEmailError('Please enter a valid email address');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/job-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          location: location || undefined,
          mode: mode || undefined,
          jobType: jobType || undefined,
          frequency,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setMessage({ type: 'success', text: 'Job alert created! Check your email to confirm.' });
        // Reset form
        setEmail('');
        setLocation('');
        setMode('');
        setJobType('');
        setFrequency('weekly');
      } else {
        setMessage({ type: 'error', text: data.error || 'Something went wrong. Please try again.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Build criteria summary for display
  const buildCriteriaSummary = (): string => {
    const parts: string[] = [];
    if (mode) parts.push(mode);
    if (jobType) parts.push(jobType);
    if (location) parts.push(`in ${location}`);
    return parts.length > 0 ? parts.join(' · ') : 'All PMHNP jobs';
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero Section - Compact */}
      <div className="bg-gradient-to-b from-blue-600 to-blue-700 text-white">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-center gap-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-white/10">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">
                Never Miss Your Dream PMHNP Job
              </h1>
              <p className="text-sm text-blue-200">
                Get personalized job alerts delivered to your inbox.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex flex-wrap gap-6">
          {/* Main Form Card */}
          <div className="flex-1 min-w-[300px]">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 sm:p-6">
              <h2 className="text-xl font-semibold text-slate-900 mb-2">
                Create Your Job Alert
              </h2>
              <p className="text-slate-600 text-sm mb-6">
                Enter your details below and we&apos;ll notify you when matching jobs are posted.
              </p>

              {/* Success Message */}
              {message.type === 'success' && (
                <div className="mb-6 rounded-lg bg-emerald-50 border border-emerald-200 p-4 flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-emerald-900">{message.text}</p>
                    <p className="text-xs text-emerald-700 mt-1">
                      You can{' '}
                      <Link href="/job-alerts/manage" className="underline hover:no-underline">
                        manage your alerts
                      </Link>{' '}
                      anytime.
                    </p>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {message.type === 'error' && (
                <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{message.text}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Email Field */}
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailError) setEmailError('');
                    }}
                    placeholder="you@example.com"
                    className={`w-full rounded-lg border px-4 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 ${emailError
                        ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                        : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500'
                      }`}
                  />
                  {emailError && (
                    <p className="mt-1.5 text-xs text-red-600">{emailError}</p>
                  )}
                </div>

                {/* Location Dropdown */}
                <div>
                  <label htmlFor="location" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Location <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <select
                    id="location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="">Any Location</option>
                    <optgroup label="Work Arrangement">
                      <option value="Remote">Remote Only</option>
                    </optgroup>
                    <optgroup label="US States">
                      {US_STATES.map((state) => (
                        <option key={state} value={state}>
                          {state}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                {/* Work Mode Dropdown */}
                <div>
                  <label htmlFor="mode" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Work Mode <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <select
                    id="mode"
                    value={mode}
                    onChange={(e) => setMode(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="">Any Work Mode</option>
                    {WORK_MODES.map((workMode) => (
                      <option key={workMode} value={workMode}>
                        {workMode}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Job Type Dropdown */}
                <div>
                  <label htmlFor="jobType" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Job Type <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <select
                    id="jobType"
                    value={jobType}
                    onChange={(e) => setJobType(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="">Any Job Type</option>
                    {JOB_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Frequency Selection */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    How often would you like to receive alerts?
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="frequency"
                        value="weekly"
                        checked={frequency === 'weekly'}
                        onChange={(e) => setFrequency(e.target.value)}
                        className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                      />
                      <span className="text-sm text-slate-700">Weekly digest</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="frequency"
                        value="daily"
                        checked={frequency === 'daily'}
                        onChange={(e) => setFrequency(e.target.value)}
                        className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                      />
                      <span className="text-sm text-slate-700">Daily digest</span>
                    </label>
                  </div>
                </div>

                {/* Alert Preview */}
                <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-1">
                    You&apos;ll receive alerts for
                  </p>
                  <p className="text-sm font-medium text-slate-800">{buildCriteriaSummary()}</p>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <svg
                        className="h-4 w-4 animate-spin"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Creating Alert...
                    </>
                  ) : (
                    <>
                      <Bell className="w-4 h-4" />
                      Create Job Alert
                    </>
                  )}
                </button>

                <p className="text-xs text-center text-slate-500">
                  You can unsubscribe anytime from the email or{' '}
                  <Link href="/job-alerts/manage" className="text-blue-600 hover:underline">
                    manage your alerts
                  </Link>
                  .
                </p>
              </form>
            </div>
          </div>

          {/* Benefits Sidebar */}
          <div className="flex-1 min-w-[250px] flex flex-col gap-4">
            {/* Benefits Card */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-900 mb-4">Why Set Up Alerts?</h3>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center mt-0.5">
                    <Zap className="w-3 h-3 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">Be First to Apply</p>
                    <p className="text-xs text-slate-500">Get notified as soon as new jobs are posted</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center mt-0.5">
                    <Bell className="w-3 h-3 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">Personalized Matches</p>
                    <p className="text-xs text-slate-500">Only receive jobs that match your criteria</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-100 flex items-center justify-center mt-0.5">
                    <Briefcase className="w-3 h-3 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">Save Time</p>
                    <p className="text-xs text-slate-500">No need to check the site daily</p>
                  </div>
                </li>
              </ul>
            </div>

            {/* Quick Links Card */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-3">Popular Alert Filters</h3>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/job-alerts?mode=Remote"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-100 text-slate-700 rounded-full hover:bg-slate-200 transition-colors"
                >
                  <MapPin className="w-3 h-3" />
                  Remote
                </Link>
                <Link
                  href="/job-alerts?jobType=Full-Time"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-100 text-slate-700 rounded-full hover:bg-slate-200 transition-colors"
                >
                  <Briefcase className="w-3 h-3" />
                  Full-Time
                </Link>
                <Link
                  href="/job-alerts?location=California"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-100 text-slate-700 rounded-full hover:bg-slate-200 transition-colors"
                >
                  California
                </Link>
                <Link
                  href="/job-alerts?location=Texas"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-100 text-slate-700 rounded-full hover:bg-slate-200 transition-colors"
                >
                  Texas
                </Link>
                <Link
                  href="/job-alerts?location=New York"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-100 text-slate-700 rounded-full hover:bg-slate-200 transition-colors"
                >
                  New York
                </Link>
              </div>
            </div>

            {/* Stats Card */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100 p-6">
              <p className="text-sm font-medium text-blue-900 mb-3">Trusted by PMHNPs</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-2xl font-bold text-blue-600">200+</p>
                  <p className="text-xs text-blue-700">New jobs daily</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-blue-600">8,500+</p>
                  <p className="text-xs text-blue-700">Active listings</p>
                </div>
              </div>
            </div>

            {/* Already have alerts? */}
            <div className="text-center py-4">
              <p className="text-sm text-slate-500">
                Already have alerts?{' '}
                <Link href="/job-alerts/manage" className="text-blue-600 hover:text-blue-700 font-medium">
                  Manage them here
                </Link>
              </p>
            </div>
          </div>
        </div>

        {/* Browse Jobs Link */}
        <div className="mt-6 text-center pb-4">
          <Link
            href="/jobs"
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Browse all jobs instead
          </Link>
        </div>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex items-center gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="text-slate-600">Loading...</p>
      </div>
    </div>
  );
}

export default function JobAlertsPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <JobAlertsContent />
    </Suspense>
  );
}
