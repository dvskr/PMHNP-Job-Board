/**
 * Emergency stop for automated outbound messaging.
 *
 * The automated senders (job alert digests, candidate alerts, saved-job
 * reminders, the monthly employer report, lifecycle emails, employer match
 * digests, the recommendation digest, admin broadcasts and system messages)
 * run by default: there is no env var to set to turn them on, and no
 * per-feature switch to remember. What remains is a single brake, for the one
 * case that matters, which is a defect discovered while a daily cron is
 * mailing real people. Setting OUTBOUND_MESSAGING_PAUSED=1 in the hosting
 * environment stops every automated send on the next invocation, with no
 * deploy and no code change. Unset it and sending resumes.
 *
 * Enforced in two places, and it needs both: each cron and background job
 * checks it up front so a pause costs no work, and sendAndLog checks it at the
 * point mail actually leaves so a sender cannot be added that forgets. Job
 * alert digests bypass sendAndLog (Resend's batch API), which is exactly why
 * the cron-level check is not redundant.
 *
 * This is deliberately NOT a feature flag. Normal operation requires nothing
 * to be set, and no feature is gated behind an operator remembering a
 * variable. Transactional mail (confirmations, application notifications,
 * expiry warnings) does not consult this and is never paused here, and neither
 * are the two user-requested marketing emails (the alert confirmation and the
 * salary guide) that a person triggers and waits for.
 */
export function isOutboundPaused(): boolean {
  return process.env.OUTBOUND_MESSAGING_PAUSED === '1';
}

/** Human-readable reason for API responses and cron metrics. */
export const OUTBOUND_PAUSED_MESSAGE =
  'OUTBOUND_MESSAGING_PAUSED=1 is set, so automated sending is paused. Unset it to resume.';
