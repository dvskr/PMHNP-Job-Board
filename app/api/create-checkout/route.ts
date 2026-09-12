import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { createId } from '@paralleldrive/cuid2';
import { config, PricingTier, PostPriceKind } from '@/lib/config';
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
import { buildQuotaKeys, domainFromEmail } from '@/lib/employer-quota';

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
    let signupEmail: string | null = null;
    // Write-once organization name from the profile (see lib/employer-quota.ts).
    let lockedCompanyName: string | null = null;
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
      signupEmail = user.email ?? null;
      lockedCompanyName = profile.company?.trim() || null;
    } catch (authErr) {
      logger.warn('Failed to fetch user session in create-checkout', { error: authErr });
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    // FIRST-POST DISCOUNT GATE. Every post is paid now, so this decides the
    // PRICE and nothing else: a collision removes the half-price entry, it can
    // never refuse the post. That distinction is the whole safety story here.
    // The old free gate could be turned into a denial-of-service if its keys
    // were poisonable; this one can at worst cost someone a discount, and the
    // keys are still session-proven so even that is not reachable from the
    // form (see lib/employer-quota.ts).
    //
    // Same predicate as the retired free gate, with two deliberate changes:
    //   - It is no longer skipped for consumer signup domains. A solo
    //     practitioner on a consumer mailbox pays like anyone else and earns
    //     the same discount, gated per-account by the acct: key.
    //   - 'pending' rows are excluded. Those are abandoned checkouts, never
    //     live postings, so an employer who backs out of Stripe and returns
    //     must not find their discount already spent. That exclusion is also
    //     why the gate expires this identity's earlier open sessions before
    //     counting: see the block below.
    //
    // Fails toward the DISCOUNT on lookup errors. Overcharging someone for the
    // half-price post they were promised is the failure this route exists to
    // avoid; the reverse costs one discount on a rare DB hiccup.
    let isFirstPost = true;
    try {
      const signupDomain = domainFromEmail(signupEmail);
      const identity = {
        OR: [
          { quotaKeys: { hasSome: buildQuotaKeys({ userId, signupEmail, lockedCompanyName }) } },
          // Legacy rows predating quotaKeys carry only this column.
          ...(signupDomain ? [{ quotaDomain: signupDomain }] : []),
        ],
      };

      // Collapse this identity's open checkouts down to the one we are about
      // to create. Every POST mints a fresh pending row plus a Checkout
      // session, Stripe sessions do not expire on their own, and pending rows
      // are excluded from the count below by design. Left alone that turns the
      // Back button, or a handful of tabs, into several simultaneously payable
      // half-price sessions, each of which publishes a discounted post.
      // Expiring the older ones first means only the checkout the employer
      // actually finishes can ever become a posting.
      const openCheckouts = await prisma.employerJob.findMany({
        where: {
          paymentStatus: 'pending',
          stripeSessionId: { not: null },
          ...identity,
        },
        select: { id: true, stripeSessionId: true },
      });
      for (const open of openCheckouts) {
        if (!open.stripeSessionId) continue;
        try {
          await stripe.checkout.sessions.expire(open.stripeSessionId);
        } catch (expireErr) {
          // Stripe refuses to expire a session that is already completed or
          // already expired, and both outcomes are fine. A completed session
          // has a webhook that lifts its row out of 'pending', so the count
          // below sees it and this post is priced as a standard one.
          logger.debug('Could not expire an earlier checkout session', {
            employerJobId: open.id,
            error: expireErr instanceof Error ? expireErr.message : String(expireErr),
          });
        }
      }

      const priorPosts = await prisma.employerJob.count({
        where: {
          paymentStatus: { not: 'pending' },
          ...identity,
        },
      });
      isFirstPost = priorPosts < config.discountedPostsPerEmployer;
    } catch (priceErr) {
      logger.warn('First-post lookup failed in create-checkout; charging the discounted price', {
        error: priceErr,
      });
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

    // Single-tier: all posts are 'pro' internally. Only the price varies.
    const pricing: PricingTier = 'pro';
    // Not const: losing the race for the discount hold below downgrades this
    // post to standard price, and the line item must follow.
    let priceKind: PostPriceKind = isFirstPost ? 'first' : 'standard';
    let price = config.priceInCentsFor(priceKind);

    // Salary parsing + normalization
    const rawMinSalary = (() => {
      const val = Number(sanitized.minSalary);
      return Number.isFinite(val) && !Number.isNaN(val) ? val : null;
    })();
    const rawMaxSalary = (() => {
      const val = Number(sanitized.maxSalary);
      return Number.isFinite(val) && !Number.isNaN(val) ? val : null;
    })();
    // A transposed range is an easy thing to type and it reaches the reader
    // raw: normalizeSalary swaps its own normalized pair internally, but the
    // minSalary/maxSalary columns written below are what the job card, the
    // salary filter and the JSON-LD read, so a $200k to $150k posting sorted
    // and filtered as if it paid $200k at the bottom. Order them here, once,
    // before anything downstream sees them.
    const transposed = rawMinSalary !== null && rawMaxSalary !== null && rawMinSalary > rawMaxSalary;
    const parsedMinSalary = transposed ? rawMaxSalary : rawMinSalary;
    const parsedMaxSalary = transposed ? rawMinSalary : rawMaxSalary;
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

    const parsedLoc = parseLocation(sanitized.location);

    // parsedLoc is computed before the score, not after it: passing city and
    // state as null scored every employer posting as if it had no location,
    // docking the one signal the employer always supplies.
    const qualityScore = computeQualityScore({
      applyLink: sanitized.applyLink,
      displaySalary,
      normalizedMinSalary: normalizedSalary.normalizedMinSalary,
      normalizedMaxSalary: normalizedSalary.normalizedMaxSalary,
      descriptionSummary: summarizeForMeta(sanitized.description),
      description: sanitized.description,
      city: parsedLoc.city,
      state: parsedLoc.state,
      isEmployerPosted: true,
    });

    // Calculate expiry — paid duration (60 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + config.durationDays);

    // Generate unique tokens
    const editToken = crypto.randomBytes(32).toString('hex');
    const dashboardToken = createId();

    // The discount claim this row will try to take. The count above is a read
    // and this is the write that acts on it, so two simultaneous requests can
    // both read "no prior posts"; the UNIQUE index on discountHoldKey is what
    // makes only one of them able to act on it. Keyed on the account rather
    // than the domain or the organization because a unique column holds one
    // value and the account is the identity a second tab shares.
    let discountHoldKey = isFirstPost && userId ? `acct:${userId.toLowerCase()}` : null;

    // Wrap Job + slug update + EmployerJob in one transaction so a partial
    // failure can't leave an orphan job row that the employer can never recover.
    const createPosting = () => prisma.$transaction(async (tx) => {
      const created = await tx.job.create({
        data: {
          title: sanitized.title,
          // Account's locked organization name wins over the form value.
          employer: lockedCompanyName || sanitized.employer,
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
          // Featured badge promise (2026-08 audit fact 7): stays FALSE while
          // the post is a pending unpaid draft, then the Stripe webhook flips
          // it to true alongside isPublished on successful payment. Do NOT
          // set it here: the employer messaging gate
          // (app/api/employer/messages/route.ts) checks only isFeatured +
          // ownership — no isPublished — so featuring an unpaid pending row
          // would unlock InMail outreach for a post that was never paid for.
          // Top placement comes from the EmployerJob relation
          // (lib/utils/job-sort.ts), not this flag.
          isFeatured: false,
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
          employerName: lockedCompanyName || sanitized.employer,
          contactEmail: sanitized.contactEmail,
          companyWebsite: sanitized.companyWebsite || null,
          companyLogoUrl: rawBody.companyLogoUrl || null,
          jobId: created.id,
          editToken,
          dashboardToken,
          paymentStatus: 'pending',
          pricingTier: pricing,
          userId,
          // Discount anchors. This row is what makes the NEXT post standard
          // price once the webhook lifts it out of 'pending', so both columns
          // must be written here and never rewritten by an update path.
          // BOTH derive from the SESSION. quotaDomain previously snapshotted
          // the form-typed contact email, which meant the same column carried
          // two different identity semantics depending on writer, and since
          // quotaDomain is a live OR-arm in the discount predicate a
          // form-typed rival domain would have been able to spend that
          // rival's discount. Nothing form-typed may ever reach an identity
          // column.
          quotaDomain: domainFromEmail(signupEmail),
          quotaKeys: buildQuotaKeys({ userId, signupEmail, lockedCompanyName }),
          discountHoldKey,
        },
      });

      return { job: updatedJob, employerJob: ej };
    });

    /**
     * Resolve a lost race for the discount claim.
     *
     * Someone already holds this account's hold. Who they are decides what we
     * do, and both answers are correct rather than one being a fallback:
     *
     *   still pending  a checkout this employer opened and did not finish
     *                  (another tab, the Back button). Expire its session so
     *                  it can never be paid, release the hold, and take it.
     *                  This is what keeps abandoning a checkout from costing
     *                  the employer the discount they were promised.
     *   anything else  they have already PAID for their discounted post. This
     *                  one is a standard post, which is the same answer the
     *                  count would have given had it not raced.
     *
     * Returns true when the caller should retry the insert.
     */
    const yieldDiscountHold = async (holdKey: string): Promise<boolean> => {
      const holder = await prisma.employerJob.findUnique({
        where: { discountHoldKey: holdKey },
        select: { id: true, paymentStatus: true, stripeSessionId: true },
      });

      if (!holder) return true; // Released between the conflict and this read.

      if (holder.paymentStatus !== 'pending') {
        logger.info('First-post discount already spent, pricing this post as standard', {
          holdKey, holderId: holder.id,
        });
        return false;
      }

      if (holder.stripeSessionId) {
        try {
          await stripe.checkout.sessions.expire(holder.stripeSessionId);
        } catch (expireErr) {
          // Already completed or already expired. A completed session has a
          // webhook that lifts the row out of 'pending', and the re-read below
          // will then price this post as standard.
          logger.debug('Could not expire the checkout session holding the discount', {
            holderId: holder.id,
            error: expireErr instanceof Error ? expireErr.message : String(expireErr),
          });
        }
      }

      // Only release a hold still attached to an unpaid checkout. The
      // condition re-checks paymentStatus so a webhook that landed while we
      // were talking to Stripe wins, and this post falls back to standard.
      const released = await prisma.employerJob.updateMany({
        where: { id: holder.id, paymentStatus: 'pending', discountHoldKey: holdKey },
        data: { discountHoldKey: null },
      });
      return released.count > 0;
    };

    let job: Awaited<ReturnType<typeof createPosting>>['job'];
    let employerJob: Awaited<ReturnType<typeof createPosting>>['employerJob'];
    try {
      ({ job, employerJob } = await createPosting());
    } catch (createErr) {
      const conflictedOnHold =
        discountHoldKey !== null &&
        (createErr as { code?: string })?.code === 'P2002' &&
        JSON.stringify((createErr as { meta?: unknown })?.meta ?? '').includes('discount_hold_key');
      if (!conflictedOnHold) throw createErr;

      // Exactly one retry. Either we took the hold over or this post is
      // standard priced; both are terminal, so a loop would only spin.
      const tookOver = await yieldDiscountHold(discountHoldKey!);
      if (!tookOver) {
        isFirstPost = false;
        priceKind = 'standard';
        price = config.priceInCentsFor(priceKind);
        discountHoldKey = null;
      }
      ({ job, employerJob } = await createPosting());
    }

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

    logger.info('Job created for paid checkout', { jobId: job.id, userId, priceKind });

    // Create Stripe Checkout session with job ID and dashboard token in metadata
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              // The name has to say WHICH price is being charged: it is the
              // line the buyer reads on the Stripe page and on the receipt,
              // and "Job Post" alone left a $149 and a $299 charge looking
              // identical in their records.
              name: isFirstPost
                ? `First Job Post, ${config.firstPostDiscountPercent()}% off: ${sanitized.title}`
                : `Job Post: ${sanitized.title}`,
              description: `${sanitized.employer}, ${sanitized.location}. Runs ${config.durationDays} days.`,
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
          description: `Job Post: ${sanitized.title}, ${sanitized.employer} (${sanitized.location}).`,
          metadata: {
            jobId: job.id,
            employerJobId: employerJob.id,
            priceKind,
          },
          rendering_options: { amount_tax_display: 'exclude_tax' },
        },
      },
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/post-job`,
      metadata: {
        jobId: job.id,
        pricing,
        // Which price this session was created at. The webhook reads it as the
        // fallback amount when Stripe omits amount_total, so the JobCharge
        // ledger cannot record a first post at the standard price.
        priceKind,
        dashboardToken: employerJob.dashboardToken,
      },
    });

    // Bind the session to the pending row immediately. This is what the
    // discount gate reads on the employer's next attempt, so a row without it
    // is an open half-price session nothing can close.
    try {
      await prisma.employerJob.update({
        where: { id: employerJob.id },
        data: { stripeSessionId: session.id },
      });
    } catch (linkErr) {
      logger.error('Failed to record the checkout session on the employer job row', linkErr, {
        employerJobId: employerJob.id,
      });
      // Not fatal: the employer still gets their checkout. Worst case this one
      // session cannot be expired by a later attempt.
    }

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
