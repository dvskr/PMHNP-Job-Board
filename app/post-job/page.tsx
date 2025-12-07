'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const jobPostingSchema = z.object({
  title: z.string().min(10, 'Job title must be at least 10 characters'),
  companyName: z.string().min(1, 'Company name is required'),
  companyWebsite: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  contactEmail: z.string().email('Must be a valid email address'),
  location: z.string().min(1, 'Location is required'),
  mode: z.enum(['Remote', 'Hybrid', 'In-Person'], {
    required_error: 'Please select a work mode',
  }),
  jobType: z.enum(['Full-Time', 'Part-Time', 'Contract', 'Per Diem'], {
    required_error: 'Please select a job type',
  }),
  salaryMin: z.number().positive().optional().nullable(),
  salaryMax: z.number().positive().optional().nullable(),
  salaryCompetitive: z.boolean().optional(),
  description: z.string().min(200, 'Job description must be at least 200 characters'),
  applyUrl: z.string().url('Must be a valid URL'),
  pricingTier: z.enum(['standard', 'featured']),
});

type JobPostingFormData = z.infer<typeof jobPostingSchema>;

const workModes = ['Remote', 'Hybrid', 'In-Person'] as const;
const jobTypes = ['Full-Time', 'Part-Time', 'Contract', 'Per Diem'] as const;

export default function PostJobPage() {
  const router = useRouter();
  const [salaryCompetitive, setSalaryCompetitive] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
  } = useForm<JobPostingFormData>({
    resolver: zodResolver(jobPostingSchema),
    defaultValues: {
      pricingTier: 'standard',
      salaryCompetitive: false,
    },
  });

  const selectedPricingTier = watch('pricingTier');

  const onSubmit = (data: JobPostingFormData) => {
    // Store form data in localStorage
    localStorage.setItem('jobFormData', JSON.stringify(data));
    // Navigate to preview
    router.push('/post-job/preview');
  };

  const handleCompetitiveChange = (checked: boolean) => {
    setSalaryCompetitive(checked);
    setValue('salaryCompetitive', checked);
    if (checked) {
      setValue('salaryMin', null);
      setValue('salaryMax', null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold mb-2">Post a Job</h1>
        <p className="text-gray-600">
          Reach thousands of qualified psychiatric nurse practitioners
        </p>
      </div>

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
                placeholder="e.g. Remote PMHNP - Telepsychiatry"
                {...register('title')}
                className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.title ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.title && (
                <p className="mt-1 text-sm text-red-500">{errors.title.message}</p>
              )}
            </div>

            {/* Company Name */}
            <div>
              <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 mb-1">
                Company Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="companyName"
                placeholder="e.g. Mindful Health Partners"
                {...register('companyName')}
                className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.companyName ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.companyName && (
                <p className="mt-1 text-sm text-red-500">{errors.companyName.message}</p>
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
                placeholder="https://www.example.com"
                {...register('companyWebsite')}
                className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.companyWebsite ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.companyWebsite && (
                <p className="mt-1 text-sm text-red-500">{errors.companyWebsite.message}</p>
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
                placeholder="hiring@example.com"
                {...register('contactEmail')}
                className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.contactEmail ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.contactEmail && (
                <p className="mt-1 text-sm text-red-500">{errors.contactEmail.message}</p>
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
              <div className="flex flex-col sm:flex-row gap-4 mb-2">
                <div className="flex-1">
                  <input
                    type="number"
                    placeholder="Min $"
                    disabled={salaryCompetitive}
                    {...register('salaryMin', { valueAsNumber: true })}
                    className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      salaryCompetitive ? 'bg-gray-100 cursor-not-allowed' : ''
                    } border-gray-300`}
                  />
                </div>
                <div className="flex-1">
                  <input
                    type="number"
                    placeholder="Max $"
                    disabled={salaryCompetitive}
                    {...register('salaryMax', { valueAsNumber: true })}
                    className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      salaryCompetitive ? 'bg-gray-100 cursor-not-allowed' : ''
                    } border-gray-300`}
                  />
                </div>
              </div>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={salaryCompetitive}
                  onChange={(e) => handleCompetitiveChange(e.target.checked)}
                  className="w-4 h-4 text-blue-500 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-600">Competitive salary (don't display range)</span>
              </label>
            </div>

            {/* Job Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                Job Description <span className="text-red-500">*</span>
              </label>
              <textarea
                id="description"
                rows={8}
                placeholder="Describe the role, responsibilities, requirements, benefits..."
                {...register('description')}
                className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.description ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.description && (
                <p className="mt-1 text-sm text-red-500">{errors.description.message}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">Minimum 200 characters</p>
            </div>

            {/* Apply URL */}
            <div>
              <label htmlFor="applyUrl" className="block text-sm font-medium text-gray-700 mb-1">
                How to Apply URL <span className="text-red-500">*</span>
              </label>
              <input
                type="url"
                id="applyUrl"
                placeholder="https://www.example.com/careers/apply"
                {...register('applyUrl')}
                className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.applyUrl ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.applyUrl && (
                <p className="mt-1 text-sm text-red-500">{errors.applyUrl.message}</p>
              )}
            </div>
          </div>
        </div>

        {/* Pricing Section */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-6">Choose Your Plan</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Standard Plan */}
            <label
              className={`relative flex flex-col p-6 border-2 rounded-lg cursor-pointer transition-all ${
                selectedPricingTier === 'standard'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                value="standard"
                {...register('pricingTier')}
                className="absolute top-4 right-4 w-4 h-4 text-blue-500"
              />
              <span className="text-lg font-semibold mb-1">Standard Job</span>
              <span className="text-3xl font-bold text-gray-900 mb-2">$99</span>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• 30-day listing</li>
                <li>• Shown in job feed</li>
                <li>• Email alerts to subscribers</li>
              </ul>
            </label>

            {/* Featured Plan */}
            <label
              className={`relative flex flex-col p-6 border-2 rounded-lg cursor-pointer transition-all ${
                selectedPricingTier === 'featured'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                value="featured"
                {...register('pricingTier')}
                className="absolute top-4 right-4 w-4 h-4 text-blue-500"
              />
              <span className="absolute -top-3 left-4 bg-blue-500 text-white text-xs px-2 py-1 rounded">
                BEST VALUE
              </span>
              <span className="text-lg font-semibold mb-1">Featured Job</span>
              <span className="text-3xl font-bold text-gray-900 mb-2">$199</span>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• 60-day listing</li>
                <li>• Featured badge</li>
                <li>• Pinned to top of results</li>
                <li>• Priority email alerts</li>
                <li>• Social media promotion</li>
              </ul>
            </label>
          </div>
          {errors.pricingTier && (
            <p className="mt-2 text-sm text-red-500">{errors.pricingTier.message}</p>
          )}
        </div>

        {/* Submit Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-blue-500 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Processing...' : 'Preview Your Job'}
          </button>
        </div>
      </form>
    </div>
  );
}

