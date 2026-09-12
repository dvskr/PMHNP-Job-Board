/**
 * In-platform apply must accept the resume the candidate already uploaded, and
 * only that candidate's own documents.
 *
 * Found 2026-09-02 by the edge-to-edge hunt. /api/upload stores a BARE storage
 * path ("uploads/<uid>/<ts>-cv.pdf"). InPlatformApplyForm reads that value back
 * from /api/auth/profile and submits it. apply-direct validated it with
 * isOwnSupabaseStorageUrl, which calls `new URL()` and therefore throws on a
 * bare path, so every candidate with a stored resume was answered
 * "Invalid resume URL. Please upload your resume through the platform" about
 * the resume they had already uploaded. The same held for cover letters.
 *
 * The host check also never established ownership, so the value being written
 * onto the application (and later signed for the employer) could name any
 * object in the bucket.
 *
 * All fixtures are fictional.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isOwnDocPath } from '@/lib/document-storage';
import { isOwnSupabaseStorageUrl } from '@/lib/supabase/origins';

const ME = 'aaaaaaaa-1111-4222-8333-444444444444';
const VICTIM = 'bbbbbbbb-5555-4666-8777-888888888888';

/** Mirrors the validator inside app/api/applications/apply-direct/route.ts. */
function validateOwnDoc(value: string, docType: 'resume' | 'cover_letter', userId: string): boolean {
    const isAbsolute = /^[a-z][a-z0-9+.-]*:/i.test(value);
    if (isAbsolute && !isOwnSupabaseStorageUrl(value)) return false;
    return isOwnDocPath(value, docType, userId);
}

describe('apply-direct document validation', () => {
    it('accepts the bare storage path that /api/upload actually stores', () => {
        expect(validateOwnDoc(`uploads/${ME}/1788000000-cv.pdf`, 'resume', ME)).toBe(true);
    });

    it('accepts a bare cover-letter path', () => {
        expect(validateOwnDoc(`uploads/${ME}/1788000000-letter.pdf`, 'cover_letter', ME)).toBe(true);
    });

    it('still accepts an absolute URL on our own storage host', () => {
        const url = `https://project.supabase.co/storage/v1/object/sign/resumes/uploads/${ME}/cv.pdf?token=abc`;
        expect(validateOwnDoc(url, 'resume', ME)).toBe(true);
    });

    it.each([
        `uploads/${VICTIM}/1788000000-cv.pdf`,
        `https://project.supabase.co/storage/v1/object/sign/resumes/uploads/${VICTIM}/cv.pdf?token=abc`,
    ])('refuses another candidate\'s document %s', (value) => {
        expect(validateOwnDoc(value, 'resume', ME)).toBe(false);
    });

    it.each([
        `https://evil.example/uploads/${ME}/cv.pdf`,
        `http://project.supabase.co/storage/v1/object/sign/resumes/uploads/${ME}/cv.pdf`,
        `javascript:alert(1)`,
    ])('refuses off-host or unsafe reference %s', (value) => {
        expect(validateOwnDoc(value, 'resume', ME)).toBe(false);
    });
});

describe('app/api/applications/apply-direct/route.ts', () => {
    const src = fs.readFileSync(
        path.join(process.cwd(), 'app/api/applications/apply-direct/route.ts'),
        'utf8',
    );

    it('checks ownership, not just the host', () => {
        expect(src).toContain('isOwnDocPath');
    });

    it('no longer gates a stored path on isOwnSupabaseStorageUrl alone', () => {
        // The two bare `if (!isOwnSupabaseStorageUrl(x)) return 400` guards are gone.
        expect(src).not.toMatch(/if\s*\(!isOwnSupabaseStorageUrl\(resumeUrl\)\)/);
        expect(src).not.toMatch(/if\s*\(!isOwnSupabaseStorageUrl\(coverLetterUrl\)\)/);
    });
});
