import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  sendExpiryWarningEmail,
  sendExpiryFinalNoticeEmail,
  isEmailSuppressed,
} from '@/lib/email-service'
import { verifyCronOrAdmin } from '@/lib/auth/verify-cron-or-admin';
import { sendCronFailureAlert } from '@/lib/discord-notifier';
import { withCronTracking } from '@/lib/cron/track';
import { logger } from '@/lib/logger';
import {
  buildFinalNoticeWindow,
  isRenewedPastExpiry,
  renewalIsCapped,
  resolveFinalNoticeState,
} from '@/lib/expiry-final-notice';
import { config } from '@/lib/config';

export const maxDuration = 120 // 2 minutes — expiry warning emails

/**
 * Two-step expiry sequence for employer postings, both sent from this one
 * daily run (0 22 * * * UTC):
 *
 *   1. WARNING, five days out. Dedupes on EmployerJob.expiryWarningSentAt.
 *   2. FINAL NOTICE, on the expiry date. Dedupes on
 *      EmployerJob.expiryFinalNoticeSentAt, stamped claim-first.
 *
 * ── HOW THE FINAL NOTICE IS EXACTLY ONCE ───────────────────────────────────
 * Two phases, in this order, per row:
 *
 *   PHASE 1, claim: a single `updateMany` whose WHERE touches only columns of
 *     the row it writes (`id`, plus `expiryFinalNoticeSentAt IS NULL`). That
 *     is one atomic UPDATE; Postgres row locking makes the second of two
 *     concurrent invocations match zero rows. count === 0 means we lost, and
 *     losing means sending nothing.
 *   PHASE 2, verify: re-read the posting and confirm it is still the thing we
 *     selected (window, renewal, archive, employer pause). Anything that
 *     changed under us hands the claim back, still without sending.
 *
 * Business predicates stay out of phase 1 on purpose. A relation filter in an
 * UPDATE becomes a subquery, and a subquery's behaviour under READ COMMITTED
 * re-evaluation is not something a live employer send should depend on.
 *
 * ── WHY THE FINAL NOTICE USES A CALENDAR WINDOW ────────────────────────────
 * This job runs at a fixed 22:00 UTC, but a posting's expiresAt is
 * createdAt + durationDays, so it lands at any clock time. A posting expiring
 * at 20:45 UTC is already an hour and a quarter dead when the 22:00 run starts;
 * one expiring at 23:30 UTC is still live. Both are normal, so the selection is
 * "expiresAt lands inside this run's own UTC calendar date", passed instant or
 * not, plus a short lookahead for postings that die just after midnight UTC
 * (still tonight in US time). The copy then branches on which side of the
 * instant we are on. See lib/expiry-final-notice.ts.
 *
 * Two deliberate differences from the 5-day pass:
 *   - No `isPublished: true` filter. cleanup-expired (10 12,18 * * *) already
 *     unpublishes anything past expiry, so requiring "published" would
 *     silently drop every posting that expired before 12:10 UTC today. Instead
 *     we exclude archived, employer-paused, and never-paid or refunded rows.
 *   - Suppressed addresses are skipped without stamping.
 *
 * ?dryRun=1 returns exactly who would receive the final notice (and the
 * warning) and sends nothing, writes no claims.
 */

interface SendPreview {
  jobId: string;
  to: string;
  jobTitle: string;
  expiresAt: string | null;
}

interface FinalNoticePreview extends SendPreview {
  /** 'expired' | 'today' | 'soon' — which honest copy branch would fire. */
  state: string;
  views: number;
  applyClicks: number;
  applications: number;
}

/**
 * Hand a final-notice claim back, so a later run can retry the row.
 *
 * Only ever called when we know nothing was sent. Guarded on OUR OWN stamp
 * (`stampedAt`) so it can never clear a claim written by a concurrent run or a
 * null already written by the Stripe renewal branch: if the value moved, the
 * update matches zero rows and quietly does nothing.
 */
