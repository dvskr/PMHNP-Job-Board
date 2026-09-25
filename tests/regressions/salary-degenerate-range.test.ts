/**
 * A stored displaySalary of "$350k - $350k/yr" is a range with one value in it.
 *
 * Hunt 2026-09-03: 31 published rows carry that shape. jobSalaryText prefers
 * the stored string, while JobStructuredData derives isRange from the numeric
 * pair (min !== max), so the card and the detail header showed a range while
 * the JobPosting markup emitted a single QuantitativeValue value. Markup that
 * contradicts the page it annotates is exactly what Google demotes.
 *
 * The collapse is conditional: when min and max genuinely differ and merely
 * round to the same label, the markup emits a real range, so collapsing the
 * text would invert the mismatch rather than fix it.
 */
import { describe, it, expect } from 'vitest';
import { jobSalaryText } from '@/lib/salary-display';
import type { JobSalaryTextFields } from '@/lib/salary-display';

function job(overrides: Partial<JobSalaryTextFields>): JobSalaryTextFields {
  return {
    displaySalary: null,
    normalizedMinSalary: null,
    normalizedMaxSalary: null,
    salaryRange: null,
    salaryPeriod: 'annual',
    ...overrides,
  };
}

describe('degenerate stored salary ranges', () => {
  it('collapses "$350k - $350k/yr" when the pair is a single value', () => {
    expect(jobSalaryText(job({
      displaySalary: '$350k - $350k/yr',
      normalizedMinSalary: 350000,
      normalizedMaxSalary: 350000,
    }))).toBe('$350k/yr');
  });

  it('collapses the no-space form too', () => {
    expect(jobSalaryText(job({
      displaySalary: '$150k-$150k/yr',
      normalizedMinSalary: 150000,
      normalizedMaxSalary: 150000,
    }))).toBe('$150k/yr');
  });

  it('collapses hourly degenerate ranges', () => {
    expect(jobSalaryText(job({
      displaySalary: '$95-$95/hr',
      normalizedMinSalary: 197600,
      normalizedMaxSalary: 197600,
      salaryPeriod: 'hourly',
    }))).toBe('$95/hr');
  });

  it('collapses when there is no numeric pair to contradict it', () => {
    expect(jobSalaryText(job({ displaySalary: '$200k - $200k/yr' }))).toBe('$200k/yr');
  });

  it('leaves a genuine range alone', () => {
    expect(jobSalaryText(job({
      displaySalary: '$150k - $180k/yr',
      normalizedMinSalary: 150000,
      normalizedMaxSalary: 180000,
    }))).toBe('$150k - $180k/yr');
  });

  it('leaves the text alone when the pair says it really is a range', () => {
    // Both bounds round to "$350k" but the markup will emit a real range, so
    // collapsing the visible text would create the opposite mismatch.
    expect(jobSalaryText(job({
      displaySalary: '$350k - $350k/yr',
      normalizedMinSalary: 350000,
      normalizedMaxSalary: 350400,
    }))).toBe('$350k - $350k/yr');
  });

  it('leaves a non-range stored value untouched', () => {
    expect(jobSalaryText(job({ displaySalary: '$180k/yr' }))).toBe('$180k/yr');
    expect(jobSalaryText(job({ displaySalary: 'Competitive' }))).toBe('$Competitive');
  });
});
