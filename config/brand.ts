/**
 * Brand configuration — single source of truth for everything a fork
 * of this codebase needs to swap to be a different niche job board.
 *
 * Forking checklist:
 *   1. Edit the values below.
 *   2. Update DNS / Vercel project domain.
 *   3. Reissue DPIA from `docs/dpia.md` (replace brand placeholders).
 *   4. Confirm sub-processor list at `app/sub-processors/page.tsx`
 *      (vendors may differ if you switch payment / email providers).
 *   5. Rewrite marketing copy: home, about, FAQ, blog.
 *   6. Run `prisma migrate deploy` against the new database.
 *
 * What is NOT in this file (intentionally):
 *   - Niche-specific job filters and category routes — those are part
 *     of the product, not branding.
 *   - Marketing copy on the home page, About, FAQ — too varied to
 *     parameterize. Rewrite per fork.
 *   - Schema field names — they're internal and don't change.
 */

export const brand = {
    /** Display name used in copy, OG titles, email subjects. */
    name: 'PMHNP Hiring',

    /** Niche descriptor used in long-form prose, schema descriptions. */
    niche: {
        short: 'PMHNP',
        long: 'Psychiatric Mental Health Nurse Practitioner',
        descriptor: 'psychiatric mental health nurse practitioner',
        category: 'mental health',
    },

    /** Domain + canonical base URL. */
    domain: 'pmhnphiring.com',
    baseUrl: 'https://pmhnphiring.com',

    /**
     * Legal entity that operates the brand.
     * - `entityName` is the registered legal name (used in ToS, privacy policy,
     *   data-controller references, indemnification, governing law clauses).
     * - `brandDisplayName` is the customer-facing trade name (used on receipts,
     *   hosted Stripe Checkout, customer support contexts).
     * - `address`, `addressLine`, `addressCity`, etc. drive CAN-SPAM email
     *   footers and the legal mailing address printed on invoices and contracts.
     */
    legal: {
        entityName: 'Akari Labs LLC',
        brandDisplayName: 'PMHNP Hiring',
        founderName: 'Pavan Kumar Reddy Daggula',
        foundingYear: '2026',
        jurisdiction: 'Wyoming, United States',
        address: '30 North Gould Street, Sheridan, WY 82801, United States',
        addressLine: '30 North Gould Street',
        addressCity: 'Sheridan',
        addressRegion: 'WY',
        addressPostalCode: '82801',
        addressCountry: 'US',
    },

    /**
     * Inboxes. We use distinct addresses so an angry-email tornado doesn't
     * drown out a real privacy or security report.
     */
    email: {
        privacy: 'privacy@pmhnphiring.com',
        security: 'security@pmhnphiring.com',
        support: 'support@pmhnphiring.com',
        contact: 'contact@pmhnphiring.com',
        // From-addresses for outbound mail. Read by lib/email-service.ts and
        // lib/job-alerts-service.ts. Env vars EMAIL_FROM, EMAIL_FROM_MARKETING,
        // and EMAIL_REPLY_TO override these at runtime when set.
        marketingFrom: 'PMHNP Hiring <alerts@pmhnphiring.com>',
        transactionalFrom: 'PMHNP Hiring <noreply@pmhnphiring.com>',
        replyTo: 'support@pmhnphiring.com',
    },

    /** Public social handles — used in footer + Organization schema. */
    social: {
        x: 'https://x.com/pmhnphiring',
        facebook: 'https://www.facebook.com/pmhnphiring',
        instagram: 'https://www.instagram.com/pmhnphiring',
        linkedin: 'https://www.linkedin.com/company/pmhnpjobs',
        youtube: 'https://www.youtube.com/@pmhnphiring',
    },
} as const;

export type Brand = typeof brand;
