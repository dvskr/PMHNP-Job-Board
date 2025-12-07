'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MapPin, Briefcase, Monitor, ExternalLink, DollarSign } from 'lucide-react';
import { formatSalary } from '@/lib/utils';

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

  const handleContinue = () => {
    router.push('/post-job/checkout');
  };

  if (loading || !formData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const salary = formatSalary(formData.minSalary, formData.maxSalary, formData.salaryPeriod);
  const price = formData.tier === 'featured' ? 199 : 99;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
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
          <div className="bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 p-4">
            <div className="bg-white rounded-lg shadow p-6 flex flex-col gap-3">
              {/* Title and Badges Row */}
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg font-semibold text-gray-900 flex-1">
                  {formData.title}
                </h3>
                <div className="flex gap-1 flex-wrap">
                  {formData.tier === 'featured' && (
                    <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
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
                  <span className="inline-flex px-2 py-1 rounded bg-blue-100 text-blue-700 text-xs">
                    {formData.jobType}
                  </span>
                )}
                {formData.mode && (
                  <span className="inline-flex px-2 py-1 rounded bg-blue-100 text-blue-700 text-xs">
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

          <div className="bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 p-4">
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
                  className="inline-flex items-center gap-2 bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold opacity-50 cursor-not-allowed"
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
            <p className="text-2xl font-bold text-gray-900">${price}</p>
          </div>

          <div className="text-sm text-gray-600">
            <p>• Your job will go live immediately after payment</p>
            <p>• Edit or update your listing anytime via email link</p>
            <p>• Reach thousands of qualified PMHNPs actively looking</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 sticky bottom-4 bg-white p-4 rounded-lg shadow-lg border border-gray-200">
          <button
            onClick={handleBack}
            className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 border border-gray-300 rounded-lg font-semibold text-gray-700 bg-white hover:bg-gray-50 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Back to Edit
          </button>
          <button
            onClick={handleContinue}
            className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            Looks Good - Continue to Payment
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

