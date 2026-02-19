'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';

interface InitialFilters {
  keyword?: string;
  location?: string;
  mode?: string;
  jobType?: string;
  minSalary?: number;
  maxSalary?: number;
}

interface CreateAlertFormProps {
  initialFilters?: InitialFilters;
  onSuccess?: () => void;
}

interface FormData {
  email: string;
  frequency: 'daily' | 'weekly';
}

function buildCriteriaSummary(filters: InitialFilters): string {
  const parts: string[] = [];

  if (filters.keyword) parts.push(`"${filters.keyword}"`);
  if (filters.mode) parts.push(filters.mode);
  if (filters.jobType) parts.push(filters.jobType);
  if (filters.location) parts.push(`in ${filters.location}`);
  if (filters.minSalary || filters.maxSalary) {
    if (filters.minSalary && filters.maxSalary) {
      parts.push(`$${(filters.minSalary / 1000).toFixed(0)}k-$${(filters.maxSalary / 1000).toFixed(0)}k`);
    } else if (filters.minSalary) {
      parts.push(`$${(filters.minSalary / 1000).toFixed(0)}k+`);
    } else if (filters.maxSalary) {
      parts.push(`up to $${(filters.maxSalary / 1000).toFixed(0)}k`);
    }
  }

  return parts.length > 0 ? parts.join(' · ') : 'all PMHNP jobs';
}

export default function CreateAlertForm({ initialFilters = {}, onSuccess }: CreateAlertFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      frequency: 'daily',
    },
  });

  const criteriaSummary = buildCriteriaSummary(initialFilters);

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/job-alerts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: data.email,
          frequency: data.frequency,
          ...initialFilters,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to create alert');
      }

      setIsSuccess(true);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
          <svg
            className="h-6 w-6 text-emerald-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-emerald-900">Alert created!</h3>
        <p className="mt-1 text-sm text-emerald-700">Check your email for confirmation.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Criteria Summary */}
      <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-1">
          Alert for
        </p>
        <p className="text-sm font-medium text-slate-800">{criteriaSummary}</p>
      </div>

      {/* Email Input */}
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
          Email address
        </label>
        <input
          type="email"
          id="email"
          placeholder="you@example.com"
          className={`w-full rounded-lg border px-3.5 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 ${errors.email
              ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
              : 'border-slate-300 focus:border-teal-500 focus:ring-teal-500'
            }`}
          {...register('email', {
            required: 'Email is required',
            pattern: {
              value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
              message: 'Please enter a valid email',
            },
          })}
        />
        {errors.email && (
          <p className="mt-1.5 text-xs text-red-600">{errors.email.message}</p>
        )}
      </div>

      {/* Frequency Select */}
      <div>
        <label htmlFor="frequency" className="block text-sm font-medium text-slate-700 mb-1.5">
          How often?
        </label>
        <select
          id="frequency"
          className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:border-teal-500 focus:ring-teal-500"
          {...register('frequency')}
        >
          <option value="daily">Daily digest</option>
          <option value="weekly">Weekly digest</option>
        </select>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isLoading}
        className="w-full rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isLoading ? (
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
            Creating...
          </>
        ) : (
          <>
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
              />
            </svg>
            Create Alert
          </>
        )}
      </button>

      <p className="text-xs text-center text-slate-500">
        You can unsubscribe anytime from the email.
      </p>
    </form>
  );
}

