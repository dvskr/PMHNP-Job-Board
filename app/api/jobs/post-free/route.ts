import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { config, PricingTier } from '@/lib/config';
import { expiresFromNow } from '@/lib/expires-at';
import { sendConfirmationEmail } from '@/lib/email-service';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { sanitizeJobPosting, sanitizeUrl, sanitizeEmail, sanitizeText, normalizeContentWhitespace } from '@/lib/sanitize';
import { logger } from '@/lib/logger';
import { slugify } from '@/lib/utils';
import { pingAllSearchEngines } from '@/lib/search-indexing';
import { normalizeSalary } from '@/lib/salary-normalizer';
import { formatDisplaySalary } from '@/lib/salary-display';
import { computeQualityScore } from '@/lib/utils/quality-score';
import { parseLocation } from '@/lib/location-parser';
import { summarizeForMeta } from '@/lib/description-cleaner';
import { normalizeExperienceFromInput } from '@/lib/experience-label';

class FreeQuotaExceededError extends Error {
  constructor(public readonly usedCount: number) {
    super('Free post quota exceeded');
    this.name = 'FreeQuotaExceededError';
  }
}

export async function POST(request: NextRequest) {
  // Rate limiting - strict for job posting
  const rateLimitResult = await rateLimit(request, 'postJob', RATE_LIMITS.postJob);
  if (rateLimitResult) return rateLimitResult;

  try {
    // Free posting gate: check if this employer still has free posts remaining

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
      applyOnPlatform,
      contactEmail,
      minSalary,
      maxSalary,
      salaryPeriod,
      companyWebsite,
      pricing,
      benefits,
      setting,
      population,
      companyLogoUrl,
      minYearsExperience,
      maxYearsExperience,
      newGradFriendly,
      experienceQualifier,
    } = body;

    const missingFields = [];
    if (!title) missingFields.push('title');
    if (!employer) missingFields.push('company name');
    if (!location) missingFields.push('location');
    if (!mode) missingFields.push('work mode');
    if (!jobType) missingFields.push('job type');
    if (!description) missingFields.push('description');
    if (!applyOnPlatform && !applyLink) missingFields.push('apply URL');
    if (!contactEmail) missingFields.push('contact email');

    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missingFields.join(', ')}` },
        { status: 400 }
      );
    }

    // Sanitize all inputs
    const sanitized = sanitizeJobPosting({
      title,
      employer,
      location,
      // Strip non-breaking-space artefacts (Quill emits these when content
      // is pasted from Word) before sanitizing — otherwise the body shows
      // mid-word line breaks at render time and `descriptionSummary` gets
      // populated with literal `&nbsp;` markup.
      description: normalizeContentWhitespace(description ?? ''),
      applyLink,
      contactEmail,
      mode,
      jobType,
      companyWebsite,
      minSalary,
      maxSalary,
      salaryPeriod,
    });

    // ── Auth FIRST — the signup email is the canonical identity for the freebie quota.
    // Audit #26: previously the FREE_EMAIL_DOMAINS check + quota count both keyed off
    // the form-submitted contactEmail, which let an attacker submit each free post with
    // a different `bob@example<N>.com` and bypass the per-domain cap. Now we anchor
    // both checks to the signup email — what they typed in the form is just public
    // contact info and can't shift the quota or sneak past the spam block.
    let userId: string;
    let signupEmail: string;
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user || !user.email) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }

      const profile = await prisma.userProfile.findUnique({
        where: { supabaseId: user.id }
      });

      if (!profile) {
        return NextResponse.json({ error: 'User profile not found' }, { status: 403 });
      }

      if (profile.role !== 'employer') {
        return NextResponse.json(
          { error: 'Only employer accounts can post jobs. Please sign up as an employer.' },
          { status: 403 }
        );
      }

      userId = user.id;
      signupEmail = user.email;
    } catch (error) {
      logger.warn('Failed to fetch user session in post-free', { error });
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    // Block free email providers — keyed off SIGNUP email, not form input.
    const FREE_EMAIL_DOMAINS = [
      'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
      'aol.com', 'icloud.com', 'mail.com', 'protonmail.com',
      'ymail.com', 'live.com', 'msn.com', 'googlemail.com'
    ];

    const signupDomain = signupEmail.toLowerCase().split('@')[1];
    if (!signupDomain || FREE_EMAIL_DOMAINS.includes(signupDomain)) {
      return NextResponse.json(
        {
          error: 'Company email required',
          message: 'Free job posts require a company email account (not Gmail, Yahoo, etc.). Please sign up with your company email.'
        },
        { status: 400 }
      );
    }

    // Per-domain freebie quota anchored to an IMMUTABLE per-row snapshot
    // (EmployerJob.quotaDomain), not to mutable contactEmail or nullable userId.
    // Rule unchanged: 2 free posts per email domain, lifetime, shared across
    // every employee at that domain.
    //
    // Why the immutable snapshot:
    //   - Editing contactEmail later cannot shift the count (audit #23)
    //   - Account deletion / userId being nulled cannot drop the count
    //   - Form contactEmail can be anything (recruiter posting on behalf of a
    //     client, multi-brand orgs); the quota is keyed off who signed up
    //   - Hard-deleting the row is the only way to drop the count, and that's
    //     admin-only (audit #25 — separate concern)
    const quotaDomain = signupDomain;

    // Validate sanitized URL (only for external apply)
    if (!applyOnPlatform && !sanitized.applyLink) {
      return NextResponse.json(
        { error: 'Invalid apply link URL' },
        { status: 400 }
      );
    }

    // Generate unique tokens
    const editToken = crypto.randomBytes(32).toString('hex');
    const dashboardToken = crypto.randomBytes(32).toString('hex');

    // Free posts get the shorter trial duration (audit #30); paid posts use the
    // full duration via /api/create-checkout. Features are otherwise identical.
    // UTC math via expiresFromNow — setDate() drifted across DST boundaries.
    const tierForDuration: PricingTier = 'pro';
    const expiresAt = expiresFromNow(config.freeDurationDays);

    // Parse salary values
    let parsedMinSalary = (() => {
      const val = Number(sanitized.minSalary);
      return (Number.isFinite(val) && !Number.isNaN(val)) ? val : null;
    })();
    let parsedMaxSalary = (() => {
      const val = Number(sanitized.maxSalary);
      return (Number.isFinite(val) && !Number.isNaN(val)) ? val : null;
    })();
    // Phase 1 guard (2026-06-01): catalog audit found 1 employer-posted
    // row with min=$277,614 / max=$86 because the raw values were stored
    // without inversion check. Swap when reversed so downstream queries
    // (BETWEEN min AND max) work as expected. Pure swap is the right move
    // here — if either value is clearly wrong, the user fixes it via the
    // dashboard edit flow rather than us silently nulling their input.
    if (parsedMinSalary != null && parsedMaxSalary != null && parsedMinSalary > parsedMaxSalary) {
      [parsedMinSalary, parsedMaxSalary] = [parsedMaxSalary, parsedMinSalary];
    }
    const parsedSalaryPeriod = sanitized.salaryPeriod || null;
    // Server-side sanitize the free-text qualifier first, then hand the
    // pre-sanitized value to the structural normalizer. Caller is
    // authoritative — client-provided experienceLabel is ignored.
    const sanitizedQualifier = typeof experienceQualifier === 'string'
      ? sanitizeText(experienceQualifier, 80) || null
      : null;
    const experienceFields = normalizeExperienceFromInput({
      minYearsExperience,
      newGradFriendly,
      experienceQualifier: sanitizedQualifier,
    });

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

    // Compute quality score — employer-posted jobs get the employer bonus (+30)
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

    // Parse location into structured fields
    const parsedLoc = parseLocation(sanitized.location);

    // Audit #6 + #7: gate-check + writes wrapped in a single Serializable
    // transaction. Postgres aborts the second transaction if two requests
    // race past the count check. Atomicity also fixes the orphan-row risk
    // when the slug update or employerJob insert fails after the job insert.
    let job;
    try {
      job = await prisma.$transaction(async (tx) => {
        // Per-domain freebie quota — see comment block above. Counted from the
        // immutable EmployerJob.quotaDomain snapshot. Re-checked inside the
        // Serializable transaction so two parallel submitters at the same
        // domain can't both slip past.
        const existingPostCount = await tx.employerJob.count({
          where: {
            quotaDomain: quotaDomain,
            paymentStatus: 'free',
          },
        });

        if (existingPostCount >= config.freePostsPerEmail) {
          throw new FreeQuotaExceededError(existingPostCount);
        }

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
            applyOnPlatform: applyOnPlatform || false,
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
            // isFeatured reserved for a future premium tier ($299+). Regular
            // employer posts (free + paid $199) get top placement via the
            // EmployerJob relation now, not via this flag (see job-sort.ts).
            isFeatured: false,
            isPublished: true,
            isVerifiedEmployer: true,
            sourceType: 'employer',
            expiresAt,
            qualityScore,
            benefits: Array.isArray(benefits) ? benefits : [],
            setting: setting || null,
            population: population || null,
            minYearsExperience: experienceFields.minYearsExperience,
            maxYearsExperience: experienceFields.maxYearsExperience,
            newGradFriendly: experienceFields.newGradFriendly,
            experienceQualifier: experienceFields.experienceQualifier,
            experienceLabel: experienceFields.experienceLabel,
          },
        });

        // Use the shared slugify helper so this path and the ingestion path
        // can never drift on slug shape. slug is set here at insert and
        // intentionally NOT updated on subsequent employer edits — the
        // canonical URL stays stable even if the employer renames the job.
        const computedSlug = slugify(sanitized.title, created.id);

        const updated = await tx.job.update({
          where: { id: created.id },
          data: { slug: computedSlug },
        });

        await tx.employerJob.create({
          data: {
            employerName: sanitized.employer,
            contactEmail: sanitized.contactEmail,
            companyWebsite: sanitized.companyWebsite || null,
            companyLogoUrl: companyLogoUrl || null,
            jobId: created.id,
            editToken,
            dashboardToken,
            paymentStatus: 'free',
            pricingTier: 'pro',
            userId: userId,
            // Immutable quota anchor — never written by any update path
            quotaDomain: quotaDomain,
          },
        });

        return updated;
      }, { isolationLevel: 'Serializable' });
    } catch (txErr) {
      if (txErr instanceof FreeQuotaExceededError) {
        logger.info('Free post limit reached for domain', {
          domain: quotaDomain,
          userId,
          existingCount: txErr.usedCount,
          limit: config.freePostsPerEmail,
        });
        return NextResponse.json(
          {
            error: `Your organization (${quotaDomain}) has used all ${config.freePostsPerEmail} free posts. Additional posts cost $${config.postingPrice}.`,
            requiresPayment: true,
            freePostsUsed: txErr.usedCount,
            freePostsLimit: config.freePostsPerEmail,
          },
          { status: 403 }
        );
      }
      throw txErr;
    }

    const slug = job.slug!;

    // Create screening questions (if any, only for platform-apply jobs)
    if (applyOnPlatform && Array.isArray(body.screeningQuestions)) {
      const questions = body.screeningQuestions.slice(0, 5); // max 5 questions
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
            options: Array.isArray(q.options) ? q.options.map((o: string) => sanitizeText(String(o), 100)).slice(0, 10) : [],
            isRequired: !!q.required,
            isKnockout: !!q.knockout,
            knockoutAnswer: q.knockoutAnswer ? sanitizeText(String(q.knockoutAnswer), 100) : null,
            sortOrder: i,
          },
        });
      }
      logger.info('Screening questions created', { jobId: job.id, count: questions.length });
    }

    // Send confirmation email with dashboard token + free-post duration so
    // the email's "30-day listing" line matches the actual expiresAt written
    // to the DB (audit #30).
    try {
      await sendConfirmationEmail(
        sanitized.contactEmail,
        sanitized.title,
        job.id,
        dashboardToken,
        undefined,
        config.freeDurationDays,
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

    // Ping search engines for indexing (production only, fire-and-forget)
    const isProduction = process.env.VERCEL_ENV === 'production' || (process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_BASE_URL?.includes('localhost'));
    if (isProduction) {
      const jobUrl = `https://pmhnphiring.com/jobs/${slug}`;
      pingAllSearchEngines(jobUrl).catch((err) =>
        logger.error('[Post-Free] Background indexing ping failed', err)
      );
    } else {
      logger.info('[Post-Free] Skipping indexing ping (non-production environment)');
    }

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

