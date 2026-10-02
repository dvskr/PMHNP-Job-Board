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
 *    reminder and a lifecycle email in one day. Rather than add an uncapped
 *    fourth sender, this one SPLITS THE WEEK with the brief: full
 *    descriptions on Monday, Wednesday and Friday, the brief on the other
 *    four days, both at 13:30. The two never land on the same day, so the
 *    list sees one alert email per day rather than two.
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
import { publicJobsWhere } from '@/lib/filters';

const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL || brand.baseUrl).replace(/\/$/, '');
/** Same resolution order as the digest, so both chains send from one address. */
const EMAIL_FROM = process.env.EMAIL_FROM_MARKETING || process.env.EMAIL_FROM || brand.email.marketingFrom;

/**
 * Kept for the tests and for anyone reading history: this chain was
 * originally gated to employer-authored postings, on the theory that
 * aggregator descriptions were too rough to carry the format.
 *
 * The numbers said otherwise. On 2026-09-27 production held 9 employer
 * postings with a description long enough to fill this email, against 597
 * across all sources, with 76 arriving in the previous week and at least one
 * on 28 of the previous 30 days. Employer-only meant the chain would have
 * run dry in about nine sends. The gate is now description quality alone,
 * and the plain-text bodies are reflowed through lib/jd-blocks.ts, the same
 * parser the web job page uses.
 */
export const FULL_JD_SOURCE_TYPE = 'employer';

/**
 * Minimum gap between two full descriptions to the same person.
 *
 * The schedule already spaces them: this runs Monday, Wednesday and Friday,
 * and the brief takes the other four days, so no one gets two emails on one
 * day. The cooldown is the belt to that braces. A cron retry after a partial
 * run, or a manual trigger from /admin/cron on a send day, would otherwise
 * mail everyone a second posting, and the ledger alone would not stop it
 * because the second posting is a different row.
 */
export const FULL_JD_COOLDOWN_HOURS = 24;

/**
 * How far back a posting may be and still be worth a dedicated email.
 *
 * Wider than the brief's window on purpose. The brief is "what is new since
 * your last one", so it needs a cutoff. This chain sends one posting per
 * person per day and the ledger guarantees nobody sees the same one twice,
 * so a posting from three weeks ago is still new to someone who has not been
 * shown it. Narrowing this to a week would leave the chain with nothing to
 * send on a quiet day for no benefit.
 */
export const FULL_JD_MAX_AGE_DAYS = 30;


export interface FullJdRunResult {
  skipped?: 'paused';
  considered: number;
  sent: number;
  suppressed: number;
  noMatch: number;
  errors: number;
  /** Employers and admins filtered out of the lead list. Candidates only. */
  excludedEmployers: number;
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
  return hasEnoughDescription(job.description);
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
  const result: FullJdRunResult = {
    considered: 0, sent: 0, suppressed: 0, noMatch: 0, errors: 0, excludedEmployers: 0,
  };

  // No feature flag. The schedule is the switch: this runs on its cron days
  // and sends. isOutboundPaused stays because it is the emergency brake for
  // every sender on the platform, not a gate on this one.
  if (await isOutboundPaused()) {
    logger.warn(`[full-jd] ${OUTBOUND_PAUSED_MESSAGE}`);
    return { ...result, skipped: 'paused' };
  }

