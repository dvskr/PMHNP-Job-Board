/**
 * Comprehensive Salary Normalizer
 * Converts all salary formats to annual equivalent
 */

import { CLAMP_TOLERANCE, NORMALIZER_BAND } from './salary-bounds';

export interface SalaryNormalizationResult {
  normalizedMinSalary: number | null;
  normalizedMaxSalary: number | null;
  salaryIsEstimated: boolean;
  salaryConfidence: number | null;
}

// Conversion multipliers to annual salary.
// biweekly/bi-weekly MUST come before weekly/week: the hint loop below
// matches by substring, and 'biweekly'.includes('weekly') is true — before
// 2026-07-06 that annualized biweekly pay at ×52, DOUBLING displayed salaries.
const PERIOD_MULTIPLIERS: Record<string, number> = {
  'annual': 1,
  'yearly': 1,
  'year': 1,
  'monthly': 12,
  'month': 12,
  'biweekly': 26,
  'bi-weekly': 26,
  'weekly': 52,
  'week': 52,
  'daily': 260, // Assuming 260 working days/year
  'day': 260,
  'hourly': 2080, // 40 hours/week * 52 weeks
  'hour': 2080,
};

/**
 * Detect salary period from salary string or context.
 *
 * Wraps resolveSalaryPeriod with a sanity override (2026-07-06, audit #13):
 * a claimed "monthly" of $20k+ is virtually always a mislabeled ANNUAL
 * figure (legit PMHNP monthly tops out ~$15k). Trusting the label used to
 * multiply a $40k salary ×12 into a fabricated $480k/yr. The override sits
 * here — after resolution — so it covers every path ('monthly'/'month'
 * hints, salaryRange strings, magnitude fallback) and keys off the LARGER
 * bound so a mixed range (min $18k / max $40k) can't slip through.
 */
function detectSalaryPeriod(
  salaryStr: string | null | undefined,
  salaryPeriod: string | null | undefined,
  minSalary: number | null | undefined,
  maxSalary: number | null | undefined
): string {
  const period = resolveSalaryPeriod(salaryStr, salaryPeriod, minSalary, maxSalary);
  if ((period === 'monthly' || period === 'month') &&
      Math.max(minSalary || 0, maxSalary || 0) >= 20000) {
    console.log(`[Salary] Overriding implausible monthly period for $${minSalary || maxSalary} → annual`);
    return 'annual';
  }
  return period;
}

function resolveSalaryPeriod(
  salaryStr: string | null | undefined,
  salaryPeriod: string | null | undefined,
  minSalary: number | null | undefined,
  maxSalary: number | null | undefined
): string {
  // If period is explicitly provided, use it
  if (salaryPeriod) {
    const normalized = salaryPeriod.toLowerCase().trim();
    for (const [period] of Object.entries(PERIOD_MULTIPLIERS)) {
      if (normalized.includes(period)) {
        return period;
      }
    }
  }

  // Try to detect from salary string. Biweekly before weekly — see the
  // PERIOD_MULTIPLIERS comment.
  if (salaryStr) {
    const lower = salaryStr.toLowerCase();
    if (lower.includes('/hour') || lower.includes('per hour') || lower.includes('hourly')) {
      return 'hourly';
    }
    if (lower.includes('biweekly') || lower.includes('bi-weekly') ||
        lower.includes('every two weeks') || lower.includes('every 2 weeks')) {
      return 'biweekly';
    }
    if (lower.includes('/week') || lower.includes('per week') || lower.includes('weekly')) {
      return 'weekly';
    }
    if (lower.includes('/month') || lower.includes('per month') || lower.includes('monthly')) {
      return 'monthly';
    }
    if (lower.includes('/year') || lower.includes('per year') || lower.includes('annually') || lower.includes('annual')) {
      return 'annual';
    }
    if (lower.includes('/day') || lower.includes('per day') || lower.includes('daily')) {
      return 'daily';
    }
  }

  // Infer from salary magnitude
  const salary = minSalary || maxSalary;
  if (salary) {
    if (salary < 500) {
      return 'hourly';  // $50-200/hour typical for PMHNP
    }
    if (salary < 5000) {
      return 'weekly';  // $2000-4000/week typical
    }
    if (salary < 20000) {
      return 'monthly'; // $8000-15000/month typical
    }
    return 'annual';    // $85k-200k/year typical
  }

  // Default to annual
  return 'annual';
}

