/**
 * lib/match-digest-service.ts — employer match digests (Feature 1).
 *
 * Daily cron pipeline: for every LIVE employer posting, vector-match visible
 * candidates against the JD (embeddings only — NO LLM rerank, this is the
 * cost-capped bulk path), threshold on similarity, exclude candidates already
 * surfaced for that posting or already applied to it, and email the employer
 * up to 5 privacy-safe candidate cards that link back into the platform via
 * the click tracker.
 *
 * HARD SEND GATES (organizational rule — every send path):
 *   - process.env.ENABLE_EMPLOYER_MATCH_DIGESTS === '1' (default OFF)
 *   - dryRun mode computes everything and sends/writes NOTHING
 *   - suppression + unsubscribe respected on every send
 *   - shared lifecycle cap: max 1 connect-feature email per recipient per
 *     7 days (across CONNECT_LIFECYCLE_EMAIL_TYPES)
 *   - per-posting cooldown: max 1 digest per posting per 7 days
 *   - follow-up: exactly once per digest, 4+ days later, unclicked, post
 *     still live (exempt from the shared cap by spec — it is the second
 *     half of an allowance already granted, never a new one)
 *
 * Concurrency discipline copied from lib/job-alerts-service.ts: the
 * MatchDigestEmail row is the claim and is written BEFORE the send is
 * handed to Resend. A definitive rejection deletes the claim (retry next
 * cycle); an ambiguous mid-flight throw keeps it (fail closed: fewer
 * emails, never doubles). Follow-ups claim via updateMany with a
 * followUpSentAt-null guard so concurrent runs cannot double-send.
 */

import { randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { embed } from '@/lib/ai/gateway';
import { semanticCandidateSearch } from '@/lib/ai/vector-search';
import {
  sendAndLog,
  isMarketingOptedOut,
  getOrCreateUnsubToken,
} from '@/lib/email-service';
import {
  buildMatchDigestHtml,
  buildMatchDigestSubject,
} from '@/lib/email/match-digest-template';
import {
  MATCH_DIGEST_ENV_FLAG,
  MIN_MATCH_SIMILARITY,
  MAX_CANDIDATES_PER_DIGEST,
  DIGEST_COOLDOWN_DAYS,
  FOLLOW_UP_AFTER_DAYS,
  MAX_DIGESTS_PER_RUN,
  MAX_FOLLOW_UPS_PER_RUN,
  SHARED_LIFECYCLE_CAP_DAYS,
  CONNECT_LIFECYCLE_EMAIL_TYPES,
  formatCandidateDisplayName,
  splitProfileList,
  type DigestCandidateCard,
} from '@/lib/email/match-digest-policy';

const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com').replace(/\/$/, '');
const DAY_MS = 24 * 60 * 60 * 1000;

/** Vector over-fetch before threshold + exclusion filtering. */
const VECTOR_FETCH_K = 50;

/** All real sends are gated on this. Default off. */
export function isMatchDigestSendingEnabled(): boolean {
  return process.env[MATCH_DIGEST_ENV_FLAG] === '1';
}

/** Opaque unguessable click token (base64url, 32 chars). */
export function generateClickToken(): string {
  return randomBytes(24).toString('base64url');
}

/**
 * UTC calendar day of a send, 'YYYY-MM-DD'. Stored on the claim row so
 * @@unique([employerJobId, sentDay]) can reject a duplicate claim from an
 * overlapping cron invocation. The 7-day cooldown check is a read followed by
 * a write, so on its own it only dedupes runs that do not overlap.
 */
export function digestSentDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Shared lifecycle frequency cap: true when the recipient received NO
 * connect-feature email in the trailing window. Admin '[TEST]' sends are
 * excluded so operator testing never blocks real traffic.
 */
export async function isUnderSharedLifecycleCap(
  email: string,
  now: Date = new Date(),
): Promise<boolean> {
  const since = new Date(now.getTime() - SHARED_LIFECYCLE_CAP_DAYS * DAY_MS);
  const recent = await prisma.emailSend.count({
    where: {
      to: email,
      emailType: { in: [...CONNECT_LIFECYCLE_EMAIL_TYPES] },
      createdAt: { gte: since },
      NOT: { subject: { startsWith: '[TEST]' } },
    },
  });
  return recent === 0;
}

// ─── JD embedding ─────────────────────────────────────────────────────────────

interface EmbeddingTextRow {
  embedding: string;
}

/**
 * Query vector for a posting. Reuses the job_embeddings row when the
 * embedding worker already produced one (zero cost); otherwise embeds the
 * same title + description text the talent-search postingId path uses.
 */
async function getJobQueryEmbedding(
  jobId: string,
  title: string,
  description: string | null,
): Promise<number[] | null> {
  try {
    const rows = await prisma.$queryRawUnsafe<EmbeddingTextRow[]>(
      `SELECT embedding::text AS embedding FROM job_embeddings WHERE job_id = $1`,
      jobId,
    );
    if (rows.length > 0 && rows[0].embedding) {
      const vec = rows[0].embedding
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map((n) => Number(n.trim()))
        .filter((n) => Number.isFinite(n));
      if (vec.length > 0) return vec;
    }
  } catch (err) {
    logger.warn('[MatchDigest] job_embeddings lookup failed; falling back to fresh embed', undefined, err);
  }

  const text = `${title}\n\n${(description ?? '').slice(0, 6000)}`.trim();
  if (text.length < 3) return null;
  try {
    const result = await embed({
      input: text,
      tenant: { type: 'system', id: 'match-digest' },
    });
    return result.embedding;
  } catch (err) {
    logger.warn('[MatchDigest] embed failed for posting', undefined, err);
    return null;
  }
}

// ─── Digest building ──────────────────────────────────────────────────────────

export interface BuiltDigest {
  found: boolean;
  reason?: 'not_found' | 'post_not_live' | 'no_jd_text' | 'no_matches';
  employerJobId?: string;
  jobId?: string;
  jobTitle?: string;
  /**
   * The address a real digest would go to: the OWNING ACCOUNT'S email, never
   * EmployerJob.contactEmail. contactEmail is free text on the post form (a
   * recruiter can type anything, including an address belonging to someone
   * with no relationship to this platform), so mailing it would push candidate
   * profile data plus recurring unsolicited marketing at an unverified third
   * party. The account email is the verified signup identity, is the only
   * login that can actually open the /employer links in the mail, and is what
   * the shared frequency cap is keyed on for this same human elsewhere.
   * Undefined when the posting has no linked account: then there is nobody to
   * send to and the digest is skipped.
   */
  recipientEmail?: string;
  candidates: DigestCandidateCard[];
}

/**
 * Compute the digest content for one posting. Pure read path — never writes,
 * never sends — shared by the cron and the admin test endpoint.
 *
 * Exclusions (always applied, so a test render mirrors the next real send):
 *   - candidates surfaced in ANY previous digest for this posting
 *   - candidates who already applied to this posting
 *   - candidates below MIN_MATCH_SIMILARITY
 *   - candidates who are not visible/open/job_seeker or are soft-deleted
 */
export async function buildDigestForPosting(employerJobId: string): Promise<BuiltDigest> {
  const employerJob = await prisma.employerJob.findUnique({
    where: { id: employerJobId },
    select: {
      id: true,
      jobId: true,
      user: { select: { email: true, deletedAt: true } },
      job: {
        select: {
          id: true,
          title: true,
          description: true,
          isPublished: true,
          archivedAt: true,
          expiresAt: true,
        },
      },
    },
  });
  if (!employerJob || !employerJob.job) {
    return { found: false, reason: 'not_found', candidates: [] };
  }
  const { job } = employerJob;
  // Owning account only. A soft-deleted owner is not mailable either.
  const recipientEmail =
    employerJob.user && !employerJob.user.deletedAt ? employerJob.user.email : undefined;
  const now = new Date();
  const isLive =
    job.isPublished &&
    !job.archivedAt &&
    (!job.expiresAt || job.expiresAt.getTime() > now.getTime());
  if (!isLive) {
    return {
      found: true,
      reason: 'post_not_live',
      employerJobId: employerJob.id,
      jobId: job.id,
      jobTitle: job.title,
      recipientEmail,
      candidates: [],
    };
  }

  const queryEmbedding = await getJobQueryEmbedding(job.id, job.title, job.description);
  if (!queryEmbedding) {
    return {
      found: true,
      reason: 'no_jd_text',
      employerJobId: employerJob.id,
      jobId: job.id,
      jobTitle: job.title,
      recipientEmail,
      candidates: [],
    };
  }

  const hits = (await semanticCandidateSearch(queryEmbedding, { k: VECTOR_FETCH_K }))
    .filter((h) => h.similarity >= MIN_MATCH_SIMILARITY);

  // History exclusion: never re-surface a candidate for the same posting.
  const history = await prisma.matchDigestEmail.findMany({
    where: { employerJobId: employerJob.id },
    select: { profileIds: true },
  });
  const surfaced = new Set(history.flatMap((h) => h.profileIds));

  // Applied exclusion: they already found this job on their own.
  const applications = await prisma.jobApplication.findMany({
    where: { jobId: job.id },
    select: { userId: true },
  });
  const applied = new Set(applications.map((a) => a.userId));

  const eligibleHits = hits.filter(
    (h) => !surfaced.has(h.supabaseId) && !applied.has(h.supabaseId),
  );
  if (eligibleHits.length === 0) {
    return {
      found: true,
      reason: 'no_matches',
      employerJobId: employerJob.id,
      jobId: job.id,
      jobTitle: job.title,
      recipientEmail,
      candidates: [],
    };
  }

  // Hydrate with the SAME visibility gates as /api/employer/talent/search.
  const profiles = await prisma.userProfile.findMany({
    where: {
      supabaseId: { in: eligibleHits.map((h) => h.supabaseId) },
      profileVisible: true,
      openToOffers: true,
      role: 'job_seeker',
      deletedAt: null,
    },
    select: {
      supabaseId: true,
      firstName: true,
      lastName: true,
      headline: true,
      yearsExperience: true,
      licenseStates: true,
      specialties: true,
    },
  });
  const byId = new Map(profiles.map((p) => [p.supabaseId, p]));

  const candidates: DigestCandidateCard[] = [];
  for (const hit of eligibleHits) {
    if (candidates.length >= MAX_CANDIDATES_PER_DIGEST) break;
    const p = byId.get(hit.supabaseId);
    if (!p) continue;
    candidates.push({
      profileId: p.supabaseId,
      displayName: formatCandidateDisplayName(p.firstName, p.lastName),
      headline: p.headline,
      yearsExperience: p.yearsExperience,
      licenseStates: splitProfileList(p.licenseStates),
      specialties: splitProfileList(p.specialties),
      // Diagnostics only. Never rendered: see DigestCandidateCard.
      similarity: hit.similarity,
    });
  }

  return {
    found: true,
    reason: candidates.length === 0 ? 'no_matches' : undefined,
    employerJobId: employerJob.id,
    jobId: job.id,
    jobTitle: job.title,
    recipientEmail,
    candidates,
  };
}

// ─── Cron orchestration ───────────────────────────────────────────────────────

export interface DigestPreview {
  employerJobId: string;
  jobTitle: string;
  to: string;
  candidateCount: number;
  /** `similarity` is the raw cosine score, for threshold tuning only. */
  candidates: Array<{ displayName: string; similarity: number | null }>;
}

export interface MatchDigestRunResult {
  enabled: boolean;
  dryRun: boolean;
  postsConsidered: number;
  digestsSent: number;
  followUpsSent: number;
  skippedCooldown: number;
  skippedNoMatches: number;
  skippedSuppressed: number;
  skippedSharedCap: number;
  /**
   * Postings that were eligible but hit MAX_DIGESTS_PER_RUN. They are not
   * lost: the next run picks them up (oldest-first ordering plus the 7 day
   * cooldown on everything already served walks the estate forward).
   */
  deferredToNextRun: number;
  errors: string[];
  /** Populated in dryRun mode only. */
  previews: DigestPreview[];
  followUpPreviews: Array<{ digestId: string; to: string; jobTitle: string }>;
}

function emptyResult(enabled: boolean, dryRun: boolean): MatchDigestRunResult {
  return {
    enabled,
    dryRun,
    postsConsidered: 0,
    digestsSent: 0,
    followUpsSent: 0,
    skippedCooldown: 0,
    skippedNoMatches: 0,
    skippedSuppressed: 0,
    skippedSharedCap: 0,
    deferredToNextRun: 0,
    errors: [],
    previews: [],
    followUpPreviews: [],
  };
}

/**
 * Full daily run: new digests, then follow-ups.
 *
 * When the env flag is off and dryRun was not requested we return before
 * touching the matching pipeline at all — a disabled cron must not spend
 * embedding budget every day.
 */
export async function runMatchDigestCron(options: {
  dryRun?: boolean;
  now?: Date;
} = {}): Promise<MatchDigestRunResult> {
  const dryRun = options.dryRun ?? false;
  const now = options.now ?? new Date();
  const enabled = isMatchDigestSendingEnabled();
  const results = emptyResult(enabled, dryRun);

  if (!enabled && !dryRun) {
    logger.info(`[MatchDigest] ${MATCH_DIGEST_ENV_FLAG} not set; skipping run (no compute, no sends)`);
    return results;
  }

  // Every live employer posting that has an OWNING ACCOUNT to mail.
  //
  // The recipient is the account email, never EmployerJob.contactEmail. That
  // column is free text on the post form (see the comment on quotaDomain in
  // app/api/jobs/post-free): a poster can type any address at all, so using it
  // would ship candidate profile data and a recurring unsolicited email to an
  // unverified third party who never touched this platform. It would also open
  // a hole in the shared frequency cap, which is keyed on the address: the same
  // employer would be capped as their account email for lifecycle mail and
  // separately uncapped as whatever they typed here. Postings with no linked
  // account are skipped entirely — nobody could log in to use the mail anyway.
  const postRows = await prisma.employerJob.findMany({
    where: {
      userId: { not: null },
      user: { is: { deletedAt: null } },
      job: {
        isPublished: true,
        archivedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    },
    select: { id: true, user: { select: { email: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const posts = postRows
    .filter((row): row is typeof row & { user: { email: string } } => !!row.user?.email)
    .map((row) => ({ id: row.id, recipientEmail: row.user.email }));
  results.postsConsidered = posts.length;

  const cooldownCutoff = new Date(now.getTime() - DIGEST_COOLDOWN_DAYS * DAY_MS);

  // Cooldown state for the whole estate in ONE query. Doing this per posting
  // inside the loop meant a round trip per live posting before any useful work,
  // which is the first thing to eat the route's maxDuration as the board grows.
  const recentDigests = await prisma.matchDigestEmail.findMany({
    where: { employerJobId: { in: posts.map((p) => p.id) }, sentAt: { gte: cooldownCutoff } },
    select: { employerJobId: true },
    distinct: ['employerJobId'],
  });
  const underCooldown = new Set(recentDigests.map((d) => d.employerJobId));

  const suppressedEmails = new Set<string>();
  /** Addresses already mailed in THIS run: see the cap check below. */
  const sentThisRun = new Set<string>();

  // Counts the postings that reached the expensive stage this run (one
  // embedding + one vector search + one send each). The cheap eligibility
  // checks above it keep running for every posting so the counters stay
  // honest about the whole estate.
  let builtThisRun = 0;

  for (const post of posts) {
    try {
      // Per-posting cooldown (1 digest per posting per 7 days).
      if (underCooldown.has(post.id)) {
        results.skippedCooldown++;
        continue;
      }

      // Suppression AND explicit unsubscribe, cached per address. This is a
      // marketing-class email nobody opted into, so isEmailSuppressed is not
      // enough: it cannot see a hand unsubscribe (EmailLead.isSubscribed=false,
      // set by the visible Unsubscribe control on /email-preferences).
      if (suppressedEmails.has(post.recipientEmail)) {
        results.skippedSuppressed++;
        continue;
      }
      if (await isMarketingOptedOut(post.recipientEmail)) {
        suppressedEmails.add(post.recipientEmail);
        results.skippedSuppressed++;
        continue;
      }

      // Shared lifecycle cap (1 connect-feature email per recipient per 7d).
      // Two layers, because one employer commonly has several live postings:
      //   - the DB check covers previous runs and sibling connect features
      //   - sentThisRun covers THIS run, and does not depend on sendAndLog's
      //     EmailSend logging, which is deliberately non-blocking there and
      //     so cannot be trusted as the only within-run record of a send.
      if (sentThisRun.has(post.recipientEmail)) {
        results.skippedSharedCap++;
        continue;
      }
      if (!(await isUnderSharedLifecycleCap(post.recipientEmail, now))) {
        results.skippedSharedCap++;
        continue;
      }

      // Everything past this point costs an embedding and a vector search,
      // so the per-run ceiling applies here and not to the checks above.
      if (builtThisRun >= MAX_DIGESTS_PER_RUN) {
        results.deferredToNextRun++;
        continue;
      }
      builtThisRun++;

      const digest = await buildDigestForPosting(post.id);
      if (!digest.found || digest.candidates.length === 0) {
        results.skippedNoMatches++;
        continue;
      }

      if (dryRun) {
        results.previews.push({
          employerJobId: post.id,
          jobTitle: digest.jobTitle ?? '',
          to: post.recipientEmail,
          candidateCount: digest.candidates.length,
          candidates: digest.candidates.map((c) => ({
            displayName: c.displayName,
            similarity: c.similarity ?? null,
          })),
        });
        continue;
      }

      // ── CLAIM FIRST: the row goes in before Resend sees the email. ──
      // @@unique([employerJobId, sentDay]) makes this the real dedupe: a
      // concurrent invocation that also cleared the cooldown read loses the
      // INSERT race with P2002 and walks away instead of sending a second
      // digest for the same posting.
      const clickToken = generateClickToken();
      let claim: { id: string };
      try {
        claim = await prisma.matchDigestEmail.create({
          data: {
            employerJobId: post.id,
            profileIds: digest.candidates.map((c) => c.profileId),
            clickToken,
            sentAt: now,
            sentDay: digestSentDay(now),
          },
          select: { id: true },
        });
      } catch (claimErr) {
        if ((claimErr as { code?: string })?.code === 'P2002') {
          // Another run already claimed this posting today.
          results.skippedCooldown++;
          continue;
        }
        throw claimErr;
      }
      // Marked at CLAIM time, not on success, and deliberately left marked
      // even if the send is rejected below: a rejection is usually about the
      // address itself, so retrying it from another posting in the same run
      // would just produce a second failure. The posting is released and
      // picked up on the next run.
      sentThisRun.add(post.recipientEmail);

      const unsubToken = await getOrCreateUnsubToken(post.recipientEmail);
      const html = buildMatchDigestHtml({
        baseUrl: BASE_URL,
        jobTitle: digest.jobTitle ?? '',
        candidates: digest.candidates,
        clickToken,
        unsubscribeToken: unsubToken,
      });
      const subject = buildMatchDigestSubject({
        candidateCount: digest.candidates.length,
        jobTitle: digest.jobTitle ?? '',
      });

      try {
        const sendResult = await sendAndLog(
          { from: '', to: post.recipientEmail, subject, html },
          'employer_match_digest',
          { employerJobId: post.id, digestId: claim.id, candidateCount: digest.candidates.length },
          `${BASE_URL}/unsubscribe?token=${unsubToken}`,
        );
        if (sendResult?.error) {
          // Definitive rejection — nothing was sent. Release the claim so
          // the posting is re-selected next cycle.
          await prisma.matchDigestEmail.delete({ where: { id: claim.id } });
          results.errors.push(`Post ${post.id}: send rejected: ${sendResult.error.message}`);
          continue;
        }
        results.digestsSent++;
      } catch (sendErr) {
        // Ambiguous mid-flight failure — the request may have reached
        // Resend. Keep the claim: this posting skips a cycle rather than
        // risking a duplicate.
        const msg = sendErr instanceof Error ? sendErr.message : String(sendErr);
        results.errors.push(`Post ${post.id}: ambiguous send failure, claim kept: ${msg}`);
        logger.error('[MatchDigest] ambiguous send failure; claim kept', sendErr, { employerJobId: post.id });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.errors.push(`Post ${post.id}: ${msg}`);
      logger.error('[MatchDigest] posting pipeline failed', err, { employerJobId: post.id });
    }
  }

  await runFollowUps(results, { dryRun, now, sentThisRun });

  logger.info('[MatchDigest] run complete', {
    dryRun,
    postsConsidered: results.postsConsidered,
    digestsSent: results.digestsSent,
    followUpsSent: results.followUpsSent,
    skippedCooldown: results.skippedCooldown,
    skippedNoMatches: results.skippedNoMatches,
    skippedSuppressed: results.skippedSuppressed,
    skippedSharedCap: results.skippedSharedCap,
    deferredToNextRun: results.deferredToNextRun,
    errors: results.errors.length,
  });
  return results;
}

/**
 * The single follow-up per digest: 4+ days old, unclicked, never followed
 * up, posting still live. Claimed via updateMany with a null guard so a
 * concurrent run loses the race cleanly.
 */
async function runFollowUps(
  results: MatchDigestRunResult,
  opts: { dryRun: boolean; now: Date; sentThisRun: Set<string> },
): Promise<void> {
  const { dryRun, now, sentThisRun } = opts;
  const followUpCutoff = new Date(now.getTime() - FOLLOW_UP_AFTER_DAYS * DAY_MS);

  const due = await prisma.matchDigestEmail.findMany({
    where: {
      sentAt: { lte: followUpCutoff },
      clickedAt: null,
      followUpSentAt: null,
      employerJob: {
        // Same owning-account requirement as the digest pass, applied in SQL so
        // rows with no mailable owner do not eat the per-run take budget.
        userId: { not: null },
        user: { is: { deletedAt: null } },
        job: {
          isPublished: true,
          archivedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      },
    },
    select: {
      id: true,
      clickToken: true,
      profileIds: true,
      employerJob: {
        select: {
          id: true,
          // Owning account, never contactEmail: same reasoning as the digest
          // pass (BuiltDigest.recipientEmail).
          user: { select: { email: true, deletedAt: true } },
          job: { select: { title: true } },
        },
      },
    },
    take: MAX_FOLLOW_UPS_PER_RUN,
  });

  for (const digest of due) {
    const owner = digest.employerJob.user;
    const jobTitle = digest.employerJob.job?.title ?? '';
    // The owning account went away (deleted or unlinked) between the digest and
    // its follow-up. Leave the row alone; there is nobody to remind.
    if (!owner?.email || owner.deletedAt) {
      results.skippedSuppressed++;
      continue;
    }
    const to = owner.email;
    try {
      if (await isMarketingOptedOut(to)) {
        results.skippedSuppressed++;
        continue;
      }

      // The follow-up is exempt from the 7 day shared cap by design: it is
      // the second half of an allowance already granted by the digest that
      // opened this row, and applying the cap here would block it every
      // single time (its own parent digest is always inside the window).
      // It is NOT exempt from "one email per recipient per run" though, so
      // an employer whose other posting just produced a digest above does
      // not also get a reminder in the same invocation.
      if (sentThisRun.has(to)) {
        results.skippedSharedCap++;
        continue;
      }

      if (dryRun) {
        results.followUpPreviews.push({ digestId: digest.id, to, jobTitle });
        continue;
      }

      // ── CLAIM FIRST: stamp followUpSentAt with a null guard. count === 0
      // means another run claimed it concurrently — walk away.
      const claimed = await prisma.matchDigestEmail.updateMany({
        where: { id: digest.id, followUpSentAt: null },
        data: { followUpSentAt: now },
      });
      if (claimed.count === 0) continue;
      sentThisRun.add(to);

      // Re-hydrate: candidates may have hidden their profiles since the
      // digest. If nobody is left, keep the stamp (never retry) and skip.
      const profiles = await prisma.userProfile.findMany({
        where: {
          supabaseId: { in: digest.profileIds },
          profileVisible: true,
          openToOffers: true,
          role: 'job_seeker',
          deletedAt: null,
        },
        select: {
          supabaseId: true,
          firstName: true,
          lastName: true,
          headline: true,
          yearsExperience: true,
          licenseStates: true,
          specialties: true,
        },
      });
      if (profiles.length === 0) continue;

      const cards: DigestCandidateCard[] = profiles.map((p) => ({
        profileId: p.supabaseId,
        displayName: formatCandidateDisplayName(p.firstName, p.lastName),
        headline: p.headline,
        yearsExperience: p.yearsExperience,
        licenseStates: splitProfileList(p.licenseStates),
        specialties: splitProfileList(p.specialties),
      }));

      const unsubToken = await getOrCreateUnsubToken(to);
      const html = buildMatchDigestHtml({
        baseUrl: BASE_URL,
        jobTitle,
        candidates: cards,
        clickToken: digest.clickToken,
        unsubscribeToken: unsubToken,
        isFollowUp: true,
      });
      const subject = buildMatchDigestSubject({
        candidateCount: cards.length,
        jobTitle,
        isFollowUp: true,
      });

      try {
        const sendResult = await sendAndLog(
          { from: '', to, subject, html },
          'employer_match_digest',
          { employerJobId: digest.employerJob.id, digestId: digest.id, followUp: true },
          `${BASE_URL}/unsubscribe?token=${unsubToken}`,
        );
        if (sendResult?.error) {
          // Definitive rejection — revert the claim (guarded on our stamp).
          await prisma.matchDigestEmail.updateMany({
            where: { id: digest.id, followUpSentAt: now },
            data: { followUpSentAt: null },
          });
          results.errors.push(`Digest ${digest.id}: follow-up rejected: ${sendResult.error.message}`);
          continue;
        }
        results.followUpsSent++;
      } catch (sendErr) {
        // Ambiguous — keep the claim, fail closed.
        const msg = sendErr instanceof Error ? sendErr.message : String(sendErr);
        results.errors.push(`Digest ${digest.id}: ambiguous follow-up failure, claim kept: ${msg}`);
        logger.error('[MatchDigest] ambiguous follow-up failure; claim kept', sendErr, { digestId: digest.id });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.errors.push(`Digest ${digest.id}: ${msg}`);
      logger.error('[MatchDigest] follow-up pipeline failed', err, { digestId: digest.id });
    }
  }
}

// ─── Admin outcome stats ──────────────────────────────────────────────────────

export interface MatchDigestStats {
  scope: 'all' | 'posting';
  digestsSent: number;
  clicked: number;
  clickRatePercent: number;
  followUpsSent: number;
  last30d: { digestsSent: number; clicked: number; followUpsSent: number };
}

/** Outcome counts surfaced by the admin test endpoint (GET). */
export async function getMatchDigestStats(employerJobId?: string): Promise<MatchDigestStats> {
  const scopeWhere = employerJobId ? { employerJobId } : {};
  const since30d = new Date(Date.now() - 30 * DAY_MS);

  const [digestsSent, clicked, followUpsSent, recentSent, recentClicked, recentFollowUps] =
    await Promise.all([
      prisma.matchDigestEmail.count({ where: scopeWhere }),
      prisma.matchDigestEmail.count({ where: { ...scopeWhere, clickedAt: { not: null } } }),
      prisma.matchDigestEmail.count({ where: { ...scopeWhere, followUpSentAt: { not: null } } }),
      prisma.matchDigestEmail.count({ where: { ...scopeWhere, sentAt: { gte: since30d } } }),
      prisma.matchDigestEmail.count({
        where: { ...scopeWhere, sentAt: { gte: since30d }, clickedAt: { not: null } },
      }),
      prisma.matchDigestEmail.count({
        where: { ...scopeWhere, followUpSentAt: { gte: since30d } },
      }),
    ]);

  return {
    scope: employerJobId ? 'posting' : 'all',
    digestsSent,
    clicked,
    clickRatePercent: digestsSent > 0 ? Math.round((clicked / digestsSent) * 100) : 0,
    followUpsSent,
    last30d: {
      digestsSent: recentSent,
      clicked: recentClicked,
      followUpsSent: recentFollowUps,
    },
  };
}
