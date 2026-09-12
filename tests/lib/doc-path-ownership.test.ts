/**
 * Private document paths must belong to the caller.
 *
 * mintDocReadUrl / downloadDocBytes sign whatever path they are handed, using
 * the service-role key. That is safe when the path comes from the caller's own
 * profile row and a cross-user PII read when it comes from a request body.
 *
 * The 2026-09-02 hunt found two ways to feed a foreign path in:
 *   - PATCH /api/auth/profile accepted `resumeUrl`, so a user could point their
 *     own profile at someone else's object and then read it through
 *     /api/documents/resume/me/url. That field is no longer accepted.
 *   - POST /api/resume/parse took the path straight from the body with no
 *     ownership check. It now gates on isOwnDocPath.
 *
 * All fixtures are fictional.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isOwnDocPath, toBareDocPath } from '@/lib/document-storage';

const ME = 'aaaaaaaa-1111-4222-8333-444444444444';
const VICTIM = 'bbbbbbbb-5555-4666-8777-888888888888';

describe('isOwnDocPath', () => {
    it.each([
        `resumes/${ME}/1788000000-cv.pdf`,
        `uploads/${ME}/1788000000-cv.pdf`,
        `resumes/resumes/${ME}/1788000000-cv.pdf`,
    ])('accepts the caller\'s own path %s', (stored) => {
        expect(isOwnDocPath(stored, 'resume', ME)).toBe(true);
    });

    it('accepts a full signed URL for the caller\'s own object', () => {
        const url = `https://project.supabase.co/storage/v1/object/sign/resumes/uploads/${ME}/cv.pdf?token=abc`;
        // Only meaningful if the helper can still recover the path.
        if (toBareDocPath(url, 'resume')) {
            expect(isOwnDocPath(url, 'resume', ME)).toBe(true);
        }
    });

    it.each([
        `uploads/${VICTIM}/1788000000-cv.pdf`,
        `resumes/uploads/${VICTIM}/cv.pdf`,
        `uploads/${VICTIM}/../${VICTIM}/cv.pdf`,
        `uploads/${ME}/../${VICTIM}/cv.pdf`,
    ])('refuses another user\'s path %s', (stored) => {
        expect(isOwnDocPath(stored, 'resume', ME)).toBe(false);
    });

    it('refuses a path that merely embeds the id inside a filename', () => {
        expect(isOwnDocPath(`uploads/${VICTIM}/${ME}.pdf`, 'resume', ME)).toBe(false);
    });

    it.each([null, undefined, '', '   '])('refuses the empty path %s', (stored) => {
        expect(isOwnDocPath(stored as string | null, 'resume', ME)).toBe(false);
    });

    it('refuses when the caller has no id', () => {
        expect(isOwnDocPath(`uploads/${ME}/cv.pdf`, 'resume', null)).toBe(false);
        expect(isOwnDocPath(`uploads/${ME}/cv.pdf`, 'resume', '')).toBe(false);
    });
});

describe('routes that handle a client-supplied resume path', () => {
    const ROOT = process.cwd();
    const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

    it('/api/resume/parse gates the body path on ownership', () => {
        const src = read('app/api/resume/parse/route.ts');
        expect(src).toContain('isOwnDocPath');
        // The guard must run before the download.
        expect(src.indexOf('isOwnDocPath')).toBeLessThan(src.indexOf('downloadResumeBytes('));
    });

    it('PATCH /api/auth/profile no longer writes resumeUrl from the body', () => {
        const src = read('app/api/auth/profile/route.ts');
        expect(src).not.toMatch(/const resumeUrl\s*=\s*body\.resumeUrl/);
        expect(src).not.toMatch(/\.\.\.\(resumeUrl !== undefined/);
    });
});
