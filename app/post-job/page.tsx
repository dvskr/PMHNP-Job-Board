'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import { config } from '@/lib/config';

const jobPostingSchema = z.object({
  title: z.string().min(10, 'Job title must be at least 10 characters'),
  companyName: z.string().min(1, 'Company name is required'),
  companyWebsite: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  contactEmail: z.string().email('Must be a valid email address'),
  location: z.string().min(1, 'Location is required'),
  mode: z.enum(['Remote', 'Hybrid', 'In-Person']),
  jobType: z.enum(['Full-Time', 'Part-Time', 'Contract', 'Per Diem']),
  salaryPeriod: z.enum(['hourly', 'weekly', 'monthly', 'annual']).optional(),
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
const salaryPeriods = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'annual', label: 'Annual' },
] as const;

function PostJobContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [salaryCompetitive, setSalaryCompetitive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSaveMessage, setDraftSaveMessage] = useState<string | null>(null);
  const [emailWarning, setEmailWarning] = useState<string | null>(null);

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
      salaryPeriod: 'annual',
    },
  });

  const selectedPricingTier = watch('pricingTier');
  const contactEmail = watch('contactEmail');
  const salaryPeriod = watch('salaryPeriod');

  // Load saved form data or draft on mount
  useEffect(() => {
    const loadFormData = async () => {
      // Check for resume token in URL
      const resumeToken = searchParams.get('resume');
      
      if (resumeToken) {
        // Load draft from API
        try {
          const response = await fetch(`/api/job-draft?token=${resumeToken}`);
          const result = await response.json();

          if (response.ok && result.success) {
            const formData = result.formData;
            
            // Restore all form fields from draft
            Object.keys(formData).forEach((key: string) => {
              const value = formData[key as keyof JobPostingFormData];
              setValue(key as keyof JobPostingFormData, value);
            });

            // Update salary competitive state
            if (formData.salaryCompetitive) {
              setSalaryCompetitive(true);
            }

            setDraftLoaded(true);
          } else {
            console.error('Failed to load draft:', result.error);
          }
        } catch (err) {
          console.error('Error loading draft:', err);
        }
      } else {
        // Try loading from localStorage
        const savedData = localStorage.getItem('jobFormData');
        if (savedData) {
          try {
            const parsedData: JobPostingFormData = JSON.parse(savedData);
            
            // Restore all form fields
            Object.keys(parsedData).forEach((key: string) => {
              const value = parsedData[key as keyof JobPostingFormData];
              setValue(key as keyof JobPostingFormData, value);
            });

            // Update salary competitive state
            if (parsedData.salaryCompetitive) {
              setSalaryCompetitive(true);
            }
          } catch (err) {
            console.error('Error loading saved form data:', err);
          }
        }
      }
      
      setIsLoading(false);
    };

    loadFormData();
  }, [setValue, searchParams]);

  const onSubmit = async (data: JobPostingFormData) => {
    if (!config.isPaidPostingEnabled) {
      // Free posting mode - submit directly
      try {
        const response = await fetch('/api/jobs/post-free', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: data.title,
            employer: data.companyName,
            location: data.location,
            mode: data.mode,
            jobType: data.jobType,
            description: data.description,
            applyLink: data.applyUrl,
            contactEmail: data.contactEmail,
            minSalary: data.salaryMin,
            maxSalary: data.salaryMax,
            salaryPeriod: data.salaryPeriod || 'annual',
            companyWebsite: data.companyWebsite,
            pricing: data.pricingTier,
          }),
        });

        const result = await response.json();

        if (response.ok && result.success) {
          // Clear form data
          localStorage.removeItem('jobFormData');
          // Redirect to success page
          router.push('/success?free=true');
        } else {
          alert(result.error || 'Failed to post job. Please try again.');
        }
      } catch (error) {
        console.error('Error posting job:', error);
        alert('Failed to post job. Please try again.');
      }
    } else {
      // Paid posting mode - store and navigate to preview
      localStorage.setItem('jobFormData', JSON.stringify(data));
      router.push('/post-job/preview');
    }
  };

  const handleSaveDraft = async () => {
    // Check if email is filled
    if (!contactEmail || contactEmail.trim() === '') {
      setDraftSaveMessage('Please enter your email address first');
      setTimeout(() => setDraftSaveMessage(null), 3000);
      return;
    }

    setSavingDraft(true);
    setDraftSaveMessage(null);

    try {
      // Get all current form values
      const formData = watch();

      const response = await fetch('/api/job-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: contactEmail,
          formData,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setDraftSaveMessage('Draft saved! Check your email to continue later.');
      } else {
        setDraftSaveMessage(result.error || 'Failed to save draft');
      }
    } catch (err) {
      console.error('Error saving draft:', err);
      setDraftSaveMessage('Failed to save draft. Please try again.');
    } finally {
      setSavingDraft(false);
      // Clear message after 5 seconds
      setTimeout(() => setDraftSaveMessage(null), 5000);
    }
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
    <>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 pb-32 lg:pb-8">
        {/* Page Header */}
        <div className="mb-6 lg:mb-8">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2">Post a Job</h1>
          <p className="text-gray-600 text-sm sm:text-base">
            Reach thousands of qualified psychiatric nurse practitioners
          </p>
        </div>

      {/* Draft Loaded Message */}
      {draftLoaded && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-800 font-medium">
            ✓ Welcome back! Your draft has been loaded.
          </p>
        </div>
      )}

      {/* Draft Save Message */}
      {draftSaveMessage && (
        <div className={`mb-6 border rounded-lg p-4 ${
          draftSaveMessage.includes('saved') || draftSaveMessage.includes('Check your email')
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <p className="font-medium">{draftSaveMessage}</p>
        </div>
      )}

      {/* Free Mode Banner */}
      {!config.isPaidPostingEnabled && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-800 font-medium">
            🎉 Launch Special: Job postings are FREE for a limited time!
          </p>
        </div>
      )}

      <form id="job-post-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6 lg:space-y-8">
        {/* Job Details Section */}
        <div className="bg-white rounded-lg shadow-md p-5 md:p-6">
          <h2 className="text-lg sm:text-xl font-semibold mb-5 lg:mb-6">Job Details</h2>
          
          <div className="space-y-5 lg:space-y-6">
            {/* Job Title */}
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                Job Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="title"
                placeholder="e.g. Remote PMHNP - Telepsychiatry"
                {...register('title')}
                className={`w-full border rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors ${
                  errors.title ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-gray-300'
                }`}
                style={{ minHeight: '44px' }}
              />
              {errors.title && (
                <p className="mt-2 text-sm font-medium text-red-600">{errors.title.message}</p>
              )}
            </div>

            {/* Company Name */}
            <div>
              <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 mb-2">
                Company Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="companyName"
                placeholder="e.g. Mindful Health Partners"
                {...register('companyName')}
                className={`w-full border rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors ${
                  errors.companyName ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-gray-300'
                }`}
                style={{ minHeight: '44px' }}
              />
              {errors.companyName && (
                <p className="mt-2 text-sm font-medium text-red-600">{errors.companyName.message}</p>
              )}
            </div>

            {/* Company Website */}
            <div>
              <label htmlFor="companyWebsite" className="block text-sm font-medium text-gray-700 mb-2">
                Company Website
              </label>
              <input
                type="url"
                inputMode="url"
                id="companyWebsite"
                placeholder="https://www.example.com"
                {...register('companyWebsite')}
                className={`w-full border rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors ${
                  errors.companyWebsite ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-gray-300'
                }`}
                style={{ minHeight: '44px' }}
              />
              {errors.companyWebsite && (
                <p className="mt-2 text-sm font-medium text-red-600">{errors.companyWebsite.message}</p>
              )}
            </div>

            {/* Contact Email */}
            <div>
              <label htmlFor="contactEmail" className="block text-sm font-medium text-gray-700 mb-1">
                Contact Email <span className="text-red-500">*</span>
              </label>
              <p className="text-sm text-gray-500 mb-2">
                Use your company email (not Gmail/Yahoo) to verify you represent this employer
              </p>
              <input
                type="email"
                inputMode="email"
                id="contactEmail"
                placeholder="hiring@yourcompany.com"
                {...register('contactEmail')}
                onBlur={(e) => {
                  const FREE_EMAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com', 'live.com', 'msn.com'];
                  const email = e.target.value.toLowerCase();
                  const emailDomain = email.split('@')[1];
                  if (emailDomain && FREE_EMAIL_DOMAINS.includes(emailDomain)) {
                    setEmailWarning('Please use your company email address (not Gmail, Yahoo, etc.)');
                  } else {
                    setEmailWarning(null);
                  }
                }}
                className={`w-full border rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                  errors.contactEmail || emailWarning ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-gray-300'
                }`}
                style={{ minHeight: '44px' }}
              />
              {errors.contactEmail && (
                <p className="mt-2 text-sm font-medium text-red-600">{errors.contactEmail.message}</p>
              )}
              {emailWarning && !errors.contactEmail && (
                <p className="mt-2 text-sm font-medium text-red-600">{emailWarning}</p>
              )}
            </div>

            {/* Location */}
            <div>
              <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-2">
                Location <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="location"
                placeholder="e.g. Remote, New York NY"
                {...register('location')}
                className={`w-full border rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors ${
                  errors.location ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-gray-300'
                }`}
                style={{ minHeight: '44px' }}
              />
              {errors.location && (
                <p className="mt-2 text-sm font-medium text-red-600">{errors.location.message}</p>
              )}
            </div>

            {/* Work Mode */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Work Mode <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:gap-4">
                {workModes.map((mode: typeof workModes[number]) => (
                  <label key={mode} className="flex items-center cursor-pointer touch-manipulation py-1">
                    <input
                      type="radio"
                      value={mode}
                      {...register('mode')}
                      className="w-5 h-5 text-primary-600 border-gray-300 focus:ring-primary-500"
                    />
                    <span className="ml-3 text-base text-gray-700">{mode}</span>
                  </label>
                ))}
              </div>
              {errors.mode && (
                <p className="mt-2 text-sm font-medium text-red-600">{errors.mode.message}</p>
              )}
            </div>

            {/* Job Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Job Type <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:gap-4">
                {jobTypes.map((type: typeof jobTypes[number]) => (
                  <label key={type} className="flex items-center cursor-pointer touch-manipulation py-1">
                    <input
                      type="radio"
                      value={type}
                      {...register('jobType')}
                      className="w-5 h-5 text-primary-600 border-gray-300 focus:ring-primary-500"
                    />
                    <span className="ml-3 text-base text-gray-700">{type}</span>
                  </label>
                ))}
              </div>
              {errors.jobType && (
                <p className="mt-2 text-sm font-medium text-red-600">{errors.jobType.message}</p>
              )}
            </div>

            {/* Salary Range */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Salary Range
              </label>
              
              {/* Salary Period Selector */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 mb-2">
                  Pay Period
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {salaryPeriods.map((period: typeof salaryPeriods[number]) => (
                    <label
                      key={period.value}
                      className="relative flex items-center justify-center cursor-pointer touch-manipulation"
                      style={{ minHeight: '44px' }}
                    >
                      <input
                        type="radio"
                        value={period.value}
                        disabled={salaryCompetitive}
                        {...register('salaryPeriod')}
                        className="sr-only peer"
                      />
                      <div className={`w-full border-2 rounded-lg px-4 py-2.5 text-center transition-all ${
                        salaryCompetitive
                          ? 'bg-gray-100 cursor-not-allowed border-gray-300 text-gray-400'
                          : 'border-gray-300 peer-checked:border-primary-600 peer-checked:bg-primary-50 peer-checked:text-primary-700 hover:border-primary-400'
                      }`}>
                        <span className="text-sm font-medium">{period.label}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Min and Max Salary Inputs */}
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-3">
                <div className="flex-1">
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder={`Min ${salaryPeriod === 'hourly' ? '$/hr' : salaryPeriod === 'weekly' ? '$/week' : salaryPeriod === 'monthly' ? '$/month' : '$ annual'}`}
                    disabled={salaryCompetitive}
                    {...register('salaryMin', { valueAsNumber: true })}
                    className={`w-full border rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors ${
                      salaryCompetitive ? 'bg-gray-100 cursor-not-allowed' : 'border-gray-300'
                    }`}
                    style={{ minHeight: '44px' }}
                  />
                </div>
                <div className="flex-1">
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder={`Max ${salaryPeriod === 'hourly' ? '$/hr' : salaryPeriod === 'weekly' ? '$/week' : salaryPeriod === 'monthly' ? '$/month' : '$ annual'}`}
                    disabled={salaryCompetitive}
                    {...register('salaryMax', { valueAsNumber: true })}
                    className={`w-full border rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors ${
                      salaryCompetitive ? 'bg-gray-100 cursor-not-allowed' : 'border-gray-300'
                    }`}
                    style={{ minHeight: '44px' }}
                  />
                </div>
              </div>
              <label className="flex items-center cursor-pointer touch-manipulation py-2">
                <input
                  type="checkbox"
                  checked={salaryCompetitive}
                  onChange={(e) => handleCompetitiveChange(e.target.checked)}
                  className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className="ml-3 text-sm sm:text-base text-gray-700">Competitive salary (don't display range)</span>
              </label>
            </div>

            {/* Job Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                Job Description <span className="text-red-500">*</span>
              </label>
              <textarea
                id="description"
                rows={8}
                placeholder="Describe the role, responsibilities, requirements, benefits..."
                {...register('description')}
                className={`w-full border rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors ${
                  errors.description ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.description && (
                <p className="mt-2 text-sm font-medium text-red-600">{errors.description.message}</p>
              )}
              <p className="mt-2 text-xs text-gray-500">Minimum 200 characters</p>
            </div>

            {/* Apply URL */}
            <div>
              <label htmlFor="applyUrl" className="block text-sm font-medium text-gray-700 mb-2">
                How to Apply URL <span className="text-red-500">*</span>
              </label>
              <input
                type="url"
                inputMode="url"
                id="applyUrl"
                placeholder="https://www.example.com/careers/apply"
                {...register('applyUrl')}
                className={`w-full border rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors ${
                  errors.applyUrl ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-gray-300'
                }`}
                style={{ minHeight: '44px' }}
              />
              {errors.applyUrl && (
                <p className="mt-2 text-sm font-medium text-red-600">{errors.applyUrl.message}</p>
              )}
            </div>
          </div>
        </div>

        {/* Pricing Section */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-6">Choose Your Plan</h2>
          
          {!config.isPaidPostingEnabled && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                🎉 Limited time: Post jobs for FREE during our launch period!
              </p>
            </div>
          )}
          
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
              <span className="text-3xl font-bold text-gray-900 mb-2">
                {config.getPricingLabel('standard')}
              </span>
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
                {!config.isPaidPostingEnabled ? '⭐ RECOMMENDED' : 'BEST VALUE'}
              </span>
              <span className="text-lg font-semibold mb-1">Featured Job</span>
              <span className="text-3xl font-bold text-gray-900 mb-2">
                {config.getPricingLabel('featured')}
              </span>
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

        {/* Submit Buttons - Desktop */}
        <div className="hidden lg:flex flex-row justify-end gap-3">
          {/* Save Draft Button */}
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={savingDraft}
            className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ minHeight: '48px' }}
          >
            {savingDraft ? 'Saving...' : 'Save Draft'}
          </button>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ minHeight: '48px' }}
          >
            {isSubmitting 
              ? 'Processing...' 
              : !config.isPaidPostingEnabled 
                ? 'Post Job - Free' 
                : 'Continue to Payment →'}
          </button>
        </div>

        {/* Mobile-only spacer for sticky button */}
        <div className="lg:hidden h-4"></div>
      </form>

      {/* Sticky Submit Buttons - Mobile Only */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 shadow-lg safe-bottom">
        <div className="px-4 py-3 pb-safe flex flex-col gap-2">
          <button
            type="submit"
            form="job-post-form"
            disabled={isSubmitting}
            className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
            style={{ minHeight: '48px' }}
          >
            {isSubmitting 
              ? 'Processing...' 
              : !config.isPaidPostingEnabled 
                ? 'Post Job - Free' 
                : 'Continue to Payment →'}
          </button>
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={savingDraft}
            className="w-full border-2 border-gray-300 text-gray-700 px-6 py-2 rounded-lg font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {savingDraft ? 'Saving...' : 'Save Draft for Later'}
          </button>
        </div>
      </div>
    </div>
    </>
  );
}

function LoadingFallback() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading form...</p>
      </div>
    </div>
  );
}

export default function PostJobPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <PostJobContent />
    </Suspense>
  );
}
