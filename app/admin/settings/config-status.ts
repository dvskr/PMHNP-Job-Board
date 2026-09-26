/**
 * What /admin/settings reports, and how it decides.
 *
 * The page used to be a static client component: every "Active" / "Enabled"
 * pill was a literal, so it read green whether or not the integration behind
 * it was configured, and two of the env names it displayed
 * (FB_PAGE_ACCESS_TOKEN, IG_USER_ID) were not read anywhere in the codebase.
 * A settings screen that cannot be wrong is not telling you anything.
 *
 * Each row names the env vars its feature actually reads. Status is derived
 * from those and nothing else, so a row can only claim "Configured" when the
 * keys the runtime looks for are present.
 */

export interface IntegrationRow {
    label: string;
    /** What the feature does, and what happens when its keys are absent. */
    description: string;
    /** Env vars the runtime reads. All must be set for the row to be configured. */
    envKeys: readonly string[];
    /** Where those keys are read, so the claim can be checked against code. */
    readBy: string;
}

export interface IntegrationSection {
    title: string;
    rows: readonly IntegrationRow[];
}

export const INTEGRATION_SECTIONS: readonly IntegrationSection[] = [
    {
        title: 'Job ingestion',
        rows: [
            {
                label: 'Adzuna feed',
                description: 'Credentialed aggregator feed. Without both keys the Adzuna source fetches nothing.',
                envKeys: ['ADZUNA_APP_ID', 'ADZUNA_APP_KEY'],
                readBy: 'lib/aggregators/adzuna.ts',
            },
            {
                label: 'USAJobs feed',
                description: 'Federal listings. USAJobs rejects requests without a key and a contact user agent.',
                envKeys: ['USAJOBS_API_KEY', 'USAJOBS_USER_AGENT'],
                readBy: 'lib/aggregators/usajobs.ts',
            },
            {
                label: 'Cron authentication',
                description: 'Shared secret every scheduled ingestion run presents. Missing means the crons cannot authenticate.',
                envKeys: ['CRON_SECRET'],
                readBy: 'lib/auth/verify-cron-or-admin.ts',
            },
        ],
    },
    {
        title: 'Social posting',
        rows: [
            {
                label: 'Postiz account',
                description: 'The scheduling API both social crons post through.',
                envKeys: ['POSTIZ_API_KEY'],
                readBy: 'lib/postiz-client.ts',
            },
            {
                label: 'Facebook page',
                description: 'Postiz integration id for the page. Unset means the social cron skips Facebook.',
                envKeys: ['POSTIZ_FB_INTEGRATION_ID'],
                readBy: 'lib/social-post-generator.ts',
            },
            {
                label: 'Instagram account',
                description: 'Postiz integration id for the carousel post. Unset means the cron skips Instagram.',
                envKeys: ['POSTIZ_INSTAGRAM_INTEGRATION_ID'],
                readBy: 'lib/social-post-generator.ts',
            },
        ],
    },
    {
        title: 'Email and notifications',
        rows: [
            {
                label: 'Transactional email',
                description: 'Every alert, digest and lifecycle email sends through Resend.',
                envKeys: ['RESEND_API_KEY'],
                readBy: 'lib/env.ts',
            },
            {
                label: 'Delivery webhooks',
                description: 'Signing secret for bounce and complaint events. Without it suppression flags never flip.',
                envKeys: ['RESEND_WEBHOOK_SECRET'],
                readBy: 'app/api/webhooks/resend/route.ts',
            },
        ],
    },
    {
        title: 'Search indexing',
        rows: [
            {
                label: 'IndexNow',
                description: 'Submits new and changed URLs to Bing and Yandex.',
                envKeys: ['INDEXNOW_API_KEY'],
                readBy: 'lib/search-indexing.ts',
            },
            {
                label: 'Bing Webmaster API',
                description: 'Per site URL submission plus coverage visibility.',
                envKeys: ['BING_WEBMASTER_API_KEY'],
                readBy: 'lib/search-indexing.ts',
            },
            {
                label: 'Google Indexing API',
                description: 'Service account credentials for job posting submissions.',
                envKeys: ['GOOGLE_INDEXING_CREDENTIALS'],
                readBy: 'lib/search-indexing.ts',
            },
        ],
    },
    {
        title: 'AI and content',
        rows: [
            {
                label: 'OpenAI',
                description: 'Backs every AI feature: summaries, embeddings, the resume studio.',
                envKeys: ['OPENAI_API_KEY'],
                readBy: 'lib/ai/providers/openai.ts',
            },
            {
                label: 'Blog and featured-jobs API key',
                description: 'Bearer token the external content pipeline uses to write posts.',
                envKeys: ['BLOG_API_KEY'],
                readBy: 'app/api/blog/route.ts',
            },
        ],
    },
    {
        title: 'Platform',
        rows: [
            {
                label: 'Supabase auth',
                description: 'Sign in, sessions, and the service role used by server-side writes.',
                envKeys: [
                    'NEXT_PUBLIC_SUPABASE_URL',
                    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
                    'SUPABASE_SERVICE_ROLE_KEY',
                ],
                readBy: 'lib/supabase',
            },
            {
                label: 'Redis rate limiting',
                description: 'Shared rate-limit counters. Unset falls back to per-instance in-memory counts, which do not hold across serverless instances.',
                envKeys: ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
                readBy: 'lib/rate-limit.ts',
            },
            {
                label: 'Stripe',
                description: 'Paid job posting checkout and its webhook.',
                envKeys: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
                readBy: 'app/api/webhooks/stripe/route.ts',
            },
        ],
    },
];

export interface IntegrationStatus {
    configured: boolean;
    /** Keys the row needs that are absent or blank. */
    missing: string[];
}

/**
 * Whether every env var a row depends on is present and non-blank.
 *
 * Blank counts as missing: an empty string in a deploy's env panel is the
 * usual way a key gets "set" without being set, and every consumer treats it
 * as absent.
 */
export function readIntegrationStatus(
    row: IntegrationRow,
    env: Record<string, string | undefined>,
): IntegrationStatus {
    const missing = row.envKeys.filter((key) => (env[key] ?? '').trim() === '');
    return { configured: missing.length === 0, missing };
}
