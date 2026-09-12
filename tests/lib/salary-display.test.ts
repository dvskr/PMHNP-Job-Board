/**
 * jobSalaryText — the single salary string every surface renders (card,
 * detail header, OG image; JSON-LD mirrors its numbers). Precedence:
 * displaySalary, then normalized pair via formatDisplaySalary, then the raw
 * min/max pair via formatSalary, then the raw salaryRange text; leading "$"
 * is normalized for legacy displaySalary values written without it.
 */
import { describe, it, expect } from 'vitest';
import { jobSalaryText, resolveJobSalary } from '@/lib/salary-display';

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

/**
 * Pay-period regression. salaryRange is unit-less free text, so reading it
 * before the raw min/max pair printed a monthly row as "$37,714 - $37,714"
 * on the header, the card and the share preview: a figure every reader takes
 * for an annual salary. formatSalary is the only formatter that carries the
 * period, so it must be tried first.
 */
describe('jobSalaryText — raw pair beats unit-less salaryRange text', () => {
  it('keeps the monthly unit instead of printing the period-less salaryRange', () => {
    const monthlyJob = {
      ...EMPTY,
      salaryRange: '$37,714 - $37,714',
      salaryPeriod: 'monthly',
      minSalary: 37714,
      maxSalary: 37714,
    };
    expect(jobSalaryText(monthlyJob)).toBe('$37,714/mo');
    expect(resolveJobSalary(monthlyJob).source).toBe('rawPair');
  });

  it('keeps the hourly unit for a raw pair whose normalized columns were never written', () => {
    expect(jobSalaryText({
      ...EMPTY,
      salaryRange: '85 - 110',
      salaryPeriod: 'hour',
      minSalary: 85,
      maxSalary: 110,
    })).toBe('$85-$110/hr');
  });

  it('does not prefix a second "$" onto formatSalary\'s "Up to" phrasing', () => {
    expect(jobSalaryText({
      ...EMPTY,
      salaryPeriod: 'annual',
      minSalary: null,
      maxSalary: 120000,
    })).toBe('Up to $120k/yr');
  });

  it('still falls through to salaryRange when there is no raw pair either', () => {
    const rangeOnly = { ...EMPTY, salaryRange: '$90,000 - $120,000 per year' };
    expect(jobSalaryText(rangeOnly)).toBe('$90,000 - $120,000 per year');
    expect(resolveJobSalary(rangeOnly).source).toBe('salaryRange');
  });
});

describe('resolveJobSalary — provenance the JSON-LD branches on', () => {
  it('labels each precedence step so the schema can tell parsed numbers from free text', () => {
    expect(resolveJobSalary({ ...EMPTY, displaySalary: '$85-$110/hr' }).source).toBe('displaySalary');
    expect(resolveJobSalary({
      ...EMPTY,
      normalizedMinSalary: 150000,
      normalizedMaxSalary: 180000,
      salaryPeriod: 'annual',
    }).source).toBe('normalized');
    expect(resolveJobSalary(EMPTY).source).toBeNull();
  });
});
