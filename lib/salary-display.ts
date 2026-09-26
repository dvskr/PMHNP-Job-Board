import { formatSalary } from '@/lib/utils';

/**
 * Generate user-friendly salary display string
 * Examples:
 *  - "$145-$200/hr"
 *  - "$150k-$180k/yr"
 *  - "$150k/yr"
 *  - "Competitive"
 */
export function formatDisplaySalary(
  normalizedMin: number | null,
  normalizedMax: number | null,
  salaryPeriod: string | null
): string | null {
  if (!normalizedMin && !normalizedMax) {
    return null;
  }

  const period = salaryPeriod?.toLowerCase() || 'annual';
  
  // For hourly rates, convert from annual back to hourly
  if (period === 'hourly' || period === 'hour' || period === 'hr') {
    const hourlyMin = normalizedMin ? Math.round(normalizedMin / 2080) : null;
    const hourlyMax = normalizedMax ? Math.round(normalizedMax / 2080) : null;
    
    if (hourlyMin && hourlyMax && hourlyMin !== hourlyMax) {
      return `$${hourlyMin}-$${hourlyMax}/hr`;
    } else if (hourlyMax) {
      return `$${hourlyMax}/hr`;
    } else if (hourlyMin) {
      return `$${hourlyMin}/hr`;
    }
  }
  
  // For annual salaries, show in thousands (k)
  const formatAnnual = (value: number): string => {
    if (value >= 1000) {
      return `$${Math.round(value / 1000)}k`;
    }
    return `$${value.toLocaleString()}`;
  };
  
  if (normalizedMin && normalizedMax && normalizedMin !== normalizedMax) {
    return `${formatAnnual(normalizedMin)}-${formatAnnual(normalizedMax)}/yr`;
  } else if (normalizedMax) {
    return `${formatAnnual(normalizedMax)}/yr`;
  } else if (normalizedMin) {
    return `${formatAnnual(normalizedMin)}/yr`;
  }
  
  return null;
}

/**
 * The minimal field subset jobSalaryText needs — structural, so Prisma
 * rows, API payloads, and the lib/types.ts Job interface all satisfy it.
 */
export interface JobSalaryTextFields {
  displaySalary: string | null;
  normalizedMinSalary: number | null;
  normalizedMaxSalary: number | null;
  salaryRange: string | null;
  salaryPeriod: string | null;
  // Raw pair in the posting's NATIVE unit (a monthly job stores the monthly
  // amount here). Optional so callers whose row shape predates the columns
  // still satisfy the interface; when absent the raw-pair step is skipped.
  minSalary?: number | null;
  maxSalary?: number | null;
}

/**
 * Which column the displayed string was derived from. JobStructuredData
 * reads this so the JSON-LD can never advertise numbers no visible surface
 * shows: `salaryRange` is free text with no parsed pair behind it, and
 * Google demotes markup that contradicts the page it annotates.
 */
export type JobSalarySource = 'displaySalary' | 'normalized' | 'rawPair' | 'salaryRange';

export interface ResolvedJobSalary {
  text: string | null;
  source: JobSalarySource | null;
}

/**
 * A stored displaySalary whose two bounds are the same amount, e.g.
 * "$350k - $350k/yr" or "$150k-$150k/yr".
 *
 * These exist in the catalogue because the write path that produced them
 * predates formatDisplaySalary's min === max collapse. They matter because
 * JobStructuredData derives `isRange` from the NUMERIC pair
 * (min != null && max != null && min !== max), so for these rows the page
 * shows a range while the JobPosting markup emits a single QuantitativeValue
 * value: markup that contradicts the page it annotates, which Google demotes.
 */
// The en dash is written as its escape: this one is DATA (some stored values
// use it as the range separator), and the repo-wide copy-style sweep rejects a
// literal en/em dash in source.
const DEGENERATE_RANGE_RE = /^\s*(\$[\d.,]+\s*[km]?)\s*[-\u2013]\s*(\$[\d.,]+\s*[km]?)\s*(\/(?:yr|hr|mo))?\s*$/i;

/**
 * Collapse a stored "X to X" range to the single value it means, but ONLY when
 * the numeric pair agrees that there is one value. When min and max genuinely
 * differ and merely round to the same label, the markup emits a real range and
 * collapsing the text would invert the mismatch instead of fixing it.
 */
function collapseDegenerateRange(job: JobSalaryTextFields, stored: string): string {
  const match = DEGENERATE_RANGE_RE.exec(stored);
  if (!match) return stored;

  const [, low, high, period = ''] = match;
  if (low.replace(/\s+/g, '').toLowerCase() !== high.replace(/\s+/g, '').toLowerCase()) return stored;

  const { normalizedMinSalary: min, normalizedMaxSalary: max } = job;
  const pairDisagrees = min != null && max != null && min !== max;
  if (pairDisagrees) return stored;

  return `${low.replace(/\s+/g, '')}${period}`;
}

/**
 * The ONE salary string every surface shows for a job (card, detail
 * header, OG image), plus the column it came from. Precedence:
 *   1. stored displaySalary
 *   2. the normalized pair formatted exactly as the write path formats it
 *      (formatDisplaySalary, so the fallback is byte-identical to what
 *      displaySalary would have been)
 *   3. the raw min/max pair via formatSalary
 *   4. the raw salaryRange text
 *
 * Step 3 exists because salaryRange is unit-less free text: a monthly row
 * whose normalized pair was never written rendered as "$37,714 - $37,714"
 * on the header, the card and the share preview, which every reader takes
 * for an annual figure. formatSalary is the only formatter that carries the
 * pay period, so it must be tried before the raw text.
 *
 * Some stored displaySalary values were written without a leading "$"
 * (lib/salary-utils.ts processSalary), so the prefix is normalized here
 * instead of at each render site. The two formatter outputs are left alone:
 * formatSalary emits "Up to $X/yr" for a max-only pair, and prefixing that
 * would produce "$Up to ...".
 */
export function resolveJobSalary(job: JobSalaryTextFields): ResolvedJobSalary {
  const withDollarPrefix = (text: string): string => (text.startsWith('$') ? text : `$${text}`);

  if (job.displaySalary) {
    const stored = collapseDegenerateRange(job, job.displaySalary);
    return { text: withDollarPrefix(stored), source: 'displaySalary' };
  }

  const fromNormalized = formatDisplaySalary(
    job.normalizedMinSalary,
    job.normalizedMaxSalary,
    job.salaryPeriod,
  );
  if (fromNormalized) return { text: fromNormalized, source: 'normalized' };

  const fromRawPair = formatSalary(job.minSalary, job.maxSalary, job.salaryPeriod);
  if (fromRawPair) return { text: fromRawPair, source: 'rawPair' };

  if (job.salaryRange) {
    return { text: withDollarPrefix(job.salaryRange), source: 'salaryRange' };
  }

  return { text: null, source: null };
}

export function jobSalaryText(job: JobSalaryTextFields): string | null {
  return resolveJobSalary(job).text;
}

/**
 * Format salary for display with optional estimate indicator
 */
export function formatSalaryWithEstimate(
  displaySalary: string | null,
  isEstimated: boolean
): string {
  if (!displaySalary) {
    return 'Competitive';
  }
  
  return isEstimated ? `~${displaySalary}` : displaySalary;
}

