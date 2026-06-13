/**
 * Regression (audit medium) — semantic-search state extraction used a single
 * (non-global) match for an uppercase 2-letter token, so "NP" (matched first,
 * not a state) blocked the real state code that followed from ever being seen.
 */
import { describe, it, expect } from 'vitest';
import { parseSemanticQuery } from '@/lib/ai/query-parser';

describe('parseSemanticQuery — state extraction past non-state uppercase tokens', () => {
  it('finds the state when "NP" precedes the code', () => {
    expect(parseSemanticQuery('NP jobs in Dallas TX').state).toBe('TX');
    expect(parseSemanticQuery('telepsych NP CA').state).toBe('CA');
  });

  it('still finds a bare uppercase state code', () => {
    expect(parseSemanticQuery('psych jobs CA').state).toBe('CA');
  });

  it('still prefers preposition-anchored codes', () => {
    expect(parseSemanticQuery('remote PMHNP in tx').state).toBe('TX');
  });

  it('returns no state when none is present', () => {
    expect(parseSemanticQuery('NP telehealth jobs').state).toBeFalsy();
  });
});
