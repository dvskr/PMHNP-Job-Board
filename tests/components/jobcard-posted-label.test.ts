/**
 * Cards must show ONE consistent relative posted-date format. getJobFreshness
 * (lib/utils.ts) intentionally falls back to an absolute "Posted on Apr 29,
 * 2026" for jobs 30+ days old — fine for the detail footer, but on card grids
 * it made adjacent rows read inconsistently ("Posted 3 weeks ago" next to
 * "Posted on Apr 29, 2026").
 *
 * formatRelativePostedLabel (components/JobCard.tsx) converts that absolute
 * fallback to "Posted N months/years ago" and passes relative labels through
 * untouched. These tests pin both behaviors, including the composition with
 * the real getJobFreshness output.
 */
import { describe, it, expect } from 'vitest';
import { formatRelativePostedLabel } from '@/components/JobCard';
import { getJobFreshness } from '@/lib/utils';

const NOW = new Date('2026-06-01T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

describe('formatRelativePostedLabel — passthrough for relative labels', () => {
  it.each([
    'Just posted',
    'Posted today',
    'Posted yesterday',
    'Posted 3 days ago',
    'Posted 2 weeks ago',
  ])('returns %j unchanged', (label) => {
    expect(formatRelativePostedLabel(label, daysAgo(1), NOW)).toBe(label);
  });
});

describe('formatRelativePostedLabel — absolute fallback becomes relative', () => {
  it('30 days → "Posted 1 month ago" (singular)', () => {
    expect(formatRelativePostedLabel('Posted on May 2, 2026', daysAgo(30), NOW)).toBe('Posted 1 month ago');
  });

  it('65 days → "Posted 2 months ago"', () => {
    expect(formatRelativePostedLabel('Posted on Mar 28, 2026', daysAgo(65), NOW)).toBe('Posted 2 months ago');
  });

  it('364 days stays in months (never "0 years")', () => {
    expect(formatRelativePostedLabel('Posted on Jun 2, 2025', daysAgo(364), NOW)).toBe('Posted 12 months ago');
  });

  it('365 days → "Posted 1 year ago" (singular)', () => {
    expect(formatRelativePostedLabel('Posted on Jun 1, 2025', daysAgo(365), NOW)).toBe('Posted 1 year ago');
  });

  it('800 days → "Posted 2 years ago"', () => {
    expect(formatRelativePostedLabel('Posted on Mar 24, 2024', daysAgo(800), NOW)).toBe('Posted 2 years ago');
  });
});

describe('composition with the real getJobFreshness output', () => {
  it('a 45-day-old job renders relative, not absolute', () => {
    const createdAt = daysAgo(45);
    const raw = getJobFreshness({ originalPostedAt: null, createdAt }, NOW);
    expect(raw.startsWith('Posted on ')).toBe(true); // the branch being unified
    expect(formatRelativePostedLabel(raw, createdAt, NOW)).toBe('Posted 1 month ago');
  });

  it('a 6-day-old job is untouched', () => {
    const createdAt = daysAgo(6);
    const raw = getJobFreshness({ originalPostedAt: null, createdAt }, NOW);
    expect(formatRelativePostedLabel(raw, createdAt, NOW)).toBe('Posted 6 days ago');
  });
});
