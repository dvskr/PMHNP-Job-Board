/**
 * #4 regression — the related-cities sidebar must not link to city pages that
 * will 404 (cities below the MIN_JOBS=3 render gate).
 */
import { describe, it, expect } from 'vitest';
import { selectEligibleCities, MIN_RELATED_CITY_JOBS } from '@/lib/pseo/related-cities';

const rows = [
  { city: 'Austin', count: 12 },
  { city: 'Dallas', count: 3 },
  { city: 'Tyler', count: 2 }, // below threshold → would 404
  { city: 'Waco', count: 1 }, // below threshold → would 404
  { city: '', count: 50 }, // empty name
  { city: null, count: 50 }, // null name
  { city: 'Houston', count: 9 },
];

describe('selectEligibleCities', () => {
  it('keeps the threshold pinned at 3 (matches the city page render gate)', () => {
    expect(MIN_RELATED_CITY_JOBS).toBe(3);
  });

  it('drops cities with fewer than 3 jobs (they would notFound())', () => {
    const out = selectEligibleCities(rows, 'San Antonio', 8).map((r) => r.city);
    expect(out).toContain('Austin');
    expect(out).toContain('Dallas'); // exactly 3 → eligible
    expect(out).not.toContain('Tyler');
    expect(out).not.toContain('Waco');
  });

  it('drops empty/null city names', () => {
    const out = selectEligibleCities(rows, 'San Antonio', 8);
    expect(out.every((r) => !!r.city && r.city.trim().length > 0)).toBe(true);
  });

  it('excludes the current city (case-insensitive)', () => {
    const out = selectEligibleCities(rows, 'AUSTIN', 8).map((r) => r.city);
    expect(out).not.toContain('Austin');
  });

  it('respects the limit', () => {
    expect(selectEligibleCities(rows, 'San Antonio', 2)).toHaveLength(2);
  });
});
