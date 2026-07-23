/**
 * Salary converter math (components/tools/SalaryConverter.tsx).
 * Pure functions — pinned so UI refactors can't drift the arithmetic.
 */
import { describe, it, expect } from 'vitest';
import { toAnnual, fromAnnual } from '@/components/tools/SalaryConverter';
import type { SalaryPeriodKey } from '@/lib/utils';

const PERIODS: SalaryPeriodKey[] = ['hourly', 'daily', 'weekly', 'biweekly', 'monthly', 'annual'];

describe('toAnnual', () => {
  it('hourly: $85 at 40h/52w = $176,800', () => {
    expect(toAnnual(85, 'hourly', 40, 52)).toBe(176800);
  });

  it('hourly honors custom assumptions: $85 at 35h/48w = $142,800', () => {
    expect(toAnnual(85, 'hourly', 35, 48)).toBe(142800);
  });

  it('biweekly: $6,000 at 52 weeks = $156,000', () => {
    expect(toAnnual(6000, 'biweekly', 40, 52)).toBe(156000);
  });

  it('daily derives days from hours/week at 8h/day: $1,000/day at 40h = 5 days', () => {
    expect(toAnnual(1000, 'daily', 40, 52)).toBe(260000);
  });

  it('daily caps at 7 days/week even for extreme hours', () => {
    expect(toAnnual(1000, 'daily', 100, 52)).toBe(7 * 52 * 1000);
  });

  it('monthly and annual are calendar-fixed', () => {
    expect(toAnnual(15000, 'monthly', 40, 52)).toBe(180000);
    expect(toAnnual(165000, 'annual', 1, 1)).toBe(165000);
  });
});

describe('fromAnnual ↔ toAnnual round-trips', () => {
  it.each(PERIODS)('%s round-trips through annual', (period) => {
    const annual = toAnnual(1234.56, period, 36, 48);
    expect(fromAnnual(annual, period, 36, 48)).toBeCloseTo(1234.56, 6);
  });
});
