import { describe, it, expect } from 'vitest';
import { expiresFromNow, renewalExpiresAt } from '@/lib/expires-at';

describe('expiresFromNow', () => {
  it('adds N×24 hours of UTC milliseconds — TZ-independent', () => {
    const from = new Date('2026-01-26T00:00:00.000Z');
    const result = expiresFromNow(60, from);
    // 60 days = 60 * 86_400_000 ms = 5_184_000_000 ms
    expect(result.getTime() - from.getTime()).toBe(60 * 24 * 60 * 60 * 1000);
    // And the date should be Mar 27 UTC, NOT the buggy Mar 29 we saw on prod
    expect(result.toISOString()).toBe('2026-03-27T00:00:00.000Z');
  });

  it('crosses US DST boundary (Mar 8, 2026) without drift — the NYPCC bug', () => {
    // The original bug: posted Jan 26, expired Mar 29 (62 days, off by 2 from
    // the intended 60). Caused by setDate() running in server-local TZ across
    // the DST transition. UTC math returns exactly 60 days regardless.
    const from = new Date('2026-01-26T12:00:00.000Z');
    const result = expiresFromNow(60, from);
    expect(result.toISOString()).toBe('2026-03-27T12:00:00.000Z');
  });

  it('30-day free-post duration is stable across timezones', () => {
    const from = new Date('2026-04-30T18:00:00.000Z');
    const result = expiresFromNow(30, from);
    expect(result.toISOString()).toBe('2026-05-30T18:00:00.000Z');
  });

  it('throws on negative input', () => {
    expect(() => expiresFromNow(-1)).toThrow();
  });

  it('throws on non-integer input', () => {
    expect(() => expiresFromNow(30.5)).toThrow();
  });

  it('zero duration returns the same instant', () => {
    const from = new Date('2026-05-02T12:00:00.000Z');
    const result = expiresFromNow(0, from);
    expect(result.getTime()).toBe(from.getTime());
  });
});

describe('renewalExpiresAt', () => {
  const originalCreatedAt = new Date('2026-01-01T00:00:00.000Z');

  it('extends from existing expiry when expiry is still in the future', () => {
    const currentExpiry = new Date('2026-05-15T00:00:00.000Z');
    const now = new Date('2026-05-01T00:00:00.000Z');
    const result = renewalExpiresAt({ currentExpiry, originalCreatedAt, durationDays: 60, now });
    expect(result.toISOString()).toBe('2026-07-14T00:00:00.000Z'); // May 15 + 60 days
  });

  it('extends from now when current expiry has lapsed', () => {
    const currentExpiry = new Date('2026-04-15T00:00:00.000Z');
    const now = new Date('2026-05-01T00:00:00.000Z');
    const result = renewalExpiresAt({ currentExpiry, originalCreatedAt, durationDays: 60, now });
    expect(result.toISOString()).toBe('2026-06-30T00:00:00.000Z'); // May 1 + 60 days
  });

  it('extends from now when current expiry is null', () => {
    const now = new Date('2026-05-01T00:00:00.000Z');
    const result = renewalExpiresAt({ currentExpiry: null, originalCreatedAt, durationDays: 60, now });
    expect(result.toISOString()).toBe('2026-06-30T00:00:00.000Z');
  });

  it('caps at 365 days from originalCreatedAt to prevent indefinite stacking', () => {
    // 5 back-to-back renewals on a fresh post would push expiry 300 days out;
    // simulate that by passing a current expiry that's already 11 months out.
    const currentExpiry = new Date('2026-12-01T00:00:00.000Z'); // 11 months from createdAt
    const now = new Date('2026-05-01T00:00:00.000Z');
    const result = renewalExpiresAt({ currentExpiry, originalCreatedAt, durationDays: 60, now });
    // proposed would be 2027-01-30; cap is 2027-01-01 (365 days from createdAt)
    expect(result.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('respects custom maxFromOriginalDays cap', () => {
    const currentExpiry = new Date('2026-06-01T00:00:00.000Z');
    const now = new Date('2026-05-01T00:00:00.000Z');
    // 90-day cap from Jan 1 = Apr 1, but currentExpiry is already past that
    // so the cap kicks in and returns the cap value.
    const result = renewalExpiresAt({
      currentExpiry, originalCreatedAt, durationDays: 60, now, maxFromOriginalDays: 90,
    });
    expect(result.toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });
});
