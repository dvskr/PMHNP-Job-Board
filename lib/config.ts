/**
 * Pricing Config — Single-Tier Model
 *
 * All job posts get the SAME features (60-day, featured, 25 unlocks, 25 InMails).
 * The FIRST post per employer domain is free. Posts 2+ cost $199.
 * Renewals cost $179 (10% off).
 *
 * `freePostsPerEmail` is the source of truth for the gate + the dynamic quota
 * counters. Marketing copy is hand-written for the current single-free-post
 * model ("your first post is free"); if this number ever changes, revisit the
 * employer-facing copy (pricing / for-employers / faq / terms / emails).
 *
 * Every employer_jobs row has pricing_tier='pro' after the 2026-04-30 migration
 * (see prisma/migrations/20260430_normalize_pricing_tier_to_pro/). The schema
 * default is 'pro', and all write paths write 'pro'. The paymentStatus field
 * ('free' vs 'paid') distinguishes free from paid posts.
 */

export type PricingTier = 'pro';

export const config = {
  // ─── Single-Tier Pricing ───
  freePostsPerEmail: 1,    // first post free; posts 2+ are paid
  postingPrice: 199,       // dollars
  renewalPrice: 179,       // dollars (10% off)
  stripePriceInCents: 19900,
  stripeRenewalPriceInCents: 17900,
  // Duration split (audit #30): paid posts get 60 days as the headline value;
  // the single free post gets 30 days (trial-feel), so a domain's lifetime free
  // giveaway is 30 days, with headroom to add a Premium tier at 90 days later.
  durationDays: 60,        // paid posts + paid renewals
  freeDurationDays: 30,    // free posts only

  // All posts are featured (no differentiation)
  isFeatured: true,

  // All posts get the same limits
  limits: {
    candidateUnlocksPerPosting: 25,
    inmailsPerPosting: 25,
  },

  // Cross-posting safety cap on candidate unlocks. The per-posting limit
  // (25) prevents abuse within a single posting, but an employer with N
  // active postings has N×25 total — fine for normal hiring, suspicious for
  // mass scraping. Cap at 50 unique unlocks across ALL postings in any
  // rolling 24h window. Real hiring teams don't review more than ~50
  // profiles in a single day; scrapers do.
  dailyUnlockCap: 50,

  // ─── Helper Functions ───

  formatPrice: (amount: number) => {
    if (amount === 0) return 'FREE'
    return `$${amount}`
  },

  /**
   * Returns the tier label for display purposes. Always 'Pro' in the
   * single-tier model — accepts legacy values for backward compat with stored rows.
   */
  getTierLabel: (_tier?: PricingTier | string) => 'Pro',

  /**
   * Duration in days. Always config.durationDays — parameter retained for
   * call-site backward compatibility.
   */
  getDurationDays: (_tier?: PricingTier | string) => config.durationDays,

  /** All posts are featured. */
  isFeaturedTier: (_tier?: PricingTier | string) => true,

  /** Returns limits for a posting. All tiers get the same limits. */
  getTierLimits: (_tier?: PricingTier | string) => config.limits,

  // Kept for active reference by app/api/employer/invoice/route.ts.
  // TODO (audit #2): replace with reading actual amount from the Stripe session.
  getStripePriceInCents: (_tier?: PricingTier | string) => config.stripePriceInCents,
}

// Type export
export type Config = typeof config
