import { logger } from '@/lib/logger';

/**
 * Audit Logger
 * 
 * Logs sensitive admin actions for GDPR/compliance. Uses the existing
 * structured logger with an [AUDIT] prefix for easy filtering.
 */
export function logAudit(
    action: string,
    adminEmail: string,
    details?: Record<string, unknown>
): void {
    logger.info(`[AUDIT] ${action}`, {
        action,
        adminEmail,
        timestamp: new Date().toISOString(),
        ...details,
    });
}
