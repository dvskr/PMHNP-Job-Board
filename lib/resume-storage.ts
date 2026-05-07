/**
 * Centralized resume storage access.
 *
 * Before this module existed, six endpoints minted their own signed URLs
 * for the `resumes` bucket. Each picked its own TTL (60s, 3600s, mixed),
 * each handled the legacy "URL stored in DB instead of bare path" case
 * differently (or not at all), and none audit-logged the read. This was
 * the highest-risk piece of the codebase: PII documents accessed by
 * three different audiences with three different authorization shapes,
 * fragmented across the file tree.
 *
 * Every read or write to a resume MUST go through this module. The
 * single chokepoint lets us:
 *   - Normalize the storage shape (bare path) regardless of what
 *     legacy data wrote into UserProfile.resumeUrl
 *   - Mint signed URLs with a single TTL knob (default 15 minutes —
 *     short enough to limit leak window, long enough for a long PDF
 *     read or a slow connection)
 *   - Emit a structured audit log on every read so we have evidence
 *     of who-viewed-what for SOC2 and "who viewed my resume" UX
 *   - Add downstream concerns (watermarking, DLP, content-addressed
 *     keys) in one place when we eventually need them
 *
 * Architecture reference: see the enterprise upgrade path documented
 * in chat — this is items 1–4 (storage shape, single mint, short
 * TTL, audit log). Item 5 (server-side proxy / streaming) is a
 * separate follow-up.
 */

import { createClient as createAdminClient } from '@supabase/supabase-js';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getPathFromUrl } from '@/lib/supabase-storage';

const RESUME_BUCKET = 'resumes';

/** Default TTL for resume signed URLs. 15 minutes is short enough to
 *  bound leak windows (browser history, screenshots, support tickets)
 *  while still surviving a slow PDF render or distracted reviewer. */
export const DEFAULT_RESUME_URL_TTL_SECONDS = 15 * 60;

/** Single audience taxonomy for audit log + future authZ branching. */
export type ResumeReadAudience =
    | 'owner'           // candidate viewing their own resume
    | 'employer'        // unlocked employer
    | 'admin'           // platform admin
    | 'system'          // background job (e.g. AI parse) — must include reason
    | 'export'          // candidate-initiated profile export
    | 'extension';      // chrome autofill extension

export interface ResumeReadContext {
    /** supabaseId / UserProfile.supabaseId of the requester. Use 'system'
     *  for background jobs, 'anonymous' if pre-auth (rare). */
    actorId: string;
    /** supabaseId of the candidate whose resume is being accessed. */
    ownerId: string;
    audience: ResumeReadAudience;
    /** Free-form action label — 'view', 'download', 'parse', 'export', etc. */
    action: string;
    /** Origin IP if available (req.headers.get('x-forwarded-for')). */
    ip?: string | null;
    /** User-Agent if available. */
    userAgent?: string | null;
    /** Optional context — short justification, request id, or job name. */
    reason?: string | null;
}

/**
 * Coerce the raw `UserProfile.resumeUrl` value to a bare storage path.
 *
 * Accepts:
 *   - bare path "prod/<uid>/<ts>-<file>.pdf"
 *   - "resumes/prod/<uid>/..." (with bucket prefix)
 *   - full signed URL "https://xxx.supabase.co/storage/v1/object/sign/resumes/...?token=..."
 *   - null / empty
 *
 * Returns null when the value is missing or unrecognizable.
 */
