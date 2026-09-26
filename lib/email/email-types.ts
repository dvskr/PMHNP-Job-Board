/**
 * The EmailType union and the marketing/transactional split, in a module with
 * no imports of its own.
 *
 * These used to live in lib/email-service.ts. The template layer needs the
 * split too (an opt-out row belongs in marketing mail and nowhere else), and
 * lib/email-service.ts imports the templates, so the templates cannot import
 * it back. Keeping the classification here is what lets both sides agree on
 * it instead of each carrying its own idea of which mail is marketing.
 */

/**
 * Every value the platform sends. `sendAndLog` takes this type, so a typo, or
 * a new kind of mail added without deciding whether it is marketing, is a
 * compile error rather than a surprise in production.
 */
export type EmailType =
  | 'welcome_alert'
  | 'welcome_signup'
  | 'job_confirmation'
  | 'job_alert'
  | 'renewal_confirmation'
  | 'refund_confirmation'
  | 'expiry_warning'
  // Second and final email of the expiry sequence, sent ON the expiry date by
  // the same cron. Distinct from 'expiry_warning' so the two are countable
  // apart and a dedupe bug in one can never be read as the other.
  | 'expiry_final_notice'
  | 'draft_saved'
  | 'employer_message'
  | 'candidate_inquiry'
  | 'candidate_alert'
  | 'broadcast'
  | 'application_notification'
  | 'application_confirmation'
  | 'status_update'
  | 'performance_report'
  | 'saved_job_reminder'
  | 'salary_guide'
  | 'contact_confirmation'
  | 'contact_internal'
  | 'employer_outreach'
  | 'email_job'
  | 'auth_confirm'
  | 'recommendation_digest'
  | 'account_purge_warning'
  | 'pd_outreach'
  | 'employer_match_digest'
  | 'lifecycle'
  // Email piggyback for the weekly in-platform system nudge
  // (lib/system-messages.ts). Deliberately DISTINCT from 'employer_message':
  // a human-to-human message notification must never count against the
  // connect-feature frequency cap, and this automated nudge must.
  | 'system_message_nudge';

/**
 * Mail the recipient can opt out of. Everything else is transactional: a
 * receipt, a confirmation, or a notification about something they did.
 *
 * The distinction is not cosmetic. Unsubscribing sets EmailLead.isSubscribed
 * to false, which suppresses every marketing type at once. Offering that on a
 * refund receipt or a "your posting is live" confirmation means one click on a
 * transactional email silently switches off the job alerts the person asked
 * for, from a message that was never opt-out mail in the first place.
 */
export const MARKETING_EMAIL_TYPES = new Set<EmailType>([
  'welcome_alert', 'job_alert', 'salary_guide', 'broadcast',
  'performance_report', 'saved_job_reminder',
  'candidate_alert',
  'recommendation_digest',
  'pd_outreach',
  'employer_match_digest',
  'lifecycle',
  'system_message_nudge',
]);

/** True when the recipient may opt out of this kind of mail. */
export function isMarketingEmailType(emailType: EmailType): boolean {
  return MARKETING_EMAIL_TYPES.has(emailType);
}
