'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { config } from '@/lib/config';

interface JobFormData {
  title: string;
  companyName: string;
  companyWebsite?: string;
  contactEmail: string;
  location: string;
  mode: string;
  jobType: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCompetitive?: boolean;
  description: string;
  applyUrl: string;
  pricingTier: 'standard' | 'featured';
}

export default function CheckoutPage() {
  const router = useRouter();
  const [jobData, setJobData] = useState<JobFormData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if free mode is enabled - redirect to post-job page
    if (!config.isPaidPostingEnabled) {
      router.push('/post-job');
      return;
    }

    // Read jobFormData from localStorage
    const storedData = localStorage.getItem('jobFormData');
    
    if (!storedData) {
      // No data, redirect to post-job
      router.push('/post-job');
      return;
    }

    try {
      const parsedData: JobFormData = JSON.parse(storedData);
      setJobData(parsedData);
    } catch (err) {
      console.error('Error parsing job data:', err);
      router.push('/post-job');
    }
  }, [router]);

  const handlePayment = async () => {
    if (!jobData) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(jobData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create checkout session');
      }

      const { url } = await response.json();
      
      if (url) {
        window.location.href = url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err) {
      console.error('Checkout error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };

  const getPrice = () => {
    return jobData?.pricingTier === 'featured' ? '$199' : '$99';
  };

  const getPlanName = () => {
    return jobData?.pricingTier === 'featured' ? 'Featured Job' : 'Standard Job';
  };

  const formatSalary = () => {
    if (jobData?.salaryCompetitive) {
      return 'Competitive';
    }
    if (jobData?.salaryMin && jobData?.salaryMax) {
      return `$${jobData.salaryMin.toLocaleString()} - $${jobData.salaryMax.toLocaleString()}`;
    }
    if (jobData?.salaryMin) {
      return `$${jobData.salaryMin.toLocaleString()}+`;
    }
    if (jobData?.salaryMax) {
      return `Up to $${jobData.salaryMax.toLocaleString()}`;
    }
    return 'Not specified';
  };

  // Show loading while checking localStorage
  if (!jobData) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Confirm Your Job Posting</h1>
        <p className="text-gray-600">Review your listing before payment</p>
      </div>

      {/* Job Summary Card */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Job Posting Summary</h2>
        
        <div className="space-y-4">
          {/* Title and Company */}
          <div className="border-b pb-4">
            <h3 className="text-lg font-semibold text-gray-900">{jobData.title}</h3>
            <p className="text-gray-600">{jobData.companyName}</p>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="text-sm font-medium text-gray-500">Location</span>
              <p className="text-gray-900">{jobData.location}</p>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-500">Work Mode</span>
              <p className="text-gray-900">{jobData.mode}</p>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-500">Job Type</span>
              <p className="text-gray-900">{jobData.jobType}</p>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-500">Salary</span>
              <p className="text-gray-900">{formatSalary()}</p>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-500">Contact Email</span>
              <p className="text-gray-900">{jobData.contactEmail}</p>
            </div>
            {jobData.companyWebsite && (
              <div>
                <span className="text-sm font-medium text-gray-500">Company Website</span>
                <p className="text-gray-900 truncate">{jobData.companyWebsite}</p>
              </div>
            )}
          </div>

          {/* Apply URL */}
          <div>
            <span className="text-sm font-medium text-gray-500">Application URL</span>
            <p className="text-gray-900 truncate">{jobData.applyUrl}</p>
          </div>

          {/* Description Preview */}
          <div>
            <span className="text-sm font-medium text-gray-500">Description Preview</span>
            <p className="text-gray-700 text-sm mt-1 line-clamp-3">
              {jobData.description.substring(0, 200)}
              {jobData.description.length > 200 && '...'}
            </p>
          </div>
        </div>
      </div>

      {/* Pricing Card */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">{getPlanName()}</h3>
            <p className="text-sm text-gray-500">
              {jobData.pricingTier === 'featured' 
                ? '60-day listing • Featured badge • Pinned to top' 
                : '30-day listing • Shown in job feed'}
            </p>
          </div>
          <div className="text-right">
            <span className="text-3xl font-bold text-gray-900">{getPrice()}</span>
            <p className="text-sm text-gray-500">one-time</p>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-600">{error}</p>
        </div>
      )}

      {/* Payment Button */}
      <button
        onClick={handlePayment}
        disabled={loading}
        className="w-full bg-teal-500 text-white py-3 rounded-lg font-semibold hover:bg-teal-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            Creating checkout session...
          </>
        ) : (
          `Proceed to Payment - ${getPrice()}`
        )}
      </button>

      {/* Back Link */}
      <div className="text-center mt-4">
        <Link
          href="/post-job"
          className="text-gray-600 hover:text-teal-500 transition-colors text-sm"
        >
          ← Back to edit job posting
        </Link>
      </div>

      {/* Secure Payment Note */}
      <p className="text-center text-xs text-gray-400 mt-6">
        Secure payment powered by Stripe. Your card details are never stored on our servers.
      </p>
    </div>
  );
}

