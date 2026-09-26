/**
 * The full-description alert chain.
 *
 * One email, one job, the whole posting. A second chain alongside the daily
 * brief, for alerts whose deliveryFormat is "full_jd".
 *
 * SHIPPED INERT. Nothing calls this: there is no cron entry in vercel.json
 * and FULL_JD_ALERTS_ENABLED is unset, so sendFullJdAlerts returns
 * { skipped: 'disabled' } until an operator turns it on. The reason is in
 * the numbers rather than the code: the format only pays off on employer
 * postings with a real description, and whether there are enough of those
 * per week to justify a cron is a question for the data, not for a review.
 *
 * Three hazards shaped this file, all of them from how the existing digest
 * works rather than from anything new here.
 *
 * 1. DEDUPE. JobAlert.lastSentAt is a cutoff, not a record of what was sent.
 *    A second chain with its own cutoff would, on its first run, mail a full
 *    description for every job the digest had already sent. Sharing the
 *    cutoff would make whichever cron ran first starve the other. So neither
 *    happens here: this chain reads and writes AlertJobSend, whose unique
 *    index on (email, jobId) is what makes "once" mean once under
 *    concurrency. sendJobAlerts records into the same ledger.
 *
 * 2. VOLUME. There is no global per-recipient daily cap anywhere in the
 *    codebase, so a person can already receive the brief, a saved-job
 *    reminder and a lifecycle email in one day. This chain caps itself at
 *    one send per recipient per day and picks a single job, rather than
 *    adding an uncapped fourth sender.
 *
 * 3. CONSENT. EmailLead.isSubscribed is all or nothing, so someone annoyed
 *    by this format would have to switch off the brief they wanted. The
 *    opt-out here is the alert's own deliveryFormat, which the email links
 *    to directly, and the standard marketing suppression still applies on
 *    top.
 */

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { logger } from '@/lib/logger';
import { brand } from '@/config/brand';
import { slugify } from '@/lib/utils';
import { isEmailSuppressed, getOrCreateUnsubToken, sendAndLog } from '@/lib/email-service';
import { oneClickUnsubscribeUrl } from '@/lib/email/list-unsubscribe';
import { isOutboundPaused, OUTBOUND_PAUSED_MESSAGE } from '@/lib/outbound-kill-switch';
import { hasEnoughDescription } from '@/lib/email/jd-body';
import { buildFullJdEmail, type FullJdJob } from '@/lib/email/full-jd-template';
import { buildCriteriaSummary, jobMatchesAlert, buildAlertEligibilityWhere } from '@/lib/job-alerts-service';

const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL || brand.baseUrl).replace(/\/$/, '');
/** Same resolution order as the digest, so both chains send from one address. */
const EMAIL_FROM = process.env.EMAIL_FROM_MARKETING || process.env.EMAIL_FROM || brand.email.marketingFrom;

/** Only employer-authored postings. See the module docblock. */
export const FULL_JD_SOURCE_TYPE = 'employer';

/** One per recipient per day. */
export const FULL_JD_COOLDOWN_HOURS = 24;

/** How far back a posting may be and still be worth a dedicated email. */
export const FULL_JD_MAX_AGE_DAYS = 7;

export function isFullJdEnabled(): boolean {
  return process.env.FULL_JD_ALERTS_ENABLED === 'true';
}

export interface FullJdRunResult {
  skipped?: 'disabled' | 'paused';
  considered: number;
  sent: number;
  suppressed: number;
  noMatch: number;
  errors: number;
}

type CandidateJob = FullJdJob & { sourceType: string | null; createdAt: Date };

/**
 * Postings this format can actually carry.
 *
 * The description gate is the important half. Job.description has a 50
 * character floor at ingest and nothing above it, so "has a description" and
 * "has enough description to fill a dedicated email" are different questions.
 */
export function isFullJdEligible(job: { sourceType?: string | null; description: string }): boolean {
  return job.sourceType === FULL_JD_SOURCE_TYPE && hasEnoughDescription(job.description);
}

/**
 * Record that these jobs went to this address, claim-first.
 *
 * createMany with skipDuplicates leans on the unique index rather than on a
 * read-then-write check, which under two concurrent crons degrades to
 * "usually once". Returns the ids actually claimed: anything already present
 * was claimed by another run or by the brief, and must not be sent again.
 */
export async function claimJobsForRecipient(
  email: string,
  jobIds: string[],
  chain: 'digest' | 'full_jd',
): Promise<string[]> {
  if (!jobIds.length) return [];
  const normalized = email.toLowerCase();

  const before = await prisma.alertJobSend.findMany({
    where: { email: normalized, jobId: { in: jobIds } },
    select: { jobId: true },
  });
  const taken = new Set(before.map((r) => r.jobId));
  const fresh = jobIds.filter((id) => !taken.has(id));
  if (!fresh.length) return [];

  const created = await prisma.alertJobSend.createMany({
    data: fresh.map((jobId) => ({ email: normalized, jobId, chain })),
    skipDuplicates: true,
  });

  // createMany reports a count, not which rows won the race. Re-read so the
  // caller sends exactly what this run owns.
  if (created.count === fresh.length) return fresh;
  const after = await prisma.alertJobSend.findMany({
    where: { email: normalized, jobId: { in: fresh }, chain },
    select: { jobId: true },
  });
  return after.map((r) => r.jobId);
}

