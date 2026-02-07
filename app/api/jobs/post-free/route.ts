import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { config } from '@/lib/config';
import { sendConfirmationEmail } from '@/lib/email-service';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { sanitizeJobPosting, sanitizeUrl, sanitizeEmail, sanitizeText } from '@/lib/sanitize';
import { logger } from '@/lib/logger';
import { normalizeSalary } from '@/lib/salary-normalizer';
import { formatDisplaySalary } from '@/lib/salary-display';

export async function POST(request: NextRequest) {
  // Rate limiting - strict for job posting
  const rateLimitResult = await rateLimit(request, 'postJob', RATE_LIMITS.postJob);
  if (rateLimitResult) return rateLimitResult;

  try {
    // Check if free posting is allowed
    if (config.isPaidPostingEnabled) {
      return NextResponse.json(
        { error: 'Free posting is not enabled. Use /api/create-checkout instead.' },
        { status: 403 }
      );
    }

    // Parse and sanitize request body
    const body = await request.json();

    // Validate required fields before sanitization
    const {
      title,
      employer,
      location,
      mode,
      jobType,
      description,
      applyLink,
      contactEmail,
      minSalary,
      maxSalary,
      salaryPeriod,
      companyWebsite,
      pricing,
    } = body;

    if (!title || !employer || !location || !mode || !jobType || !description || !applyLink || !contactEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Sanitize all inputs
    const sanitized = sanitizeJobPosting({
      title,
      employer,
      location,
      description,
      applyLink,
      contactEmail,
      mode,
      jobType,
      companyWebsite,
      minSalary,
      maxSalary,
      salaryPeriod,
    });

    // Block free email providers to prevent spam
    const FREE_EMAIL_DOMAINS = [
      'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
      'aol.com', 'icloud.com', 'mail.com', 'protonmail.com',
      'ymail.com', 'live.com', 'msn.com', 'googlemail.com'
    ];

    const emailDomain = sanitized.contactEmail.toLowerCase().split('@')[1];
    if (FREE_EMAIL_DOMAINS.includes(emailDomain)) {
      return NextResponse.json(
        {
          error: 'Company email required',
          message: 'Please use your company email address (not Gmail, Yahoo, etc.) to verify you represent this employer.'
        },
        { status: 400 }
      );
    }

    // Validate sanitized URL
    if (!sanitized.applyLink) {
      return NextResponse.json(
        { error: 'Invalid apply link URL' },
        { status: 400 }
      );
    }

    // Require authenticated user
    let userId: string | null = null;
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }

      // Verify profile and get userId
      const profile = await prisma.userProfile.findUnique({
        where: { supabaseId: user.id }
      });

      if (!profile) {
        // This technically shouldn't happen if they are logged in, but just in case
        return NextResponse.json({ error: 'User profile not found' }, { status: 403 });
      }

      userId = user.id;

    } catch (error) {
      logger.warn('Failed to fetch user session in post-free', { error });
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    // DUPLICATE CHECK
    // Check for existing active jobs for this employer to prevent accidental double-posting
    const existingEmployerJobs = await prisma.employerJob.findMany({
      where: {
        contactEmail: sanitized.contactEmail,
      },
      include: {
        job: true,
      },
    });

    const normalizedTitle = sanitized.title.trim().toLowerCase();
    const normalizedLocation = sanitized.location.trim().toLowerCase();
    const now = new Date();

    const duplicateJob = existingEmployerJobs.find((ej) => {
      const job = ej.job;
      // Only check active, published jobs
      if (!job.isPublished || !job.expiresAt || new Date(job.expiresAt) < now) {
        return false;
      }

      const existingTitle = job.title.trim().toLowerCase();
      const existingLocation = job.location.trim().toLowerCase();

      return existingTitle === normalizedTitle && existingLocation === normalizedLocation;
    });

    if (duplicateJob) {
      return NextResponse.json(
        {
          error: 'You already have an active posting for this role',
          editLink: `/jobs/edit/${duplicateJob.editToken}`
        },
        { status: 409 }
      );
    }

    // Generate unique tokens
    const editToken = crypto.randomBytes(32).toString('hex');
    const dashboardToken = crypto.randomBytes(32).toString('hex');

    // Calculate expiry date (30 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Parse salary values
    const parsedMinSalary = (() => {
      const val = Number(sanitized.minSalary);
      return (Number.isFinite(val) && !Number.isNaN(val)) ? val : null;
    })();
    const parsedMaxSalary = (() => {
      const val = Number(sanitized.maxSalary);
      return (Number.isFinite(val) && !Number.isNaN(val)) ? val : null;
    })();
    const parsedSalaryPeriod = sanitized.salaryPeriod || null;

    // Normalize salary data for filtering and display
    const normalizedSalary = normalizeSalary({
      minSalary: parsedMinSalary,
      maxSalary: parsedMaxSalary,
      salaryPeriod: parsedSalaryPeriod,
      title: sanitized.title,
    });

    // Generate display salary string
    const displaySalary = formatDisplaySalary(
      normalizedSalary.normalizedMinSalary,
      normalizedSalary.normalizedMaxSalary,
      parsedSalaryPeriod
    );

    // Create job with Prisma
    const job = await prisma.job.create({
      data: {
        title: sanitized.title,
        employer: sanitized.employer,
        location: sanitized.location,
        jobType: sanitized.jobType || null,
        mode: sanitized.mode || null,
        description: sanitized.description,
        descriptionSummary: sanitized.description.slice(0, 300),
        applyLink: sanitized.applyLink,
        minSalary: parsedMinSalary,
        maxSalary: parsedMaxSalary,
        salaryPeriod: parsedSalaryPeriod,
        normalizedMinSalary: normalizedSalary.normalizedMinSalary,
        normalizedMaxSalary: normalizedSalary.normalizedMaxSalary,
        salaryIsEstimated: normalizedSalary.salaryIsEstimated,
        salaryConfidence: normalizedSalary.salaryConfidence,
        displaySalary,
        isFeatured: pricing === 'featured',
        isPublished: true,
        sourceType: 'employer',
        expiresAt,
      },
    });

    // Generate and update slug
    const slug = `${sanitized.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()}-${job.id}`;

    await prisma.job.update({
      where: { id: job.id },
      data: { slug },
    });

    // Create employer job record
    await prisma.employerJob.create({
      data: {
        employerName: sanitized.employer,
        contactEmail: sanitized.contactEmail,
        companyWebsite: sanitized.companyWebsite || null,
        jobId: job.id,
        editToken,
        dashboardToken,
        paymentStatus: 'free',
        userId: userId, // Link to user if authenticated
      },
    });

    // Send confirmation email with dashboard token
    try {
      await sendConfirmationEmail(
        sanitized.contactEmail,
        sanitized.title,
        job.id,
        editToken,
        dashboardToken
      );
    } catch (emailError) {
      logger.error('Failed to send confirmation email', emailError);
      // Don't fail the request if email fails
    }

    // Clean up any saved drafts for this email
    try {
      await prisma.jobDraft.deleteMany({
        where: { email: sanitized.contactEmail },
      });
    } catch {
      // Ignore - draft may not exist
      logger.debug('No draft to clean up');
    }

    logger.info('Free job posted successfully', {
      jobId: job.id,
      employer: sanitized.employer
    });

    // Return success response
    return NextResponse.json({
      success: true,
      jobId: job.id,
      editToken,
      dashboardToken,
    });
  } catch (error) {
    logger.error('Free posting error', error);
    return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });
  }
}

