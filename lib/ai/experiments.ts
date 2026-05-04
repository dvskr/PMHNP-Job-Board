/**
 * Phase 1 Sprint 1.1.6 — A/B experiment assignment + event tracking.
 *
 * Two pieces:
 *
 *   1. `getExperimentArm(...)` — sticky per-tenant arm picker. First call
 *      writes to `experiment_assignment`; subsequent calls read from it.
 *      The arm choice is deterministic per (experiment, tenantId) so that
 *      even if the DB write loses to a race, both racers pick the SAME arm.
 *
 *   2. `trackExperimentEvent(...)` — append-only event log for arm-level
 *      CTR / apply-rate / impressions / etc. Best-effort writes; never
 *      blocks the request path.
 *
 * Routing is a deterministic murmur-style hash so the rollout percentage is
 * stable. Once a tenant is in an arm, they stay there for the lifetime of
 * the experiment row — even if the rollout config changes — because the
 * helper checks the table first before re-hashing.
 *
 * Anonymous (signed-out) callers should use `tenantType: 'system'` with a
 * stable hashed-cookie id; the route is responsible for setting the cookie.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export interface ExperimentConfig {
    /** Stable identifier — bake the version into the name so rollout config
     *  changes don't accidentally re-bucket existing tenants. */
    experiment: string;
    /** Ordered arm names. The first arm is the control; rollout % is the
     *  share of tenants routed to ANY non-control arm. */
    arms: ReadonlyArray<string>;
    /** 0..100 — share of tenants assigned to a non-control arm. */
    rolloutPercent: number;
}

export interface ExperimentTenant {
    type: 'employer' | 'candidate' | 'admin' | 'system';
    id: string;
}

export type ExperimentEventType = 'impression' | 'click' | 'apply' | string;

/**
 * FNV-1a 32-bit hash. Cheap, deterministic, evenly distributed enough for
 * percentage-based bucketing. Not cryptographic — we don't need it to be.
 */
function fnv1a(str: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = (h * 0x01000193) >>> 0;
    }
    return h >>> 0;
}

function pickArm(config: ExperimentConfig, tenantKey: string): string {
    const arms = config.arms;
    if (arms.length === 0) return 'control';
    const control = arms[0];
    if (arms.length === 1) return control;
    if (config.rolloutPercent <= 0) return control;
    if (config.rolloutPercent >= 100 && arms.length === 2) return arms[1];

    // Two-stage hash: first decide IF this tenant is in the rollout,
    // then which non-control arm if there are several. Salt with the
    // experiment name so the same tenant can be in arm A for one
    // experiment and arm B for another.
    const rolloutBucket = fnv1a(`${config.experiment}|rollout|${tenantKey}`) % 100;
    if (rolloutBucket >= config.rolloutPercent) return control;

    const nonControl = arms.slice(1);
    const armIdx = fnv1a(`${config.experiment}|arm|${tenantKey}`) % nonControl.length;
    return nonControl[armIdx];
}

/**
 * Read-or-assign the tenant's arm for `config.experiment`. Sticky — once
 * a row exists, that arm wins regardless of subsequent rollout changes.
 *
 * Failure mode: if the DB read throws, falls back to the deterministic
 * hash. This means the experiment still works in the rare provider-outage
 * window, but drift between hashed and stored arms can happen if the
 * outage straddles a config change. Preferable to blocking the request.
 */
export async function getExperimentArm(
    config: ExperimentConfig,
    tenant: ExperimentTenant,
): Promise<string> {
    const tenantKey = `${tenant.type}:${tenant.id}`;
    try {
        const existing = await prisma.experimentAssignment.findUnique({
            where: {
                experiment_assignment_unique_target: {
                    experiment: config.experiment,
                    tenantType: tenant.type,
                    tenantId: tenant.id,
                },
            },
            select: { arm: true },
        });
        if (existing) return existing.arm;
    } catch (err) {
        logger.warn('experiment assignment read failed — falling back to hash', undefined, err);
        return pickArm(config, tenantKey);
    }

    const arm = pickArm(config, tenantKey);

    // Best-effort write. If a race inserted the same triple first, we
    // ignore the conflict — the racer's arm matches ours (same hash).
    try {
        await prisma.experimentAssignment.upsert({
            where: {
                experiment_assignment_unique_target: {
                    experiment: config.experiment,
                    tenantType: tenant.type,
                    tenantId: tenant.id,
                },
            },
            create: {
                experiment: config.experiment,
                tenantType: tenant.type,
                tenantId: tenant.id,
                arm,
            },
            update: {},
        });
    } catch (err) {
        logger.warn('experiment assignment write failed — proceeding with hashed arm', undefined, err);
    }

    return arm;
}

/**
 * Append-only event log. Fire-and-forget — never throws into the caller.
 * Use for impression / click / apply tracking that downstream BI joins
 * back to assignment rows for arm-level conversion math.
 */
export async function trackExperimentEvent(args: {
    experiment: string;
    arm: string;
    tenant: ExperimentTenant;
    eventType: ExperimentEventType;
    subjectId?: string;
    metadata?: Record<string, unknown>;
}): Promise<void> {
    try {
        await prisma.experimentEvent.create({
            data: {
                experiment: args.experiment,
                arm: args.arm,
                tenantType: args.tenant.type,
                tenantId: args.tenant.id,
                eventType: args.eventType,
                subjectId: args.subjectId ?? null,
                metadata: args.metadata ? (args.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
            },
        });
    } catch (err) {
        logger.warn('experiment event write failed — silently dropping', undefined, err);
    }
}

// Exported for unit tests so the deterministic-hash math can be locked in.
export const _internals = { fnv1a, pickArm };
