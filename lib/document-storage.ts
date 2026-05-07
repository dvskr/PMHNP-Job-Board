/**
 * Centralized PII document access — the single chokepoint for every
 * private bucket the app reads (resumes, message attachments, and any
 * future cover letters / transcripts / ID verification scans).
 *
 * Why one module instead of one-per-bucket:
 *   - One TTL knob for all PII URLs (default 15 minutes)
 *   - One audit-log write path so SOC2 evidence is uniform
 *   - One audience taxonomy (owner | counterparty | employer | admin
 *     | system | export | extension) used identically across surfaces
 *   - Future cross-cutting concerns — watermarking, DLP, edge-cache
 *     auth, content rewriting — plug in once and apply to all docs
 *
 * What's deliberately NOT in here:
 *   - Avatars (public bucket, no PII, no audit needed)
 *   - Job-posting attachments / company logos (also public)
 *   - Anything served from public buckets where signed URLs aren't
 *     the access mechanism
 *
 * Each consumer passes its `DocType` and the helper picks the bucket,
 * the URL extractor pattern, and the audit `docType` value. Callers
 * never touch Supabase storage directly.
 */

import { createClient as createAdminClient } from '@supabase/supabase-js';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getPathFromUrl } from '@/lib/supabase-storage';

/* ─────────────────────────── Doc-type registry ─────────────────────── */

export type DocType =
    | 'resume'
    | 'message_attachment'
    /** Reserved — not yet wired. */
    | 'cover_letter'
    | 'transcript';

interface DocTypeConfig {
    /** Supabase Storage bucket name. Always private (signed-URL access). */
    bucket: string;
    /** Default TTL when caller doesn't override. */
    defaultTtlSeconds: number;
}

const DOC_TYPE_CONFIG: Record<DocType, DocTypeConfig> = {
    resume:             { bucket: 'resumes',             defaultTtlSeconds: 15 * 60 },
    message_attachment: { bucket: 'message-attachments', defaultTtlSeconds: 15 * 60 },
    cover_letter:       { bucket: 'cover-letters',       defaultTtlSeconds: 15 * 60 },
    transcript:         { bucket: 'transcripts',         defaultTtlSeconds: 15 * 60 },
};

/* ─────────────────────────── Audience taxonomy ─────────────────────── */

export type DocReadAudience =
    | 'owner'           // person who uploaded the doc viewing their own
    | 'counterparty'    // the other party in a 1:1 context (message recipient)
    | 'employer'        // unlocked employer reading a candidate's doc
    | 'admin'           // platform admin
    | 'system'          // background job (AI parse, AV scan, etc.)
    | 'export'          // owner-initiated profile export
    | 'extension';      // chrome autofill extension

export interface DocReadContext {
    /** supabaseId of the requester. Use 'system' for background jobs. */
    actorId: string;
    /** supabaseId of the document owner — the candidate, message
     *  sender, etc. Used for "who viewed my doc" queries. */
    ownerId: string;
    audience: DocReadAudience;
    /** Free-form short label — 'view' | 'download' | 'parse' | 'export' */
    action: string;
    ip?: string | null;
    userAgent?: string | null;
    /** Optional context: request id, job name, justification. */
    reason?: string | null;
}

/* ─────────────────────────── Path normalization ─────────────────────── */

/**
 * Coerce a stored doc URL/path to a bare storage path that
 * Supabase's `.download()` / `.createSignedUrl()` accept.
 *
 * Accepts:
 *   - bare path "prefix/<uid>/<ts>-<file>.pdf"
 *   - "<bucket>/prefix/<uid>/..." (with bucket prefix)
 *   - full signed URL "https://xxx.supabase.co/storage/v1/object/sign/<bucket>/...?token=..."
 *   - null/empty
 */
export function toBareDocPath(stored: string | null | undefined, docType: DocType): string | null {
    if (!stored || typeof stored !== 'string') return null;
    if (stored.startsWith('http')) return getPathFromUrl(stored);
    const bucket = DOC_TYPE_CONFIG[docType].bucket;
    return stored.replace(new RegExp(`^${bucket}/`), '');
}

