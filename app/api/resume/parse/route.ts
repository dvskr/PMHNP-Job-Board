import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { parseResume, ParsedResume } from '@/lib/resume-parser';
import { rateLimit } from '@/lib/rate-limit';
import { downloadResumeBytes, extractRequestContext } from '@/lib/resume-storage';
import { inngest } from '@/lib/inngest/client';

/**
 * POST /api/resume/parse
 * Parse an uploaded resume with AI and auto-fill the user's profile.
 *
 * Accepts either:
 *  - { resumeUrl: string } — path in Supabase Storage (e.g. "resumes/userId/file.pdf")
 *  - multipart/form-data with a "file" field
 */

// gpt-5-mini's reasoning + verbatim-bullet output for a complex
// resume regularly takes 60-150s. The Vercel default function
// timeout is 10s on Hobby / 60s on Pro / 300s on Pro w/ Fluid;
// without an explicit `maxDuration` export the function is killed
// before the LLM finishes and the user sees "All providers failed".
// 240s (4 min) gives the 180s LLM timeout (lib/ai/tasks.ts) some
// headroom for PDF extraction + cold start + DB writes.
export const maxDuration = 240;

// Cap upload size to prevent OOM in the Vercel function (resumes are typically <2MB).
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const SUPPORTED_RESUME_CONTENT_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]);

function inferContentTypeFromPath(resumePath: string): string {
  const lower = resumePath.toLowerCase();
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (lower.endsWith('.doc')) {
    return 'application/msword';
  }
  return 'application/pdf';
}