/** Undo a claim when the provider definitively refused the message. */
export async function releaseClaim(email: string, jobId: string): Promise<void> {
  try {
    await prisma.alertJobSend.deleteMany({ where: { email: email.toLowerCase(), jobId, chain: 'full_jd' } });
  } catch (err) {
    // A stranded claim costs one missed email. Surfacing the delete failure
    // and continuing is better than retrying into a duplicate send.
    logger.warn('[full-jd] could not release claim', { jobId, err: String(err) });
  }
}

/**
 * Run the chain.
 *
 * Deliberately sequential per recipient rather than a Resend batch: this is
 * a low-volume, one-job-per-person send, and the claim has to be settled per
 * message so a single rejection cannot strand a whole batch's worth of
 * ledger rows.
 */
export async function sendFullJdAlerts(options: { dryRun?: boolean } = {}): Promise<FullJdRunResult> {
  const result: FullJdRunResult = { considered: 0, sent: 0, suppressed: 0, noMatch: 0, errors: 0 };

  if (!isFullJdEnabled()) return { ...result, skipped: 'disabled' };
  if (await isOutboundPaused()) {
    logger.warn(`[full-jd] ${OUTBOUND_PAUSED_MESSAGE}`);
    return { ...result, skipped: 'paused' };
  }

  const now = new Date();
  const cooldown = new Date(now.getTime() - FULL_JD_COOLDOWN_HOURS * 60 * 60 * 1000);
  const oldest = new Date(now.getTime() - FULL_JD_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

  const alerts = await prisma.jobAlert.findMany({
    where: { ...buildAlertEligibilityWhere(now), deliveryFormat: 'full_jd' },
  });
  if (!alerts.length) return result;

  // Employer postings only, and only ones recent enough to still be open.
  const pool = await prisma.job.findMany({
    where: {
      isPublished: true,
      sourceType: FULL_JD_SOURCE_TYPE,
      createdAt: { gte: oldest },
    },
    include: { screeningQuestions: { select: { questionText: true }, orderBy: { sortOrder: 'asc' } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  // No cast through unknown here. An earlier version had one, and it hid a
  // real mismatch: Prisma returns screening questions as questionText, the
  // template read q.question, and every question would have rendered blank.
  const eligible: CandidateJob[] = pool.filter(isFullJdEligible);
  if (!eligible.length) return result;

  // One recipient may hold several full_jd alerts; they get one email.
  const byEmail = new Map<string, typeof alerts>();
  for (const alert of alerts) {
    const key = alert.email.toLowerCase();
    const group = byEmail.get(key);
    if (group) group.push(alert);
    else byEmail.set(key, [alert]);
  }

  for (const [email, group] of byEmail) {
    result.considered += 1;
    try {
      if (await isEmailSuppressed(email)) {
        result.suppressed += 1;
        continue;
      }

      const recent = await prisma.alertJobSend.findFirst({
        where: { email, chain: 'full_jd', sentAt: { gte: cooldown } },
        select: { id: true },
      });
      if (recent) continue;

      const alert = group[0];
      const match = eligible.find((job) => group.some((a) => jobMatchesAlert(job as never, a as never)));
      if (!match) {
        result.noMatch += 1;
        continue;
      }

      const [claimed] = await claimJobsForRecipient(email, [match.id], 'full_jd');
      if (!claimed) continue; // another run, or the brief, already has it

      if (options.dryRun) {
        result.sent += 1;
        continue;
      }

      const jobUrl = `${BASE_URL}/jobs/${slugify(match.title, match.id)}`;
      const manageUrl = `${BASE_URL}/job-alerts/manage?token=${alert.token}`;
      const { subject, html } = buildFullJdEmail({
        job: match,
        jobUrl,
        alertToken: alert.token,
        criteriaText: buildCriteriaSummary(alert) || 'your saved search',
        manageUrl,
      });

      // sendAndLog owns the List-Unsubscribe pair: it builds both the RFC
      // 8058 machine POST and the human fallback from the URL passed as its
      // fourth argument. Setting the headers here would be a second, likely
      // divergent, source for the one control that has to work.
      const oneClickToken = await getOrCreateUnsubToken(email);
      const send = await sendAndLog(
        { from: EMAIL_FROM, to: email, subject, html },
        'job_alert',
        undefined,
        `${BASE_URL}/unsubscribe?token=${oneClickToken}`,
      );

      if (send?.error) {
        await releaseClaim(email, match.id);
        result.errors += 1;
        continue;
      }
      result.sent += 1;
    } catch (err) {
      result.errors += 1;
      logger.error('[full-jd] recipient failed', err, { email });
    }
  }

  return result;
}

/** Re-exported so callers do not need Prisma's namespace for the P2002 check. */
export const UNIQUE_VIOLATION = Prisma.PrismaClientKnownRequestError;