/**
 * Normalize a single salary value to annual.
 *
 * Changed 2026-05-05: out-of-range annuals clamped rather than dropped.
 * Changed 2026-07-06 (audit #13): no value is ever adjusted UPWARD —
 * blanket clamping FABRICATED salaries (a $38k posting displayed as
 * "$64k/yr", and a $56k stated MAX was raised to $64k). Behavior now:
 *
 *   - below the band floor → null, always (no normalized salary; the card
 *     shows no figure, which is honest — raw fields stay stored)
 *   - above the band cap but within +15% (CLAMP_TOLERANCE) → clamped DOWN
 *     to the cap, confidence 0.5 (never overstates)
 *   - further above → null
 */
function normalizeSingleSalary(
  salary: number,
  period: string,
  isEstimated: boolean
): { value: number; confidence: number } | null {
  const multiplier = PERIOD_MULTIPLIERS[period] || 1;
  let annualSalary = Math.round(salary * multiplier);

  let confidence = isEstimated ? 0.6 : 1.0;

  // Hourly: validate the hourly rate itself, not the annual conversion.
  if (period === 'hourly' || period === 'hour') {
    const minHourly = NORMALIZER_BAND.contractorHourlyMin;
    const maxHourly = NORMALIZER_BAND.contractorHourlyMax;
    if (salary < minHourly) {
      // Below-floor is dropped, never raised — raising fabricates (and this
      // function can't tell a min bound from a stated MAX bound).
      console.log(`[Salary] Dropped below-floor hourly: $${salary}/hr`);
      return null;
    } else if (salary > maxHourly) {
      if (salary > maxHourly * (1 + CLAMP_TOLERANCE)) {
        console.log(`[Salary] Dropped implausible hourly: $${salary}/hr (above tolerance)`);
        return null;
      }
      console.log(`[Salary] Clamped high hourly: $${salary}/hr → $${maxHourly}/hr`);
      annualSalary = maxHourly * 2080;
      confidence = 0.5;
    }
  } else {
    // Annual + other-period-converted-to-annual: bounded clamp to the
    // PMHNP-realistic band. Caps and floor multipliers live in
    // lib/salary-bounds.ts; tolerance policy in the function header.
    const minAnnual = confidence < 0.5
      ? NORMALIZER_BAND.annualMin * NORMALIZER_BAND.floorMultiplierLowConfidence   // $48k for low-confidence
      : NORMALIZER_BAND.annualMin * NORMALIZER_BAND.floorMultiplierHighConfidence; // $64k for high-confidence
    const maxAnnual = confidence < 0.5
      ? NORMALIZER_BAND.clampCapLowConfidence
      : NORMALIZER_BAND.clampCapHighConfidence;
    if (annualSalary < minAnnual) {
      // Below-floor is dropped, never raised (see header).
      console.log(`[Salary] Dropped below-floor annual: $${annualSalary}`);
      return null;
    } else if (annualSalary > maxAnnual) {
      if (annualSalary > maxAnnual * (1 + CLAMP_TOLERANCE)) {
        console.log(`[Salary] Dropped implausible annual: $${annualSalary} (above tolerance)`);
        return null;
      }
      console.log(`[Salary] Clamped high annual: $${annualSalary} → $${maxAnnual}`);
      annualSalary = maxAnnual;
      confidence = 0.5;
    }
  }

  // Adjust confidence based on period (annual is most reliable)
  if (period === 'hourly' || period === 'hour') {
    confidence *= 0.9; // Hourly conversions slightly less certain
  } else if (period === 'daily' || period === 'weekly' || period === 'day' || period === 'week') {
    confidence *= 0.85; // Weekly/daily conversions less certain
  }

  return { value: annualSalary, confidence };
}

