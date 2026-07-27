/**
 * Regression locks for two silent money/data bugs on the employer path.
 *
 * 1. CHECKOUT FREE-ELIGIBILITY GUARD. The free-vs-paid decision lived only in
 *    the preview page's client routing; /api/create-checkout had no server
 *    check of any kind before creating the Stripe session. Any false "paid"
 *    verdict (stale quota fetch, preview predicate drift, direct navigation)
 *    charged a customer for the post they were entitled to free — silently.
 *
 * 2. EMPLOYER-EDIT LOCATION STALENESS. /api/jobs/update wrote the raw
 *    location string without re-running parseLocation, so city/state/
 *    stateCode/isRemote/isHybrid froze at post time through every edit.
 *    Nearly every employer job in prod has been edited at least once.
 *
 * These read the real source so neither guard can be stubbed out silently.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const read = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

describe('create-checkout free-eligibility guard', () => {
  const src = read('app/api/create-checkout/route.ts');

  /** The guard block itself, so assertions can't be satisfied by the row
   *  write further down the file. */
  const guardBlock = (): string => {
    const start = src.indexOf('FREE-ELIGIBILITY GUARD');
    const end = src.indexOf('Sanitize core fields');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return src.slice(start, end);
  };

  it('checks prior free posts with BOTH gate arms (quotaKeys OR legacy quotaDomain)', () => {
    const guard = guardBlock();
    expect(guard).toContain("paymentStatus: 'free'");
    expect(guard).toContain('OR:');
    expect(guard).toContain('quotaKeys: { hasSome:');
    expect(guard).toContain('quotaDomain:');
  });

  it('refuses with a structured 409 the client can act on', () => {
    expect(src).toContain("code: 'FREE_POST_AVAILABLE'");
    expect(src).toContain('status: 409');
  });

  it('runs BEFORE the Stripe session is created', () => {
    const guardAt = src.indexOf('FREE_POST_AVAILABLE');
    const stripeAt = src.indexOf('stripe.checkout.sessions.create');
    expect(guardAt).toBeGreaterThan(-1);
    expect(stripeAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(stripeAt);
  });

  it('builds keys from session identity only, never form fields', () => {
    const guard = guardBlock();
    expect(guard).toContain('buildQuotaKeys({ userId, signupEmail })');
    expect(guard).not.toContain('contactEmail');
    expect(guard).not.toContain('companyWebsite');
    expect(guard).not.toContain('employerName');
  });

  it('the paid-row identity write is session-derived, never the form contact email', () => {
    // The row write used to snapshot quotaDomain from the form-typed contact
    // email, planting a form-derived rival domain in a live blocking column.
    expect(src).toContain('quotaDomain: domainFromEmail(signupEmail)');
    expect(src).not.toContain("quotaDomain: sanitized.contactEmail");
  });

  it('the checkout page routes a 409 to the free flow instead of erroring', () => {
    const page = read('app/post-job/checkout/page.tsx');
    expect(page).toContain("FREE_POST_AVAILABLE");
    expect(page).toContain("router.push('/post-job/preview')");
  });
});

describe('employer edit re-derives structured location', () => {
  const src = read('app/api/jobs/update/route.ts');

  it('imports and calls parseLocation like both post routes do', () => {
    expect(src).toContain("import { parseLocation } from '@/lib/location-parser'");
    expect(src).toContain('parseLocation(jobData.location)');
  });

  it('writes every derived field, not just the raw string', () => {
    for (const field of ['city: parsedLoc.city', 'state: parsedLoc.state', 'stateCode: parsedLoc.stateCode', 'isRemote: parsedLoc.isRemote', 'isHybrid: parsedLoc.isHybrid']) {
      expect(src).toContain(field);
    }
  });
});
