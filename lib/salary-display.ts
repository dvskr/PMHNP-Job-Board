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