export async function POST(request: NextRequest) {
  const rateLimitResult = await rateLimit(request, 'resume:parse', { limit: 5, windowSeconds: 60 });
  if (rateLimitResult) return rateLimitResult;

  // Fail fast with a precise status if server config is missing — avoids
  // the opaque 500s we were seeing when the Node module booted without
  // the keys it needs and crashed mid-request.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey || !process.env.OPENAI_API_KEY) {
    logger.error('Resume parse misconfigured: missing required env vars', {
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasServiceKey: Boolean(supabaseServiceKey),
      hasOpenAi: Boolean(process.env.OPENAI_API_KEY),
    });
    return NextResponse.json(
      { error: 'Resume parsing is temporarily unavailable. Please try again later.' },
      { status: 503 }
    );
  }

  let userId: string | null = null;

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userId = user.id;

    // Mark profile as parsing-in-progress.
    // updateMany doesn't throw P2025 ("record not found") if the profile row
    // doesn't exist yet — previously the missing-profile case crashed the
    // route with a hard 500 before the file was even read.
    await prisma.userProfile.updateMany({
      where: { supabaseId: user.id },
      data: { resumeParseStatus: 'pending' },
    });

    let buffer: Buffer;
    let contentType: string;

    // Check if this is a JSON request (resumeUrl) or form-data (file upload)
    const ct = request.headers.get('content-type') || '';

    if (ct.includes('application/json')) {
      // Download from Supabase Storage via the centralized helper.
      // It handles legacy URL-shaped values vs bare paths, audit-logs
      // the access (audience='system' for AI parse), and never leaks
      // the underlying error to the response.
      const body = await request.json().catch(() => null);
      const rawResumeUrl = body?.resumeUrl;

      if (!rawResumeUrl || typeof rawResumeUrl !== 'string') {
        return NextResponse.json({ error: 'resumeUrl is required' }, { status: 400 });
      }

      const reqCtx = extractRequestContext(request);
      const downloaded = await downloadResumeBytes(rawResumeUrl, {
        actorId: user.id,
        ownerId: user.id,
        audience: 'system',
        action: 'parse',
        ip: reqCtx.ip,
        userAgent: reqCtx.userAgent,
        reason: 'AI resume parse — preview-then-apply flow',
      });

      if (!downloaded) {
        await markProfileFailed(user.id);
        return NextResponse.json(
          {
            error: 'Could not locate the uploaded resume in storage. Try re-uploading.',
          },
          { status: 400 },
        );
      }

      if (downloaded.buffer.length > MAX_FILE_BYTES) {
        await markProfileFailed(user.id);
        return NextResponse.json({ error: 'Resume file is too large (max 5MB)' }, { status: 413 });
      }

      buffer = downloaded.buffer;
      contentType = downloaded.contentType;
    } else {
      // Direct file upload via form-data
      const formData = await request.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }

      if (file.size > MAX_FILE_BYTES) {
        await markProfileFailed(user.id);
        return NextResponse.json({ error: 'Resume file is too large (max 5MB)' }, { status: 413 });
      }

      contentType = file.type || inferContentTypeFromPath(file.name || '');

      if (!SUPPORTED_RESUME_CONTENT_TYPES.has(contentType)) {
        await markProfileFailed(user.id);
        return NextResponse.json(
          { error: 'Unsupported file type. Upload a PDF or Word document.' },
          { status: 415 }
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    }

    // Parse the resume with AI
    let parsed: ParsedResume;
    try {
      parsed = await parseResume(buffer, contentType, user.id);
    } catch (parseErr) {
      logger.error('Resume content extraction or AI parse failed', parseErr, { userId: user.id });
      await markProfileFailed(user.id);
      // The user uploaded a file we couldn't read — return 422 (unprocessable),
      // not 500. Keeps the error budget honest and tells the client it's a
      // content problem, not a server outage.
      // Include the underlying detail so the modal can show actionable info
      // (e.g. "Failed to extract text from PDF: ..." vs "Resume text is too
      // short or empty") instead of a generic "try a text-based PDF" line.
      const detail = parseErr instanceof Error ? parseErr.message : String(parseErr);
      return NextResponse.json(
        {
          error: 'We could not read this resume. Try a text-based PDF or DOCX.',
          detail,
        },
        { status: 422 }
      );
    }

    // Sprint 2.1.P5 — preview mode. When ?preview=1 is set, return the
    // parsed JSON WITHOUT writing anything to the profile or related
    // tables. The UI uses this to show a 'review-before-save' diff;
    // the user then re-POSTs without the preview flag (or via the apply
    // endpoint that takes a curated subset) to commit.
    const url = new URL(request.url);
    const previewMode = url.searchParams.get('preview') === '1';
    // ?overwrite=1 → replace scalar fields even when set, AND
    // delete-then-recreate structured records (licenses, certs, etc).
    // Default behavior remains "fill empty fields only".
    const overwriteMode = url.searchParams.get('overwrite') === '1';
    if (previewMode) {
      // Clear the 'pending' status the upload route set — the parse
      // succeeded, the badge "Analyzing resume…" is no longer accurate.
      // Status stays null until the user clicks Apply (which sets it
      // to 'completed'). If they skip, status remains null instead of
      // hanging at 'pending' forever.
      await prisma.userProfile.updateMany({
        where: { supabaseId: user.id, resumeParseStatus: 'pending' },
        data: { resumeParseStatus: null },
      });
      logger.info('Resume parsed (preview mode — no DB writes)', { userId: user.id });
      return NextResponse.json({
        success: true,
        preview: true,
        parsed,
      });
    }

    // Auto-fill profile. Behavior controlled by overwriteMode.
    await autoFillProfile(user.id, parsed, { overwrite: overwriteMode });

    // Mark as completed
    await prisma.userProfile.updateMany({
      where: { supabaseId: user.id },
      data: {
        resumeParsedAt: new Date(),
        resumeParseStatus: 'completed',
      },
    });

    // Refresh the candidate embedding so the now-populated profile becomes
    // searchable in employer AI Match. autoFillProfile may have updated
    // headline/bio/specialties/yearsExperience/certifications/licenseStates/
    // skills — all embedder inputs. Fire-and-forget; the manual backfill
    // covers us if the queue is down. Inngest's per-supabaseId 30s throttle
    // coalesces with any concurrent dispatches from /api/auth/profile.
    inngest.send({
      name: 'embedding.refresh.candidate',
      data: { supabaseId: user.id },
    }).catch((err) => {
      logger.warn('inngest.send embedding.refresh.candidate failed (resume parse)', undefined, err);
    });

    logger.info('Resume parsed successfully', {
      userId: user.id,
      fieldsFound: Object.keys(parsed).filter(k => {
        const val = parsed[k as keyof ParsedResume];
        return val !== undefined && val !== null && (Array.isArray(val) ? val.length > 0 : true);
      }).length,
    });

    return NextResponse.json({
      success: true,
      parsed,
      message: 'Resume parsed and profile updated successfully',
    });
  } catch (err) {
    logger.error('Resume parse failed', err, { userId: userId ?? undefined });

    if (userId) {
      await markProfileFailed(userId);
    }

    return NextResponse.json(
      { error: 'Failed to parse resume' },
      { status: 500 }
    );
  }
}

