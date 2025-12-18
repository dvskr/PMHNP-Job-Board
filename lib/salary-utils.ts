// ===========================================
// SALARY UTILITIES - Store Both Approach
// ===========================================

// PMHNP-specific thresholds
const THRESHOLDS = {
  // Hourly rates (PMHNP contractors typically $100-$300/hr)
  MIN_HOURLY: 25,
  MAX_HOURLY: 400,

  // Annual salaries
  MIN_ANNUAL: 40000,
  MAX_ANNUAL: 400000,
};

// Conversion factor for hourly → annual
// 40 hrs/week × 52 weeks = 2,080 hours (standard full-time)
// This matches the conversion in lib/salary-normalizer.ts
const HOURLY_TO_ANNUAL_HOURS = 2080;

// ============================================
// TYPES
// ============================================

export interface RawSalaryInput {
  min?: number | null;
  max?: number | null;
  raw?: string | null;
  type?: string | null;
}

export interface ProcessedSalary {
  normalizedMin: number | null;      // For filtering (annual)
  normalizedMax: number | null;      // For filtering (annual)
  displaySalary: string | null;      // For display ("$150-$200/hr")
  salaryType: 'hourly' | 'annual' | 'daily' | 'unknown';
  isValid: boolean;
}

// ============================================
// MAIN PROCESSING FUNCTION
// ============================================

export function processSalary(input: RawSalaryInput): ProcessedSalary {
  const { min, max, raw, type } = input;

  // Default result
  const result: ProcessedSalary = {
    normalizedMin: null,
    normalizedMax: null,
    displaySalary: null,
    salaryType: 'unknown',
    isValid: false,
  };

  // Nothing to process
  if (!min && !max && !raw) {
    return result;
  }

  // Detect salary type
  const detectedType = detectSalaryType(type, raw, min, max);
  result.salaryType = detectedType;

  // Process based on type
  if (detectedType === 'hourly') {
    return processHourlySalary(min, max, raw);
  } else if (detectedType === 'annual') {
    return processAnnualSalary(min, max, raw);
  } else if (detectedType === 'daily') {
    return processDailySalary(min, max, raw);
  }

  // Try to infer from values
  if (min || max) {
    const value = min || max;
    if (value && value >= THRESHOLDS.MIN_HOURLY && value <= THRESHOLDS.MAX_HOURLY) {
      return processHourlySalary(min, max, raw);
    }
    if (value && value >= THRESHOLDS.MIN_ANNUAL) {
      return processAnnualSalary(min, max, raw);
    }
  }

  return result;
}

// ============================================
// SALARY TYPE DETECTION
// ============================================

function detectSalaryType(
  explicitType?: string | null,
  raw?: string | null,
  min?: number | null,
  max?: number | null
): 'hourly' | 'annual' | 'daily' | 'unknown' {

  const typeLower = (explicitType || '').toLowerCase();
  const rawLower = (raw || '').toLowerCase();

  // Check explicit type first
  if (typeLower.includes('hour') || typeLower === 'hourly') return 'hourly';
  if (typeLower.includes('year') || typeLower.includes('annual')) return 'annual';
  if (typeLower.includes('day') || typeLower === 'daily') return 'daily';

  // Check raw string
  if (rawLower.includes('/hr') || rawLower.includes('per hour') || rawLower.includes('hourly')) return 'hourly';
  if (rawLower.includes('/yr') || rawLower.includes('per year') || rawLower.includes('annual')) return 'annual';
  if (rawLower.includes('/day') || rawLower.includes('per day') || rawLower.includes('daily')) return 'daily';

  // Infer from numeric values
  const value = min || max;
  if (value) {
    if (value >= THRESHOLDS.MIN_HOURLY && value <= THRESHOLDS.MAX_HOURLY) return 'hourly';
    if (value >= THRESHOLDS.MIN_ANNUAL) return 'annual';
  }

  return 'unknown';
}

