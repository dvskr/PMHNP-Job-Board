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

    /** Legal entity. Used in privacy policy, sub-processors page. */
    legal: {
        entityName: 'PMHNP Hiring',
        founderName: 'Pavan Kumar Reddy Daggula',
        foundingYear: '2026',
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
        // From-addresses for outbound mail. Read by lib/email-service-v2.
        marketingFrom: 'PMHNP Hiring <alerts@pmhnphiring.com>',
        transactionalFrom: 'PMHNP Hiring <hello@pmhnphiring.com>',
        replyTo: 'hello@pmhnphiring.com',
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
