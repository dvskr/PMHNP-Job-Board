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
export async function POST(request: NextRequest) {
  const rateLimitResult = await rateLimit(request, 'resume:parse', { limit: 5, windowSeconds: 60 });
  if (rateLimitResult) return rateLimitResult;

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Mark profile as parsing-in-progress
    await prisma.userProfile.update({
      where: { supabaseId: user.id },
      data: { resumeParseStatus: 'pending' },
    });

    let buffer: Buffer;
    let contentType: string;

    // Check if this is a JSON request (resumeUrl) or form-data (file upload)
    const ct = request.headers.get('content-type') || '';

    if (ct.includes('application/json')) {
      // Download from Supabase Storage
      const body = await request.json();
      const resumePath = body.resumeUrl;

      if (!resumePath || typeof resumePath !== 'string') {
        return NextResponse.json({ error: 'resumeUrl is required' }, { status: 400 });
      }

      // Use admin client to download the file
      const adminSupabase = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const { data: fileData, error: downloadError } = await adminSupabase.storage
        .from('resumes')
        .download(resumePath.replace(/^resumes\//, ''));

      if (downloadError || !fileData) {
        logger.error('Failed to download resume from storage', { resumePath, error: downloadError });
        await prisma.userProfile.update({
          where: { supabaseId: user.id },
          data: { resumeParseStatus: 'failed' },
        });
        return NextResponse.json({ error: 'Failed to download resume' }, { status: 400 });
      }

      const arrayBuffer = await fileData.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      contentType = resumePath.endsWith('.docx')
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : resumePath.endsWith('.doc')
          ? 'application/msword'
          : 'application/pdf';
    } else {
      // Direct file upload via form-data
      const formData = await request.formData();
      const file = formData.get('file') as File;

      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }

      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      contentType = file.type;
    }

    // Parse the resume with AI
    const parsed = await parseResume(buffer, contentType);

    // Auto-fill profile (only update empty fields)
    await autoFillProfile(user.id, parsed);

    // Mark as completed
    await prisma.userProfile.update({
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
    logger.error('Resume parse failed', err);

    // Try to mark as failed
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await prisma.userProfile.update({
          where: { supabaseId: user.id },
          data: { resumeParseStatus: 'failed' },
        });
      }
    } catch {
      // ignore
    }

    return NextResponse.json(
      { error: 'Failed to parse resume' },
      { status: 500 }
    );
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

  // Upsert certification records
  if (parsed.certifications?.length) {
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
