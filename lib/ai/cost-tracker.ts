/**
 * Persists every gateway call to ai_call_log for cost + latency dashboards.
 *
 * Writes are best-effort and never block or fail the caller — observability
 * must not break production traffic. If the DB is down we log and move on.
 */

import { prisma } from '../prisma';
import { logger } from '../logger';
import type { AiProvider, AiTenant, AiUsage } from './types';

export interface CallLogEntry {
    /**
     * Task identifier. Usually a registered AiTaskId, but accepts arbitrary
     * strings (e.g. 'embedding') so primitives outside the task registry
     * can still record cost.
     */
    task: string;
    provider: AiProvider;
    model: string;
    promptId?: string;
    promptVersion?: string;
    tenant: AiTenant;
    usage: AiUsage;
    latencyMs: number;
    cacheHit: boolean;
    fallbackUsed: boolean;
    error?: string;
}

export async function recordAiCall(entry: CallLogEntry): Promise<void> {
    try {
        await prisma.aiCallLog.create({
            data: {
                task: entry.task,
                provider: entry.provider,
                model: entry.model,
                promptId: entry.promptId ?? null,
                promptVersion: entry.promptVersion ?? null,
                tenantId: entry.tenant.id,
                tenantType: entry.tenant.type,
                inputTokens: entry.usage.inputTokens,
                cachedTokens: entry.usage.cachedTokens,
                outputTokens: entry.usage.outputTokens,
                costUsd: entry.usage.costUsd,
                latencyMs: entry.latencyMs,
                cacheHit: entry.cacheHit,
                fallbackUsed: entry.fallbackUsed,
                error: entry.error ?? null,
            },
        });
    } catch (err) {
        // Don't let observability break the caller.
        logger.warn('Failed to record AI call log entry', { task: entry.task, model: entry.model }, err);
    }
}
