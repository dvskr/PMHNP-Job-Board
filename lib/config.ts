/**
 * Pricing Config — Single-Tier, Paid-First Model
 *
 * All job posts get the SAME features (60-day, featured, 25 unlocks, 25 InMails).
 * The FIRST post per employer identity is discounted ($199). Posts 2+ cost
 * $349. Renewals cost $249.
 *
 * PRICE MOVE (2026-09-27): first post 149 to 199, standard 299 to 349. The
 * closest comparable, a nurse practitioner board, charges $389 for a 60-day
 * post, and NP-specific boards cluster at $389 to $399, so the old standard
 * sat under the market for a single-specialty board. Note that no employer
 * had ever actually paid the 299: every sale to date was either the old 199
 * flat price or the 149 first-post price, so the standard price is being
 * repositioned rather than raised on anyone.
 *
 * The first-post discount is now 43%, not 50%, and it is DERIVED by
 * firstPostDiscountPercent(). Any copy that states the number must call that
 * helper rather than writing a figure, which is what
 * tests/regressions/paid-first-pricing-static.test.ts enforces.
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

/**
 * Prepaid posting credits, for agencies that post continuously.
 *
 * Discounts follow the market: comparable boards cluster at about 10% off at
 * three posts, 15% at five and 20 to 25% at ten. Credits sit on a 12-month
 * clock, which every comparable pack does, and are spendable by anyone on
 * the buying account.
 *
 * HOW A PACK INTERACTS WITH THE FIRST-POST DISCOUNT, decided here because
 * the discount gate in create-checkout and the quote in post-price must
 * agree and this file is the declared source of truth:
 *
 *   A credit-funded post is written with paymentStatus 'paid', so it COUNTS
 *   in the discount gate exactly like any other paid post. Buying a pack
 *   therefore ends the first-post discount.
 *
 * That is the intended behaviour, not a side effect: the opposite rule, where
 * credit posts do not count, would let a buyer spend ten credits and still
 * claim the entry discount on the eleventh.
 *
 * BUT IT IS NOT FREE FOR THE BUYER, AND COPY MUST NOT PRETEND IT IS. An
 * earlier version of this comment claimed a pack always costs less per post
 * than the discounted entry plus standard pricing. That is false at the
 * smallest size: three posts bought as a pack cost more than
 * firstPostPrice + 2 * postingPrice, because buying the pack forfeits the
 * discount. It only turns in the buyer's favour from the next size up.
 * savingsPercent measures the saving against the STANDARD price, which is
 * the right claim for a returning employer and the wrong one for a first
 * purchase. Use smallestPackWorthItBeforeFirstPost() when the reader may
 * still hold the discount, and never lead cold copy with creditPacks[0].
 *
 * Credit posts write discountHoldKey null, like any standard post. Taking
 * the hold would collide with the buyer's existing paid row on a unique
 * index, and the one-shot recovery for that collision expires a Checkout
 * session, which a credit post does not have.
 */
export interface CreditPackOption {
  /** Stable id, carried in Stripe metadata. */
  id: string;
  credits: number;
  priceCents: number;
  /** Whole percent off the standard per-post price, for copy. */
  savingsPercent: number;
}

export const config = {
  // ─── Single-Tier Pricing ───
  /** How many half-price posts an employer identity gets, ever. */
  discountedPostsPerEmployer: 1,
  firstPostPrice: 199,     // dollars, first post per employer identity
  postingPrice: 349,       // dollars, standard
  renewalPrice: 249,       // dollars
  stripeFirstPostPriceInCents: 19900,
  stripePriceInCents: 34900,
  stripeRenewalPriceInCents: 24900,
  /** Every post runs 60 days. The old 30-day free-post split is retired. */
  durationDays: 60,

  /** How long prepaid credits stay spendable. */
  creditPackValidDays: 365,

  /**
   * The packs on sale. Prices are round numbers near the market discount
   * curve rather than exact percentages of 349, because a pack priced at
   * $1,484.25 reads as arithmetic rather than as an offer.
   */
  creditPacks: [
    { id: 'pack3', credits: 3, priceCents: 94500, savingsPercent: 10 },
    { id: 'pack5', credits: 5, priceCents: 148500, savingsPercent: 15 },
    { id: 'pack10', credits: 10, priceCents: 279000, savingsPercent: 20 },
  ] as CreditPackOption[],

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

  /** Whole-percent discount the first post carries, for copy. */
  firstPostDiscountPercent: (): number =>
    Math.round((1 - config.firstPostPrice / config.postingPrice) * 100),

  /**
   * Whole-percent discount a renewal carries, for copy.
   *
   * Exists because the renewal modal hardcoded "Save 10%" next to an
   * interpolated price. The real figure is nearly three times that, and it
   * had already survived one repricing, which is what a literal always does.
   */
  renewalDiscountPercent: (): number =>
    Math.round((1 - config.renewalPrice / config.postingPrice) * 100),

  /** A pack by its id, or undefined. Never trust an id straight from a form. */
  creditPackById: (id: string): CreditPackOption | undefined =>
    config.creditPacks.find((p) => p.id === id),

  /** What one post inside a pack works out at, in whole dollars, for copy. */
  creditPackPerPostPrice: (pack: CreditPackOption): number =>
    Math.round(pack.priceCents / pack.credits / 100),

  /**
   * The best per-post saving any pack offers, for "save up to N%" copy.
   *
   * Derived by scanning, not by indexing the last entry: the array happens to
   * be ascending today and a copy line that silently depends on that ordering
   * is one reordered literal away from advertising the wrong number.
   */
  maxPackSavingsPercent: (): number =>
    config.creditPacks.reduce((best, p) => Math.max(best, p.savingsPercent), 0),

  /**
   * The smallest pack that genuinely beats paying post by post for a buyer
   * who still holds their discounted first post, or null if none does.
   *
   * This exists because the obvious copy is wrong. A pack beats the STANDARD
   * price at every size, which is what savingsPercent measures, but a buyer
   * whose entry discount is unspent is comparing against
   * firstPostPrice + (n-1) * postingPrice, and at the smallest size the pack
   * loses. Any surface that pitches a pack to someone who still has the
   * discount has to start here, not at creditPacks[0].
   */
  smallestPackWorthItBeforeFirstPost: (): CreditPackOption | null =>
    config.creditPacks
      .filter((p) => p.priceCents < (config.firstPostPrice + (p.credits - 1) * config.postingPrice) * 100)
      .sort((a, b) => a.credits - b.credits)[0] ?? null,

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
