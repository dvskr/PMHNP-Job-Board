import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow, differenceInHours, differenceInDays, differenceInWeeks, format } from 'date-fns';


export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const hoursSincePosted = (Date.now() - dateObj.getTime()) / (1000 * 60 * 60);

  if (hoursSincePosted < 1) {
    return 'Just posted';
  }

  return formatDistanceToNow(dateObj, { addSuffix: true });
}

function getEffectiveDate(job: { originalPostedAt?: Date | null; createdAt: Date } | Date): Date {
  if (job instanceof Date || typeof job === 'string') return new Date(job as any);
  // Debug log (temporary)
  // if ((job as any).title?.includes('Nurse')) console.log('Date Debug:', { title: (job as any).title, orig: (job as any).originalPostedAt, created: (job as any).createdAt });
  return (job as any).originalPostedAt ? new Date((job as any).originalPostedAt) : new Date((job as any).createdAt);
}

export function formatSalary(
  min?: number | null,
  max?: number | null,
  period?: string | null
): string {
  if (!min && !max) return '';

  const formatNumber = (n: number, period: string): string => {
    // For hourly/weekly/monthly, show the raw number with comma formatting
    if (period === 'hourly' || period === 'weekly' || period === 'monthly') {
      return `$${n.toLocaleString()}`;
    }
    // Annual - use k format for thousands
    if (n >= 1000) return `$${Math.round(n / 1000)}k`;
    return `$${n}`;
  };

  const suffix: { [key: string]: string } = {
    'hourly': '/hr',
    'weekly': '/week',
    'monthly': '/mo',
    'annual': '/yr',
  };

  const periodKey = period || 'annual';
  const periodSuffix = suffix[periodKey] || '/yr';

  if (min && max && min !== max) {
    return `${formatNumber(min, periodKey)}-${formatNumber(max, periodKey)}${periodSuffix}`;
  }
  if (min) {
    return `${formatNumber(min, periodKey)}${periodSuffix}`;
  }
  if (max) {
    return `Up to ${formatNumber(max, periodKey)}${periodSuffix}`;
  }
  return '';
}

export function slugify(title: string, id: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();

  // Use full UUID to match database slugs
  return `${slug}-${id}`;
}

export function isNewJob(job: { originalPostedAt?: Date | null; createdAt: Date } | Date): boolean {
  const dateObj = getEffectiveDate(job);
  const hoursSincePosted = differenceInHours(new Date(), dateObj);
  return hoursSincePosted < 72; // Increased to 72h for better "New" badge coverage with historical dates
}

export function getJobFreshness(job: { originalPostedAt?: Date | null; createdAt: Date } | Date): string {
  const dateObj = getEffectiveDate(job);
  const now = new Date();

  const hours = differenceInHours(now, dateObj);
  const days = differenceInDays(now, dateObj);
  const weeks = differenceInWeeks(now, dateObj);

  if (hours < 1) {
    return 'Just posted';
  }

  if (hours < 24) {
    return 'Posted today';
  }

  if (hours < 48) {
    return 'Posted yesterday';
  }

  if (days < 7) {
    return `Posted ${days} day${days !== 1 ? 's' : ''} ago`;
  }

  if (days < 30) {
    return `Posted ${weeks} week${weeks !== 1 ? 's' : ''} ago`;
  }

  return `Posted on ${format(dateObj, 'MMM d, yyyy')}`;
}

export function getExpiryStatus(expiresAt: Date | null): { text: string; isUrgent: boolean; isExpired: boolean } {
  if (!expiresAt) {
    return { text: '', isUrgent: false, isExpired: false };
  }

  const dateObj = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  const now = new Date();

  // Check if expired
  if (dateObj < now) {
    return { text: 'This job may no longer be active', isUrgent: false, isExpired: true };
  }

  const daysUntilExpiry = differenceInDays(dateObj, now);

  // Less than 3 days - urgent
  if (daysUntilExpiry < 3) {
    const daysText = daysUntilExpiry === 0 ? 'today' : `in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}`;
    return { text: `Expires ${daysText}`, isUrgent: true, isExpired: false };
  }

  // Less than 7 days - show but not urgent
  if (daysUntilExpiry < 7) {
    return { text: `Expires in ${daysUntilExpiry} days`, isUrgent: false, isExpired: false };
  }

  // More than 7 days - don't show
  return { text: '', isUrgent: false, isExpired: false };
}