/**
 * Main function: Normalize salary data for a job
 */
export function normalizeSalary(job: {
  salaryRange?: string | null;
  minSalary?: number | null;
  maxSalary?: number | null;
  salaryPeriod?: string | null;
  title?: string;
}): SalaryNormalizationResult {
  const result: SalaryNormalizationResult = {
    normalizedMinSalary: null,
    normalizedMaxSalary: null,
    salaryIsEstimated: false,
    salaryConfidence: null,
  };

  // Check if salary is marked as estimated/predicted
  const isEstimated = job.salaryRange?.toLowerCase().includes('estimated') ||
    job.salaryRange?.toLowerCase().includes('predicted') ||
    false;

  result.salaryIsEstimated = isEstimated;

  // If no salary data, return early
  if (!job.minSalary && !job.maxSalary) {
    return result;
  }

  // Detect the salary period
  const period = detectSalaryPeriod(
    job.salaryRange,
    job.salaryPeriod,
    job.minSalary,
    job.maxSalary
  );

  // Normalize min salary
  if (job.minSalary) {
    const normalized = normalizeSingleSalary(job.minSalary, period, isEstimated);
    if (normalized) {
      result.normalizedMinSalary = normalized.value;
      result.salaryConfidence = normalized.confidence;
    }
  }

  // Normalize max salary
  if (job.maxSalary) {
    const normalized = normalizeSingleSalary(job.maxSalary, period, isEstimated);
    if (normalized) {
      result.normalizedMaxSalary = normalized.value;
      // Use the lower confidence of the two
      if (result.salaryConfidence !== null) {
        result.salaryConfidence = Math.min(result.salaryConfidence, normalized.confidence);
      } else {
        result.salaryConfidence = normalized.confidence;
      }
    }
  }

  // Pair integrity (2026-07-06, audit #13): if the source stated a bound but
  // policy dropped it while the other survived, showing the survivor alone
  // misrepresents the range — a "$60k-$90k" posting must not display as
  // "$90k/yr". Drop the pair; honest absence beats a misleading half-range.
  if (
    (job.minSalary && !result.normalizedMinSalary && result.normalizedMaxSalary) ||
    (job.maxSalary && !result.normalizedMaxSalary && result.normalizedMinSalary)
  ) {
    console.log(`[Salary] Dropped surviving bound — its pair failed policy ($${job.minSalary || '-'}–$${job.maxSalary || '-'})`);
    result.normalizedMinSalary = null;
    result.normalizedMaxSalary = null;
    result.salaryConfidence = null;
    return result;
  }

  // If we have both min and max, validate the range
  if (result.normalizedMinSalary && result.normalizedMaxSalary) {
    if (result.normalizedMinSalary > result.normalizedMaxSalary) {
      // Swap min and max if they're reversed
      [result.normalizedMinSalary, result.normalizedMaxSalary] =
        [result.normalizedMaxSalary, result.normalizedMinSalary];
    }

    // Check if range is too wide (indicates bad data)
    const rangeRatio = result.normalizedMaxSalary / result.normalizedMinSalary;
    if (rangeRatio > 2.5) {
      // Wide salary range detected - reduce confidence
      if (result.salaryConfidence) {
        result.salaryConfidence *= 0.7;
      }
    }
  }

  return result;
}

/**
 * Format normalized salary for display
 */
export function formatNormalizedSalary(
  min: number | null,
  max: number | null,
  isEstimated: boolean = false
): string {
  if (!min && !max) return 'Not specified';

  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

  const estimatedLabel = isEstimated ? ' (estimated)' : '';

  if (min && max) {
    return `${formatter.format(min)} - ${formatter.format(max)}${estimatedLabel}`;
  }
  if (min) {
    return `From ${formatter.format(min)}${estimatedLabel}`;
  }
  if (max) {
    return `Up to ${formatter.format(max)}${estimatedLabel}`;
  }

  return 'Not specified';
}

