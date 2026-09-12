/**
 * Regression locks for two silent money/data bugs on the employer path.
 *
 * 1. CHECKOUT FIRST-POST PRICING. Under the retired free-post model this
 *    guard's job was to refuse a charge the employer did not owe. Now every
 *    post is paid and the same predicate decides only WHICH price applies,
 *    which reverses the danger: a wrong verdict here charges $299 for the
 *    half-price first post that was advertised, and the route must never turn
 *    a key collision back into a refusal to post.
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

describe('create-checkout first-post discount gate', () => {
  const src = read('app/api/create-checkout/route.ts');

  /** The gate block itself, so assertions can't be satisfied by the row
   *  write further down the file. */
  const gateBlock = (): string => {
    const start = src.indexOf('FIRST-POST DISCOUNT GATE');
    const end = src.indexOf('Sanitize core fields');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return src.slice(start, end);
  };

  it('counts prior posts with BOTH arms (quotaKeys OR legacy quotaDomain)', () => {
    const gate = gateBlock();
    expect(gate).toContain('OR:');
    expect(gate).toContain('quotaKeys: { hasSome:');
    expect(gate).toContain('quotaDomain:');
  });

  it('excludes abandoned checkouts so backing out of Stripe cannot spend the discount', () => {
    expect(gateBlock()).toContain("paymentStatus: { not: 'pending' }");
  });

  it('NEVER refuses the post on a key collision, it only drops the discount', () => {
    const gate = gateBlock();
    // No early return, no error code, no status of any kind in the gate: the
    // only thing it may produce is a boolean that selects a price.
    expect(gate).not.toMatch(/return NextResponse/);
    expect(gate).not.toMatch(/status: \d{3}/);
    expect(gate).toMatch(/isFirstPost = /);
    // And the retired free-post handoff must not come back.
    expect(src).not.toContain('FREE_POST_AVAILABLE');
  });

  it('prices from config, never a hardcoded amount', () => {
    expect(src).toContain("config.priceInCentsFor(priceKind)");
    expect(src).not.toContain('config.stripePriceInCents');
    expect(src).not.toMatch(/unit_amount: \d+/);
  });

  it('runs BEFORE the Stripe session is created', () => {
    const gateAt = src.indexOf('FIRST-POST DISCOUNT GATE');
    const stripeAt = src.indexOf('stripe.checkout.sessions.create');
    expect(gateAt).toBeGreaterThan(-1);
    expect(stripeAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(stripeAt);
  });

  it('tells Stripe and the ledger which price was charged', () => {
    // The webhook's fallback amount reads this; without it a first post can
    // be booked into JobCharge at the standard price.
    expect(src).toMatch(/priceKind,/);
    expect(read('app/api/webhooks/stripe/route.ts')).toContain(
      "config.priceInCentsFor(priceKind)",
    );
  });

  it('builds keys from session identity only, never form fields', () => {
    const gate = gateBlock();
    // Session-derived inputs only. lockedCompanyName is the account's
    // write-once profile name, not a request body field (see
    // lib/employer-quota.ts QuotaIdentity for the caller contract).
    expect(gate).toMatch(/buildQuotaKeys\(\{\s*userId,\s*signupEmail(,\s*lockedCompanyName)?\s*\}\)/);
    expect(gate).not.toContain('contactEmail');
    expect(gate).not.toContain('companyWebsite');
    expect(gate).not.toContain('employerName');
    expect(gate).not.toContain('rawBody');
    expect(gate).not.toContain('sanitized.');
  });

  it('the row identity write is session-derived, never the form contact email', () => {
    // The row write used to snapshot quotaDomain from the form-typed contact
    // email, planting a form-derived rival domain in a live pricing column.
    expect(src).toContain('quotaDomain: domainFromEmail(signupEmail)');
    expect(src).not.toContain("quotaDomain: sanitized.contactEmail");
  });

  it('guarantee copy is gated on the config toggle and interpolates its numbers', () => {
    expect(src).toContain('config.firstPostGuarantee');
    expect(src).toContain('config.guaranteeMinApplicants');
    expect(src).toContain('config.guaranteeWindowDays');
  });
});

describe('post-price preview agrees with what checkout will charge', () => {
  const quote = read('app/api/employer/post-price/route.ts');
  const charge = read('app/api/create-checkout/route.ts');

  it('uses the same predicate, so the quote cannot undercut the charge', () => {
    for (const fragment of ["paymentStatus: { not: 'pending' }", 'quotaKeys: { hasSome:', 'quotaDomain:']) {
      expect(quote, `quote missing ${fragment}`).toContain(fragment);
      expect(charge, `charge missing ${fragment}`).toContain(fragment);
    }
  });

  it('does not refuse consumer signup domains any more', () => {
    expect(quote).not.toContain('FREE_EMAIL_DOMAINS');
    expect(quote).not.toContain('free-email-provider');
  });

  it('answers the fixed contract shape', () => {
    for (const field of ['eligible', 'isFirstPost', 'priceKind', 'priceDollars', 'remaining', 'reason']) {
      expect(quote, `missing ${field}`).toContain(`${field}`);
    }
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
