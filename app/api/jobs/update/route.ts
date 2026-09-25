import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { sanitizeJobPosting, sanitizeUrl, sanitizeText, normalizeContentWhitespace } from '@/lib/sanitize';
import { summarizeForMeta } from '@/lib/description-cleaner';
import { parseLocation } from '@/lib/location-parser';
import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { isEditTokenWindowOpen, EDIT_TOKEN_CLOSED_MESSAGE } from '@/lib/auth/edit-token-window';
import { inngest } from '@/lib/inngest/client';
import { pingAllSearchEngines, jobIndexUrl } from '@/lib/search-indexing';
import { slugify } from '@/lib/utils';
import { normalizeSalary } from '@/lib/salary-normalizer';
import { formatDisplaySalary } from '@/lib/salary-display';
import { collectJobTypes } from '@/lib/job-normalizer';
import { extractEligibleStates } from '@/lib/eligible-states';
import { STATE_NAME_TO_CODE } from '@/lib/us-states';

interface ScreeningQuestionInput {
  text: string;
  type: string;
  options?: string[];
  required?: boolean;
  knockout?: boolean;
  knockoutAnswer?: string;
}

interface UpdateJobData {
  title: string;
  location: string;
  mode: string;
  jobType: string;
  description: string;
  applyLink: string | null;
  minSalary?: number | null;
  maxSalary?: number | null;
  salaryPeriod?: string | null;
  companyWebsite?: string | null;
  // contactEmail is deliberately NOT here. It is the ownership key for legacy
  // `userId: null` EmployerJob rows — ~20 employer routes resolve access with
  // `{ userId: null, contactEmail: user.email }` — so letting a bearer token
  // rewrite it turns a forwarded edit link into an account-takeover primitive:
  // repoint the address, sign up under it, inherit the posting's applicants.
  // It was also the free-post quota key that docs/pricing-audit.md flagged.
  // Contact-email changes belong on the authenticated /api/employer/settings
  // path, where the current owner proves they hold the old address.

  // New editable fields — mirror the post-job inputs
  applyOnPlatform?: boolean;
  benefits?: string[];
  setting?: string | null;
  population?: string | null;
  companyLogoUrl?: string | null;
  screeningQuestions?: ScreeningQuestionInput[];
}

interface UpdateRequestBody {
  token: string;
  jobData: UpdateJobData;
}