export function toBareResumePath(stored: string | null | undefined): string | null {
    if (!stored || typeof stored !== 'string') return null;
    if (stored.startsWith('http')) return getPathFromUrl(stored);
    return stored.replace(/^resumes\//, '');
}

/**
 * Mint a fresh signed URL for the resume. Audit-logs the access.
 *
 * Returns null when the path is unrecognizable, the storage object is
 * missing, or the signing call fails. Callers should treat null as a
 * 404 / 500 to the requester — never leak the underlying error.
 */
export async function mintResumeReadUrl(
    storedPath: string | null | undefined,
    ctx: ResumeReadContext,
    opts: { ttlSeconds?: number } = {},
): Promise<string | null> {
    const path = toBareResumePath(storedPath);
    if (!path) {
        logger.warn('mintResumeReadUrl: could not derive bare path', {
            ownerId: ctx.ownerId,
            audience: ctx.audience,
        });
        return null;
    }

    const ttl = opts.ttlSeconds ?? DEFAULT_RESUME_URL_TTL_SECONDS;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        logger.error('mintResumeReadUrl: storage credentials missing');
        return null;
    }

    try {
        const admin = createAdminClient(url, key);
        const { data, error } = await admin.storage
            .from(RESUME_BUCKET)
            .createSignedUrl(path, ttl);
        if (error || !data?.signedUrl) {
            logger.error('mintResumeReadUrl: signing failed', {
                error: error?.message ?? 'unknown',
                ownerId: ctx.ownerId,
                audience: ctx.audience,
            });
            return null;
        }

        // Fire-and-forget audit log. Uses a short timeout/catch so a
        // slow audit DB doesn't block the URL response — for SOC2
        // evidence we trade strict consistency for availability.
        logResumeAccess(ctx).catch((err) => {
            logger.warn('mintResumeReadUrl: audit log insert failed', err);
        });

        return data.signedUrl;
    } catch (err) {
        logger.error('mintResumeReadUrl: unexpected error', err);
        return null;
    }
}

/**
 * Download the raw resume bytes (server-side only — never expose this
 * to clients). Used by the AI parse worker. Audit-logged with audience
 * 'system' so we can trace AI accesses separately from human views.
 */
export async function downloadResumeBytes(
    storedPath: string | null | undefined,
    ctx: ResumeReadContext,
): Promise<{ buffer: Buffer; contentType: string } | null> {
    const path = toBareResumePath(storedPath);
    if (!path) return null;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;

    try {
        const admin = createAdminClient(url, key);
        const { data, error } = await admin.storage.from(RESUME_BUCKET).download(path);
        if (error || !data) return null;

        const arrayBuffer = await data.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        logResumeAccess(ctx).catch(() => { /* audit fire-and-forget */ });

        return {
            buffer,
            contentType: inferContentTypeFromPath(path),
        };
    } catch {
        return null;
    }
}

/**
 * Insert a structured audit-log row. Never throws — caller catches.
 *
 * The DocumentAccessLog table is the source of truth for "who viewed
 * my resume" UX, SOC2 evidence, and incident forensics. Schema
 * deliberately denormalized — we store the audience + action even
 * when implied by the role, so historical queries don't require
 * joining against a UserProfile table whose role may have changed.
 */
export async function logResumeAccess(ctx: ResumeReadContext): Promise<void> {
    try {
        await prisma.documentAccessLog.create({
            data: {
                docType: 'resume',
                actorId: ctx.actorId,
                ownerId: ctx.ownerId,
                audience: ctx.audience,
                action: ctx.action,
                ip: ctx.ip ?? null,
                userAgent: ctx.userAgent?.slice(0, 500) ?? null,
                reason: ctx.reason?.slice(0, 200) ?? null,
            },
        });
    } catch (err) {
        // Never block the read on a failed audit insert. Log + drop —
        // the structured logger output captures the gap so we can
        // backfill from request logs if needed.
        logger.warn('logResumeAccess: insert failed', undefined, err);
    }
}

function inferContentTypeFromPath(path: string): string {
    const lower = path.toLowerCase();
    if (lower.endsWith('.docx')) {
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    if (lower.endsWith('.doc')) {
        return 'application/msword';
    }
    return 'application/pdf';
}

/** Helper to extract IP/UA from a Next request without each caller
 *  reaching into headers. */
export function extractRequestContext(req: { headers: Headers }): { ip: string | null; userAgent: string | null } {
    const ip =
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        req.headers.get('x-real-ip') ||
        null;
    const userAgent = req.headers.get('user-agent');
    return { ip, userAgent };
}
