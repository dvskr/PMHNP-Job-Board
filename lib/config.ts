export const config = {
  // Feature flags
  isPaidPostingEnabled: process.env.ENABLE_PAID_POSTING === 'true',
  
  // Pricing (in dollars)
  pricing: {
    standard: 99,
    featured: 199,
    renewal: 99,
    upgrade: 100,  // Standard to Featured upgrade
  },
  
  // Pricing (in cents for Stripe)
  stripePricing: {
    standard: 9900,
    featured: 19900,
    renewal: 9900,
    upgrade: 10000,
  },
  
  // Job settings
  jobSettings: {
    durationDays: 30,
    featuredDurationDays: 30,
  },
  
  // Helper functions
  getPostingPrice: (tier: 'standard' | 'featured') => {
    if (!config.isPaidPostingEnabled) return 0
    return tier === 'featured' ? config.pricing.featured : config.pricing.standard
  },
  
  getRenewalPrice: () => {
    if (!config.isPaidPostingEnabled) return 0
    return config.pricing.renewal
  },
  
  getUpgradePrice: () => {
    if (!config.isPaidPostingEnabled) return 0
    return config.pricing.upgrade
  },
  
  // Display helpers
  formatPrice: (amount: number) => {
    if (amount === 0) return 'FREE'
    return `$${amount}`
  },
  
  getPricingLabel: (tier: 'standard' | 'featured') => {
    const price = config.getPostingPrice(tier)
    if (price === 0) return 'FREE during launch'
    return `$${price}`
  },
}

// Type export
export type Config = typeof config

