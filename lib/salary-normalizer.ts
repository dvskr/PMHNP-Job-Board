/**
 * Comprehensive Salary Normalizer
 * Converts all salary formats to annual equivalent
 */

export interface SalaryNormalizationResult {
  normalizedMinSalary: number | null;
  normalizedMaxSalary: number | null;
  salaryIsEstimated: boolean;
  salaryConfidence: number | null;
}

// Conversion multipliers to annual salary
const PERIOD_MULTIPLIERS: Record<string, number> = {
  'annual': 1,
  'yearly': 1,
  'year': 1,
  'monthly': 12,
  'month': 12,
  'weekly': 52,
  'week': 52,
  'daily': 260, // Assuming 260 working days/year
  'day': 260,
  'hourly': 2080, // 40 hours/week * 52 weeks
  'hour': 2080,
};

// Typical PMHNP salary ranges for validation
const PMHNP_SALARY_RANGES = {
  // W-2 / Salaried positions
  min: 80000,           // Minimum reasonable annual salary
  max: 250000,          // Maximum reasonable W-2 annual salary
  
  // Contract / Hourly positions (these convert to higher annual equivalents)
  contractorHourlyMin: 50,   // $50/hour minimum for contractor PMHNP
  contractorHourlyMax: 350,  // $350/hour maximum (high-end contractors)
  
  typical: {
    min: 100000,
    max: 160000,
  },
};

/**
 * Detect salary period from salary string or context
 */
function detectSalaryPeriod(
  salaryStr: string | null | undefined,
  salaryPeriod: string | null | undefined,
  minSalary: number | null | undefined,
  maxSalary: number | null | undefined
): string {
  // If period is explicitly provided, use it
  if (salaryPeriod) {
    const normalized = salaryPeriod.toLowerCase().trim();
    for (const [period, _] of Object.entries(PERIOD_MULTIPLIERS)) {
      if (normalized.includes(period)) {
        return period;
      }
    }
  }

  // Try to detect from salary string
  if (salaryStr) {
    const lower = salaryStr.toLowerCase();
    if (lower.includes('/hour') || lower.includes('per hour') || lower.includes('hourly')) {
      return 'hourly';
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
 * Validate if salary is reasonable for PMHNP role
 * Handles hourly contractor rates and annual salaries differently
 */
function isReasonableSalary(
  annual: number, 
  originalPeriod: string,
  originalSalary: number,
  confidence: number = 1.0
): boolean {
  // For hourly rates, validate the hourly amount (not the annual conversion)
  // PMHNP contractors can earn $50-350/hour, which converts to $104k-$728k annually
  if (originalPeriod === 'hourly' || originalPeriod === 'hour') {
    const hourlyRate = originalSalary;
    const minHourly = PMHNP_SALARY_RANGES.contractorHourlyMin;
    const maxHourly = PMHNP_SALARY_RANGES.contractorHourlyMax;
    
    const isValid = hourlyRate >= minHourly && hourlyRate <= maxHourly;
    
    if (!isValid) {
      console.log(
        `[Salary] Rejected hourly rate: $${hourlyRate}/hr (outside $${minHourly}-${maxHourly}/hr range)`
      );
    }
    
    return isValid;
  }
  
  // For annual salaries, validate against annual thresholds
  // Allow wider ranges for estimated/low-confidence salaries
  const minThreshold = confidence < 0.5 
    ? PMHNP_SALARY_RANGES.min * 0.6   // $48k minimum for low-confidence
    : PMHNP_SALARY_RANGES.min * 0.8;   // $64k minimum for high-confidence
  
  const maxThreshold = confidence < 0.5 
    ? 400000   // $400k max for low-confidence (catches high contractor estimates)
    : 300000;  // $300k max for high-confidence
  
  const isValid = annual >= minThreshold && annual <= maxThreshold;
  
  if (!isValid) {
    console.log(
      `[Salary] Rejected annual salary: $${annual.toLocaleString()} (outside $${minThreshold.toLocaleString()}-${maxThreshold.toLocaleString()} range, confidence: ${confidence})`
    );
  }
  
  return isValid;
}

/**
 * Normalize a single salary value to annual
 */
function normalizeSingleSalary(
  salary: number,
  period: string,
  isEstimated: boolean
): { value: number; confidence: number } | null {
  const multiplier = PERIOD_MULTIPLIERS[period] || 1;
  const annualSalary = Math.round(salary * multiplier);
  
  // Calculate confidence
  let confidence = 1.0;
  if (isEstimated) {
    confidence = 0.6; // Lower confidence for estimated salaries
  }
  
  // Validate salary based on period and original value
  // Pass the original salary and period for proper validation
  if (!isReasonableSalary(annualSalary, period, salary, confidence)) {
    // Salary rejected - original values are still preserved in the job record
    return null;
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

/**
 * Get typical PMHNP salary range for comparison
 */
export function getTypicalPMHNPRange(): { min: number; max: number } {
  return PMHNP_SALARY_RANGES.typical;
}

