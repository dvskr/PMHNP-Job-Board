import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { createId } from '@paralleldrive/cuid2';
import { config, PricingTier } from '@/lib/config';
import { logger } from '@/lib/logger';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { sanitizeJobPosting, sanitizeUrl, sanitizeEmail } from '@/lib/sanitize';

// Lazy Stripe client — instantiated per-request so a missing STRIPE_SECRET_KEY
// surfaces as a clean 503 instead of crashing on module import.
function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

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
  pricingTier?: PricingTier; // ignored — single tier, kept for backward compat
}

export async function POST(request: NextRequest) {
  // Rate limiting (IP based) - strictly limit checkout creation to prevent spam
  const rateLimitResult = await rateLimit(request, 'checkout', RATE_LIMITS.postJob);
  if (rateLimitResult) return rateLimitResult;

  try {
    const stripe = getStripe();
    if (!stripe) {
      logger.error('Paid checkout attempted but STRIPE_SECRET_KEY is not configured', null);
      return NextResponse.json(
        { error: 'Paid checkout is currently unavailable' },
        { status: 503 }
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
      pricingTier: _pricing, // ignored in single-tier model
    } = body;

    // Validate and trim required string fields
    const trimmedEmployer = employer?.trim();
    const trimmedContactEmail = contactEmail?.trim();
    const trimmedTitle = title?.trim();
    const trimmedLocation = location?.trim();
    const trimmedDescription = description?.trim();
    const trimmedApplyLink = applyLink?.trim();

    if (!trimmedTitle || !trimmedEmployer || !trimmedLocation || !mode || !jobType || !trimmedDescription || !trimmedApplyLink || !trimmedContactEmail) {
      logger.warn('Validation failed. Missing required fields', {
        title: !!trimmedTitle,
        employer: !!trimmedEmployer,
        location: !!trimmedLocation,
        mode: !!mode,
        jobType: !!jobType,
        description: !!trimmedDescription,
        applyLink: !!trimmedApplyLink,
        contactEmail: !!trimmedContactEmail,
      });
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Single-tier: all paid posts are 'pro' internally, $199
    const pricing: PricingTier = 'pro';
    const price = config.stripePriceInCents;

    // DUPLICATE CHECK
    // Check for existing active jobs for this employer
    const existingEmployerJobs = await prisma.employerJob.findMany({
      where: {
        contactEmail: trimmedContactEmail,
      },
      include: {
        job: true,
      },
    });

    const normalizedTitle = trimmedTitle.toLowerCase();
    const normalizedLocation = trimmedLocation.toLowerCase();
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

    // Determine salary period (default to year for annual salaries)
    const salaryPeriod = (salaryMin || salaryMax) && !salaryCompetitive ? 'year' : null;

    // Calculate expiry date — all posts get same duration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + config.durationDays);

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

    // Audit #7: wrap the three writes in a single transaction so a slug-update
    // or employerJob-create failure can't leave an orphan job row that the
    // employer can never recover.
    const { job, employerJob } = await prisma.$transaction(async (tx) => {
      const created = await tx.job.create({
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
          isFeatured: config.isFeaturedTier(pricing),
          isPublished: false, // Will be published after payment
          sourceType: 'employer',
          expiresAt,
        },
      });

      const computedSlug = `${trimmedTitle
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim()}-${created.id}`;

      const updatedJob = await tx.job.update({
        where: { id: created.id },
        data: { slug: computedSlug },
      });

      const ej = await tx.employerJob.create({
        data: {
          employerName: trimmedEmployer,
          contactEmail: trimmedContactEmail,
          companyWebsite: companyWebsite?.trim() || null,
          jobId: created.id,
          editToken,
          dashboardToken,
          paymentStatus: 'pending',
          pricingTier: pricing,
        },
      });

      return { job: updatedJob, employerJob: ej };
    });

    logger.info('Job created successfully', { jobId: job.id });

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

    if (!session.url) {
      logger.error('Stripe returned a checkout session without a URL', null, { sessionId: session.id });
      return NextResponse.json(
        { error: 'Checkout session created but URL is missing' },
        { status: 502 }
      );
    }

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
