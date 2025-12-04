'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { Job } from '@prisma/client';
import { AlertTriangle, CheckCircle } from 'lucide-react';

const editJobSchema = z.object({
  title: z.string().min(10, 'Job title must be at least 10 characters'),
  location: z.string().min(1, 'Location is required'),
  mode: z.enum(['Remote', 'Hybrid', 'In-Person'], {
    required_error: 'Please select a work mode',
  }),
  jobType: z.enum(['Full-Time', 'Part-Time', 'Contract', 'Per Diem'], {
    required_error: 'Please select a job type',
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
                {workModes.map((mode) => (
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
                {jobTypes.map((type) => (
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
    </div>
  );
}

