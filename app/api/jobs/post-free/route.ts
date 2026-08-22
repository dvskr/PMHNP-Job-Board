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
import { inngest } from '@/lib/inngest/client';
import { parseLocation } from '@/lib/location-parser';
import { extractEligibleStates } from '@/lib/eligible-states';
import { STATE_NAME_TO_CODE } from '@/lib/us-states';
import { summarizeForMeta } from '@/lib/description-cleaner';
import { buildQuotaKeys, describeQuotaKey, rawDomainFromEmail, FREE_EMAIL_DOMAINS } from '@/lib/employer-quota';
import { normalizeExperienceFromInput } from '@/lib/experience-label';

class FreeQuotaExceededError extends Error {
  constructor(
    public readonly usedCount: number,
    /** Which identity key matched, so the refusal is diagnosable in support. */
    public readonly matchedKey: string | null = null,
  ) {
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
    // Write-once organization name from the profile. Authoritative for the
    // listing and for the org quota key; never taken from the request body.
    let lockedCompanyName: string | null = null;
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
      lockedCompanyName = profile.company?.trim() || null;
    } catch (error) {
      logger.warn('Failed to fetch user session in post-free', { error });
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    // Block free email providers — keyed off SIGNUP email, not form input.
    // The list AND the derivation live in lib/employer-quota.ts so this
    // check, the preview endpoint, the checkout guard, and the key builder
    // can never diverge (a local copy here had drifted to 12 entries against
    // the library's 20, and a raw split('@')[1] let "x@gmail.com." sail past
    // the exact-match blocklist).
    const signupDomain = rawDomainFromEmail(signupEmail);
    if (!signupDomain || FREE_EMAIL_DOMAINS.includes(signupDomain)) {
      return NextResponse.json(
        {
          error: 'Company email required',
          message: 'Free job posts require a company email account (not Gmail, Yahoo, etc.). Please sign up with your company email.'
        },
        { status: 400 }
      );
    }

    // Legacy anchor, still written and still counted. Rows created before
    // quotaKeys existed only have this column, so the gate below ORs the two
    // together rather than replacing one with the other.
    //
    // It is an IMMUTABLE per-row snapshot rather than a live lookup because:
    //   - Editing contactEmail later cannot shift the count (audit #23)
    //   - Form contactEmail can be anything (recruiter posting on behalf of a
    //     client, multi-brand orgs); the quota is keyed off who signed up
    //   - Hard-deleting the row is the only way to drop the count, and that is
    //     admin-only and now refused while a free post is anchored to it
    //
    // Snapshotting alone was not enough: the DERIVATION was mutable. Support
    // changed one account's address and the domain changed with it, minting a
    // fresh key and a second free post. quotaKeys below closes that.
    const quotaDomain = signupDomain;

    // Quota identity. SESSION-VERIFIED signals only: the account id (so an
    // email change can no longer reset the freebie, which is the leak this
    // fixes) and the signup domain (the original per-company rule). Form
    // fields are deliberately excluded — being attacker controlled, they would
    // let one poster burn a rival's free post, and shared ATS/site-builder
    // domains would refuse unrelated clinics. See lib/employer-quota.ts.
    const quotaKeys = buildQuotaKeys({ userId, signupEmail, lockedCompanyName });

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

    // Fully-remote posts: extract any candidate-facing state restriction
    // from the description (same rule as the ingest normalizer) so the
    // eligibility-aware search never reads a restricted post as nationwide.
    const eligibleStateCodes = parsedLoc.isRemote && !parsedLoc.isHybrid
      ? extractEligibleStates(sanitized.description)
          .map((name) => STATE_NAME_TO_CODE[name])
          .filter((code): code is string => !!code)
      : [];

    // Audit #6 + #7: gate-check + writes wrapped in a single Serializable
    // transaction. Postgres aborts the second transaction if two requests
    // race past the count check. Atomicity also fixes the orphan-row risk
    // when the slug update or employerJob insert fails after the job insert.
    let job;
    try {
      job = await prisma.$transaction(async (tx) => {
        // Freebie gate — see comment block above. Re-checked inside the
        // Serializable transaction so two parallel submitters can't both
        // slip past the count.
        // quotaKeys carries exactly two SESSION-VERIFIED keys (account id +
        // signup domain; see lib/employer-quota.ts). The domain alone was
        // defeatable: derived from the CURRENT account email, so changing
        // that email's domain minted a second free post (seen in prod). The
        // acct: key survives email changes. The legacy quotaDomain arm keeps
        // pre-quotaKeys rows counting.
        // Fetch rather than count so the matching key can be reported: a bare
        // count made every refusal blame quotaDomain even when the account key
        // was the real match, leaving support unable to explain the block.
        const priorFree = await tx.employerJob.findMany({
          where: {
            paymentStatus: 'free',
            OR: [
              { quotaKeys: { hasSome: quotaKeys } },
              // Legacy rows predating quotaKeys still hold their domain claim.
              { quotaDomain: quotaDomain },
            ],
          },
          select: { quotaKeys: true, quotaDomain: true },
          take: config.freePostsPerEmail + 1,
        });

        if (priorFree.length >= config.freePostsPerEmail) {
          const hit = priorFree.find((r) => r.quotaKeys.some((k) => quotaKeys.includes(k)));
          const matchedKey = hit
            ? hit.quotaKeys.find((k) => quotaKeys.includes(k)) ?? null
            : `dom:${quotaDomain}`;
          throw new FreeQuotaExceededError(priorFree.length, matchedKey);
        }

        const created = await tx.job.create({
          data: {
            title: sanitized.title,
            // Account's locked organization name wins over anything typed in
            // this request, so one account cannot publish under many identities.
            employer: lockedCompanyName || sanitized.employer,
            location: sanitized.location,
            jobType: sanitized.jobType || null,
            // Employer form offers a single schedule; mirror it into the
            // multi-schedule array so JSON-LD / Role Snapshot readers see
            // one consistent source.
            jobTypes: sanitized.jobType ? [sanitized.jobType] : [],
            eligibleStateCodes,
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
            // Featured badge promise (2026-08 audit fact 7): every employer
            // post is featured — /pricing sells the badge on free AND paid
            // posts ("Same features — Featured badge, top placement...") and
            // config.isFeaturedTier returns true for all tiers. Free posts
            // publish immediately, so the flag flips here at creation. The
            // messaging + candidate-unlock gates (app/api/employer/messages,
            // app/api/employer/candidates/[id]) key on this flag; ordering
            // does NOT (top placement comes from the EmployerJob relation,
            // see lib/utils/job-sort.ts).
            isFeatured: config.isFeaturedTier('pro'),
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
            employerName: lockedCompanyName || sanitized.employer,
            contactEmail: sanitized.contactEmail,
            companyWebsite: sanitized.companyWebsite || null,
            companyLogoUrl: companyLogoUrl || null,
            jobId: created.id,
            editToken,
            dashboardToken,
            paymentStatus: 'free',
            pricingTier: 'pro',
            userId: userId,
            // Immutable quota anchors — never written by any update path
            quotaDomain: quotaDomain,
            quotaKeys: quotaKeys,
          },
        });

        return updated;
      }, { isolationLevel: 'Serializable' });
    } catch (txErr) {
      if (txErr instanceof FreeQuotaExceededError) {
        logger.info('Free post limit reached', {
          domain: quotaDomain,
          userId,
          // Which signal actually matched. Without this every refusal read as
          // a domain match and support could not explain or override it.
          matchedKey: txErr.matchedKey,
          existingCount: txErr.usedCount,
          limit: config.freePostsPerEmail,
        });
        return NextResponse.json(
          {
            // Describe the real reason rather than asserting a domain match
            // that may be false (an account-key match is the common case after
            // an email change).
            error: `${describeQuotaKey(txErr.matchedKey ?? '')} has already used its free post. Additional posts cost $${config.postingPrice}.`
              .replace(/^this account/, 'This account')
              .replace(/^the domain/, 'The domain'),
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

    // C1 fix (2026-06-01): emit embedding refresh so this new posting
    // surfaces in AI search + candidate-recommendation streams. The
    // Inngest 30s throttle dedupes any race with a near-simultaneous
    // admin edit. Inngest no-ops silently if INNGEST_EVENT_KEY is unset.
    inngest.send({
      name: 'embedding.refresh.job',
      data: { jobId: job.id },
    }).catch((err) => {
      logger.warn('inngest.send embedding.refresh.job failed (post-free)', undefined, err);
    });

    // Distribution audit A4: instant alert fan-out — matches this employer
    // post against active confirmed job alerts and sends a single-job alert
    // email that replaces the recipient's daily digest for the day
    // (handler: lib/inngest/functions/employer-published.ts).
    inngest.send({
      name: 'job/employer.published',
      data: { jobId: job.id },
    }).catch((err) => {
      logger.warn('inngest.send job/employer.published failed (post-free)', undefined, err);
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

