import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow } from 'date-fns';

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

export function formatSalary(
  min?: number | null,
  max?: number | null,
  period?: string | null
): string {
  if (!min && !max) {
    return '';
  }

  const isAnnual = period?.toLowerCase() === 'year' || period?.toLowerCase() === 'annual' || !period;
  const suffix = period ? `/${period}` : '/year';

  if (min && max) {
    if (isAnnual) {
      return `$${min / 1000}k-${max / 1000}k${suffix}`;
    } else {
      return `$${min}-${max}${suffix}`;
    }
  }

  if (min) {
    if (isAnnual) {
      return `$${min / 1000}k+${suffix}`;
    } else {
      return `$${min}+${suffix}`;
    }
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
  
  const idSuffix = id.slice(-8);
  
  return `${slug}-${idSuffix}`;
}

