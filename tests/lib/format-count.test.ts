/**
 * roundedCountDisplay is the single formatter for rounded site-wide counts.
 * The 2026-08 audit found the same total rendered as "1,600+" in homepage
 * metadata but "1600+" in the hero body; these tests lock the shared shape.
 */
import { describe, it, expect } from 'vitest';
import { roundedCountDisplay } from '@/lib/format-count';

describe('roundedCountDisplay', () => {
  it('rounds down to the nearest hundred and appends a plus', () => {
    expect(roundedCountDisplay(1620)).toBe('1,600+');
    expect(roundedCountDisplay(1699)).toBe('1,600+');
  });

  it('uses en-US thousands separators regardless of server locale', () => {
    expect(roundedCountDisplay(12345)).toBe('12,300+');
  });

  it('keeps an exact hundred as its own floor', () => {
    expect(roundedCountDisplay(200)).toBe('200+');
  });

  it('renders counts under 100 exactly, without a plus', () => {
    expect(roundedCountDisplay(99)).toBe('99');
    expect(roundedCountDisplay(1)).toBe('1');
    expect(roundedCountDisplay(0)).toBe('0');
  });
});
