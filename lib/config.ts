/**
 * Pricing Config — Single-Tier Model
 *
 * All job posts get the SAME features (60-day, featured, 25 unlocks, 25 InMails).
 * First 2 posts per employer email are free. Posts 3+ cost $199.
 * Renewals cost $159 (20% off).
 *
 * Internally we store pricingTier='growth' in the DB for backward compatibility
 * with existing records. The paymentStatus field ('free' vs 'paid') distinguishes
 * free from paid posts.
 */

// Keep legacy type for DB compatibility — existing records use these values
export type PricingTier = 'starter' | 'growth' | 'premium';

export const config = {
  // ─── Single-Tier Pricing ───
  freePostsPerEmail: 2,
  postingPrice: 199,       // dollars
  renewalPrice: 159,       // dollars (20% off)
  stripePriceInCents: 19900,
  stripeRenewalPriceInCents: 15900,
  durationDays: 60,

  // All posts are featured (no differentiation)
  isFeatured: true,

  // All posts get the same limits
  limits: {
    candidateUnlocksPerPosting: 25,
    inmailsPerPosting: 25,
  },

  // ─── Helper Functions ───

  formatPrice: (amount: number) => {
    if (amount === 0) return 'FREE'
    return `$${amount}`
  },

  /**
   * Returns the tier label for display purposes.
   * Used in emails, dashboard, etc. Accepts legacy tier values for backward compat.
   */
  getTierLabel: (tier: PricingTier | string) => {
    // Legacy tiers map to "Pro" for display
    switch (tier) {
      case 'premium': return 'Pro'
      case 'growth': return 'Pro'
      case 'starter': return 'Pro'
      default: return 'Pro'
    }
  },

  /**
   * Duration in days. Accepts legacy tier values for backward compat.
   * All tiers now return the same duration.
   */
  getDurationDays: (tier?: PricingTier | string) => {
    return config.durationDays
  },

  /**
   * All posts are featured. Accepts legacy tier values for backward compat.
   */
  isFeaturedTier: (_tier?: PricingTier | string) => {
    return true
  },

  /**
   * Returns limits for a posting. All tiers get the same limits now.
   * Accepts legacy tier values for backward compat.
   */
  getTierLimits: (_tier?: PricingTier | string) => {
    return config.limits
  },

  // ─── Legacy Compat (for existing code that reads these) ───
  // TODO: Remove once all references are cleaned up

  /** @deprecated Use config.postingPrice */
  pricing: {
    starter: 199,
    growth: 199,
    premium: 199,
  },

  /** @deprecated Use config.stripePriceInCents */
  stripePricing: {
    starter: 19900,
    growth: 19900,
    premium: 19900,
  },

  /** @deprecated Use config.renewalPrice */
  renewalPricing: {
    starter: 159,
    growth: 159,
    premium: 159,
  },

  /** @deprecated Use config.stripeRenewalPriceInCents */
  stripeRenewalPricing: {
    starter: 15900,
    growth: 15900,
    premium: 15900,
  },

  /** @deprecated Always returns config.postingPrice now */
  getPostingPrice: (_tier?: PricingTier | string) => {
    return config.postingPrice
  },

  /** @deprecated Always returns config.renewalPrice now */
  getRenewalPrice: (_tier?: PricingTier | string) => {
    return config.renewalPrice
  },

  /** @deprecated Always returns config.stripePriceInCents now */
  getStripePriceInCents: (_tier?: PricingTier | string) => {
    return config.stripePriceInCents
  },

  /** @deprecated Always returns config.stripeRenewalPriceInCents now */
  getStripeRenewalPriceInCents: (_tier?: PricingTier | string) => {
    return config.stripeRenewalPriceInCents
  },

  /** @deprecated No upgrades in single-tier model */
  getUpgradePrice: (_from?: PricingTier | string, _to?: PricingTier | string) => {
    return 0
  },

  /** @deprecated Use config.postingPrice */
  getPricingLabel: (_tier?: PricingTier | string) => {
    return `$${config.postingPrice}`
  },

  // Legacy tierLimits object for backward compat
  tierLimits: {
    starter: { candidateUnlocksPerPosting: 25, inmailsPerPosting: 25 },
    growth: { candidateUnlocksPerPosting: 25, inmailsPerPosting: 25 },
    premium: { candidateUnlocksPerPosting: 25, inmailsPerPosting: 25 },
  },
}

// Type export
export type Config = typeof config
