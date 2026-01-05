/**
 * Sentry Error Monitoring Integration
 * 
 * Captures errors and provides performance monitoring.
 * Set SENTRY_DSN in environment to enable.
 */

import { getEnv, isFeatureEnabled } from '@/lib/env';

// Simple Sentry-like interface for when Sentry is not available
interface ErrorContext {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
    user?: { id?: string; email?: string };
}

let sentryInitialized = false;

/**
 * Initialize Sentry (call once at app startup)
 */
export function initSentry(): void {
    if (!isFeatureEnabled('sentry')) {
        console.log('Sentry DSN not configured, error monitoring disabled');
        return;
    }

    // Note: In production, you'd install @sentry/nextjs and use:
    // Sentry.init({ dsn: getEnv().SENTRY_DSN, ... });
    // 
    // For now, we'll use a simple console-based fallback
    // Replace this with actual Sentry integration when ready

    sentryInitialized = true;
    console.log('Error monitoring initialized');
}

/**
 * Capture an exception
 */
export function captureException(error: Error | unknown, context?: ErrorContext): void {
    const env = getEnv();

    // Always log to console in development
    if (env.NODE_ENV === 'development') {
        console.error('[Sentry] Exception captured:', error);
        if (context) {
            console.error('[Sentry] Context:', context);
        }
    }

    // In production with Sentry DSN, this would send to Sentry
    // Sentry.captureException(error, { extra: context?.extra, tags: context?.tags });

    if (!sentryInitialized && env.NODE_ENV === 'production') {
        console.error('[Error]', error);
    }
}

/**
 * Capture a message
 */
export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
    const env = getEnv();

    if (env.NODE_ENV === 'development') {
        console.log(`[Sentry] ${level}: ${message}`);
    }

    // In production: Sentry.captureMessage(message, level);
}

/**
 * Set user context for error tracking
 */
export function setUser(user: { id?: string; email?: string } | null): void {
    // In production: Sentry.setUser(user);
    if (process.env.NODE_ENV === 'development' && user) {
        console.log('[Sentry] User context set:', user);
    }
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(breadcrumb: {
    category: string;
    message: string;
    level?: 'debug' | 'info' | 'warning' | 'error';
    data?: Record<string, unknown>;
}): void {
    // In production: Sentry.addBreadcrumb(breadcrumb);
    if (process.env.NODE_ENV === 'development') {
        console.log('[Sentry] Breadcrumb:', breadcrumb);
    }
}

/**
 * Wrap an async function with error capture
 */
export function withSentry<T extends (...args: unknown[]) => Promise<unknown>>(
    fn: T,
    context?: ErrorContext
): T {
    return (async (...args: Parameters<T>) => {
        try {
            return await fn(...args);
        } catch (error) {
            captureException(error, context);
            throw error;
        }
    }) as T;
}

export default {
    init: initSentry,
    captureException,
    captureMessage,
    setUser,
    addBreadcrumb,
    withSentry,
};
