/**
 * Emergency stop for automated outbound messaging.
 *
 * The connect features (lifecycle emails, employer match digests, system
 * messages) run by default: there is no env var to set to turn them on, and
 * no per-feature switch to remember. What remains is a single brake, for the
 * one case that matters, which is a defect discovered while a daily cron is
 * mailing real people. Setting OUTBOUND_MESSAGING_PAUSED=1 in the hosting
 * environment stops every automated send on the next invocation, with no
 * deploy and no code change. Unset it and sending resumes.
 *
 * This is deliberately NOT a feature flag. Normal operation requires nothing
 * to be set, and no feature is gated behind an operator remembering a
 * variable. Transactional mail (confirmations, application notifications,
 * expiry warnings) does not consult this and is never paused here.
 */
export function isOutboundPaused(): boolean {
  return process.env.OUTBOUND_MESSAGING_PAUSED === '1';
}

/** Human-readable reason for API responses and cron metrics. */
export const OUTBOUND_PAUSED_MESSAGE =
  'OUTBOUND_MESSAGING_PAUSED=1 is set, so automated sending is paused. Unset it to resume.';
