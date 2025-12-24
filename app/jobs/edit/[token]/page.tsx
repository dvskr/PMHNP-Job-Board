'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { Job } from '@/lib/types';
import { AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';

const editJobSchema = z.object({
  title: z.string().min(10, 'Job title must be at least 10 characters'),
  location: z.string().min(1, 'Location is required'),
  mode: z.enum(['Remote', 'Hybrid', 'In-Person'], {
    message: 'Please select a work mode',
  }),
  jobType: z.enum(['Full-Time', 'Part-Time', 'Contract', 'Per Diem'], {
    message: 'Please select a job type',
  }),
  salaryMin: z.number().positive().optional().nullable(),
  salaryMax: z.number().positive().optional().nullable(),
  description: z.string().min(200, 'Job description must be at least 200 characters'),
  applyUrl: z.string().url('Must be a valid URL'),
  contactEmail: z.string().email('Must be a valid email address'),
  companyWebsite: z.string().url('Must be a valid URL').optional().or(z.literal('')),
});

type EditJobFormData = z.infer<typeof editJobSchema>;

interface EmployerJobData {
  id: string;
  employerName: string;
  contactEmail: string;
  companyWebsite: string | null;
  paymentStatus: string;
}

const workModes = ['Remote', 'Hybrid', 'In-Person'] as const;
const jobTypes = ['Full-Time', 'Part-Time', 'Contract', 'Per Diem'] as const;

export default function EditJobPage({ params }: { params: Promise<{ token: string }> }) {
  const router = useRouter();
  const [token, setToken] = useState<string>('');
  const [job, setJob] = useState<Job | null>(null);
  const [employerJob, setEmployerJob] = useState<EmployerJobData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [showUnpublishConfirm, setShowUnpublishConfirm] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [showRenewModal, setShowRenewModal] = useState(false);
  const [renewingTier, setRenewingTier] = useState<'standard' | 'featured' | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<EditJobFormData>({
    resolver: zodResolver(editJobSchema),
  });

  useEffect(() => {
    const fetchJob = async () => {
      try {
        const resolvedParams = await params;
        setToken(resolvedParams.token);

        const response = await fetch(`/api/jobs/edit/${resolvedParams.token}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch job');
        }

        setJob(data.job);
        setEmployerJob(data.employerJob);

        // Pre-fill form
        reset({
          title: data.job.title,
          location: data.job.location,
          mode: data.job.mode as 'Remote' | 'Hybrid' | 'In-Person',
          jobType: data.job.jobType as 'Full-Time' | 'Part-Time' | 'Contract' | 'Per Diem',
          salaryMin: data.job.minSalary,
          salaryMax: data.job.maxSalary,
          description: data.job.description,
          applyUrl: data.job.applyLink,
          contactEmail: data.employerJob.contactEmail,
          companyWebsite: data.employerJob.companyWebsite || '',
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchJob();
  }, [params, reset]);

  const onSubmit = async (data: EditJobFormData) => {
    try {
      setUpdateSuccess(false);
      setError(null);

      const response = await fetch('/api/jobs/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          jobData: {
            title: data.title,
            location: data.location,
            mode: data.mode,
            jobType: data.jobType,
            description: data.description,
            applyLink: data.applyUrl,
            minSalary: data.salaryMin,
            maxSalary: data.salaryMax,
            salaryPeriod: 'year',
            contactEmail: data.contactEmail,
            companyWebsite: data.companyWebsite || null,
          },
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update job');
      }

      setUpdateSuccess(true);
      setJob(result.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update job');
    }
  };

  const handleUnpublish = async () => {
    try {
      setUnpublishing(true);
      setError(null);

      const response = await fetch(`/api/jobs/update?token=${token}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to unpublish job');
      }

      // Redirect to jobs page
      router.push('/jobs?unpublished=true');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unpublish job');
      setUnpublishing(false);
    }
  };

  const isExpired = (): boolean => {
    if (!job?.expiresAt) return false;
    return new Date(job.expiresAt) < new Date();
  };

  const isExpiringSoon = (): boolean => {
    if (!job?.expiresAt) return false;
    const daysUntilExpiry = Math.ceil(
      (new Date(job.expiresAt).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysUntilExpiry > 0 && daysUntilExpiry <= 7;
  };

  const shouldShowRenew = (): boolean => {
    return isExpired() || isExpiringSoon();
  };

  const handleRenewCheckout = async (tier: 'standard' | 'featured') => {
    if (!job) return;

    setRenewingTier(tier);
    setShowRenewModal(false);

    try {
      const response = await fetch('/api/create-renewal-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          editToken: token,
          tier,
        }),
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to create checkout');
      }

      // Redirect to Stripe checkout
      if (result.url) {
        window.location.href = result.url;
      }
    } catch (err) {
      console.error('Renewal checkout error:', err);
      alert(err instanceof Error ? err.message : 'Failed to start renewal process');
      setRenewingTier(null);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <p className="text-gray-600">Loading job details...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state (invalid token)
  if (error && !job) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid Edit Link</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <p className="text-sm text-gray-500">
            This link may have expired or is invalid. Please check your email for the correct edit link.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Edit Job Posting</h1>
        <p className="text-gray-600">
          Update your job listing for <strong>{employerJob?.employerName}</strong>
        </p>
      </div>

      {/* Success Message */}
      {updateSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 flex items-center gap-3">
          <CheckCircle className="text-green-500" size={20} />
          <p className="text-green-700">Job updated successfully!</p>
        </div>
      )}

      {/* Error Message */}
      {error && job && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-600">{error}</p>
        </div>
      )}

      {/* Expiry Warning & Renew Section */}
      {shouldShowRenew() && job && (
        <div className={`rounded-lg border-2 p-6 mb-6 ${
          isExpired() 
            ? 'bg-red-50 border-red-300' 
            : 'bg-orange-50 border-orange-300'
        }`}>
          <div className="flex items-start gap-3 mb-4">
            <AlertTriangle className={`flex-shrink-0 ${
              isExpired() ? 'text-red-600' : 'text-orange-600'
            }`} size={24} />
            <div className="flex-1">
              <h3 className={`font-bold text-lg mb-1 ${
                isExpired() ? 'text-red-900' : 'text-orange-900'
              }`}>
                {isExpired() ? 'This job has expired' : 'This job expires soon'}
              </h3>
              <p className={`text-sm mb-4 ${
                isExpired() ? 'text-red-700' : 'text-orange-700'
              }`}>
                {isExpired() 
                  ? `This job expired on ${new Date(job.expiresAt!).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} and is no longer visible to candidates.`
                  : `This job expires on ${new Date(job.expiresAt!).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}. Renew now to keep it visible.`
                }
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => setShowRenewModal(true)}
                  disabled={renewingTier !== null}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw size={18} className={renewingTier ? 'animate-spin' : ''} />
                  {renewingTier ? 'Processing...' : 'Renew This Job'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* Job Details Section */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-6">Job Details</h2>
          
          <div className="space-y-6">
            {/* Job Title */}
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
                Job Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="title"
                {...register('title')}
                className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.title ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.title && (
                <p className="mt-1 text-sm text-red-500">{errors.title.message}</p>
              )}
            </div>

            {/* Location */}
            <div>
              <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">
                Location <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="location"
                placeholder="e.g. Remote, New York NY"
                {...register('location')}
                className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.location ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.location && (
                <p className="mt-1 text-sm text-red-500">{errors.location.message}</p>
              )}
            </div>

            {/* Work Mode */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Work Mode <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-wrap gap-4">
                {workModes.map((mode: typeof workModes[number]) => (
                  <label key={mode} className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      value={mode}
                      {...register('mode')}
                      className="w-4 h-4 text-blue-500 border-gray-300 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-600">{mode}</span>
                  </label>
                ))}
              </div>
              {errors.mode && (
                <p className="mt-1 text-sm text-red-500">{errors.mode.message}</p>
              )}
            </div>

            {/* Job Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Job Type <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-wrap gap-4">
                {jobTypes.map((type: typeof jobTypes[number]) => (
                  <label key={type} className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      value={type}
                      {...register('jobType')}
                      className="w-4 h-4 text-blue-500 border-gray-300 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-600">{type}</span>
                  </label>
                ))}
              </div>
              {errors.jobType && (
                <p className="mt-1 text-sm text-red-500">{errors.jobType.message}</p>
              )}
            </div>

            {/* Salary Range */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Salary Range (Annual)
              </label>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <input
                    type="number"
                    placeholder="Min $"
                    {...register('salaryMin', { valueAsNumber: true })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex-1">
                  <input
                    type="number"
                    placeholder="Max $"
                    {...register('salaryMax', { valueAsNumber: true })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Job Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                Job Description <span className="text-red-500">*</span>
              </label>
              <textarea
                id="description"
                rows={8}
                {...register('description')}
                className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.description ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.description && (
                <p className="mt-1 text-sm text-red-500">{errors.description.message}</p>
              )}
            </div>

            {/* Apply URL */}
            <div>
              <label htmlFor="applyUrl" className="block text-sm font-medium text-gray-700 mb-1">
                How to Apply URL <span className="text-red-500">*</span>
              </label>
              <input
                type="url"
                id="applyUrl"
                {...register('applyUrl')}
                className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.applyUrl ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.applyUrl && (
                <p className="mt-1 text-sm text-red-500">{errors.applyUrl.message}</p>
              )}
            </div>

            {/* Contact Email */}
            <div>
              <label htmlFor="contactEmail" className="block text-sm font-medium text-gray-700 mb-1">
                Contact Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                id="contactEmail"
                {...register('contactEmail')}
                className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.contactEmail ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.contactEmail && (
                <p className="mt-1 text-sm text-red-500">{errors.contactEmail.message}</p>
              )}
            </div>

            {/* Company Website */}
            <div>
              <label htmlFor="companyWebsite" className="block text-sm font-medium text-gray-700 mb-1">
                Company Website
              </label>
              <input
                type="url"
                id="companyWebsite"
                {...register('companyWebsite')}
                className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.companyWebsite ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.companyWebsite && (
                <p className="mt-1 text-sm text-red-500">{errors.companyWebsite.message}</p>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <button
            type="button"
            onClick={() => setShowUnpublishConfirm(true)}
            className="px-6 py-3 bg-red-50 text-red-600 rounded-lg font-semibold hover:bg-red-100 transition-colors border border-red-200"
          >
            Unpublish Job
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-8 py-3 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Updating...' : 'Update Job'}
          </button>
        </div>
      </form>

      {/* Unpublish Confirmation Dialog */}
      {showUnpublishConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="text-red-500" size={24} />
              <h3 className="text-xl font-semibold">Unpublish Job?</h3>
            </div>
            <p className="text-gray-600 mb-6">
              Are you sure you want to unpublish this job? It will no longer be visible to job seekers.
              You can contact support if you need to republish it later.
            </p>
            <div className="flex gap-4 justify-end">
              <button
                onClick={() => setShowUnpublishConfirm(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUnpublish}
                disabled={unpublishing}
                className="px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {unpublishing ? 'Unpublishing...' : 'Yes, Unpublish'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Renewal Modal */}
      {showRenewModal && job && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="mb-4">
              <h3 className="text-xl font-bold text-gray-900 mb-2">Renew Job Posting</h3>
              <p className="text-sm text-gray-600">{job.title}</p>
            </div>

            <p className="text-gray-700 mb-6">Choose how you&apos;d like to renew your listing:</p>

            <div className="space-y-3 mb-6">
              {/* Standard Option */}
              <button
                onClick={() => handleRenewCheckout('standard')}
                className="w-full text-left border-2 border-gray-300 rounded-lg p-4 hover:border-blue-500 hover:bg-blue-50 transition-all group"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-gray-900 group-hover:text-blue-700">Standard Renewal</span>
                  <span className="text-2xl font-bold text-gray-900 group-hover:text-blue-700">$99</span>
                </div>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>✓ 30 days of visibility</li>
                  <li>✓ Standard placement</li>
                  <li>✓ Email confirmation</li>
                </ul>
              </button>

              {/* Featured Option */}
              <button
                onClick={() => handleRenewCheckout('featured')}
                className="w-full text-left border-2 border-blue-500 bg-blue-50 rounded-lg p-4 hover:bg-blue-100 transition-all group relative"
              >
                <div className="absolute top-2 right-2">
                  <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded">BEST VALUE</span>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-blue-900">Featured Renewal</span>
                  <span className="text-2xl font-bold text-blue-900">$199</span>
                </div>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>✓ 60 days of visibility</li>
                  <li>✓ <strong>Featured placement</strong> (top of list)</li>
                  <li>✓ <strong>2x more visibility</strong></li>
                  <li>✓ Email confirmation</li>
                </ul>
              </button>
            </div>

            {/* Cancel Button */}
            <button
              onClick={() => setShowRenewModal(false)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

