'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Briefcase, Monitor, ExternalLink, DollarSign } from 'lucide-react';
import { formatSalary } from '@/lib/utils';
import { config } from '@/lib/config';

interface JobFormData {
  title: string;
  companyName: string;
  companyWebsite?: string;
  companyDescription?: string;
  location: string;
  mode?: string;
  jobType?: string;
  description: string;
  minSalary?: number;
  maxSalary?: number;
  salaryPeriod?: string;
  applyLink: string;
  contactEmail: string;
  tier: 'standard' | 'featured';
}

export default function PreviewPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<JobFormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Read form data from localStorage
    const stored = localStorage.getItem('jobFormData');
    if (!stored) {
      // No data, redirect to post-job
      router.push('/post-job');
      return;
    }

    try {
      const data = JSON.parse(stored) as JobFormData;
      setFormData(data);
    } catch (error) {
      console.error('Error parsing form data:', error);
      router.push('/post-job');
      return;
    }

    setLoading(false);
  }, [router]);

  const handleBack = () => {
    router.push('/post-job');
  };

  const handleContinue = async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (config.isPaidPostingEnabled) {
        // PAID MODE: Navigate to checkout (existing behavior)
        router.push('/post-job/checkout');
      } else {
        // FREE MODE: Submit directly to post-free API
        if (!formData) return;

        const response = await fetch('/api/jobs/post-free', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: formData.title,
            employer: formData.companyName,
            location: formData.location,
            mode: formData.mode,
            jobType: formData.jobType,
            description: formData.description,
            applyLink: formData.applyLink,
            contactEmail: formData.contactEmail,
            minSalary: formData.minSalary,
            maxSalary: formData.maxSalary,
            salaryPeriod: formData.salaryPeriod || 'annual',
            companyWebsite: formData.companyWebsite,
            pricing: formData.tier,
          }),
        });

        const result = await response.json();

        if (result.success) {
          // Clear localStorage
          localStorage.removeItem('jobFormData');
          // Redirect to success
          router.push('/success?free=true');
        } else {
          setError(result.error || 'Failed to post job');
        }
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (loading || !formData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  const salary = formatSalary(formData.minSalary, formData.maxSalary, formData.salaryPeriod);
  const price = config.isPaidPostingEnabled
    ? (formData.tier === 'featured' ? 199 : 99)
    : 0;
  const priceLabel = price === 0 ? 'FREE' : `$${price}`;

  return (
    <div className="min-h-screen bg-white py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Preview Your Job Post</h1>
          <p className="text-gray-600">Review how your job will appear to candidates</p>
        </div>

        {/* Section 1: Listing Preview */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">How it appears in job listings</h2>
            <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded">PREVIEW</span>
          </div>

          {/* Job Card Preview */}
          <div className="bg-white rounded-lg border-2 border-dashed border-gray-300 p-4">
            <div className="bg-white rounded-lg shadow p-6 flex flex-col gap-3">
              {/* Title and Badges Row */}
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg font-semibold text-gray-900 flex-1">
                  {formData.title}
                </h3>
                <div className="flex gap-1 flex-wrap">
                  {formData.tier === 'featured' && (
                    <span className="bg-teal-600 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                      Featured
                    </span>
                  )}
                </div>
              </div>

              {/* Company Name */}
              <p className="text-gray-600">{formData.companyName}</p>

              {/* Location */}
              <div className="flex items-center gap-1 text-gray-500 text-sm">
                <MapPin size={16} />
                <span>{formData.location}</span>
              </div>

              {/* Job Type and Mode Badges */}
              <div className="flex gap-2 flex-wrap">
                {formData.jobType && (
                  <span className="inline-flex px-2 py-1 rounded bg-teal-100 text-teal-700 text-xs">
                    {formData.jobType}
                  </span>
                )}
                {formData.mode && (
                  <span className="inline-flex px-2 py-1 rounded bg-teal-100 text-teal-700 text-xs">
                    {formData.mode}
                  </span>
                )}
              </div>

              {/* Salary */}
              {salary && (
                <p className="text-green-600 font-semibold">{salary}</p>
              )}

              {/* Posted Date */}
              <p className="text-gray-400 text-sm">Just posted</p>
            </div>
          </div>
        </div>

        {/* Section 2: Detail Page Preview */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Job detail page</h2>
            <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded">PREVIEW</span>
          </div>

          <div className="bg-white rounded-lg border-2 border-dashed border-gray-300 p-4">
            <div className="bg-white rounded-lg p-6">
              {/* Title and Company */}
              <h1 className="text-2xl md:text-3xl font-bold mb-2">{formData.title}</h1>
              <p className="text-xl text-gray-600 mb-4">{formData.companyName}</p>

              {/* Metadata Row */}
              <div className="flex flex-wrap gap-4 text-gray-600 mb-4">
                <div className="flex items-center gap-2">
                  <MapPin size={20} />
                  <span>{formData.location}</span>
                </div>
                {formData.jobType && (
                  <div className="flex items-center gap-2">
                    <Briefcase size={20} />
                    <span>{formData.jobType}</span>
                  </div>
                )}
                {formData.mode && (
                  <div className="flex items-center gap-2">
                    <Monitor size={20} />
                    <span>{formData.mode}</span>
                  </div>
                )}
              </div>

              {/* Salary */}
              {salary && (
                <div className="mb-4">
                  <p className="text-xl text-green-600 font-bold flex items-center gap-2">
                    <DollarSign size={20} />
                    {salary}
                  </p>
                </div>
              )}

              {/* Description */}
              <div className="mt-6">
                <h2 className="text-xl font-bold mb-3">About this role</h2>
                <div className="whitespace-pre-wrap text-gray-700 leading-relaxed text-sm">
                  {formData.description}
                </div>
              </div>

              {/* Apply Button (Disabled) */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <button
                  disabled
                  className="inline-flex items-center gap-2 bg-teal-600 text-white px-8 py-3 rounded-lg font-semibold opacity-50 cursor-not-allowed"
                >
                  Apply Now
                  <ExternalLink size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Pricing Summary */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Pricing Summary</h2>

          <div className="flex items-center justify-between mb-4 pb-4 border-b">
            <div>
              <p className="font-semibold text-gray-900">
                {formData.tier === 'featured' ? 'Featured Job Post' : 'Standard Job Post'}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {formData.tier === 'featured'
                  ? '✓ Priority placement ✓ Featured badge ✓ 60 days active'
                  : '✓ 30 days active ✓ Email to subscribers'
                }
              </p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{priceLabel}</p>
          </div>

          <div className="text-sm text-gray-600">
            <p>• Your job will go live immediately after payment</p>
            <p>• Edit or update your listing anytime via email link</p>
            <p>• Reach thousands of qualified PMHNPs actively looking</p>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 font-medium">{error}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 sticky bottom-4 bg-white p-4 rounded-lg shadow-lg border border-gray-200">
          <button
            onClick={handleBack}
            disabled={isLoading}
            className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 border border-gray-300 rounded-lg font-semibold text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Back to Edit
          </button>
          <button
            onClick={handleContinue}
            disabled={isLoading}
            className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading
              ? 'Processing...'
              : config.isPaidPostingEnabled
                ? 'Looks Good - Continue to Payment'
                : 'Looks Good - Post Job (Free)'}
            {!isLoading && (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

