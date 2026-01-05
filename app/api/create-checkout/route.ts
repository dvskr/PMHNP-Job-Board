import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { createId } from '@paralleldrive/cuid2';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { sanitizeJobPosting, sanitizeUrl, sanitizeEmail } from '@/lib/sanitize';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

interface CheckoutRequestBody {
  title: string;
  companyName: string;
  companyWebsite?: string;
  contactEmail: string;
  location: string;
  mode: string;
  jobType: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCompetitive?: boolean;
  description: string;
  applyUrl: string;
  pricingTier: 'standard' | 'featured';
}

export async function POST(request: NextRequest) {
  // Rate limiting (IP based) - strictly limit checkout creation to prevent spam
  const rateLimitResult = await rateLimit(request, 'checkout', RATE_LIMITS.postJob);
  if (rateLimitResult) return rateLimitResult;

  try {
    // Block in free mode - users should use /api/jobs/post-free instead
    if (!config.isPaidPostingEnabled) {
      return NextResponse.json(
        {
          error: 'Paid posting is currently disabled. Job postings are free during our launch period.',
          redirect: '/post-job'
        },
        { status: 403 }
      );
    }

    const rawBody: CheckoutRequestBody = await request.json();

    // Sanitize inputs
    const body = {
      ...rawBody,
      title: sanitizeJobPosting({ ...rawBody, title: rawBody.title || '' } as any).title,
      companyName: sanitizeJobPosting({ ...rawBody, employer: rawBody.companyName || '' } as any).employer,
      companyWebsite: rawBody.companyWebsite ? sanitizeUrl(rawBody.companyWebsite) : undefined,
      contactEmail: sanitizeEmail(rawBody.contactEmail || ''),
      location: sanitizeJobPosting({ ...rawBody, location: rawBody.location || '' } as any).location,
      description: sanitizeJobPosting({ ...rawBody, description: rawBody.description || '' } as any).description,
      applyUrl: sanitizeUrl(rawBody.applyUrl || ''),
    };

    // Validate required fields
    const {
      title,
      companyName: employer,
      companyWebsite,
      contactEmail,
      location,
      mode,
      jobType,
      salaryMin,
      salaryMax,
      salaryCompetitive,
      description,
      applyUrl: applyLink,
      pricingTier: pricing,
    } = body;

    // Validate and trim required string fields
    const trimmedEmployer = employer?.trim();
    const trimmedContactEmail = contactEmail?.trim();
    const trimmedTitle = title?.trim();
    const trimmedLocation = location?.trim();
    const trimmedDescription = description?.trim();
    const trimmedApplyLink = applyLink?.trim();

    if (!trimmedTitle || !trimmedEmployer || !trimmedLocation || !mode || !jobType || !trimmedDescription || !trimmedApplyLink || !trimmedContactEmail || !pricing) {
      logger.warn('Validation failed. Missing required fields', {
        title: !!trimmedTitle,
        employer: !!trimmedEmployer,
        location: !!trimmedLocation,
        mode: !!mode,
        jobType: !!jobType,
        description: !!trimmedDescription,
        applyLink: !!trimmedApplyLink,
        contactEmail: !!trimmedContactEmail,
        pricing: !!pricing,
      });
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Calculate price in cents
    let price: number;
    if (pricing === 'standard') {
      price = 9900; // $99
    } else if (pricing === 'featured') {
      price = 19900; // $199
    } else {
      return NextResponse.json(
        { error: 'Invalid pricing tier' },
        { status: 400 }
      );
    }

    // Determine salary period (default to year for annual salaries)
    const salaryPeriod = (salaryMin || salaryMax) && !salaryCompetitive ? 'year' : null;

    // Calculate expiry date based on pricing tier
    const expiresAt = new Date();
    if (pricing === 'featured') {
      expiresAt.setDate(expiresAt.getDate() + 60); // 60 days for featured
    } else {
      expiresAt.setDate(expiresAt.getDate() + 30); // 30 days for standard
    }

    // Generate unique edit token and dashboard token
    const editToken = crypto.randomBytes(32).toString('hex');
    const dashboardToken = createId();

    // Log the data we're about to use
    // Log the data we're about to use
    logger.info('Creating job for checkout', {
      employer: trimmedEmployer,
      contactEmail: trimmedContactEmail,
      pricing,
    });

    // Create job in database first (unpublished, pending payment)
    const job = await prisma.job.create({
      data: {
        title: trimmedTitle,
        employer: trimmedEmployer,
        location: trimmedLocation,
        jobType,
        mode,
        description: trimmedDescription,
        descriptionSummary: trimmedDescription.slice(0, 300),
        applyLink: trimmedApplyLink,
        minSalary: salaryMin ? Math.round(salaryMin) : null,
        maxSalary: salaryMax ? Math.round(salaryMax) : null,
        salaryPeriod,
        isFeatured: pricing === 'featured',
        isPublished: false, // Will be published after payment
        sourceType: 'employer',
        expiresAt,
      },
    });

    logger.info('Job created successfully', { jobId: job.id });

    // Generate and update slug
    const slug = `${trimmedTitle
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
    const employerJobData = {
      employerName: trimmedEmployer,
      contactEmail: trimmedContactEmail,
      companyWebsite: companyWebsite?.trim() || null,
      jobId: job.id,
      editToken,
      dashboardToken,
      paymentStatus: 'pending',
    };

    logger.debug('Creating employer job record', { jobId: job.id, email: trimmedContactEmail });

    const employerJob = await prisma.employerJob.create({
      data: employerJobData,
    });

    // Create Stripe Checkout session with job ID and dashboard token in metadata
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Job Post: ${trimmedTitle}`,
              description: `${trimmedEmployer} - ${trimmedLocation}`,
            },
            unit_amount: price,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/post-job`,
      metadata: {
        jobId: job.id,
        pricing,
        dashboardToken: employerJob.dashboardToken,
      },
    });

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    logger.error('Error creating checkout session', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