// ============================================
// PROCESS BY TYPE
// ============================================

function processHourlySalary(
  min?: number | null,
  max?: number | null,
  raw?: string | null
): ProcessedSalary {
  // Validate range
  const minRate = min || null;
  const maxRate = max || min || null;

  // Check if rates are reasonable
  if (minRate && (minRate < THRESHOLDS.MIN_HOURLY || minRate > THRESHOLDS.MAX_HOURLY)) {
    return {
      normalizedMin: null,
      normalizedMax: null,
      displaySalary: null,
      salaryType: 'hourly',
      isValid: false,
    };
  }

  // Create display string (without $ since icon is used)
  let displaySalary: string;
  if (minRate && maxRate && minRate !== maxRate) {
    displaySalary = `${minRate}-${maxRate}/hr`;
  } else {
    displaySalary = `${minRate || maxRate}/hr`;
  }

  // Convert to annual for filtering
  const normalizedMin = minRate ? Math.round(minRate * HOURLY_TO_ANNUAL_HOURS) : null;
  const normalizedMax = maxRate ? Math.round(maxRate * HOURLY_TO_ANNUAL_HOURS) : null;

  return {
    normalizedMin,
    normalizedMax,
    displaySalary,
    salaryType: 'hourly',
    isValid: true,
  };
}

function processAnnualSalary(
  min?: number | null,
  max?: number | null,
  raw?: string | null
): ProcessedSalary {
  const minSalary = min || null;
  const maxSalary = max || min || null;

  // Validate range
  if (minSalary && (minSalary < THRESHOLDS.MIN_ANNUAL || minSalary > THRESHOLDS.MAX_ANNUAL)) {
    return {
      normalizedMin: null,
      normalizedMax: null,
      displaySalary: null,
      salaryType: 'annual',
      isValid: false,
    };
  }

  // Create display string (without $ since icon is used)
  let displaySalary: string;
  if (minSalary && maxSalary && minSalary !== maxSalary) {
    displaySalary = `${formatK(minSalary)}-${formatK(maxSalary)}/yr`;
  } else {
    const salaryValue = minSalary || maxSalary;
    if (!salaryValue) {
      return {
        normalizedMin: null,
        normalizedMax: null,
        displaySalary: null,
        salaryType: 'annual',
        isValid: false,
      };
    }
    displaySalary = `${formatK(salaryValue)}/yr`;
  }

  return {
    normalizedMin: minSalary,
    normalizedMax: maxSalary,
    displaySalary,
    salaryType: 'annual',
    isValid: true,
  };
}

function processDailySalary(
  min?: number | null,
  max?: number | null,
  raw?: string | null
): ProcessedSalary {
  const minRate = min || null;
  const maxRate = max || min || null;

  // Validate (daily rates typically $500-$3000 for PMHNP)
  if (minRate && (minRate < 200 || minRate > 5000)) {
    return {
      normalizedMin: null,
      normalizedMax: null,
      displaySalary: null,
      salaryType: 'daily',
      isValid: false,
    };
  }

  // Create display string (without $ since icon is used)
  let displaySalary: string;
  if (minRate && maxRate && minRate !== maxRate) {
    displaySalary = `${minRate}-${maxRate}/day`;
  } else {
    displaySalary = `${minRate || maxRate}/day`;
  }

  // Convert to annual (assume 200 working days for per diem)
  const normalizedMin = minRate ? Math.round(minRate * 200) : null;
  const normalizedMax = maxRate ? Math.round(maxRate * 200) : null;

  return {
    normalizedMin,
    normalizedMax,
    displaySalary,
    salaryType: 'daily',
    isValid: true,
  };
}

// ============================================
// EXTRACT FROM DESCRIPTION
// ============================================

