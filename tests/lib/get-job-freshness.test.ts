/**
 * S5 regression — getJobFreshness (lib/utils.ts) must accept an injected `now`
 * so the relative-time label is deterministic. Before the fix the function read
 * `new Date()` internally, so SSR and client computed different strings → React
 * hydration error #418 on /jobs and the pSEO listings, and the function was
 * impossible to unit-test without mocking the global clock.
 *
 * After the fix `now` is a parameter (default = live clock), so every assertion
 * below is stable forever and the SSR/client strings agree for a shared `now`.
 */
import { describe, it, expect } from 'vitest';
import { getJobFreshness } from '@/lib/utils';

// Fixed reference "now" for all tests.
const NOW = new Date('2026-06-01T12:00:00.000Z');

function jobAt(offsetMs: number): { originalPostedAt: null; createdAt: Date } {
  return { originalPostedAt: null, createdAt: new Date(NOW.getTime() - offsetMs) };
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('getJobFreshness — pure function with injected `now`', () => {
  it('returns "Just posted" when createdAt is < 1 hour ago', () => {
    expect(getJobFreshness(jobAt(30 * MINUTE), NOW)).toBe('Just posted');
  });

  it('returns "Just posted" at exactly 0 ms (brand-new)', () => {
    expect(getJobFreshness(jobAt(0), NOW)).toBe('Just posted');
  });

  it('returns "Posted today" when createdAt is 2 hours ago', () => {
    expect(getJobFreshness(jobAt(2 * HOUR), NOW)).toBe('Posted today');
  });

  it('returns "Posted today" at exactly 23 hours ago', () => {
    expect(getJobFreshness(jobAt(23 * HOUR), NOW)).toBe('Posted today');
  });

  it('returns "Posted yesterday" when createdAt is 25 hours ago', () => {
    expect(getJobFreshness(jobAt(25 * HOUR), NOW)).toBe('Posted yesterday');
  });

  it('returns "Posted yesterday" at exactly 47 hours ago', () => {
    expect(getJobFreshness(jobAt(47 * HOUR), NOW)).toBe('Posted yesterday');
  });

  it('returns "Posted 2 days ago" at 49 hours ago', () => {
    expect(getJobFreshness(jobAt(49 * HOUR), NOW)).toBe('Posted 2 days ago');
  });

  it('returns "Posted 3 days ago" when createdAt is 3 days ago', () => {
    expect(getJobFreshness(jobAt(3 * DAY), NOW)).toBe('Posted 3 days ago');
  });

  it('returns "Posted 6 days ago" (plural) when createdAt is 6 days ago', () => {
    expect(getJobFreshness(jobAt(6 * DAY), NOW)).toBe('Posted 6 days ago');
  });

  it('returns "Posted 1 week ago" (singular) at exactly 7 days ago', () => {
    expect(getJobFreshness(jobAt(7 * DAY), NOW)).toBe('Posted 1 week ago');
  });

  it('returns "Posted 2 weeks ago" when createdAt is 14 days ago', () => {
    expect(getJobFreshness(jobAt(14 * DAY), NOW)).toBe('Posted 2 weeks ago');
  });

  it('returns "Posted 4 weeks ago" at 29 days ago (date-fns truncates 29/7 → 4)', () => {
    expect(getJobFreshness(jobAt(29 * DAY), NOW)).toBe('Posted 4 weeks ago');
  });

  it('returns an absolute date string when createdAt is 30+ days ago', () => {
    expect(getJobFreshness(jobAt(30 * DAY), NOW)).toBe('Posted on May 2, 2026');
  });

  it('returns an absolute date string for a 1-year-old job', () => {
    expect(getJobFreshness(jobAt(365 * DAY), NOW)).toBe('Posted on Jun 1, 2025');
  });

  it('works when a raw Date is passed instead of a job shape', () => {
    const twoHoursAgo = new Date(NOW.getTime() - 2 * HOUR);
    expect(getJobFreshness(twoHoursAgo, NOW)).toBe('Posted today');
  });

  it('uses createdAt (not originalPostedAt) per getEffectiveDate contract', () => {
    const job = {
      originalPostedAt: new Date(NOW.getTime() - 365 * DAY), // very old
      createdAt: new Date(NOW.getTime() - 2 * HOUR), // recent
    };
    expect(getJobFreshness(job, NOW)).toBe('Posted today');
  });
});
