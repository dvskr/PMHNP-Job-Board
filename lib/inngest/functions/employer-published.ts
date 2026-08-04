/**
 * Instant employer fan-out — distribution audit A4.
 *
 * Fired as 'job/employer.published' from all three employer publish paths:
 *   - app/api/jobs/post-free/route.ts        (free post goes live)
 *   - app/api/webhooks/stripe/route.ts       (paid new post)
 *   - app/api/webhooks/stripe/route.ts       (paid renewal republish)
 *
 * Matches THAT ONE job against active, CONFIRMED, daily-frequency job alerts
 * that are currently DUE (buildAlertEligibilityWhere) using the pure matcher
 * jobMatchesAlert, then triggers an EARLY full digest for just those
 * recipients via sendJobAlerts({ restrictToEmails, frequency: 'daily' }).
 *
 * Why a full digest and not a hand-built single-job email:
 *   - The digest's per-alert freshness cutoff IS lastSentAt. A single-job
 *     email that stamps lastSentAt would advance the cutoff past every other
 *     match accumulated since the previous send (>20h of ingest, since the
 *     alert must be due to be selected here) and permanently drop them.
 *     The employer post is inside the digest by construction: it matched the
 *     alert criteria, and employer postings are pinned to the top.
 *   - Scoping by EMAIL (not alert id) folds the recipient's OTHER due daily
 *     alerts into the same email and stamps them too, so the daily cron
 *     cannot send the same person a second alert email that day.
 *   - Suppression checks, EmailSend logging, the E1-correct List-Unsubscribe
 *     pair, and the claim-before-send lastSentAt stamp are all inherited
 *     from the one shared pipeline instead of re-implemented.
 *
 * CADENCE RULE: the instant digest REPLACES that alert's daily digest for
 * the day. sendJobAlerts claims lastSentAt BEFORE handing each batch to
 * Resend, so a crash mid-run (or an Inngest retry) can only mean a missed
 * instant email — which degrades to the normal 13:30 UTC daily digest with
 * nothing lost — never a duplicate.
 *
 * Weekly-frequency alerts are deliberately excluded: an early send would
 * shift the subscriber's weekly rhythm to whichever day an employer happened
 * to post. Weekly subscribers see the employer post in their normal weekly
 * digest instead (employer pinning already surfaces it at the top).
 */

import { inngest } from '@/lib/inngest/client';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
    buildAlertEligibilityWhere,
    jobMatchesAlert,
    sendJobAlerts,
} from '@/lib/job-alerts-service';

export interface EmployerPublishedEventData {
    jobId: string;
}

export const employerPublishedFanout = inngest.createFunction(
    {
        id: 'employer-published-alert-fanout',
        name: 'Employer post published: instant alert fan-out',
        triggers: [{ event: 'job/employer.published' }],
        // A Stripe webhook redelivery (or a publish+renewal in quick
        // succession) can double-fire the event; one fan-out per job per
        // hour is plenty. Recipients are additionally protected by the
        // lastSentAt cadence stamp: a delayed duplicate run re-derives
        // eligibility and finds the alerts no longer due.
        throttle: { limit: 1, period: '1h', key: 'event.data.jobId' },
        // Retries cannot duplicate emails because sendJobAlerts claims
        // lastSentAt BEFORE sending: a retry re-derives eligibility and
        // already-claimed alerts are no longer due. A lost instant send
        // simply degrades to the normal daily digest.
        retries: 1,
    },
    async ({ event, step }) => {
        const { jobId } = event.data as EmployerPublishedEventData;

        const result = await step.run('fan-out', async () => {
            const now = new Date();

            const job = await prisma.job.findUnique({
                where: { id: jobId },
                select: {
                    id: true,
                    title: true,
                    employer: true,
                    location: true,
                    city: true,
                    state: true,
                    stateCode: true,
                    mode: true,
                    jobType: true,
                    isRemote: true,
                    isHybrid: true,
                    normalizedMinSalary: true,
                    normalizedMaxSalary: true,
                    newGradFriendly: true,
                    minYearsExperience: true,
                    sourceType: true,
                    isPublished: true,
                    expiresAt: true,
                },
            });
            if (!job) return { skipped: 'not_found', matched: 0, sent: 0 };
            if (!job.isPublished) return { skipped: 'not_published', matched: 0, sent: 0 };
            if (job.sourceType !== 'employer') return { skipped: 'not_employer', matched: 0, sent: 0 };
            if (job.expiresAt && job.expiresAt.getTime() <= now.getTime()) {
                return { skipped: 'expired', matched: 0, sent: 0 };
            }

            // Due, daily-frequency alerts only (see module docblock for why
            // weekly is excluded from the instant path). jobMatchesAlert is a
            // cheap prefilter deciding WHO gets an early digest; the digest's
            // own DB query remains the source of truth for what is sent.
            const dueAlerts = await prisma.jobAlert.findMany({
                where: { AND: [buildAlertEligibilityWhere(now), { frequency: 'daily' }] },
            });
            const matched = dueAlerts.filter((alert) => jobMatchesAlert(job, alert));
            if (matched.length === 0) return { matched: 0, sent: 0 };

            const emails = Array.from(new Set(matched.map((a) => a.email)));

            // Early full digest for the matched recipients (see module
            // docblock). Inherits suppression, unsubscribe headers, EmailSend
            // logging, and the claim-first lastSentAt stamp.
            const digest = await sendJobAlerts({
                restrictToEmails: emails,
                frequency: 'daily',
            });

            return { matched: matched.length, ...digest };
        });

        logger.info('employer-published fan-out complete', { jobId, ...result });
        return result;
    },
);

export const employerPublishedFunctions = [employerPublishedFanout] as const;
