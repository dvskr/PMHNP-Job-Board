/**
 * Guards on lib/config.ts, the pricing contract.
 *
 * The failure this suite exists to catch: dollars and Stripe cents are two
 * independent literals in the config object. An edit that raises
 * `postingPrice` and forgets `stripePriceInCents` charges an amount no
 * surface displays, and nothing else in the codebase notices, because the
 * copy reads one field and Checkout reads the other.
 */
import { describe, it, expect } from 'vitest';
import { config, type PostPriceKind } from '@/lib/config';

const KINDS: PostPriceKind[] = ['first', 'standard', 'renewal'];

describe('priceFor', () => {
  it('returns the half-price entry for the once-per-employer first post', () => {
    expect(config.priceFor('first')).toBe(config.firstPostPrice);
  });

  it('returns the standard price for every post after the first', () => {
    expect(config.priceFor('standard')).toBe(config.postingPrice);
  });

  it('returns the renewal price for an extension', () => {
    expect(config.priceFor('renewal')).toBe(config.renewalPrice);
  });
});

describe('priceInCentsFor', () => {
  it('returns the first-post Stripe amount', () => {
    expect(config.priceInCentsFor('first')).toBe(config.stripeFirstPostPriceInCents);
  });

  it('returns the standard Stripe amount', () => {
    expect(config.priceInCentsFor('standard')).toBe(config.stripePriceInCents);
  });

  it('returns the renewal Stripe amount', () => {
    expect(config.priceInCentsFor('renewal')).toBe(config.stripeRenewalPriceInCents);
  });
});

describe('dollars and cents agree', () => {
  it.each(KINDS)('%s: the charged cents are exactly the displayed dollars', (kind) => {
    expect(config.priceInCentsFor(kind)).toBe(config.priceFor(kind) * 100);
  });

  it.each(KINDS)('%s: the dollar figure is a whole positive number of dollars', (kind) => {
    const dollars = config.priceFor(kind);
    expect(Number.isInteger(dollars)).toBe(true);
    expect(dollars).toBeGreaterThan(0);
    // A cents value pasted into a dollars field is the other half of the
    // same mistake, and it would sail past the equality check above only if
    // both fields were wrong together. This catches the obvious magnitude.
    expect(dollars).toBeLessThan(10_000);
  });
});

describe('price ordering', () => {
  it('the first post is strictly cheaper than a standard post', () => {
    expect(config.priceFor('first')).toBeLessThan(config.priceFor('standard'));
  });

  it('a renewal is cheaper than posting fresh at standard price', () => {
    expect(config.priceFor('renewal')).toBeLessThan(config.priceFor('standard'));
  });
});

describe('firstPostDiscountPercent', () => {
  it('is 50, which is the number the copy says out loud', () => {
    expect(config.firstPostDiscountPercent()).toBe(50);
  });

  it('is derived from the two prices, not stored separately', () => {
    expect(config.firstPostDiscountPercent()).toBe(
      Math.round((1 - config.firstPostPrice / config.postingPrice) * 100),
    );
  });
});

describe('the discount gate', () => {
  it('grants exactly one discounted post per employer identity', () => {
    expect(config.discountedPostsPerEmployer).toBe(1);
  });
});

describe('duration', () => {
  it('is a single value for every post, with no free-post split left', () => {
    expect(config.durationDays).toBe(60);
    expect(config.getDurationDays()).toBe(config.durationDays);
    expect(config).not.toHaveProperty('freeDurationDays');
    expect(config).not.toHaveProperty('freePostsPerEmail');
  });
});

describe('no refund guarantee lives in config', () => {
  it('exposes none of the retired guarantee keys', () => {
    for (const key of ['firstPostGuarantee', 'guaranteeMinApplicants', 'guaranteeWindowDays', 'guaranteeClaimDays']) {
      expect(config).not.toHaveProperty(key);
    }
  });
});
