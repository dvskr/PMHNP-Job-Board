/**
 * Sentry Error Monitoring — thin wrapper over @sentry/nextjs.
 *
 * The SDK is initialized per-runtime by sentry.server.config.ts /
 * sentry.edge.config.ts / instrumentation-client.ts (loaded via
 * instrumentation.ts). Those are no-ops without a DSN, so when Sentry is
 * unconfigured every function here degrades to local logging only.
 *
 * This module keeps a stable internal API so existing call sites
 * (captureException / captureMessage / setUser / addBreadcrumb / withSentry)
 * don't have to import @sentry/nextjs directly.
 */

import * as Sentry from '@sentry/nextjs';
import { logger } from '@/lib/logger';

interface ErrorContext {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
    user?: { id?: string; email?: string };
}

const isDev = process.env.NODE_ENV === 'development';
const sentryEnabled = !!(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);

/**
 * Kept for backwards-compatibility with existing call sites. Real
 * initialization now happens in the per-runtime sentry.*.config.ts files
 * loaded by instrumentation.ts, so this is a no-op.
 */
export function initSentry(): void {
    if (!sentryEnabled) {
        logger.info('Sentry DSN not configured, error monitoring disabled');
    }
}

export function captureException(error: Error | unknown, context?: ErrorContext): void {
    if (isDev) {
        logger.error('[Sentry] Exception captured', error, context as Record<string, unknown> | undefined);
    }
    if (sentryEnabled) {
        Sentry.captureException(error, {
            tags: context?.tags,
            extra: context?.extra,
            user: context?.user,
        });
    } else if (!isDev) {
        logger.error('[Error]', error);
    }
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
    if (isDev) {
        const logMethod = level === 'warning' ? 'warn' : level;
        logger[logMethod](`[Sentry] ${message}`);
    }
    if (sentryEnabled) {
        Sentry.captureMessage(message, level);
    }
}

export function setUser(user: { id?: string; email?: string } | null): void {
    if (sentryEnabled) {
        Sentry.setUser(user);
    }
    if (isDev && user) {
        logger.debug('[Sentry] User context set', { user });
    }
}

export function addBreadcrumb(breadcrumb: {
    category: string;
    message: string;
    level?: 'debug' | 'info' | 'warning' | 'error';
    data?: Record<string, unknown>;
}): void {
    if (sentryEnabled) {
        Sentry.addBreadcrumb(breadcrumb);
    }
    if (isDev) {
        logger.debug('[Sentry] Breadcrumb', breadcrumb as unknown as Record<string, unknown>);
    }
}

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
