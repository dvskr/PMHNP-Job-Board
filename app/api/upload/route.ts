import { NextRequest, NextResponse } from 'next/server';
import { uploadResume, uploadAvatar, validateFile } from '@/lib/supabase-storage';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { verifyCsrf } from '@/lib/csrf';

/**
 * 'cover_letter' shares the private resumes bucket with 'resume' (see
 * lib/document-storage.ts) but is deliberately a distinct type: only a
 * 'resume' upload is allowed to repoint UserProfile.resumeUrl.
 */
const UPLOAD_TYPES = ['resume', 'cover_letter', 'avatar'] as const;
type UploadType = (typeof UPLOAD_TYPES)[number];

/**
 * Per-type byte caps, mirroring lib/supabase-storage.ts validateFile (which
 * keeps them private and is the authority once the buffer exists). They are
 * restated here because the cheap checks have to happen before the body is
 * read, and validateFile only runs after it has been.
 */
const MAX_BYTES_BY_TYPE: Readonly<Record<UploadType, number>> = {
  resume: 5 * 1024 * 1024,
  cover_letter: 5 * 1024 * 1024,
  avatar: 2 * 1024 * 1024,
};

/**
 * Hard ceiling applied BEFORE the body is parsed, so an oversized upload is
 * never buffered into memory at all. The largest per-type cap plus a small
 * allowance for multipart framing; the exact per-type limit is applied once the
 * declared type is known.
 */
const LARGEST_TYPE_BYTES = Math.max(...Object.values(MAX_BYTES_BY_TYPE));
const MAX_REQUEST_BYTES = LARGEST_TYPE_BYTES + 64 * 1024;

const describeLimit = (bytes: number): string => `${bytes / 1024 / 1024}MB`;

export async function POST(request: NextRequest) {
  // Rate limiting for uploads (stricter)
  const rateLimitResult = await rateLimit(request, 'upload', { limit: 10, windowSeconds: 60 });
  if (rateLimitResult) return rateLimitResult;

  // Every other cookie-authenticated upload route verifies the origin
  // (message-attachment, company-logo). This one repoints UserProfile.resumeUrl
  // and avatarUrl, so it belongs on the same footing rather than relying on
  // SameSite=Lax alone.
  const csrfResult = verifyCsrf(request);
  if (csrfResult) return csrfResult;

  try {
    // Get authenticated user from Supabase session
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in.' },
        { status: 401 }
      );
    }

    // Refuse an oversized body at the door. request.formData() buffers the
    // whole payload before validateFile's size check ever runs, so a 30MB
    // upload used to blow up inside the parser and surface as a generic
    // 500 "Failed to upload file" instead of telling the user their file is
    // too big, and a much larger one was a free way to burn server memory.
    const declaredLength = Number(request.headers.get('content-length') ?? '');
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
      return NextResponse.json(
        { error: `File size exceeds maximum of ${describeLimit(LARGEST_TYPE_BYTES)}` },
        { status: 413 }
      );
    }

    // A body that cannot be parsed is a client error, not a server fault. Left
    // to the outer catch it became an indistinguishable 500.
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (error) {
      logger.warn('Upload rejected: unreadable multipart body', { error: String(error) });
      return NextResponse.json(
        { error: 'Could not read the uploaded file. Please try again.' },
        { status: 400 }
      );
    }
    const file = formData.get('file') as File;
    const uploadType = formData.get('type') as UploadType;

    // Validate required fields
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!uploadType || !UPLOAD_TYPES.includes(uploadType)) {
      return NextResponse.json(
        { error: 'Invalid upload type. Must be "resume", "cover_letter", or "avatar".' },
        { status: 400 }
      );
    }

    // Size is known from the File object without touching the stream. Checking
    // it here (the way message-attachment and company-logo already do) keeps an
    // oversized file from being materialised into a Buffer just so validateFile
    // can reject it.
    const maxBytes = MAX_BYTES_BY_TYPE[uploadType];
    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: `File size exceeds maximum of ${describeLimit(maxBytes)}` },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Cover letters are PDF only. Enforced before the shared document
    // validator, which accepts the wider resume set (PDF + DOC/DOCX).
    if (uploadType === 'cover_letter' && file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Cover letter must be a PDF file' },
        { status: 400 }
      );
    }

    // Validate file. Cover letters ride the resume rules (same private
    // bucket, same 5MB cap, same magic-byte check).
    const validation = validateFile(
      buffer,
      file.name,
      file.type,
      uploadType === 'avatar' ? 'avatar' : 'resume',
    );
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    // Upload based on type (using authenticated user's ID)
    let result;
    if (uploadType === 'resume' || uploadType === 'cover_letter') {
      result = await uploadResume(buffer, file.name, file.type, user.id);

      // ONLY a resume upload repoints the profile. The apply form used to send
      // type='resume' for cover letters, so uploading a cover letter silently
      // replaced the candidate's stored resume (and reset its parse status),
      // and every later application then attached the cover letter as the
      // resume. A cover letter is per-application: it is returned to the
      // caller and lands on the JobApplication row, never on the profile.
      if (uploadType === 'resume') {
        // Store the permanent storage path (not the signed URL which expires).
        // Sprint 2.1.P5: status stays 'pending' until the client commits the
        // preview via the ResumeAutofillReview modal (`/api/resume/parse`
        // without `?preview=1`). We removed the fire-and-forget background
        // trigger here so the user reviews the extraction before any
        // profile/license/cert rows are written.
        await prisma.userProfile.update({
          where: { supabaseId: user.id },
          data: {
            resumeUrl: result.path,
            resumeParseStatus: 'pending'
          },
        });
      }
    } else {
      result = await uploadAvatar(buffer, file.name, file.type, user.id);

      // Update user profile with avatar URL
      await prisma.userProfile.update({
        where: { supabaseId: user.id },
        data: { avatarUrl: result.url },
      });
    }

    return NextResponse.json({
      success: true,
      url: result.url,
      path: result.path,
    });
  } catch (error) {
    logger.error('Error uploading file', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}

