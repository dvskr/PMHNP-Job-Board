/**
 * lib/email/match-digest-policy.ts — pure policy for employer match digests.
 *
 * Everything in this module is import-light and side-effect free so unit
 * tests can pin the cadence, threshold, and privacy rules without touching
 * Prisma, Resend, or the AI gateway. The orchestration lives in
 * lib/match-digest-service.ts; this file is its single source of truth for
 * "when is a send allowed" and "what may a card show".
 */

/** Env flag gating ALL real match-digest sends. Default off. */
export const MATCH_DIGEST_ENV_FLAG = 'ENABLE_EMPLOYER_MATCH_DIGESTS';

/**
 * Cosine-similarity floor for a candidate to appear in a digest. The talent
 * search endpoint surfaces unthresholded vector hits because an employer is
 * actively searching; an unsolicited email needs a floor so a thin candidate
 * pool never produces a digest of visibly bad matches.
 */
export const MIN_MATCH_SIMILARITY = 0.3;

/** Card cap per digest email. */
export const MAX_CANDIDATES_PER_DIGEST = 5;

/**
 * Ceiling on how many digests one cron invocation will actually build and
 * send. The cheap per-posting checks (cooldown, suppression, shared cap)
 * still run for every posting, so the run keeps advancing through the
 * estate; only the expensive work (one embedding + one vector search + one
 * send per posting) is bounded. Without this, the first run after the
 * operator flips the flag would try to digest every live posting at once
 * and blow the route's maxDuration. Postings are processed oldest-first and
 * a sent digest enters a 7 day cooldown, so successive runs naturally walk
 * the whole estate instead of re-serving the same head every day.
 */
export const MAX_DIGESTS_PER_RUN = 25;

/** Same bound for the follow-up pass. */
export const MAX_FOLLOW_UPS_PER_RUN = 25;

/** A posting may receive at most one digest per this many days. */
export const DIGEST_COOLDOWN_DAYS = 7;

/** The single follow-up goes out this many days after an unclicked digest. */
export const FOLLOW_UP_AFTER_DAYS = 4;

/**
 * Shared marketing/lifecycle frequency cap across ALL new connect-feature
 * email types: max 1 per recipient per this many days. Checked against
 * EmailSend rows (subject-prefix '[TEST]' rows excluded).
 */
export const SHARED_LIFECYCLE_CAP_DAYS = 7;

/**
 * Email types that count against the shared lifecycle cap. Sibling connect
 * features (candidate-side digests, system messages) append theirs here so
 * every sender checks one list.
 */
export const CONNECT_LIFECYCLE_EMAIL_TYPES: readonly string[] = [
  'employer_match_digest',
  // Product/lifecycle onboarding emails (lib/lifecycle-emails.ts, cron
  // /api/cron/lifecycle-emails). One EmailSend row per send, type 'lifecycle'.
  'lifecycle',
  // Email piggyback on the weekly in-platform system nudge
  // (lib/system-messages.ts, cron /api/cron/system-messages). It logs under
  // its OWN type rather than 'employer_message' precisely so it can appear
  // here: without this entry the nudge would check the cap but never consume
  // it, letting one employer receive a nudge and a match digest inside the
  // same 7 day window. Human-to-human 'employer_message' must stay out.
  'system_message_nudge',
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** True while the posting is inside its 7-day digest cooldown. */
export function isPostUnderDigestCooldown(
  lastDigestSentAt: Date | null,
  now: Date,
): boolean {
  if (!lastDigestSentAt) return false;
  return now.getTime() - lastDigestSentAt.getTime() < DIGEST_COOLDOWN_DAYS * DAY_MS;
}

export interface FollowUpCandidateRow {
  sentAt: Date;
  clickedAt: Date | null;
  followUpSentAt: Date | null;
}

/**
 * Pure predicate for "this digest is owed its one follow-up": 4+ days old,
 * never clicked, never followed up, and the posting is still live. Mirrors
 * the WHERE clause in the service so tests can pin the cadence without a DB.
 */
export function isFollowUpDue(
  digest: FollowUpCandidateRow,
  now: Date,
  postIsLive: boolean,
): boolean {
  if (!postIsLive) return false;
  if (digest.clickedAt) return false;
  if (digest.followUpSentAt) return false;
  return now.getTime() - digest.sentAt.getTime() >= FOLLOW_UP_AFTER_DAYS * DAY_MS;
}

/**
 * The privacy transform for candidate names shown to employers: first name
 * plus last initial. Identical rule to /api/employer/candidates and
 * /api/employer/talent/search — employers never see a candidate's full last
 * name outside the platform's tier gates.
 */
export function formatCandidateDisplayName(
  firstName: string | null,
  lastName: string | null,
): string {
  if (!firstName) return 'PMHNP Candidate';
  const initial = lastName ? `${lastName.charAt(0)}.` : '';
  return `${firstName} ${initial}`.trim();
}

/**
 * The complete set of candidate fields a digest card may carry. No email,
 * no phone, no resume URL, no full last name — the email links INTO the
 * platform where tier gates apply.
 *
 * Note there is deliberately NO "match score" here. Raw cosine similarity is
 * not a percentage of anything an employer would recognise: a genuinely
 * strong JD-to-profile pair sits around 0.4 to 0.6, so rendering it as
 * "45% match" would both understate the match and invent a metric the
 * product cannot defend. Vector rank order (best first) carries the ranking
 * honestly. `similarity` below is carried for operator diagnostics only and
 * is never rendered into an email.
 */
export interface DigestCandidateCard {
  /** UserProfile.supabaseId — used only to build the in-platform link. */
  profileId: string;
  /** Privacy-transformed: first name + last initial. */
  displayName: string;
  headline: string | null;
  yearsExperience: number | null;
  licenseStates: string[];
  specialties: string[];
  /**
   * Raw cosine similarity, OPERATOR DIAGNOSTICS ONLY (dry-run previews and
   * the admin test endpoint, so the threshold can be tuned against real
   * pools). Never rendered into employer-facing HTML. Absent on follow-ups,
   * which re-hydrate from stored profile ids rather than re-running search.
   */
  similarity?: number;
}

/** Split a comma-separated profile field into trimmed non-empty parts. */
export function splitProfileList(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