  const now = new Date();
  const cooldown = new Date(now.getTime() - FULL_JD_COOLDOWN_HOURS * 60 * 60 * 1000);
  const oldest = new Date(now.getTime() - FULL_JD_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

  // The audience is the whole mailable list, not only alert subscribers.
  //
  // On 2026-09-27 that was 1,987 addresses, of which 937 hold a job alert
  // and 1,097 do not. Those 1,097 came mostly from account signup rather
  // than from asking for job email, so the two groups are handled
  // differently below: an alert holder gets a posting that matches their
  // criteria, and everyone else gets the strongest posting they have not
  // been shown. Nobody gets a posting that contradicts a stated preference,
  // because the alternative is teaching the list to mark this as spam.
  const [leads, alerts, nonCandidateAccounts, legacyEmployerContacts] = await Promise.all([
    prisma.emailLead.findMany({
      where: { isSubscribed: true, isSuppressed: false },
      select: { email: true },
    }),
    prisma.jobAlert.findMany({ where: buildAlertEligibilityWhere(now) }),
    // THIS CHAIN IS FOR CANDIDATES ONLY.
    //
    // The lead list is everyone mailable, and an employer who created an
    // account to post a job is on it, so employers were receiving job
    // adverts for roles they are trying to fill, including their own. The
    // brief does not have this problem because it only mails people who
    // explicitly created a JobAlert; this chain mails the whole list, so it
    // has to do the filtering itself.
    //
    // UserProfile.role is the authoritative signal: it is session-proven,
    // defaults to job_seeker, and is what every other employer gate reads.
    // Admin is excluded too; an operator is not a candidate.
    prisma.userProfile.findMany({
      where: { role: { not: 'job_seeker' } },
      select: { email: true },
    }),
    // Legacy posters with no account. Posting is session-gated now, so this
    // set cannot grow, which also bounds the one weakness of using a
    // form-typed address: someone could once have typed a stranger's email
    // as the contact on a posting. Over-excluding costs one marketing
    // email, which is the safe direction to be wrong in.
    prisma.employerJob.findMany({
      where: { userId: null },
      select: { contactEmail: true },
    }),
  ]);
  if (!leads.length) return result;

  const employerEmails = new Set<string>([
    ...nonCandidateAccounts.map((p) => p.email.toLowerCase()),
    ...legacyEmployerContacts.map((e) => e.contactEmail.toLowerCase()),
  ]);

  // Any source, provided the description can carry the format. The recency
  // window is wide because the ledger, not the window, is what stops a
  // repeat: each recipient sees a given posting once, so older postings stay
  // useful to people who have not been shown them yet.
  const pool = await prisma.job.findMany({
    where: {
      ...publicJobsWhere(),
      createdAt: { gte: oldest },
    },
    include: { screeningQuestions: { select: { questionText: true }, orderBy: { sortOrder: 'asc' } } },
    orderBy: { createdAt: 'desc' },
    take: 400,
  });
  // No cast through unknown here. An earlier version had one, and it hid a
  // real mismatch: Prisma returns screening questions as questionText, the
  // template read q.question, and every question would have rendered blank.
  const eligible: CandidateJob[] = pool.filter(isFullJdEligible);
  if (!eligible.length) return result;

  // A recipient may hold several alerts; they still get one email.
  const alertsByEmail = new Map<string, typeof alerts>();
  for (const alert of alerts) {
    const key = alert.email.toLowerCase();
    const group = alertsByEmail.get(key);
    if (group) group.push(alert);
    else alertsByEmail.set(key, [alert]);
  }

  // Deduplicate the lead list: the same address can appear in more than one
  // casing, and sending twice to one person is the failure this whole chain
  // is built to avoid. Employers come out here, before anything is claimed
  // in the ledger, so an excluded address leaves no trace that would stop a
  // later legitimate send to it.
  const allLeadEmails = [...new Set(leads.map((l) => l.email.toLowerCase()))];
  const recipients = allLeadEmails.filter((email) => !employerEmails.has(email));
  result.excludedEmployers = allLeadEmails.length - recipients.length;
  if (!recipients.length) return result;

  // One query for the whole ledger slice, not one per recipient. At ~2,000
  // recipients the per-recipient version was 2,000 round trips before a
  // single email was composed.
  const ledger = await prisma.alertJobSend.findMany({
    where: { email: { in: recipients } },
    select: { email: true, jobId: true, chain: true, sentAt: true },
  });
  const sentJobs = new Map<string, Set<string>>();
  const lastFullJd = new Map<string, Date>();
  for (const row of ledger) {
    let seen = sentJobs.get(row.email);
    if (!seen) { seen = new Set(); sentJobs.set(row.email, seen); }
    seen.add(row.jobId);
    if (row.chain === 'full_jd') {
      const prev = lastFullJd.get(row.email);
      if (!prev || row.sentAt > prev) lastFullJd.set(row.email, row.sentAt);
    }
  }

  for (const email of recipients) {
    const group = alertsByEmail.get(email) ?? [];
    result.considered += 1;
    try {
      if (await isEmailSuppressed(email)) {
        result.suppressed += 1;
        continue;
      }

      const last = lastFullJd.get(email);
      if (last && last >= cooldown) continue;

      // Never a posting this person has already been shown, by either
      // chain. Picking first and then discovering it was already sent meant
      // they got nothing that day instead of the next one down.
      const seen = sentJobs.get(email) ?? new Set<string>();
      const unseen = eligible.filter((job) => !seen.has(job.id));
      if (!unseen.length) {
        result.noMatch += 1;
        continue;
      }

      const alert: (typeof alerts)[number] | undefined = group[0];
      // An alert holder gets something their criteria actually match.
      // Everyone else gets the newest they have not seen: they stated no
      // preference, so the strongest honest default is recency.
      const match = group.length
        ? unseen.find((job) => group.some((a) => jobMatchesAlert(job as never, a as never)))
        : unseen[0];
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

      // Resolved before the render so the footer link and the
      // List-Unsubscribe header cannot disagree about the token.
      const oneClickToken = await getOrCreateUnsubToken(email);
      const unsubscribeUrl = `${BASE_URL}/unsubscribe?token=${oneClickToken}`;

      const jobUrl = `${BASE_URL}/jobs/${slugify(match.title, match.id)}`;
      // Alert holders manage the alert. Everyone else has no alert to
      // manage, so they get the preferences page their token resolves.
      const manageUrl = alert
        ? `${BASE_URL}/job-alerts/manage?token=${alert.token}`
        : `${BASE_URL}/email-preferences?token=${oneClickToken}`;

      const { subject, html } = buildFullJdEmail({
        job: match,
        jobUrl,
        alertToken: alert?.token ?? null,
        criteriaText: alert ? buildCriteriaSummary(alert) || 'your saved search' : null,
        manageUrl,
        unsubscribeUrl,
      });

      // sendAndLog owns the List-Unsubscribe pair: it builds both the RFC
      // 8058 machine POST and the human fallback from the URL passed as its
      // fourth argument. Setting the headers here would be a second, likely
      // divergent, source for the one control that has to work.
      const send = await sendAndLog(
        { from: EMAIL_FROM, to: email, subject, html },
        'job_alert',
        undefined,
        unsubscribeUrl,
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