async function releaseClaim(employerJobId: string, stampedAt: Date): Promise<void> {
  await prisma.employerJob.updateMany({
    where: { id: employerJobId, expiryFinalNoticeSentAt: stampedAt },
    data: { expiryFinalNoticeSentAt: null },
  })
}

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authError = await verifyCronOrAdmin(request);
  if (authError) return authError;

  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';

  try {
    return await withCronTracking('expiry-warnings', async () => {
      const now = new Date()

      // ─────────────────────────────────────────────────────────────────────
      // PASS 1 — five-day warning (pre-existing behaviour, unchanged apart
      // from the dryRun short circuit)
      // ─────────────────────────────────────────────────────────────────────

      // Find jobs expiring in 5 days
      const fiveDaysFromNow = new Date()
      fiveDaysFromNow.setDate(fiveDaysFromNow.getDate() + 5)

      const fourDaysFromNow = new Date()
      fourDaysFromNow.setDate(fourDaysFromNow.getDate() + 4)

      const expiringJobs = await prisma.job.findMany({
        where: {
          isPublished: true,
          sourceType: 'employer',
          expiresAt: {
            gte: fourDaysFromNow,
            lte: fiveDaysFromNow,
          },
          // Only warn once per job (dedup via expiryWarningSentAt)
          employerJobs: {
            expiryWarningSentAt: null,
          },
        },
        include: {
          employerJobs: true,
        },
      })

      let sentCount = 0
      const errors: string[] = []
      const warningPreviews: SendPreview[] = []

      for (const job of expiringJobs) {
        const employerJob = job.employerJobs
        if (employerJob?.contactEmail) {
          if (dryRun) {
            warningPreviews.push({
              jobId: job.id,
              to: employerJob.contactEmail,
              jobTitle: job.title,
              expiresAt: job.expiresAt?.toISOString() ?? null,
            })
            continue
          }
          // Suppression applies here too. This pass predates the check and was
          // still mailing hard-bounced and complained addresses, which is
          // exactly the traffic that costs sender reputation on the domains
          // every other employer email shares. The final-notice pass below has
          // always checked. Skip without stamping so the row is reconsidered
          // if the address is ever un-suppressed.
          if (await isEmailSuppressed(employerJob.contactEmail)) {
            continue
          }
          try {
            await sendExpiryWarningEmail(
              employerJob.contactEmail,
              job.title,
              job.expiresAt!,
              job.viewCount || 0,
              job.applyClickCount || 0,
              employerJob.dashboardToken || employerJob.editToken,
              null, // unsubscribeToken — sendExpiryWarningEmail will mint one if null
              job.id, // deep links the CTA to this listing's renew flow
            )
            sentCount++

            // Mark as warned (dedup)
            await prisma.employerJob.update({
              where: { id: employerJob.id },
              data: { expiryWarningSentAt: new Date() },
            })
          } catch (e) {
            errors.push(`Job ${job.id}: ${e}`)
            logger.error(`Failed to send expiry warning for job ${job.id}`, e)
          }
        }
      }

      // ─────────────────────────────────────────────────────────────────────
      // PASS 2 — final notice, on the expiry date itself
      // ─────────────────────────────────────────────────────────────────────

      const noticeWindow = buildFinalNoticeWindow(now)

      const finalCandidates = await prisma.job.findMany({
        where: {
          sourceType: 'employer',
          // Deleted or employer-paused postings get nothing: the first is gone,
          // the second came down on purpose.
          archivedAt: null,
          isManuallyUnpublished: false,
          expiresAt: { gte: noticeWindow.start, lte: noticeWindow.end },
          employerJobs: {
            // Exactly-once gate. Also the reason a renewed-then-re-expiring
            // posting works: the renewal branch resets this to null.
            expiryFinalNoticeSentAt: null,
            // 'pending' never completed checkout, 'refunded'/'disputed' asked
            // for their money back. None of them should get a renewal pitch.
            // notIn (rather than in) so unknown legacy statuses stay eligible.
            paymentStatus: { notIn: ['pending', 'refunded', 'disputed'] },
          },
        },
        select: {
          id: true,
          title: true,
          expiresAt: true,
          lastRenewedAt: true,
          // Needed for the 365-day renewal cap: a posting sitting on the cap
          // gains nothing from renewing, so it must not be pitched one.
          createdAt: true,
          viewCount: true,
          applyClickCount: true,
          // Real application count for this posting, counted in the same query.
          _count: { select: { jobApplications: true } },
          employerJobs: { select: { id: true, contactEmail: true } },
        },
        // Soonest death first. The window does not repeat, so a row this run
        // never reaches is a row that never gets its notice; if the function
        // ever runs out of time, the ones already gone should not be the last
        // in line ahead of the ones still savable.
        orderBy: { expiresAt: 'asc' },
      })

      let finalNoticesSent = 0
      let skippedIneligible = 0
      let skippedSuppressed = 0
      let skippedClaimLost = 0
      let skippedChangedUnderUs = 0
      const finalNoticePreviews: FinalNoticePreview[] = []

      const renewalDurationDays = config.getDurationDays()

      /**
       * Everything that disqualifies a posting from the pitch, evaluated
       * against a freshly read row. Used twice: as a cheap early-out before
       * the claim, and as the authoritative check AFTER the claim (see the
       * two-phase claim below).
       */
      const isIneligible = (row: {
        expiresAt: Date | null
        createdAt: Date
        lastRenewedAt: Date | null
      }): boolean => {
        if (!row.expiresAt) return true
        // Renewed posting: the renewal stamp is newer than the expiry it is
        // replacing. They just paid; do not tell them their listing died.
        if (isRenewedPastExpiry(row)) return true
        // Against the 365-day renewal cap: renewing would deliver less than the
        // full cycle the email promises (and nothing at all once it is sitting
        // on the ceiling). This is also the only shape a posting renewed
        // earlier today can take while still inside the window.
        if (renewalIsCapped({
          expiresAt: row.expiresAt,
          createdAt: row.createdAt,
          durationDays: renewalDurationDays,
          now,
        })) return true
        return false
      }

      for (const job of finalCandidates) {
        const employerJob = job.employerJobs
        if (!employerJob?.contactEmail || !job.expiresAt) continue

        if (isIneligible(job)) {
          skippedIneligible++
          continue
        }

        const { state } = resolveFinalNoticeState(job.expiresAt, now)
        const stats = {
          viewCount: job.viewCount || 0,
          applyClickCount: job.applyClickCount || 0,
          applicationCount: job._count.jobApplications,
        }

        if (dryRun) {
          finalNoticePreviews.push({
            jobId: job.id,
            to: employerJob.contactEmail,
            jobTitle: job.title,
            expiresAt: job.expiresAt.toISOString(),
            state,
            views: stats.viewCount,
            applyClicks: stats.applyClickCount,
            applications: stats.applicationCount,
          })
          continue
        }

        // Hard-suppressed address (bounce/complaint): skip WITHOUT stamping.
        if (await isEmailSuppressed(employerJob.contactEmail)) {
          skippedSuppressed++
          continue
        }

        try {
          // ── PHASE 1: CLAIM (atomic, scalar predicate only) ──
          // Exactly-once rests entirely on this statement, so its WHERE is
          // deliberately limited to columns of the row being written: the
          // primary key and the null dedupe stamp. Prisma compiles that to a
          // single `UPDATE employer_jobs SET ... WHERE id = $1 AND
          // expiry_final_notice_sent_at IS NULL`. Under Postgres READ
          // COMMITTED a concurrent invocation blocks on the row lock, then
          // re-evaluates that predicate against the committed new version,
          // sees a non-null stamp and updates nothing. count === 0 therefore
          // means "somebody else owns this row": walk away, do not send.
          //
          // Relation filters (the expiry window, the renewal stamp) are
          // deliberately NOT in here. Prisma renders a relation filter as a
          // subquery, and a subquery's re-evaluation under READ COMMITTED is
          // not something this send can afford to depend on. They move to
          // phase 2 instead, where being wrong costs a skipped email rather
          // than a duplicate one.
          const claimed = await prisma.employerJob.updateMany({
            where: {
              id: employerJob.id,
              expiryFinalNoticeSentAt: null,
            },
            data: { expiryFinalNoticeSentAt: now },
          })
          if (claimed.count === 0) {
            skippedClaimLost++
            continue
          }

          // ── PHASE 2: VERIFY, still before any send ──
          // The claim is ours, so nothing else can send this row. Re-read the
          // posting and confirm it is still the thing we selected: a renewal,
          // an archive or an employer pause landing between the selection
          // query and the claim all show up here. If it changed, hand the
          // claim back (guarded on our own stamp) and send nothing.
          const fresh = await prisma.job.findUnique({
            where: { id: job.id },
            select: {
              expiresAt: true,
              createdAt: true,
              lastRenewedAt: true,
              archivedAt: true,
              isManuallyUnpublished: true,
            },
          })
          const stillEligible =
            !!fresh &&
            !!fresh.expiresAt &&
            fresh.archivedAt === null &&
            !fresh.isManuallyUnpublished &&
            fresh.expiresAt.getTime() >= noticeWindow.start.getTime() &&
            fresh.expiresAt.getTime() <= noticeWindow.end.getTime() &&
            !isIneligible(fresh)

          if (!stillEligible) {
            await releaseClaim(employerJob.id, now)
            skippedChangedUnderUs++
            continue
          }

          const result = await sendExpiryFinalNoticeEmail({
            email: employerJob.contactEmail,
            jobTitle: job.title,
            // The freshly read instant, so the date in the email is the date
            // in the database at send time.
            expiresAt: fresh.expiresAt!,
            stats,
            jobId: job.id,
            now,
          })

          if (result.success) {
            finalNoticesSent++
            continue
          }

          if (result.rejected) {
            // Definitive rejection: nothing was sent, so handing the claim
            // back is provably safe. Guarded on our own stamp so a concurrent
            // writer is never clobbered.
            await releaseClaim(employerJob.id, now)
            errors.push(`Final notice ${job.id}: rejected: ${result.error}`)
          } else {
            // Ambiguous failure: the request may already have reached Resend.
            // Keep the claim and fail closed. One missed notice beats a
            // duplicate "your listing expired".
            errors.push(`Final notice ${job.id}: ambiguous failure, claim kept: ${result.error}`)
            logger.error('Expiry final notice ambiguous failure; claim kept', result.error, { jobId: job.id })
          }
        } catch (e) {
          // The send path returns instead of throwing, so a throw here is a
          // database call: the claim, the phase-2 re-read, or a release. If it
          // was the claim, nothing was stamped and nothing was sent. If it was
          // a later call, the stamp may survive with no email behind it, which
          // is a miss rather than a duplicate. Either way this row is left
          // alone deliberately: a stuck claim is recoverable by hand, a second
          // "your listing expired" is not.
          errors.push(`Final notice ${job.id}: ${e}`)
          logger.error('Expiry final notice failed before or during claim', e, { jobId: job.id })
        }
      }

      if (dryRun) {
        return {
          response: NextResponse.json({
            success: true,
            dryRun: true,
            window: { start: noticeWindow.start.toISOString(), end: noticeWindow.end.toISOString() },
            wouldSendWarnings: warningPreviews,
            wouldSendFinalNotices: finalNoticePreviews,
            finalNoticeCandidates: finalCandidates.length,
            skippedIneligible,
            timestamp: now.toISOString(),
          }),
          metrics: {
            dryRun: true,
            candidates: expiringJobs.length,
            wouldSendWarnings: warningPreviews.length,
            finalNoticeCandidates: finalCandidates.length,
            wouldSendFinalNotices: finalNoticePreviews.length,
            skippedIneligible,
          },
        }
      }

      return {
        response: NextResponse.json({
          success: true,
          warningsSent: sentCount,
          finalNoticesSent,
          skippedIneligible,
          skippedSuppressed,
          skippedClaimLost,
          skippedChangedUnderUs,
          errors,
          timestamp: now.toISOString(),
        }),
        metrics: {
          candidates: expiringJobs.length,
          warningsSent: sentCount,
          finalNoticeCandidates: finalCandidates.length,
          finalNoticesSent,
          skippedIneligible,
          skippedSuppressed,
          skippedClaimLost,
          skippedChangedUnderUs,
          errors: errors.length,
        },
      }
    })
  } catch (error) {
      await sendCronFailureAlert('expiry-warnings', error);
    logger.error('Cron expiry-warnings error', error)
    return NextResponse.json({ error: 'Expiry warnings failed' }, { status: 500 })
  }
}
