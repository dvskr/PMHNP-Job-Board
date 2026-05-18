import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow, differenceInHours, differenceInDays, differenceInWeeks, format } from 'date-fns';


export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const hoursDelta = (Date.now() - dateObj.getTime()) / (1000 * 60 * 60);

  // Only treat as "Just posted" for the recent past (0–1 hour ago).
  // Future dates (e.g. expiresAt = now + 60 days) have negative hoursDelta and
  // would otherwise satisfy `< 1` and incorrectly read as "Just posted" — that
  // was the bug where dashboard cards showed "Expires Just posted".
  if (hoursDelta >= 0 && hoursDelta < 1) {
    return 'Just posted';
  }

  // formatDistanceToNow handles both past and future dates correctly when
  // addSuffix=true: "5 minutes ago" / "in 60 days".
  return formatDistanceToNow(dateObj, { addSuffix: true });
}

function getEffectiveDate(job: { originalPostedAt?: Date | null; createdAt: Date } | Date): Date {
  if (job instanceof Date || typeof job === 'string') return new Date(job as any);
  // Use createdAt (ingestion date) for freshness display — this ensures jobs
  // in the "Past 24 hours" filter show "Posted today" instead of "Posted 2 days ago".
  // originalPostedAt is still used for SEO structured data (JobStructuredData.tsx).
  return new Date((job as any).createdAt);
}

/**
 * Canonicalize the salary `period` string. The ingest pipeline writes BOTH
 * `'hour'/'week'/'month'/'year'` (regex-extracted, singular) and
 * `'hourly'/'weekly'/'monthly'/'annual'` (magnitude-inferred). Anything
 * downstream that branches on period (formatSalary UI, JobPosting schema,
 * salary backfill scripts) must accept both. Single source of truth here.
 */
export type SalaryPeriodKey = 'hourly' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'annual';

export function canonicalSalaryPeriod(period?: string | null): SalaryPeriodKey {
  const p = (period || '').toLowerCase().trim();
  if (p === 'hour' || p === 'hourly' || p === 'hr') return 'hourly';
  if (p === 'day' || p === 'daily') return 'daily';
  if (p === 'week' || p === 'weekly') return 'weekly';
  if (p === 'biweekly' || p === 'bi-weekly' || p === 'fortnightly') return 'biweekly';
  if (p === 'month' || p === 'monthly' || p === 'mo') return 'monthly';
  // Anything else (incl. 'year', 'yearly', 'annual', '', null) → annual
  return 'annual';
}

export function formatSalary(
  min?: number | null,
  max?: number | null,
  period?: string | null
): string {
  if (!min && !max) return '';

  // SEO/UI consistency fix: canonicalize period upfront so 'hour' and 'hourly'
  // (and 'year' vs 'annual') both render the same and match the JobPosting
  // schema's unitText. Previously a job with salaryPeriod='hour' rendered as
  // '/yr' in the UI while the schema correctly emitted 'HOUR' — a fresh
  // mismatch. Both surfaces now agree.
  const periodKey = canonicalSalaryPeriod(period);

  const formatNumber = (n: number, p: SalaryPeriodKey): string => {
    // For non-annual periods, show the raw number with comma formatting (e.g. $175/hr).
    if (p !== 'annual') {
      return `$${n.toLocaleString()}`;
    }
    // Annual — values 20-999 are almost certainly stored in thousands (e.g. 125 = $125K)
    // No PMHNP job pays $125/year, so normalize these
    if (n >= 20 && n < 1000) {
      return `$${Math.round(n)}k`;
    }
    // Annual - use k format for thousands
    if (n >= 1000) return `$${Math.round(n / 1000)}k`;
    return `$${n}`;
  };

  const suffix: Record<SalaryPeriodKey, string> = {
    hourly: '/hr',
    daily: '/day',
    weekly: '/week',
    biweekly: '/2wk',
    monthly: '/mo',
    annual: '/yr',
  };
  const periodSuffix = suffix[periodKey];

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

// Cap on the title-derived prefix before the UUID suffix. Slugs over ~75
// chars truncate in SERP display and become harder to remember/type. The
// UUID is 36 chars + 1 hyphen = 37, leaving 38 chars for the title prefix
// to stay under 75. Conservative trim to 60 leaves headroom for very-long
// employer/title combos without ever overflowing.
const SLUG_TITLE_MAX = 60;

export function slugify(title: string, id: string): string {
  let slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();

  // Truncate the title prefix at a word boundary when possible so the URL
  // doesn't end mid-word before the UUID suffix.
  if (slug.length > SLUG_TITLE_MAX) {
    const trimmed = slug.slice(0, SLUG_TITLE_MAX);
    const lastDash = trimmed.lastIndexOf('-');
    slug = lastDash > SLUG_TITLE_MAX - 15 ? trimmed.slice(0, lastDash) : trimmed;
    // Strip a trailing hyphen left by the cut so we don't get "title--uuid".
    slug = slug.replace(/-+$/, '');
  }

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

/**
 * Reflow run-on aggregator-stripped descriptions into bullets.
 *
 * Some sources (e.g. Ashby) ship descriptions whose HTML structure was
 * flattened during ingestion — every `<br>`, `<li>`, `<p>` collapses to a
 * single space, leaving inline " - " markers as the only remaining list
 * cue. Render-time helper that converts " - X" patterns back to bullets so
 * the JD page reads as a list instead of one giant paragraph.
 *
 * Conservative on purpose: only fires when the description has zero line
 * breaks AND at least 3 inline " - X" markers — otherwise a prose dash
 * ("a clinician-led — virtual practice") would get misclassified as a
 * bullet break. Compound words ("W-2", "in-house", "day-to-day") have no
 * surrounding spaces and are unaffected.
 */
export function expandInlineBullets(text: string): string {
  if (!text) return text;
  if (text.includes('\n')) return text;
  const markerMatches = text.match(/\s-\s+[A-Z]/g);
  if (!markerMatches || markerMatches.length < 3) return text;
  return text.replace(/\s-\s+(?=[A-Z])/g, '\n• ');
}

