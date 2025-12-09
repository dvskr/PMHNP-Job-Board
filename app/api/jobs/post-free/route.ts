import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { config } from '@/lib/config';
import { sendConfirmationEmail } from '@/lib/email-service';

export async function POST(request: NextRequest) {
  try {
    // Check if free posting is allowed
    if (config.isPaidPostingEnabled) {
      return NextResponse.json(
        { error: 'Free posting is not enabled. Use /api/create-checkout instead.' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
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

    // Validate required fields
    if (!title || !employer || !location || !mode || !jobType || !description || !applyLink || !contactEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Block free email providers to prevent spam
    const FREE_EMAIL_DOMAINS = [
      'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 
      'aol.com', 'icloud.com', 'mail.com', 'protonmail.com',
      'ymail.com', 'live.com', 'msn.com', 'googlemail.com'
    ];

    const emailDomain = contactEmail.toLowerCase().split('@')[1];
    if (FREE_EMAIL_DOMAINS.includes(emailDomain)) {
      return NextResponse.json(
        { 
          error: 'Company email required',
          message: 'Please use your company email address (not Gmail, Yahoo, etc.) to verify you represent this employer.'
        },
        { status: 400 }
      );
    }

    // Generate unique tokens
    const editToken = crypto.randomBytes(32).toString('hex');
    const dashboardToken = crypto.randomBytes(32).toString('hex'); // GAP FIX 1

    // Calculate expiry date (30 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Create job with Prisma
    const job = await prisma.job.create({
      data: {
        title,
        employer,
        location,
        jobType,
        mode,
        description,
        descriptionSummary: description.slice(0, 300),
        applyLink,
        minSalary: minSalary ? parseInt(minSalary) : null,
        maxSalary: maxSalary ? parseInt(maxSalary) : null,
        salaryPeriod: salaryPeriod || null,
        isFeatured: pricing === 'featured',
        isPublished: true,
        sourceType: 'employer',
        expiresAt,
      },
    });

    // Create employer job record
    await prisma.employerJob.create({
      data: {
        employerName: employer,
        contactEmail,
        companyWebsite: companyWebsite || null,
        jobId: job.id,
        editToken,
        dashboardToken, // GAP FIX 1: Include dashboard token
        paymentStatus: 'free',
      },
    });

    // Send confirmation email with dashboard token (GAP FIX 1)
    try {
      await sendConfirmationEmail(
        contactEmail,
        title,
        job.id,
        editToken,
        dashboardToken // GAP FIX 1: Pass dashboard token
      );
    } catch (emailError) {
      console.error('Failed to send email:', emailError);
      // Don't fail the request if email fails
    }

    // Clean up any saved drafts for this email (GAP FIX 4)
    try {
      await prisma.jobDraft.deleteMany({
        where: { email: contactEmail },
      });
    } catch (draftError) {
      // Ignore - draft may not exist
      console.log('No draft to clean up');
    }

    // Return success response
    return NextResponse.json({
      success: true,
      jobId: job.id,
      editToken,
      dashboardToken,
    });
  } catch (error) {
    console.error('Free posting error:', error);
    return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });
  }
}

