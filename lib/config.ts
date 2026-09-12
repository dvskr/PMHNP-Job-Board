/**
 * Pricing Config — Single-Tier, Paid-First Model
 *
 * All job posts get the SAME features (60-day, featured, 25 unlocks, 25 InMails).
 * The FIRST post per employer identity is half price ($149). Posts 2+ cost $299.
 * Renewals cost $249.
 *
 * WHY PAID-FIRST (2026-09): the previous model gave the first post away free,
 * and the free tier behaved as the product rather than as a funnel into the
 * paid one. A half-price first post keeps the low-friction entry point while
 * putting every employer on a paid footing from day one.
 *
 * `discountedPostsPerEmployer` is the source of truth for the discount gate and
 * the dynamic counters. It replaces the old `freePostsPerEmail`. The quota-key
 * machinery in lib/employer-quota.ts is UNCHANGED: the same session-proven keys
 * (acct:, dom:, org:) that used to gate a free post now gate the discount.
 *
 * Marketing copy is hand-written for the current one-discounted-post model
 * ("50% off your first post"); if this number ever changes, revisit the
 * employer-facing copy (pricing / for-employers / faq / terms / emails /
 * post-job layout metadata / signup).
 *
 * Every employer_jobs row has pricing_tier='pro' after the 2026-04-30 migration
 * (see prisma/migrations/20260430_normalize_pricing_tier_to_pro/). The schema
 * default is 'pro', and all write paths write 'pro'. The paymentStatus field
 * distinguishes historical 'free' rows from 'paid' ones; no new 'free' rows are
 * created after this change.
 */

export type PricingTier = 'pro';

/** Which price a given post is charged at. */
export type PostPriceKind = 'first' | 'standard' | 'renewal';

export const config = {
  // ─── Single-Tier Pricing ───
  /** How many half-price posts an employer identity gets, ever. */
  discountedPostsPerEmployer: 1,
  firstPostPrice: 149,     // dollars, first post per employer identity
  postingPrice: 299,       // dollars, standard
  renewalPrice: 249,       // dollars
  stripeFirstPostPriceInCents: 14900,
  stripePriceInCents: 29900,
  stripeRenewalPriceInCents: 24900,
  /** Every post runs 60 days. The old 30-day free-post split is retired. */
  durationDays: 60,

  // ─── First-post guarantee ───
  // A half-price first post still asks a cold employer to trust an unproven
  // board, so the first post carries an applicant-count refund guarantee.
  // Toggle OFF to withdraw the offer: copy and the terms clause both read
  // this flag, so flipping it removes the promise everywhere at once.
  firstPostGuarantee: true,
  guaranteeMinApplicants: 3,
  guaranteeWindowDays: 30,

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
   * Dollar price for a post. `first` is the once-per-employer half-price
   * entry; `standard` is every post after it; `renewal` extends a live post.
   */
  priceFor: (kind: PostPriceKind): number => {
    if (kind === 'first') return config.firstPostPrice
    if (kind === 'renewal') return config.renewalPrice
    return config.postingPrice
  },

  /** Stripe amount in cents for a post. Mirrors priceFor exactly. */
  priceInCentsFor: (kind: PostPriceKind): number => {
    if (kind === 'first') return config.stripeFirstPostPriceInCents
    if (kind === 'renewal') return config.stripeRenewalPriceInCents
    return config.stripePriceInCents
  },

  /** Whole-percent discount the first post carries, for copy ("50% off"). */
  firstPostDiscountPercent: (): number =>
    Math.round((1 - config.firstPostPrice / config.postingPrice) * 100),

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
