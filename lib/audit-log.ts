import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * Audit Logger
 *
 * Persists sensitive actions to the `audit_logs` table for the SOC2
 * audit trail and GDPR Art. 30 record-of-processing.
 *
 * Failures are caught and logged but never thrown — auditing must not
 * break the action it is observing. The structured fallback log line
 * is the recovery path if the DB write fails.
 *
 * Wire this into:
 *   - account.delete / account.restore / account.purge
 *   - data.export
 *   - data.request.received / data.request.completed
 *   - role.change
 *   - cron.purge_soft_deleted / cron.purge_inactive
 */

export type ActorType = 'user' | 'admin' | 'system';

export interface AuditEntry {
    /** Dotted action name. Verb past-tense. e.g. "account.delete" */
    action: string;
    actorType: ActorType;
    /** UserProfile.id (preferred), Supabase auth id (fallback), or null when actorType='system' */
    actorId?: string | null;
    targetType?: 'user' | 'job' | 'application' | 'data_request' | 'company' | string | null;
    targetId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    /** Anything else — keep it small and free of PII */
    metadata?: Record<string, unknown> | null;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
    try {
        await prisma.auditLog.create({
            data: {
                action: entry.action,
                actorType: entry.actorType,
                actorId: entry.actorId ?? null,
                targetType: entry.targetType ?? null,
                targetId: entry.targetId ?? null,
                ip: entry.ip ?? null,
                userAgent: entry.userAgent ?? null,
                metadata: (entry.metadata ?? null) as never,
            },
        });
    } catch (err) {
        // Fall back to structured logging so the trail survives even if
        // the DB write fails. Operators can replay from logs.
        logger.error('[AUDIT] failed to persist audit log', err, entry as unknown as Record<string, unknown>);
    }
}

