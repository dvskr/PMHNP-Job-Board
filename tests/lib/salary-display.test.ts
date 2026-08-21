/**
 * jobSalaryText — the single salary string every surface renders (card,
 * detail header, OG image; JSON-LD mirrors its numbers). Precedence:
 * displaySalary, then normalized pair via formatDisplaySalary, then raw
 * salaryRange text; leading "$" is normalized for legacy displaySalary
 * values written without it.
 */
import { describe, it, expect } from 'vitest';
import { jobSalaryText } from '@/lib/salary-display';

const EMPTY = {
  displaySalary: null,
  normalizedMinSalary: null,
  normalizedMaxSalary: null,
  salaryRange: null,
  salaryPeriod: null,
};

describe('jobSalaryText', () => {
  it('prefers the stored displaySalary over everything else', () => {
    expect(jobSalaryText({
      ...EMPTY,
      displaySalary: '$85-$110/hr',
      normalizedMinSalary: 999999,
      normalizedMaxSalary: 999999,
      salaryRange: '$1 per year',
    })).toBe('$85-$110/hr');
  });

  it('prefixes "$" onto legacy displaySalary values written without one', () => {
    expect(jobSalaryText({ ...EMPTY, displaySalary: '150-200/hr' })).toBe('$150-200/hr');
  });

  it('falls back to the normalized pair formatted like the write path (annual)', () => {
    expect(jobSalaryText({
      ...EMPTY,
      normalizedMinSalary: 150000,
      normalizedMaxSalary: 180000,
      salaryPeriod: 'annual',
    })).toBe('$150k-$180k/yr');
  });

  it('converts the annualized normalized pair back to hourly (/2080) for hourly jobs', () => {
    expect(jobSalaryText({
      ...EMPTY,
      normalizedMinSalary: 176800,
      normalizedMaxSalary: 228800,
      salaryPeriod: 'hourly',
    })).toBe('$85-$110/hr');
  });

  it('falls back to raw salaryRange text when nothing else exists', () => {
    expect(jobSalaryText({ ...EMPTY, salaryRange: '$90,000 - $120,000 per year' }))
      .toBe('$90,000 - $120,000 per year');
    expect(jobSalaryText({ ...EMPTY, salaryRange: '90,000 - 120,000 per year' }))
      .toBe('$90,000 - 120,000 per year');
  });

  it('returns null when the job discloses no salary at all', () => {
    expect(jobSalaryText(EMPTY)).toBeNull();
  });
});
