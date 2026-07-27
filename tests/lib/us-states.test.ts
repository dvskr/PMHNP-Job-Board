/**
 * Canonical US state registry (lib/us-states.ts).
 *
 * Locks the two regressions that motivated the module:
 *   1. DC missing from picker lists (job-alerts shipped 50 names, matcher
 *      understood 51).
 *   2. "West Virginia" resolving to Virginia via substring/ordering bugs.
 */
import { describe, it, expect } from 'vitest';
import {
  US_STATES,
  US_STATE_NAMES,
  CANONICAL_STATE_CODES,
  STATE_CODE_TO_NAME,
  STATE_NAME_TO_CODE,
  toStateCode,
} from '@/lib/us-states';

describe('registry shape', () => {
  it('has exactly 51 entries: 50 states plus DC', () => {
    expect(US_STATES).toHaveLength(51);
    expect(CANONICAL_STATE_CODES).toContain('DC');
  });

  it('codes are unique, uppercase, 2 letters', () => {
    expect(new Set(CANONICAL_STATE_CODES).size).toBe(51);
    for (const code of CANONICAL_STATE_CODES) {
      expect(code).toMatch(/^[A-Z]{2}$/);
    }
  });

  it('US_STATE_NAMES is the 51-entry alphabetical picker list with DC', () => {
    expect(US_STATE_NAMES).toHaveLength(51);
    expect(US_STATE_NAMES).toContain('District of Columbia');
    expect([...US_STATE_NAMES]).toEqual(
      [...US_STATE_NAMES].slice().sort((a, b) => a.localeCompare(b)),
    );
  });

  it('keeps DC before WA so "washington dc" outranks "washington"', () => {
    const dc = US_STATES.findIndex((s) => s.code === 'DC');
    const wa = US_STATES.findIndex((s) => s.code === 'WA');
    expect(dc).toBeGreaterThanOrEqual(0);
    expect(dc).toBeLessThan(wa);
  });

  it('maps are mutually consistent', () => {
    for (const { code, name } of US_STATES) {
      expect(STATE_CODE_TO_NAME[code]).toBe(name);
      expect(STATE_NAME_TO_CODE[name]).toBe(code);
    }
  });
});

describe('toStateCode', () => {
  it('accepts codes in any case', () => {
    expect(toStateCode('TX')).toBe('TX');
    expect(toStateCode('tx')).toBe('TX');
    expect(toStateCode(' dc ')).toBe('DC');
  });

  it('accepts display names and aliases', () => {
    expect(toStateCode('Texas')).toBe('TX');
    expect(toStateCode('district of columbia')).toBe('DC');
    expect(toStateCode('washington d.c.')).toBe('DC');
    expect(toStateCode('calif')).toBe('CA');
  });

  it('West Virginia never collapses into Virginia', () => {
    expect(toStateCode('West Virginia')).toBe('WV');
    expect(toStateCode('west virginia')).toBe('WV');
    expect(toStateCode('Virginia')).toBe('VA');
  });

  it('"washington" alone is the state, "washington dc" is DC', () => {
    expect(toStateCode('washington')).toBe('WA');
    expect(toStateCode('washington state')).toBe('WA');
    expect(toStateCode('washington dc')).toBe('DC');
  });

  it('returns null for junk instead of guessing', () => {
    for (const bad of [null, undefined, '', '  ', 'ZZ', 'Canada', 'Springfield', 'X']) {
      expect(toStateCode(bad as string)).toBeNull();
    }
  });
});
