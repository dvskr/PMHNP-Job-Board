import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { parseResume, ParsedResume } from '@/lib/resume-parser';
import { rateLimit } from '@/lib/rate-limit';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * POST /api/resume/parse
 * Parse an uploaded resume with AI and auto-fill the user's profile.
 *
 * Accepts either:
 *  - { resumeUrl: string } — path in Supabase Storage (e.g. "resumes/userId/file.pdf")
 *  - multipart/form-data with a "file" field
 */
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
      // Download from Supabase Storage
      const body = await request.json().catch(() => null);
      const resumePath = body?.resumeUrl;

      if (!resumePath || typeof resumePath !== 'string') {
        return NextResponse.json({ error: 'resumeUrl is required' }, { status: 400 });
      }

      const adminSupabase = createSupabaseClient(supabaseUrl, supabaseServiceKey);

      const { data: fileData, error: downloadError } = await adminSupabase.storage
        .from('resumes')
        .download(resumePath.replace(/^resumes\//, ''));

      if (downloadError || !fileData) {
        logger.error('Failed to download resume from storage', { resumePath, error: downloadError });
        await markProfileFailed(user.id);
        return NextResponse.json({ error: 'Failed to download resume' }, { status: 400 });
      }

      if (fileData.size > MAX_FILE_BYTES) {
        await markProfileFailed(user.id);
        return NextResponse.json({ error: 'Resume file is too large (max 5MB)' }, { status: 413 });
      }

      const arrayBuffer = await fileData.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      contentType = inferContentTypeFromPath(resumePath);
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
    const previewMode = new URL(request.url).searchParams.get('preview') === '1';
    if (previewMode) {
      logger.info('Resume parsed (preview mode — no DB writes)', { userId: user.id });
      return NextResponse.json({
        success: true,
        preview: true,
        parsed,
      });
    }

    // Auto-fill profile (only update empty fields)
    await autoFillProfile(user.id, parsed);

    // Mark as completed
    await prisma.userProfile.updateMany({
      where: { supabaseId: user.id },
      data: {
        resumeParsedAt: new Date(),
        resumeParseStatus: 'completed',
      },
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

/**
 * Auto-fill empty profile fields with parsed resume data.
 * NEVER overwrites user-entered data — only fills empty/null fields.
 */
async function autoFillProfile(supabaseId: string, parsed: ParsedResume): Promise<void> {
  const profile = await prisma.userProfile.findUnique({
    where: { supabaseId },
  });

  if (!profile) return;

  // Build update only for empty fields
  const update: Record<string, unknown> = {};

  if (!profile.firstName && parsed.firstName) update.firstName = parsed.firstName;
  if (!profile.lastName && parsed.lastName) update.lastName = parsed.lastName;
  if (!profile.phone && parsed.phone) update.phone = parsed.phone;
  if (!profile.linkedinUrl && parsed.linkedinUrl) update.linkedinUrl = parsed.linkedinUrl;
  if (!profile.headline && parsed.headline) update.headline = parsed.headline;
  if (!profile.yearsExperience && parsed.yearsExperience) update.yearsExperience = parsed.yearsExperience;
  if (!profile.certifications && parsed.certifications?.length) {
    update.certifications = parsed.certifications.join(', ');
  }
  if (!profile.licenseStates && parsed.licenseStates?.length) {
    update.licenseStates = parsed.licenseStates.join(', ');
  }
  if (!profile.specialties && parsed.specialties?.length) {
    update.specialties = parsed.specialties.join(', ');
  }
  if ((!profile.skills || profile.skills.length === 0) && parsed.skills?.length) {
    update.skills = parsed.skills;
  }
  if (!profile.npiNumber && parsed.npiNumber) update.npiNumber = parsed.npiNumber;
  if (!profile.deaNumber && parsed.deaNumber) update.deaNumber = parsed.deaNumber;

  // Update profile if there are changes
  if (Object.keys(update).length > 0) {
    await prisma.userProfile.update({
      where: { supabaseId },
      data: update,
    });
    logger.info('Profile auto-filled from resume', { supabaseId, fields: Object.keys(update) });
  }

  // Upsert education records
  if (parsed.education?.length) {
    for (const edu of parsed.education) {
      // Check if a similar record already exists
      const existing = await prisma.candidateEducation.findFirst({
        where: {
          userId: profile.id,
          schoolName: edu.schoolName,
          degreeType: edu.degreeType,
        },
      });

      if (!existing) {
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
  }

  // Upsert work experience records
  if (parsed.workExperience?.length) {
    for (const exp of parsed.workExperience) {
      // Check if a similar record already exists
      const existing = await prisma.candidateWorkExperience.findFirst({
        where: {
          userId: profile.id,
          jobTitle: exp.jobTitle,
          employerName: exp.employerName,
        },
      });

      if (!existing) {
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
  }

  // ── Structured license records (Sprint 2.1) ─────────────────
  // Insert one CandidateLicense row per (state, type, number) combo
  // the parser found. These are richer than the CSV `licenseStates`
  // string on UserProfile — they include the actual license number
  // and expiration date for employer compliance verification.
  if (parsed.licenses?.length) {
    for (const lic of parsed.licenses) {
      const existing = await prisma.candidateLicense.findFirst({
        where: {
          userId: profile.id,
          licenseState: lic.licenseState,
          licenseNumber: lic.licenseNumber,
        },
      });
      if (!existing) {
        let expirationDate: Date | null = null;
        if (lic.expirationDate) {
          const parsed = new Date(lic.expirationDate);
          if (!Number.isNaN(parsed.getTime())) expirationDate = parsed;
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
  }

  // ── Structured certification records (Sprint 2.1) ────────────
  // Prefer the structured payload (with certifyingBody + expiration)
  // over the legacy flat-name payload. Falls back to the flat list
  // for backward compatibility when the model returns names only.
  if (parsed.certificationRecords?.length) {
    for (const cert of parsed.certificationRecords) {
      const existing = await prisma.candidateCertification.findFirst({
        where: {
          userId: profile.id,
          certificationName: cert.certificationName,
        },
      });
      if (!existing) {
        let expirationDate: Date | null = null;
        if (cert.expirationDate) {
          const parsed = new Date(cert.expirationDate);
          if (!Number.isNaN(parsed.getTime())) expirationDate = parsed;
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
    }
  } else if (parsed.certifications?.length) {
    // Legacy fallback: flat name list with no structured metadata.
    for (const certName of parsed.certifications) {
      const existing = await prisma.candidateCertification.findFirst({
        where: {
          userId: profile.id,
          certificationName: certName,
        },
      });
      if (!existing) {
        await prisma.candidateCertification.create({
          data: {
            userId: profile.id,
            certificationName: certName,
          },
        });
      }
    }
  }
}
