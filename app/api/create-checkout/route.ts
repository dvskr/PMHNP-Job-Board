import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { createId } from '@paralleldrive/cuid2';
import { config, PricingTier } from '@/lib/config';
import { logger } from '@/lib/logger';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import {
  sanitizeJobPosting,
  sanitizeUrl,
  sanitizeEmail,
  sanitizeText,
  normalizeContentWhitespace,
} from '@/lib/sanitize';
import { createClient } from '@/lib/supabase/server';
import { normalizeSalary } from '@/lib/salary-normalizer';
import { formatDisplaySalary } from '@/lib/salary-display';
import { computeQualityScore } from '@/lib/utils/quality-score';
import { parseLocation } from '@/lib/location-parser';
import { summarizeForMeta } from '@/lib/description-cleaner';
import { normalizeExperienceFromInput } from '@/lib/experience-label';

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
  salaryPeriod?: string;
  salaryCompetitive?: boolean;
  description: string;
  applyUrl?: string;
  applyOnPlatform?: boolean;
  pricingTier?: PricingTier; // ignored — single tier, kept for backward compat
  benefits?: string[];
  setting?: string;
  population?: string;
  companyLogoUrl?: string;
  // Phase 1 experience picker — see lib/experience-label.ts.
  minYearsExperience?: number | null;
  maxYearsExperience?: number | null;
  newGradFriendly?: boolean;
  experienceQualifier?: string | null;
  screeningQuestions?: {
    text: string;
    type: string;
    options?: string[];
    required?: boolean;
    knockout?: boolean;
    knockoutAnswer?: string;
  }[];
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

    // Auth — paid posts still must be tied to an authenticated employer.
    let userId: string | null = null;
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }
      const profile = await prisma.userProfile.findUnique({
        where: { supabaseId: user.id },
      });
      if (!profile) {
        return NextResponse.json({ error: 'User profile not found' }, { status: 403 });
      }
      if (profile.role !== 'employer') {
        return NextResponse.json(
          { error: 'Only employer accounts can post jobs.' },
          { status: 403 }
        );
      }
      userId = user.id;
    } catch (authErr) {
      logger.warn('Failed to fetch user session in create-checkout', { error: authErr });
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    // Sanitize core fields
    const sanitized = sanitizeJobPosting({
      title: rawBody.title || '',
      employer: rawBody.companyName || '',
      location: rawBody.location || '',
      description: normalizeContentWhitespace(rawBody.description ?? ''),
      applyLink: rawBody.applyUrl || null,
      contactEmail: rawBody.contactEmail || '',
      mode: rawBody.mode,
      jobType: rawBody.jobType,
      companyWebsite: rawBody.companyWebsite,
      minSalary: rawBody.salaryMin ?? undefined,
      maxSalary: rawBody.salaryMax ?? undefined,
      salaryPeriod: rawBody.salaryPeriod,
    });

    const applyOnPlatform = !!rawBody.applyOnPlatform;

    // Validate required fields
    const missing: string[] = [];
    if (!sanitized.title.trim()) missing.push('title');
    if (!sanitized.employer.trim()) missing.push('company name');
    if (!sanitized.location.trim()) missing.push('location');
    if (!sanitized.mode) missing.push('work mode');
    if (!sanitized.jobType) missing.push('job type');
    if (!sanitized.description.trim()) missing.push('description');
    if (!sanitized.contactEmail) missing.push('contact email');
    if (!applyOnPlatform && !sanitized.applyLink) missing.push('apply URL');

    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(', ')}` },
        { status: 400 }
      );
    }

    // Single-tier: all paid posts are 'pro' internally, $199
    const pricing: PricingTier = 'pro';
    const price = config.stripePriceInCents;

    // Salary parsing + normalization
    const parsedMinSalary = (() => {
      const val = Number(sanitized.minSalary);
      return Number.isFinite(val) && !Number.isNaN(val) ? val : null;
    })();
    const parsedMaxSalary = (() => {
      const val = Number(sanitized.maxSalary);
      return Number.isFinite(val) && !Number.isNaN(val) ? val : null;
    })();
    const parsedSalaryPeriod = sanitized.salaryPeriod || (parsedMinSalary || parsedMaxSalary ? 'year' : null);

    const normalizedSalary = normalizeSalary({
      minSalary: parsedMinSalary,
      maxSalary: parsedMaxSalary,
      salaryPeriod: parsedSalaryPeriod,
      title: sanitized.title,
    });

    const displaySalary = formatDisplaySalary(
      normalizedSalary.normalizedMinSalary,
      normalizedSalary.normalizedMaxSalary,
      parsedSalaryPeriod
    );

    const qualityScore = computeQualityScore({
      applyLink: sanitized.applyLink,
      displaySalary,
      normalizedMinSalary: normalizedSalary.normalizedMinSalary,
      normalizedMaxSalary: normalizedSalary.normalizedMaxSalary,
      descriptionSummary: summarizeForMeta(sanitized.description),
      description: sanitized.description,
      city: null,
      state: null,
      isEmployerPosted: true,
    });

    const parsedLoc = parseLocation(sanitized.location);

    // Calculate expiry — paid duration (60 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + config.durationDays);

    // Generate unique tokens
    const editToken = crypto.randomBytes(32).toString('hex');
    const dashboardToken = createId();

    // Wrap Job + slug update + EmployerJob in one transaction so a partial
    // failure can't leave an orphan job row that the employer can never recover.
    const { job, employerJob } = await prisma.$transaction(async (tx) => {
      const created = await tx.job.create({
        data: {
          title: sanitized.title,
          employer: sanitized.employer,
          location: sanitized.location,
          jobType: sanitized.jobType || null,
          mode: sanitized.mode || null,
          description: sanitized.description,
          descriptionSummary: summarizeForMeta(sanitized.description),
          applyLink: applyOnPlatform ? null : sanitized.applyLink,
          applyOnPlatform,
          minSalary: parsedMinSalary,
          maxSalary: parsedMaxSalary,
          salaryPeriod: parsedSalaryPeriod,
          normalizedMinSalary: normalizedSalary.normalizedMinSalary,
          normalizedMaxSalary: normalizedSalary.normalizedMaxSalary,
          salaryIsEstimated: normalizedSalary.salaryIsEstimated,
          salaryConfidence: normalizedSalary.salaryConfidence,
          displaySalary,
          city: parsedLoc.city,
          state: parsedLoc.state,
          stateCode: parsedLoc.stateCode,
          isRemote: parsedLoc.isRemote,
          isHybrid: parsedLoc.isHybrid,
          isFeatured: config.isFeaturedTier(pricing),
          isPublished: false, // Will be flipped by webhook on successful payment
          sourceType: 'employer',
          expiresAt,
          qualityScore,
          benefits: Array.isArray(rawBody.benefits) ? rawBody.benefits : [],
          setting: rawBody.setting || null,
          population: rawBody.population || null,
          ...(() => {
            const sanitizedQualifier =
              typeof rawBody.experienceQualifier === 'string'
                ? sanitizeText(rawBody.experienceQualifier, 80) || null
                : null;
            return normalizeExperienceFromInput({
              minYearsExperience: rawBody.minYearsExperience,
              newGradFriendly: rawBody.newGradFriendly,
              experienceQualifier: sanitizedQualifier,
            });
          })(),
        },
      });

      const computedSlug = `${sanitized.title
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
          employerName: sanitized.employer,
          contactEmail: sanitized.contactEmail,
          companyWebsite: sanitized.companyWebsite || null,
          companyLogoUrl: rawBody.companyLogoUrl || null,
          jobId: created.id,
          editToken,
          dashboardToken,
          paymentStatus: 'pending',
          pricingTier: pricing,
          userId,
          // Anchor — paid posts don't consume free quota (the count query
          // filters paymentStatus='free'), but we still record the domain so
          // ownership reporting stays consistent.
          quotaDomain: sanitized.contactEmail.split('@')[1] || null,
        },
      });

      return { job: updatedJob, employerJob: ej };
    });

    // Persist screening questions (only for platform-apply jobs)
    if (applyOnPlatform && Array.isArray(rawBody.screeningQuestions)) {
      const questions = rawBody.screeningQuestions.slice(0, 5);
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (!q?.text || typeof q.text !== 'string') continue;

        const validTypes = ['boolean', 'text', 'select', 'number'];
        const qType = validTypes.includes(q.type) ? q.type : 'boolean';

        await prisma.jobScreeningQuestion.create({
          data: {
            jobId: job.id,
            questionText: sanitizeText(q.text, 200),
            questionType: qType,
            options: Array.isArray(q.options)
              ? q.options.map((o: string) => sanitizeText(String(o), 100)).slice(0, 10)
              : [],
            isRequired: !!q.required,
            isKnockout: !!q.knockout,
            knockoutAnswer: q.knockoutAnswer ? sanitizeText(String(q.knockoutAnswer), 100) : null,
            sortOrder: i,
          },
        });
      }
    }

    logger.info('Job created for paid checkout', { jobId: job.id, userId });

    // Create Stripe Checkout session with job ID and dashboard token in metadata
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Job Post: ${sanitized.title}`,
              description: `${sanitized.employer} - ${sanitized.location}`,
            },
            unit_amount: price,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: sanitized.contactEmail,
      // B2B polish — collect billing address + optional tax ID, generate
      // downloadable PDF invoice (one-time Checkout payments don't create
      // Invoice objects by default; this opts in).
      billing_address_collection: 'required',
      tax_id_collection: { enabled: true },
      // Force Stripe to send a receipt email regardless of the dashboard
      // "Successful payments" toggle. The toggle is gated behind live-account
      // activation, but `receipt_email` on the underlying PaymentIntent
      // bypasses it — works in sandbox immediately and stays correct in live.
      payment_intent_data: {
        receipt_email: sanitized.contactEmail,
      },
      invoice_creation: {
        enabled: true,
        invoice_data: {
          description: `Job Post: ${sanitized.title} — ${sanitized.employer} (${sanitized.location})`,
          metadata: {
            jobId: job.id,
            employerJobId: employerJob.id,
          },
          rendering_options: { amount_tax_display: 'exclude_tax' },
        },
      },
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

    // Bind this Stripe session to the originating browser via a httpOnly
    // cookie. /api/verify-checkout-session re-reads the cookie and only
    // returns the employer dashboardToken when the cookie matches the
    // session_id from the success-page query string. Without this binding
    // anyone who learned a session_id (browser history, referer logs)
    // could call verify and harvest the dashboard token.
    const response = NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });
    response.cookies.set('pmhnp_checkout_session', session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60, // 1 hour — covers the longest realistic checkout flow
    });
    return response;
  } catch (error) {
    logger.error('Error creating checkout session', error);
    // In dev, surface the underlying cause so we don't have to grep server logs.
    const isDev = process.env.NODE_ENV !== 'production';
    return NextResponse.json(
      {
        error: 'Failed to create checkout session',
        ...(isDev && { cause: error instanceof Error ? error.message : String(error) }),
      },
      { status: 500 }
    );
  }
}