export function extractSalaryFromDescription(description: string): RawSalaryInput | null {
  if (!description) return null;

  const text = description.replace(/,/g, '');

  // Pattern 1: $XXX - $XXX per hour
  const hourlyRangeMatch = text.match(
    /\$(\d{2,3})(?:\.\d{2})?\s*[-–to]+\s*\$(\d{2,3})(?:\.\d{2})?\s*(?:\/|\s*per\s*)?(?:hr|hour|hourly)/i
  );
  if (hourlyRangeMatch) {
    return {
      min: parseInt(hourlyRangeMatch[1]),
      max: parseInt(hourlyRangeMatch[2]),
      type: 'hourly',
      raw: hourlyRangeMatch[0],
    };
  }

  // Pattern 2: $XXX/hr (single)
  const hourlySingleMatch = text.match(
    /\$(\d{2,3})(?:\.\d{2})?\s*(?:\/|\s*per\s*)(?:hr|hour|hourly)/i
  );
  if (hourlySingleMatch) {
    const rate = parseInt(hourlySingleMatch[1]);
    return { min: rate, max: rate, type: 'hourly', raw: hourlySingleMatch[0] };
  }

  // Pattern 3: $XXXk - $XXXk (annual)
  const annualKMatch = text.match(
    /\$(\d{2,3})k\s*[-–to]+\s*\$(\d{2,3})k/i
  );
  if (annualKMatch) {
    return {
      min: parseInt(annualKMatch[1]) * 1000,
      max: parseInt(annualKMatch[2]) * 1000,
      type: 'annual',
      raw: annualKMatch[0],
    };
  }

  // Pattern 4: $XXX,XXX - $XXX,XXX (annual)
  const annualFullMatch = text.match(
    /\$(\d{2,3})(\d{3})\s*[-–to]+\s*\$(\d{2,3})(\d{3})/i
  );
  if (annualFullMatch) {
    return {
      min: parseInt(annualFullMatch[1] + annualFullMatch[2]),
      max: parseInt(annualFullMatch[3] + annualFullMatch[4]),
      type: 'annual',
      raw: annualFullMatch[0],
    };
  }

  // Pattern 5: $XXX/day (daily/per diem)
  const dailyMatch = text.match(
    /\$(\d{3,4})(?:\.\d{2})?\s*(?:\/|\s*per\s*)(?:day|diem)/i
  );
  if (dailyMatch) {
    const rate = parseInt(dailyMatch[1]);
    return { min: rate, max: rate, type: 'daily', raw: dailyMatch[0] };
  }

  return null;
}

// ============================================
// HELPERS
// ============================================

function formatK(value: number): string {
  if (value >= 1000) {
    return `${Math.round(value / 1000)}k`;
  }
  return value.toString();
}

// Format for display in job cards (without $ since icon is used)
export function formatSalaryDisplay(
  displaySalary: string | null,
  normalizedMin: number | null,
  normalizedMax: number | null,
  salaryType: string | null
): string | null {
  // If we have a pre-formatted display string, use it
  if (displaySalary) return displaySalary;

  // Otherwise, format from normalized values
  if (!normalizedMin && !normalizedMax) return null;

  if (salaryType === 'hourly') {
    const minHr = normalizedMin ? Math.round(normalizedMin / HOURLY_TO_ANNUAL_HOURS) : null;
    const maxHr = normalizedMax ? Math.round(normalizedMax / HOURLY_TO_ANNUAL_HOURS) : null;
    if (minHr && maxHr && minHr !== maxHr) {
      return `${minHr}-${maxHr}/hr`;
    }
    const hrRate = minHr || maxHr;
    return hrRate ? `${hrRate}/hr` : null;
  }

  // Default to annual format
  if (normalizedMin && normalizedMax && normalizedMin !== normalizedMax) {
    return `${formatK(normalizedMin)}-${formatK(normalizedMax)}/yr`;
  }
  
  const salaryValue = normalizedMin || normalizedMax;
  return salaryValue ? `${formatK(salaryValue)}/yr` : null;
}
