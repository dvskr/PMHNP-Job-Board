/**
 * Uploading a cover letter must not overwrite the candidate's stored resume.
 *
 * Found 2026-09-13. InPlatformApplyForm sent `type=resume` for cover letters
 * ("reuse resume bucket for cover letters too"), and that branch of
 * /api/upload unconditionally repoints UserProfile.resumeUrl at whatever it
 * just wrote and resets resumeParseStatus. So attaching a cover letter
 * silently replaced the candidate's primary document, and apply-direct's
 * `validResumeUrl || profile.resumeUrl` fallback then sent the cover letter to
 * every subsequent employer as the resume.
 *
 * 'cover_letter' is now its own upload type: same private bucket and virus
 * scan, PDF only, and no profile write.
 *
 * All fixtures are fictional.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const USER_ID = 'supabase-seeker-fic-1';

vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }) },
    }),
}));

vi.mock('@/lib/rate-limit', () => ({
    rateLimit: async () => null,
    RATE_LIMITS: { upload: { limit: 10, windowSeconds: 60 } },
}));

const uploadResume = vi.fn();
const uploadAvatar = vi.fn();
const validateFile = vi.fn();
vi.mock('@/lib/supabase-storage', () => ({
    uploadResume: (...a: unknown[]) => uploadResume(...a),
    uploadAvatar: (...a: unknown[]) => uploadAvatar(...a),
    validateFile: (...a: unknown[]) => validateFile(...a),
}));

const profileUpdate = vi.fn();
vi.mock('@/lib/prisma', () => ({
    prisma: { userProfile: { update: (...a: unknown[]) => profileUpdate(...a) } },
}));

import { POST } from '@/app/api/upload/route';

const PDF = 'application/pdf';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Stand-in for a Next request. It carries real Headers as well as formData:
 * the route reads content-length to refuse an oversized body BEFORE
 * formData() buffers it, and a stand-in without headers made all six cases
 * here fail with "Cannot read properties of undefined" rather than testing
 * anything. `contentLength` is optional so a case can exercise that guard.
 */
function uploadRequest(
    type: string,
    fileName: string,
    fileType: string,
    contentLength?: number,
): NextRequest {
    const form = new FormData();
    form.append('file', new File(['%PDF-1.7 fixture'], fileName, { type: fileType }));
    form.append('type', type);
    const headers = new Headers();
    if (contentLength !== undefined) headers.set('content-length', String(contentLength));
    return { headers, formData: async () => form } as unknown as NextRequest;
}

beforeEach(() => {
    vi.clearAllMocks();
    uploadResume.mockResolvedValue({ path: `uploads/${USER_ID}/1788000000-doc.pdf`, url: 'https://storage.example/signed-fic' });
    uploadAvatar.mockResolvedValue({ path: `avatars/${USER_ID}/1788000000-me.png`, url: 'https://storage.example/avatar-fic' });
    validateFile.mockReturnValue({ valid: true });
});

describe('POST /api/upload — cover letters', () => {
    it('stores the cover letter without touching the profile resume', async () => {
        const res = await POST(uploadRequest('cover_letter', 'letter.pdf', PDF));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
        expect(uploadResume).toHaveBeenCalledTimes(1);
        // The whole bug: this write is what clobbered the candidate's resume.
        expect(profileUpdate).not.toHaveBeenCalled();
    });

    it('validates a cover letter against the resume rules (size, magic bytes)', async () => {
        await POST(uploadRequest('cover_letter', 'letter.pdf', PDF));

        expect(validateFile).toHaveBeenCalledTimes(1);
        expect(validateFile.mock.calls[0][3]).toBe('resume');
    });

    it('rejects a non-PDF cover letter before writing anything', async () => {
        const res = await POST(uploadRequest('cover_letter', 'letter.docx', DOCX));
        const body = await res.json();

        expect(res.status).toBe(400);
        expect(body.error).toBe('Cover letter must be a PDF file');
        expect(uploadResume).not.toHaveBeenCalled();
        expect(profileUpdate).not.toHaveBeenCalled();
    });
});

describe('POST /api/upload — other types still behave', () => {
    it('a resume upload does repoint the profile', async () => {
        const res = await POST(uploadRequest('resume', 'cv.pdf', PDF));

        expect(res.status).toBe(200);
        expect(profileUpdate).toHaveBeenCalledTimes(1);
        expect(profileUpdate.mock.calls[0][0].data).toEqual({
            resumeUrl: `uploads/${USER_ID}/1788000000-doc.pdf`,
            resumeParseStatus: 'pending',
        });
    });

    it('an avatar upload writes avatarUrl', async () => {
        const res = await POST(uploadRequest('avatar', 'me.png', 'image/png'));

        expect(res.status).toBe(200);
        expect(uploadAvatar).toHaveBeenCalledTimes(1);
        expect(profileUpdate.mock.calls[0][0].data).toEqual({ avatarUrl: 'https://storage.example/avatar-fic' });
    });

    it('rejects an unknown upload type', async () => {
        const res = await POST(uploadRequest('transcript', 'x.pdf', PDF));

        expect(res.status).toBe(400);
        expect(uploadResume).not.toHaveBeenCalled();
        expect(uploadAvatar).not.toHaveBeenCalled();
    });
});