export async function POST(request: NextRequest) {
    // Rate limiting
    const rateLimitResult = await rateLimit(request, 'jobs-update', RATE_LIMITS.general);
    if (rateLimitResult) return rateLimitResult;

  try {
    const body: UpdateRequestBody = await request.json();
    const { token, jobData: rawBodyJobData } = body;

    // Drop the identity field at the door rather than further down: an older
    // client (or a hand-rolled request) still sends contactEmail, and nothing
    // on a bearer-token path may rewrite the column that grants ownership of
    // legacy postings. See UpdateJobData.
    const { contactEmail: _rejectedContactEmail, ...rawJobData } =
      (rawBodyJobData ?? {}) as UpdateJobData & { contactEmail?: unknown };

    // Sanitize job data. Description is whitespace-normalized first so Quill-
    // emitted &nbsp; / U+00A0 between words doesn't make the body line-break
    // mid-character at render time (root cause reported by employers).
    const normalizedRawJobData = {
      ...rawJobData,
      description: normalizeContentWhitespace(rawJobData.description ?? ''),
    };
    const jobData = {
      ...normalizedRawJobData,
      title: sanitizeJobPosting({ ...normalizedRawJobData, employer: '' } as any).title,
      location: sanitizeJobPosting({ ...normalizedRawJobData, employer: '' } as any).location,
      description: sanitizeJobPosting({ ...normalizedRawJobData, employer: '' } as any).description,
      applyLink: rawJobData.applyLink ? sanitizeUrl(rawJobData.applyLink) : null,
      companyWebsite: rawJobData.companyWebsite ? sanitizeUrl(rawJobData.companyWebsite) : undefined,
    };

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    // Verify token
    const employerJob = await prisma.employerJob.findFirst({
      where: { editToken: token },
      include: { job: { select: { isPublished: true, expiresAt: true } } },
    });

    if (!employerJob) {
      return NextResponse.json(
        { error: 'Invalid or expired edit token' },
        { status: 401 }
      );
    }

    // The same 30-day window the GET loader enforces. Without it a leaked
    // magic link could still rewrite this posting's applyLink — sending every
    // applicant to an attacker's page — years after the listing expired.
    // A missing job relation means the row is orphaned: fail closed.
    if (!employerJob.job || !isEditTokenWindowOpen(employerJob.job)) {
      logger.warn('[jobs-update] edit-token rejected: outside the edit window', {
        tokenPrefix: token.slice(0, 4),
        jobId: employerJob.jobId,
      });
      return NextResponse.json({ error: EDIT_TOKEN_CLOSED_MESSAGE }, { status: 401 });
    }

    // Apply-on-platform: clear applyLink when switching to in-platform.
    const applyOnPlatform = rawJobData.applyOnPlatform === true;

    // Re-derive structured location exactly like both post routes do
    // (post-free:262, create-checkout:189). This route used to write the raw
    // location string WITHOUT re-parsing, so city/state/stateCode/isRemote/
    // isHybrid stayed frozen at post time through every edit — an employer
    // changing "Austin, TX" to "Remote (New York)" kept stateCode TX and
    // isRemote false forever, and the job filtered, mapped, and rendered its
    // JSON-LD off the stale fields. Nearly every employer job in prod has
    // been edited at least once, so this was the rule rather than the edge.
    const parsedLoc = parseLocation(jobData.location);

    // Every public salary surface reads a DERIVED column, never the raw pair:
    // lib/salary-display.ts prefers the stored displaySalary, then the
    // normalized pair, and only then minSalary/maxSalary, and the salary
    // filters query normalizedMin/MaxSalary. This route wrote the raw pair
    // alone, so an employer correcting their pay range saw a success toast
    // while the detail header, the OG image, the cards and the filters all
    // kept serving the figure from post time. Mirror create-checkout:242-263
    // so both write paths derive the same columns from the same helpers.
    const parseSalary = (value: number | null | undefined): number | null => {
      if (value === null || value === undefined) return null;
      const num = Number(value);
      return Number.isFinite(num) && num > 0 ? Math.round(num) : null;
    };
    const rawMinSalary = parseSalary(jobData.minSalary);
    const rawMaxSalary = parseSalary(jobData.maxSalary);
    // A transposed range (min above max) renders as a negative band and sorts
    // wrong in the salary filters. Swap rather than reject: the employer's
    // intent is unambiguous and a hard 400 loses the rest of the edit.
    const [minSalary, maxSalary] =
      rawMinSalary !== null && rawMaxSalary !== null && rawMinSalary > rawMaxSalary
        ? [rawMaxSalary, rawMinSalary]
        : [rawMinSalary, rawMaxSalary];
    const salaryPeriod = jobData.salaryPeriod || (minSalary || maxSalary ? 'year' : null);

    const normalizedSalary = normalizeSalary({
      minSalary,
      maxSalary,
      salaryPeriod,
      title: jobData.title,
    });
    const displaySalary = formatDisplaySalary(
      normalizedSalary.normalizedMinSalary,
      normalizedSalary.normalizedMaxSalary,
      salaryPeriod
    );

    // The structured arrays JSON-LD (components/JobStructuredData.tsx) and the
    // Role Snapshot prefer over the scalar columns. Re-derived on every edit
    // with the same rules as the ingest path and
    // scripts/backfill-structured-fields.ts, so a posting that switches from
    // remote to on-site drops its stale state-eligibility list instead of
    // advertising licences it no longer needs.
    const jobTypes = collectJobTypes(jobData.jobType || null, jobData.title);
    const eligibleStateCodes = parsedLoc.isRemote && !parsedLoc.isHybrid
      ? extractEligibleStates(jobData.description)
          .map((name) => STATE_NAME_TO_CODE[name])
          .filter((code): code is string => !!code)
      : [];

    // Snapshot material fields before writing so we can tell whether the edit
    // actually changed what search engines see (title, description, location,
    // salary) and only re-ping when it did.
    const beforeJob = await prisma.job.findUnique({
      where: { id: employerJob.jobId },
      select: {
        title: true,
        description: true,
        location: true,
        minSalary: true,
        maxSalary: true,
        salaryPeriod: true,
      },
    });

    // Update job
    const updatedJob = await prisma.job.update({
      where: { id: employerJob.jobId },
      data: {
        title: jobData.title,
        location: jobData.location,
        city: parsedLoc.city,
        state: parsedLoc.state,
        stateCode: parsedLoc.stateCode,
        isRemote: parsedLoc.isRemote,
        isHybrid: parsedLoc.isHybrid,
        mode: jobData.mode,
        jobType: jobData.jobType,
        description: jobData.description,
        descriptionSummary: summarizeForMeta(jobData.description),
        applyLink: applyOnPlatform ? null : jobData.applyLink,
        applyOnPlatform,
        minSalary,
        maxSalary,
        salaryPeriod,
        normalizedMinSalary: normalizedSalary.normalizedMinSalary,
        normalizedMaxSalary: normalizedSalary.normalizedMaxSalary,
        salaryIsEstimated: normalizedSalary.salaryIsEstimated,
        salaryConfidence: normalizedSalary.salaryConfidence,
        displaySalary,
        jobTypes,
        eligibleStateCodes,
        benefits: Array.isArray(rawJobData.benefits) ? rawJobData.benefits : undefined,
        setting: rawJobData.setting !== undefined ? (rawJobData.setting || null) : undefined,
        population: rawJobData.population !== undefined ? (rawJobData.population || null) : undefined,
        updatedAt: new Date(),
      },
    });

    // C1: an employer edit changes content-bearing fields (title, description,
    // setting, population) — refresh the semantic-search embedding so it stays in
    // sync with the edited text. Fire-and-forget; the Inngest handler skips the
    // job if it's unpublished. Never block the response on this.
    inngest.send({
      name: 'embedding.refresh.job',
      data: { jobId: updatedJob.id },
    }).catch((err) => {
      logger.warn('inngest.send embedding.refresh.job failed (employer edit)', { error: String(err) });
    });

    // Audit fact 10: employer edits never re-pinged search engines, so Google
    // kept serving the pre-edit listing for the rest of the term. Mirror the
    // post-free pattern (post-free:~491): production-gated, fire-and-forget,
    // and only when a field that changes the indexed page actually changed.
    const hasMaterialChange = !beforeJob
      || beforeJob.title !== updatedJob.title
      || beforeJob.description !== updatedJob.description
      || beforeJob.location !== updatedJob.location
      || beforeJob.minSalary !== updatedJob.minSalary
      || beforeJob.maxSalary !== updatedJob.maxSalary
      || beforeJob.salaryPeriod !== updatedJob.salaryPeriod;
    const isProduction = process.env.VERCEL_ENV === 'production'
      || (process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_BASE_URL?.includes('localhost'));
    if (hasMaterialChange && updatedJob.isPublished && isProduction) {
      // Stored slug, not a recompute: an employer editing an admin-created or
      // pre-2026-07 job would otherwise ping a URL that canonicals elsewhere,
      // spending the daily quota without re-crawling the page they just
      // changed. This route is the only ping for an edit, since the index-urls
      // cron no longer re-lists edited jobs.
      const jobUrl = jobIndexUrl(updatedJob);
      pingAllSearchEngines(jobUrl).catch((err) =>
        logger.error('[Jobs-Update] Background indexing ping failed', err)
      );
    }

    // Update employer-level fields (website, logo). contactEmail is NOT
    // writable here: it is the ownership key for legacy `userId: null` rows.
    if (
      jobData.companyWebsite
      || rawJobData.companyLogoUrl !== undefined
    ) {
      await prisma.employerJob.update({
        where: { id: employerJob.id },
        data: {
          companyWebsite: jobData.companyWebsite || employerJob.companyWebsite,
          ...(rawJobData.companyLogoUrl !== undefined
            ? { companyLogoUrl: rawJobData.companyLogoUrl ? sanitizeUrl(rawJobData.companyLogoUrl) : null }
            : {}),
        },
      });
    }

    // Replace screening questions wholesale when the client sends an array.
    // `undefined` => leave existing questions alone; `[]` => clear them.
    if (Array.isArray(rawJobData.screeningQuestions)) {
      await prisma.jobScreeningQuestion.deleteMany({
        where: { jobId: employerJob.jobId },
      });
      const questions = rawJobData.screeningQuestions.slice(0, 5);
      const validTypes = ['boolean', 'text', 'select', 'number'];
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (!q?.text || typeof q.text !== 'string') continue;
        await prisma.jobScreeningQuestion.create({
          data: {
            jobId: employerJob.jobId,
            questionText: sanitizeText(q.text, 200),
            questionType: validTypes.includes(q.type) ? q.type : 'boolean',
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

    return NextResponse.json({
      success: true,
      job: updatedJob,
    });
  } catch (error) {
    logger.error('Error updating job:', error);
    return NextResponse.json(
      { error: 'Failed to update job' },
      { status: 500 }
    );
  }
}

// Unpublish job endpoint
export async function DELETE(request: NextRequest) {
  // Unpublishing is destructive and token-authenticated, so it needs the same
  // brute-force ceiling the loader and the update handler already have.
  const rateLimitResult = await rateLimit(request, 'jobs-update', RATE_LIMITS.general);
  if (rateLimitResult) return rateLimitResult;

  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    // Verify token
    const employerJob = await prisma.employerJob.findFirst({
      where: { editToken: token },
      include: { job: { select: { isPublished: true, expiresAt: true } } },
    });

    if (!employerJob) {
      return NextResponse.json(
        { error: 'Invalid or expired edit token' },
        { status: 401 }
      );
    }

    // Same window as the loader and the update handler: a leaked magic link
    // must not be able to unpublish a posting indefinitely.
    if (!employerJob.job || !isEditTokenWindowOpen(employerJob.job)) {
      logger.warn('[jobs-update] unpublish rejected: outside the edit window', {
        tokenPrefix: token.slice(0, 4),
        jobId: employerJob.jobId,
      });
      return NextResponse.json({ error: EDIT_TOKEN_CLOSED_MESSAGE }, { status: 401 });
    }

    // Unpublish job (soft delete)
    await prisma.job.update({
      where: { id: employerJob.jobId },
      data: {
        isPublished: false,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Job unpublished successfully',
    });
  } catch (error) {
    logger.error('Error unpublishing job:', error);
    return NextResponse.json(
      { error: 'Failed to unpublish job' },
      { status: 500 }
    );
  }
}

