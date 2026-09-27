/**
 * Copy for each stage of a candidate's application, written per stage rather
 * than poured into one template.
 *
 * WHY THIS IS ITS OWN MODULE. It lives outside lib/email-service.ts so it can
 * be tested directly: tests/setup.ts mocks that module wholesale, so anything
 * exported from it is unreachable from a unit test, and copy that nobody can
 * assert on is copy that drifts.
 *
 * WHAT WAS WRONG BEFORE. Every stage was built from one sentence:
 *
 *   "Your application has moved to the <strong>{label}</strong> stage."
 *
 * which rendered a rejection as "moved to the not selected stage", in bold,
 * under a party emoji subject line, with a "View Application Details" button
 * pointing at a dead application. A rejection and an offer are not the same
 * message with a different noun in the slot, so they no longer share one.
 *
 * RULES APPLIED HERE, each of which the old version broke:
 *   - No emoji in subject lines.
 *   - The CTA follows the outcome. After a rejection the useful click is
 *     another role, not the application that just ended.
 *   - No em or en dashes, per the repo copy rule.
 *   - Plain, warm and brief. No stacked exclamation marks.
 *   - Nothing is bolded that the reader would not want emphasised.
 *
 * CONTRACT. `subject` and `preheader` are PLAIN TEXT and take RAW values.
 * `body` is HTML and takes values the caller has ALREADY ESCAPED. Getting
 * that backwards either double escapes the subject or injects into the body.
 */

export interface StatusCopy {
  /** Stage name for logs and the dashboard. Never shown bolded to a reader. */
  label: string;
  heading: string;
  subject: (job: string, employer: string) => string;
  body: (job: string, employer: string) => string;
  preheader: (job: string, employer: string) => string;
  ctaLabel: string;
  ctaPath: string;
}

export const STATUS_COPY: Record<string, StatusCopy> = {
  screening: {
    label: 'Under Review',
    heading: 'Your Application Is Under Review',
    subject: (job, employer) => `Your application is under review: ${job} at ${employer}`,
    body: (job, employer) =>
      `${employer} has begun reviewing your application for <strong>${job}</strong>. There is nothing you need to do right now. We will email you as soon as the status changes.`,
    preheader: (_job, employer) => `${employer} has begun reviewing your application.`,
    ctaLabel: 'View your application',
    ctaPath: '/my-applications',
  },
  interview: {
    label: 'Interview',
    heading: 'You Have Been Invited to Interview',
    subject: (job, employer) => `Interview invitation: ${job} at ${employer}`,
    body: (job, employer) =>
      `${employer} would like to interview you for <strong>${job}</strong>. They will contact you directly to arrange a time. It is worth re-reading the job description before you speak with them.`,
    preheader: (_job, employer) => `${employer} would like to interview you.`,
    ctaLabel: 'View your application',
    ctaPath: '/my-applications',
  },
  offered: {
    label: 'Offer Extended',
    heading: 'You Have Received an Offer',
    subject: (job, employer) => `Offer extended: ${job} at ${employer}`,
    body: (job, employer) =>
      `Congratulations. ${employer} has extended an offer for <strong>${job}</strong>. They will be in touch directly with the details and the next steps.`,
    preheader: (_job, employer) => `${employer} has extended an offer.`,
    ctaLabel: 'View your application',
    ctaPath: '/my-applications',
  },
  hired: {
    label: 'Hired',
    heading: 'Congratulations on Your New Role',
    subject: (job, employer) => `Congratulations: ${job} at ${employer}`,
    body: (job, employer) =>
      `${employer} has confirmed you for <strong>${job}</strong>. Congratulations from all of us here. We wish you every success in the role.`,
    preheader: (job) => `You have been hired for ${job}.`,
    ctaLabel: 'View your application',
    ctaPath: '/my-applications',
  },
  rejected: {
    label: 'Not Selected',
    // Deliberately neutral. A heading that delivers the verdict before the
    // reader has opened anything is not kinder for being direct, and this
    // heading is what shows in the preview pane next to the subject.
    heading: 'Update on Your Application',
    subject: (job, employer) => `Update on your application: ${job} at ${employer}`,
    body: (job, employer) =>
      `Thank you for applying for <strong>${job}</strong> at ${employer}. On this occasion the employer has decided to move forward with other candidates. We know that is disappointing. Your profile stays active, and new PMHNP roles are posted here every week.`,
    preheader: (_job, employer) => `${employer} is moving forward with other candidates.`,
    // Not "View Application Details". This application is over, and pointing
    // someone who was just turned down back at it is a dead end.
    ctaLabel: 'Browse current openings',
    ctaPath: '/jobs',
  },
};

/**
 * Copy for a status, or null when that status sends no mail (e.g. 'applied').
 *
 * Own-property checked, not a bare index. `STATUS_COPY['__proto__']` on an
 * object literal resolves to Object.prototype, which is truthy, so a plain
 * `?? null` would hand the caller a "copy" object whose every field is
 * undefined and send an email made of the word undefined. The status reaches
 * here from a request body on the employer's applicant tab.
 */
export function statusCopyFor(status: string): StatusCopy | null {
  if (!Object.prototype.hasOwnProperty.call(STATUS_COPY, status)) return null;
  return STATUS_COPY[status];
}
