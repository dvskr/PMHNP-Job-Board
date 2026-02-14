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
  const [frequency, setFrequency] = useState('daily');
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
        setFrequency('daily');
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

  const inputCls = "w-full rounded-lg border px-4 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500";
  const inputSty = {
    background: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
    borderColor: 'var(--border-color-dark)',
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      {/* Hero Section - Compact */}
      <div className="border-b" style={{ borderColor: 'var(--border-color)' }}>
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-center gap-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-full" style={{ background: 'var(--bg-tertiary)' }}>
              <Bell className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
            </div>
            <div>
              <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                Never Miss Your Dream PMHNP Job
              </h1>
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
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
            <div
              className="rounded-xl shadow-sm border p-5 sm:p-6"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
            >
              <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                Create Your Job Alert
              </h2>
              <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
                Enter your details below and we&apos;ll notify you when matching jobs are posted.
              </p>

              {/* Success Message */}
              {message.type === 'success' && (
                <div
                  className="mb-6 rounded-lg p-4 flex items-start gap-3"
                  style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}
                >
                  <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-emerald-500">{message.text}</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                      You can{' '}
                      <Link href="/job-alerts/manage" className="underline hover:no-underline" style={{ color: 'var(--color-primary)' }}>
                        manage your alerts
                      </Link>{' '}
                      anytime.
                    </p>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {message.type === 'error' && (
                <div
                  className="mb-6 rounded-lg p-4 flex items-start gap-3"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
                >
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-500">{message.text}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Email Field */}
                <div>
                  <label htmlFor="email" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
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
                    className={inputCls}
                    style={{
                      ...inputSty,
                      borderColor: emailError ? '#ef4444' : 'var(--border-color-dark)',
                    }}
                  />
                  {emailError && (
                    <p className="mt-1.5 text-xs text-red-500">{emailError}</p>
                  )}
                </div>

                {/* Location Dropdown */}
                <div>
                  <label htmlFor="location" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    Location <span className="font-normal" style={{ color: 'var(--text-tertiary)' }}>(optional)</span>
                  </label>
                  <select
                    id="location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className={inputCls}
                    style={inputSty}
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
                  <label htmlFor="mode" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    Work Mode <span className="font-normal" style={{ color: 'var(--text-tertiary)' }}>(optional)</span>
                  </label>
                  <select
                    id="mode"
                    value={mode}
                    onChange={(e) => setMode(e.target.value)}
                    className={inputCls}
                    style={inputSty}
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
                  <label htmlFor="jobType" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    Job Type <span className="font-normal" style={{ color: 'var(--text-tertiary)' }}>(optional)</span>
                  </label>
                  <select
                    id="jobType"
                    value={jobType}
                    onChange={(e) => setJobType(e.target.value)}
                    className={inputCls}
                    style={inputSty}
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
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    How often would you like to receive alerts?
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="frequency"
                        value="daily"
                        checked={frequency === 'daily'}
                        onChange={(e) => setFrequency(e.target.value)}
                        className="w-4 h-4 text-teal-600 focus:ring-teal-500"
                        style={{ borderColor: 'var(--border-color-dark)' }}
                      />
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Daily digest</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="frequency"
                        value="weekly"
                        checked={frequency === 'weekly'}
                        onChange={(e) => setFrequency(e.target.value)}
                        className="w-4 h-4 text-teal-600 focus:ring-teal-500"
                        style={{ borderColor: 'var(--border-color-dark)' }}
                      />
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Weekly digest</span>
                    </label>
                  </div>
                </div>

                {/* Alert Preview */}
                <div
                  className="rounded-lg border px-4 py-3"
                  style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border-color)' }}
                >
                  <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: 'var(--text-tertiary)' }}>
                    You&apos;ll receive alerts for
                  </p>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{buildCriteriaSummary()}</p>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full rounded-lg px-4 py-3 text-sm font-semibold text-white transition-all hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{ background: 'var(--color-primary)' }}
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

                <p className="text-xs text-center" style={{ color: 'var(--text-tertiary)' }}>
                  You can unsubscribe anytime from the email or{' '}
                  <Link href="/job-alerts/manage" className="hover:underline" style={{ color: 'var(--color-primary)' }}>
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
            <div
              className="rounded-xl shadow-sm border p-5"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
            >
              <h3 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Why Set Up Alerts?</h3>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5" style={{ background: 'rgba(16,185,129,0.15)' }}>
                    <Zap className="w-3 h-3 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Be First to Apply</p>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Get notified as soon as new jobs are posted</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5" style={{ background: 'rgba(20,184,166,0.15)' }}>
                    <Bell className="w-3 h-3" style={{ color: 'var(--color-primary)' }} />
                  </div>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Personalized Matches</p>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Only receive jobs that match your criteria</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5" style={{ background: 'rgba(168,85,247,0.15)' }}>
                    <Briefcase className="w-3 h-3 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Save Time</p>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>No need to check the site daily</p>
                  </div>
                </li>
              </ul>
            </div>

            {/* Quick Links Card */}
            <div
              className="rounded-xl shadow-sm border p-6"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
            >
              <h3 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Popular Alert Filters</h3>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/job-alerts?mode=Remote"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full transition-colors"
                  style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                >
                  <MapPin className="w-3 h-3" />
                  Remote
                </Link>
                <Link
                  href="/job-alerts?jobType=Full-Time"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full transition-colors"
                  style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                >
                  <Briefcase className="w-3 h-3" />
                  Full-Time
                </Link>
                <Link
                  href="/job-alerts?location=California"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full transition-colors"
                  style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                >
                  California
                </Link>
                <Link
                  href="/job-alerts?location=Texas"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full transition-colors"
                  style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                >
                  Texas
                </Link>
                <Link
                  href="/job-alerts?location=New York"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full transition-colors"
                  style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                >
                  New York
                </Link>
              </div>
            </div>

            {/* Stats Card */}
            <div
              className="rounded-xl border p-6"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color-dark)' }}
            >
              <p className="text-sm font-medium mb-3" style={{ color: 'var(--color-primary)' }}>Trusted by PMHNPs</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>200+</p>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>New jobs daily</p>
                </div>
                <div>
                  <p className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>10,000+</p>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Active listings</p>
                </div>
              </div>
            </div>

            {/* Already have alerts? */}
            <div className="text-center py-4">
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                Already have alerts?{' '}
                <Link href="/job-alerts/manage" className="font-medium hover:underline" style={{ color: 'var(--color-primary)' }}>
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
            className="inline-flex items-center gap-2 font-medium"
            style={{ color: 'var(--text-secondary)' }}
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
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
      <div className="flex items-center gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--color-primary)' }}></div>
        <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
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