/* ─────────────────────────── Public API ─────────────────────────── */

/**
 * Mint a fresh signed URL for a private doc and audit-log the access.
 * Returns null on any failure (missing path, signing error, missing
 * credentials). Callers should treat null as a 404/500 — never leak
 * the underlying error.
 */
export async function mintDocReadUrl(
    storedPath: string | null | undefined,
    docType: DocType,
    ctx: DocReadContext,
    opts: { ttlSeconds?: number } = {},
): Promise<string | null> {
    const path = toBareDocPath(storedPath, docType);
    if (!path) {
        logger.warn('mintDocReadUrl: could not derive bare path', {
            docType,
            ownerId: ctx.ownerId,
            audience: ctx.audience,
        });
        return null;
    }

    const cfg = DOC_TYPE_CONFIG[docType];
    const ttl = opts.ttlSeconds ?? cfg.defaultTtlSeconds;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        logger.error('mintDocReadUrl: storage credentials missing');
        return null;
    }

    try {
        const admin = createAdminClient(url, key);
        const { data, error } = await admin.storage
            .from(cfg.bucket)
            .createSignedUrl(path, ttl);
        if (error || !data?.signedUrl) {
            logger.error('mintDocReadUrl: signing failed', {
                docType,
                error: error?.message ?? 'unknown',
                ownerId: ctx.ownerId,
                audience: ctx.audience,
            });
            return null;
        }

        logDocAccess(docType, ctx).catch((err) => {
            logger.warn('mintDocReadUrl: audit log insert failed', undefined, err);
        });

        return data.signedUrl;
    } catch (err) {
        logger.error('mintDocReadUrl: unexpected error', err);
        return null;
    }
}

/**
 * Download raw bytes server-side. Used by background processors
 * (AI parse, AV scan). Audit-logged with audience='system' so we
 * can trace machine accesses separately from human views.
 */
export async function downloadDocBytes(
    storedPath: string | null | undefined,
    docType: DocType,
    ctx: DocReadContext,
): Promise<{ buffer: Buffer; contentType: string } | null> {
    const path = toBareDocPath(storedPath, docType);
    if (!path) return null;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;

    try {
        const cfg = DOC_TYPE_CONFIG[docType];
        const admin = createAdminClient(url, key);
        const { data, error } = await admin.storage.from(cfg.bucket).download(path);
        if (error || !data) return null;

        const arrayBuffer = await data.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        logDocAccess(docType, ctx).catch(() => { /* fire-and-forget */ });

        return {
            buffer,
            contentType: inferContentTypeFromPath(path),
        };
    } catch {
        return null;
    }
}

/* ─────────────────────────── Audit log ─────────────────────────── */

/**
 * Insert a structured audit-log row. Never throws — caller catches.
 *
 * The DocumentAccessLog table is the single source of truth for
 * "who viewed my X" UX, SOC2 evidence, and incident forensics.
 * Schema is denormalized — we store audience + action even when
 * implied by role, so historical queries don't require joining
 * against a UserProfile.role that may have changed.
 */
export async function logDocAccess(docType: DocType, ctx: DocReadContext): Promise<void> {
    try {
        await prisma.documentAccessLog.create({
            data: {
                docType,
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
        // Never block the read on a failed audit insert. Log + drop.
        logger.warn('logDocAccess: insert failed', undefined, err);
    }
}

/* ─────────────────────────── Helpers ─────────────────────────── */

function inferContentTypeFromPath(path: string): string {
    const lower = path.toLowerCase();
    if (lower.endsWith('.docx')) {
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    if (lower.endsWith('.doc')) return 'application/msword';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.webp')) return 'image/webp';
    return 'application/pdf';
}

/** Extract IP/UA from a Next/Web request without callers reaching into headers. */
export function extractRequestContext(req: { headers: Headers }): { ip: string | null; userAgent: string | null } {
    const ip =
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        req.headers.get('x-real-ip') ||
        null;
    const userAgent = req.headers.get('user-agent');
    return { ip, userAgent };
}
