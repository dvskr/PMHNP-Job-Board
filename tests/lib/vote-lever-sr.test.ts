/**
 * Regression (audit medium) — the dead-link voter omitted lever_api_404 and
 * smartrecruiters_api_404 from its high-confidence set, so dead Lever/SR jobs
 * fell to 'awaiting_confirmation' every run and were never flipped unpublished.
 */
import { describe, it, expect } from 'vitest';
import { tally } from '@/lib/health/vote';
import type { HealthDecision } from '@/lib/health/check-job-health';

const dead = (reason: string): HealthDecision => ({ alive: false, reason } as unknown as HealthDecision);

describe('tally — Lever/SmartRecruiters 404s flip high-confidence', () => {
  it('flips immediately on lever_api_404', () => {
    const r = tally(dead('lever_api_404'), []);
    expect(r.flip).toBe(true);
    expect(r.outcome).toBe('flip_high_confidence');
  });

  it('flips immediately on smartrecruiters_api_404', () => {
    const r = tally(dead('smartrecruiters_api_404'), []);
    expect(r.flip).toBe(true);
    expect(r.outcome).toBe('flip_high_confidence');
  });

  it('still flips on greenhouse_api_404 (unchanged)', () => {
    expect(tally(dead('greenhouse_api_404'), []).flip).toBe(true);
  });

  it('does not flip a soft_404 without a confirming signal', () => {
    expect(tally(dead('soft_404'), []).flip).toBe(false);
  });
});
