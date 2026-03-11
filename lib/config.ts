export type PricingTier = 'starter' | 'growth' | 'premium';

export const config = {
  // Feature flags
  isPaidPostingEnabled: process.env.ENABLE_PAID_POSTING === 'true',

  // Pricing (in dollars)
  pricing: {
    starter: 199,
    growth: 299,
    premium: 399,
    upgradeStarterToGrowth: 100,
    upgradeGrowthToPremium: 100,
    upgradeStarterToPremium: 200,
  },

  // Renewal pricing (20% discount)
  renewalPricing: {
    starter: 159,
    growth: 239,
    premium: 319,
  },

  // Pricing (in cents for Stripe)
  stripePricing: {
    starter: 19900,
    growth: 29900,
    premium: 39900,
    upgradeStarterToGrowth: 10000,
    upgradeGrowthToPremium: 10000,
    upgradeStarterToPremium: 20000,
  },

  // Renewal pricing (in cents for Stripe)
  stripeRenewalPricing: {
    starter: 15900,
    growth: 23900,
    premium: 31900,
  },

  // Job settings
  jobSettings: {
    starterDurationDays: 30,
    growthDurationDays: 60,
    premiumDurationDays: 90,
  },

  // Helper functions
  getPostingPrice: (tier: PricingTier) => {
    if (!config.isPaidPostingEnabled) return 0
    return config.pricing[tier]
  },

  getRenewalPrice: (tier: PricingTier) => {
    if (!config.isPaidPostingEnabled) return 0
    return config.renewalPricing[tier]
  },

  getStripePriceInCents: (tier: PricingTier) => {
    return config.stripePricing[tier]
  },

  getStripeRenewalPriceInCents: (tier: PricingTier) => {
    return config.stripeRenewalPricing[tier]
  },

  getUpgradePrice: (from: PricingTier, to: PricingTier) => {
    if (!config.isPaidPostingEnabled) return 0
    return config.pricing[to] - config.pricing[from]
  },

  getDurationDays: (tier: PricingTier) => {
    switch (tier) {
      case 'premium': return config.jobSettings.premiumDurationDays
      case 'growth': return config.jobSettings.growthDurationDays
      default: return config.jobSettings.starterDurationDays
    }
  },

  getTierLabel: (tier: PricingTier) => {
    switch (tier) {
      case 'premium': return 'Premium'
      case 'growth': return 'Growth'
      default: return 'Starter'
    }
  },

  // Display helpers
  formatPrice: (amount: number) => {
    if (amount === 0) return 'FREE'
    return `$${amount}`
  },

  getPricingLabel: (tier: PricingTier) => {
    const price = config.getPostingPrice(tier)
    if (price === 0) return 'Free'
    return `$${price}`
  },

  // Check if a tier is "featured" (Growth and Premium both get featured treatment)
  isFeaturedTier: (tier: PricingTier) => {
    return tier === 'growth' || tier === 'premium'
  },

  // Tier limits for feature gating (per job posting lifecycle)
  tierLimits: {
    starter: { candidateUnlocksPerPosting: 5, inmailsPerPosting: 5 },
    growth: { candidateUnlocksPerPosting: 25, inmailsPerPosting: 25 },
    premium: { candidateUnlocksPerPosting: Infinity, inmailsPerPosting: Infinity },
  },

  getTierLimits: (tier: PricingTier) => {
    return config.tierLimits[tier] || config.tierLimits.starter
  },
}

// Type export
export type Config = typeof config
