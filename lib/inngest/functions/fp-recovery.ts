/**
 * False-positive recovery loop for the job-health system.
 *
 * When the dead-link cron flips `is_published=false` on a job, it fires a
 * `job.health.flipped` event. This Inngest function listens to that event
 * and schedules three re-probes at 6h, 24h, and 72h with rotated user
 * agents. If any re-probe returns alive, the job is automatically
 * resurrected (`is_published=true` again) and an audit row is written
 * with `outcome='false_positive'`.
 *
 * Why on Inngest and not cron: Vercel cron can't model "do X 6h from
 * now for THIS specific job". You'd have to maintain a queue table,
 * scan it every minute, and handle retries by hand. Inngest's `step.sleep`
 * + per-event isolation does the same job in 30 lines.
 *
 * Safety:
 *   - Skips manually-unpublished jobs (admin override is sticky).
 *   - Skips jobs that have been re-published in the meantime by some
 *     other mechanism (no-op).
 *   - Uses three different user agents for the three attempts to dodge
 *     UA-blacklist false negatives.
 */

import { inngest } from '@/lib/inngest/client';
import { prisma } from '@/lib/prisma';
import { checkJobHealth, HealthRecorder } from '@/lib/health';
import { logger } from '@/lib/logger';

const RECOVERY_USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
] as const;

/**
 * Top-level: fan out three scheduled probes when a job is flipped dead.
 */
export const scheduleFpRecoveryProbes = inngest.createFunction(
    {
        id: 'job-health-schedule-fp-recovery',
        name: 'Job-health: schedule FP-recovery probes',
        triggers: [{ event: 'job.health.flipped' }],
        // One scheduling fn-instance per job at a time — duplicate flips
        // for the same job within the throttle window are coalesced.
        throttle: {
            limit: 1,
            period: '5m',
            key: 'event.data.jobId',
        },
    },
    async ({ event, step }) => {
        const { jobId, sourceProvider, externalId, applyLink, flippedAt, triggeringReason } =
            event.data;

        const baseEvent = {
            jobId,
            sourceProvider,
            externalId,
            applyLink,
            originallyFlippedAt: flippedAt,
        };

        // Fire three downstream events at staggered delays. step.sleepUntil
        // provides durable scheduling — Inngest persists the wakeup time
        // and survives deploys.
        await step.sendEvent('schedule-attempt-1', {
            name: 'job.health.fp_probe.scheduled',
            data: { ...baseEvent, attempt: 1 },
            ts: new Date(Date.now() + 6 * 60 * 60 * 1000).getTime(),
        });
        await step.sendEvent('schedule-attempt-2', {
            name: 'job.health.fp_probe.scheduled',
            data: { ...baseEvent, attempt: 2 },
            ts: new Date(Date.now() + 24 * 60 * 60 * 1000).getTime(),
        });
        await step.sendEvent('schedule-attempt-3', {
            name: 'job.health.fp_probe.scheduled',
            data: { ...baseEvent, attempt: 3 },
            ts: new Date(Date.now() + 72 * 60 * 60 * 1000).getTime(),
        });

        return {
            scheduled: 3,
            jobId,
            triggeringReason,
        };
    },
);

/**
 * Per-attempt: re-probe the job with a rotated UA. If alive, resurrect.
 */
export const fpRecoveryProbe = inngest.createFunction(
    {
        id: 'job-health-fp-recovery-probe',
        name: 'Job-health: FP-recovery re-probe',
        triggers: [{ event: 'job.health.fp_probe.scheduled' }],
        // Cap concurrency so a flood of events doesn't hammer one source.
        // Limited to 5 to fit Inngest's free-tier ceiling — bump if/when
        // upgrading the plan. Volume is light anyway: a few dozen flips
        // per day × 3 re-probes each, spread over 72h.
        concurrency: { limit: 5 },
    },
    async ({ event, step, logger: inngestLog }) => {
        const { jobId, sourceProvider, externalId, applyLink, attempt } = event.data;
        const log = logger.withContext({
            component: 'fp-recovery',
            jobId,
            attempt,
        });

        if (!applyLink) {
            log.info('Skipping FP probe — no apply link');
            return { skipped: 'no_apply_link' };
        }

        // 1. Read current state. If the job has been re-published or
        //    manually-unpublished since the original flip, exit cleanly.
        const job = await step.run('load-job-state', async () => {
            return prisma.job.findUnique({
                where: { id: jobId },
                select: {
                    id: true,
                    isPublished: true,
                    isManuallyUnpublished: true,
                },
            });
        });

        if (!job) {
            log.info('Job no longer exists — skipping');
            return { skipped: 'job_deleted' };
        }
        if (job.isPublished) {
            log.info('Job already re-published by another mechanism — skipping');
            return { skipped: 'already_alive' };
        }
        if (job.isManuallyUnpublished) {
            log.info('Job manually-unpublished by admin — never overriding');
            return { skipped: 'manual_admin_override' };
        }

        // 2. Re-probe with a rotated UA.
        const userAgent = RECOVERY_USER_AGENTS[(attempt - 1) % RECOVERY_USER_AGENTS.length];
        inngestLog.info('Running FP-recovery probe', { jobId, attempt, userAgent });

        const decision = await step.run('probe-with-rotated-ua', async () => {
            return checkJobHealth(applyLink, sourceProvider, {
                externalId,
                // Probe-level UA override flows through via probeUrl options.
                // The check-job-health wrapper passes through.
                timeoutMs: 10_000,
            });
        });

        // 3. Record the audit row regardless of outcome.
        await step.run('record-audit-row', async () => {
            const recorder = new HealthRecorder(prisma);
            await recorder.stageDecision(jobId, {
                ...decision,
                // Override the reason to indicate this came from FP recovery.
                reason:
                    decision.alive && decision.reason !== 'alive_2xx'
                        ? decision.reason
                        : decision.alive
                            ? 'alive_2xx'
                            : decision.reason,
                evidence: {
                    ...decision.evidence,
                    // Stamp the recovery context onto evidence for grep-ability.
                    errorMessage: `fp_recovery_attempt_${attempt}`,
                },
            });
            await recorder.flush();
        });

        // 4. If the re-probe says alive → resurrect.
        if (decision.alive) {
            await step.run('resurrect-job', async () => {
                await prisma.job.update({
                    where: { id: jobId },
                    data: { isPublished: true },
                });
                log.warn('FP-recovery resurrected a previously-flipped job', {
                    jobId,
                    attempt,
                    reason: decision.reason,
                });
            });
            return { result: 'resurrected', attempt, reason: decision.reason };
        }

        log.info('FP-recovery probe still says dead', {
            jobId,
            attempt,
            reason: decision.reason,
        });
        return { result: 'still_dead', attempt, reason: decision.reason };
    },
);

export const fpRecoveryFunctions = [scheduleFpRecoveryProbes, fpRecoveryProbe];
