/**
 * Environment Variable Validation
 * 
 * Validates all required environment variables at startup.
 * Provides type-safe access to environment variables.
 */

import { z } from 'zod';

const envSchema = z.object({
    // Database (required)
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    // Supabase (required for auth)
    NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL must be a valid URL'),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required'),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

    // App URL (required)
    NEXT_PUBLIC_APP_URL: z.string().url().optional().default('http://localhost:3000'),
    NEXT_PUBLIC_BASE_URL: z.string().url().optional(),

    // Email (required for production)
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional().default('PMHNP Hiring <noreply@pmhnphiring.com>'),

    // Stripe (optional - for paid posting)
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),

    // Feature flags
    ENABLE_PAID_POSTING: z.string().optional().default('false'),

    // Cron security
    CRON_SECRET: z.string().optional(),

    // Job aggregator APIs (all optional)
    ADZUNA_APP_ID: z.string().optional(),
    ADZUNA_APP_KEY: z.string().optional(),
    JOOBLE_API_KEY: z.string().optional(),
    USAJOBS_API_KEY: z.string().optional(),

    // Monitoring (optional)
    SENTRY_DSN: z.string().optional(),

    // Logging
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
    NODE_ENV: z.enum(['development', 'production', 'test']),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

/**
 * Validates and returns typed environment variables.
 * Caches the result after first call.
 * Throws on validation failure in production.
 */
export function getEnv(): Env {
    if (cachedEnv) {
        return cachedEnv;
    }

    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        const errors = result.error.issues
            .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
            .join('\n');

        const message = `❌ Invalid environment variables:\n${errors}`;

        // In production, throw immediately
        if (process.env.NODE_ENV === 'production') {
            throw new Error(message);
        }

        // In development, warn but continue with defaults
        console.warn(message);
        console.warn('⚠️  Continuing with defaults for missing optional variables...\n');

        // Parse again with defaults applied using safeParse to prevent crashing
        const fallbackResult = envSchema.safeParse({
            ...process.env,
            NODE_ENV: process.env.NODE_ENV || 'development',
            // Default required keys to prevent throwing if missed in dev (though they should be there)
            DATABASE_URL: process.env.DATABASE_URL || 'postgresql://dev:dev@localhost:5432/dev',
            NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co',
            NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'demo-key',
        });

        if (fallbackResult.success) {
            cachedEnv = fallbackResult.data;
            return cachedEnv;
        }

        // If even fallback fails, throw a clear error
        throw new Error(`Failed to initialize environment: ${fallbackResult.error.message}`);
        return cachedEnv;
    }

    cachedEnv = result.data;
    return cachedEnv;
}

/**
 * Check if a specific feature is enabled
 */
export function isFeatureEnabled(feature: 'paidPosting' | 'sentry'): boolean {
    const env = getEnv();
    switch (feature) {
        case 'paidPosting':
            return env.ENABLE_PAID_POSTING === 'true';
        case 'sentry':
            return !!env.SENTRY_DSN;
        default:
            return false;
    }
}

/**
 * Get the base URL for the app
 */
export function getBaseUrl(): string {
    const env = getEnv();
    return env.NEXT_PUBLIC_BASE_URL || env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

// Validate on import in production
if (typeof window === 'undefined' && process.env.NODE_ENV === 'production') {
    getEnv();
}