async function markProfileFailed(supabaseId: string): Promise<void> {
  try {
    await prisma.userProfile.updateMany({
      where: { supabaseId },
      data: { resumeParseStatus: 'failed' },
    });
  } catch (err) {
    logger.warn('Failed to mark profile as failed', { supabaseId }, err);
  }
}

interface AutoFillOptions {
  /** When true, overwrite existing profile values + replace structured
   *  rows (delete + reinsert). When false (default), only empty fields
   *  get filled and structured rows are inserted only when no duplicate
   *  key exists. */
  overwrite: boolean;
}

/**
 * Apply parsed resume data to the user's profile.
 *
 * - overwrite=false (default): non-destructive merge. Scalar fields
 *   that already have a value are kept; new structured rows are
 *   inserted only when no duplicate exists by key fields.
 * - overwrite=true: destructive replace. Scalar fields are written
 *   from the parsed payload (only when the parser supplied a value
 *   — null/undefined parser fields never clobber). Structured tables
 *   (CandidateLicense / Certification / Education / WorkExperience)
 *   are deleted and recreated from the parsed payload.
 */
async function autoFillProfile(
  supabaseId: string,
  parsed: ParsedResume,
  opts: AutoFillOptions,
): Promise<void> {
  const profile = await prisma.userProfile.findUnique({
    where: { supabaseId },
  });

  if (!profile) return;

  const { overwrite } = opts;
  // For each scalar field, write when:
  //   overwrite=true AND parser produced a value
  //   OR profile field is empty AND parser produced a value
  const shouldWrite = (existing: unknown, incoming: unknown): boolean => {
    if (incoming === undefined || incoming === null) return false;
    if (Array.isArray(incoming) && incoming.length === 0) return false;
    if (overwrite) return true;
    if (existing === null || existing === undefined) return true;
    if (typeof existing === 'string' && existing.trim() === '') return true;
    if (Array.isArray(existing) && existing.length === 0) return true;
    return false;
  };

  const update: Record<string, unknown> = {};

  if (shouldWrite(profile.firstName, parsed.firstName)) update.firstName = parsed.firstName;
  if (shouldWrite(profile.lastName, parsed.lastName)) update.lastName = parsed.lastName;
  if (shouldWrite(profile.phone, parsed.phone)) update.phone = parsed.phone;
  if (shouldWrite(profile.linkedinUrl, parsed.linkedinUrl)) update.linkedinUrl = parsed.linkedinUrl;
  if (shouldWrite(profile.headline, parsed.headline)) update.headline = parsed.headline;
  // v2 prompt — verbatim "Professional Summary" paragraph from the
  // resume routes to UserProfile.bio.
  if (shouldWrite(profile.bio, parsed.professionalSummary)) update.bio = parsed.professionalSummary;
  if (shouldWrite(profile.yearsExperience, parsed.yearsExperience)) update.yearsExperience = parsed.yearsExperience;
  if (shouldWrite(profile.certifications, parsed.certifications)) {
    update.certifications = parsed.certifications!.join(', ');
  }
  if (shouldWrite(profile.licenseStates, parsed.licenseStates)) {
    update.licenseStates = parsed.licenseStates!.join(', ');
  }
  if (shouldWrite(profile.specialties, parsed.specialties)) {
    update.specialties = parsed.specialties!.join(', ');
  }
  if (shouldWrite(profile.skills, parsed.skills)) {
    update.skills = parsed.skills;
  }
  if (shouldWrite(profile.npiNumber, parsed.npiNumber)) update.npiNumber = parsed.npiNumber;
  if (shouldWrite(profile.deaNumber, parsed.deaNumber)) update.deaNumber = parsed.deaNumber;

  // Update profile if there are changes
  if (Object.keys(update).length > 0) {
    await prisma.userProfile.update({
      where: { supabaseId },
      data: update,
    });
    logger.info('Profile auto-filled from resume', { supabaseId, fields: Object.keys(update) });
  }

  // ── Structured rows ────────────────────────────────────────
  // overwrite=true: nuke the existing rows first so the parsed set
  // becomes the canonical truth. overwrite=false: dedupe by key
  // fields and only insert what isn't already there.
  if (overwrite) {
    await prisma.$transaction([
      prisma.candidateEducation.deleteMany({ where: { userId: profile.id } }),
      prisma.candidateWorkExperience.deleteMany({ where: { userId: profile.id } }),
      prisma.candidateLicense.deleteMany({ where: { userId: profile.id } }),
      prisma.candidateCertification.deleteMany({ where: { userId: profile.id } }),
    ]);
  }

  if (parsed.education?.length) {
    for (const edu of parsed.education) {
      if (!overwrite) {
        const existing = await prisma.candidateEducation.findFirst({
          where: {
            userId: profile.id,
            schoolName: edu.schoolName,
            degreeType: edu.degreeType,
          },
        });
        if (existing) continue;
      }
      await prisma.candidateEducation.create({
        data: {
          userId: profile.id,
          degreeType: edu.degreeType,
          fieldOfStudy: edu.fieldOfStudy || null,
          schoolName: edu.schoolName,
          graduationDate: edu.graduationYear
            ? new Date(`${edu.graduationYear}-06-01`)
            : null,
        },
      });
    }
  }

  if (parsed.workExperience?.length) {
    for (const exp of parsed.workExperience) {
      if (!overwrite) {
        const existing = await prisma.candidateWorkExperience.findFirst({
          where: {
            userId: profile.id,
            jobTitle: exp.jobTitle,
            employerName: exp.employerName,
          },
        });
        if (existing) continue;
      }
      await prisma.candidateWorkExperience.create({
        data: {
          userId: profile.id,
          jobTitle: exp.jobTitle,
          employerName: exp.employerName,
          startDate: exp.startDate ? new Date(exp.startDate) : new Date(),
          endDate: exp.endDate ? new Date(exp.endDate) : null,
          isCurrent: exp.isCurrent || false,
          description: exp.description || null,
          practiceSetting: exp.practiceSetting || null,
        },
      });
    }
  }

  // ── Structured license records (Sprint 2.1) ─────────────────
  if (parsed.licenses?.length) {
    for (const lic of parsed.licenses) {
      if (!overwrite) {
        const existing = await prisma.candidateLicense.findFirst({
          where: {
            userId: profile.id,
            licenseState: lic.licenseState,
            licenseNumber: lic.licenseNumber,
          },
        });
        if (existing) continue;
      }
      let expirationDate: Date | null = null;
      if (lic.expirationDate) {
        const expParsed = new Date(lic.expirationDate);
        if (!Number.isNaN(expParsed.getTime())) expirationDate = expParsed;
      }
      await prisma.candidateLicense.create({
        data: {
          userId: profile.id,
          licenseType: lic.licenseType,
          licenseNumber: lic.licenseNumber,
          licenseState: lic.licenseState,
          expirationDate,
          status: 'active',
        },
      });
    }
  }

  // ── Structured certification records (Sprint 2.1) ────────────
  if (parsed.certificationRecords?.length) {
    for (const cert of parsed.certificationRecords) {
      if (!overwrite) {
        const existing = await prisma.candidateCertification.findFirst({
          where: {
            userId: profile.id,
            certificationName: cert.certificationName,
          },
        });
        if (existing) continue;
      }
      let expirationDate: Date | null = null;
      if (cert.expirationDate) {
        const expParsed = new Date(cert.expirationDate);
        if (!Number.isNaN(expParsed.getTime())) expirationDate = expParsed;
      }
      await prisma.candidateCertification.create({
        data: {
          userId: profile.id,
          certificationName: cert.certificationName,
          certifyingBody: cert.certifyingBody ?? null,
          certificationNumber: cert.certificationNumber ?? null,
          expirationDate,
        },
      });
    }
  } else if (parsed.certifications?.length) {
    // Legacy fallback: flat name list with no structured metadata.
    for (const certName of parsed.certifications) {
      if (!overwrite) {
        const existing = await prisma.candidateCertification.findFirst({
          where: {
            userId: profile.id,
            certificationName: certName,
          },
        });
        if (existing) continue;
      }
      await prisma.candidateCertification.create({
        data: {
          userId: profile.id,
          certificationName: certName,
        },
      });
    }
  }
}
