/**
 * Resume-specific helpers — thin wrappers over lib/document-storage.ts
 * that pin the docType to 'resume'. Lets the existing import sites
 * keep working while the underlying module handles every PII doc type.
 *
 * New code should import directly from `lib/document-storage.ts`
 * and pick the docType explicitly. This module exists for ergonomic
 * call sites that ONLY ever deal with resumes (e.g. /api/resume/parse).
 */

import {
    mintDocReadUrl,
    downloadDocBytes,
    toBareDocPath,
    logDocAccess,
    extractRequestContext,
    type DocReadContext,
    type DocReadAudience,
} from '@/lib/document-storage';

/** Default TTL for resume signed URLs — 15 minutes. */
export const DEFAULT_RESUME_URL_TTL_SECONDS = 15 * 60;

export type ResumeReadAudience = DocReadAudience;
export type ResumeReadContext = DocReadContext;

export function toBareResumePath(stored: string | null | undefined): string | null {
    return toBareDocPath(stored, 'resume');
}

export async function mintResumeReadUrl(
    storedPath: string | null | undefined,
    ctx: ResumeReadContext,
    opts: { ttlSeconds?: number } = {},
): Promise<string | null> {
    return mintDocReadUrl(storedPath, 'resume', ctx, opts);
}

export async function downloadResumeBytes(
    storedPath: string | null | undefined,
    ctx: ResumeReadContext,
): Promise<{ buffer: Buffer; contentType: string } | null> {
    return downloadDocBytes(storedPath, 'resume', ctx);
}

export async function logResumeAccess(ctx: ResumeReadContext): Promise<void> {
    return logDocAccess('resume', ctx);
}

export { extractRequestContext };
