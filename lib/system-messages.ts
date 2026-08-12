/**
 * In-platform system messages ("InMail" from the platform itself).
 *
 * Both sides of the marketplace get a weekly nudge INSIDE /messages, ridden
 * on the existing Conversation + EmployerMessage models so the UI needs zero
 * changes:
 *   - Employers: "Your <title> post has N new applications waiting" when a
 *     live post accumulated new applications in the last 7 days.
 *   - Candidates: "Jobs picked for you this week" built from fresh, untouched
 *     CandidateRecommendation rows, with a JobAlert-filter fallback for
 *     candidates who have an account + confirmed alert but no fresh recs.
 *
 * HARD SEND GATES (organizational rule: ship send-disabled):
 *   1. ENABLE_SYSTEM_MESSAGES env flag, default off. Real cron sends are
 *      refused both in the cron route AND inside sendSystemMessage.
 *   2. dryRun mode everywhere: counts and previews, zero writes.
 *   3. Admin test endpoint (app/api/admin/system-message-test) messages only
 *      the authenticated admin's own account.
 *
 * Sender identity: a dedicated UserProfile named 'PMHNP Hiring Team' with
 * role='system'. It never logs in (sentinel supabaseId), is invisible to
 * talent search (profileVisible=false) and is safe from the inactive-user
 * purge cron (that cron only targets role='job_seeker'). Messages are always
 * visibly from the platform, never a person, and every body carries an
 * automated-update footer because the /messages UI lets recipients reply
 * (replies land in the system profile's unread inbox, which is unmonitored;
 * the profile is emailSuppressed and the reply route honors that, so a reply
 * never turns into mail at the system address).
 *
 * Frequency cap: at most 1 system message per recipient per 7 days, enforced
 * by querying the system profile's own sent EmployerMessage rows. The message
 * row doubles as the claim (claim-first): the cap read and the delivering
 * insert target the same rows, and there is no post-claim send step that can
 * fail, so no revert path is needed (unlike job-alerts' lastSentAt stamp,
 * where the Resend call can fail after the claim).
 */
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { slugify } from '@/lib/utils';
import {
    getOrCreateUnsubToken,
    isMarketingOptedOut,
    sendEmployerMessageNotification,
} from '@/lib/email-service';
// Shared connect-feature frequency cap (1 lifecycle-ish email per address per
// 7 days across the match digest, lifecycle emails and this nudge). Owned by
// the match-digest feature; reused here, never reimplemented.
import { isUnderSharedLifecycleCap } from '@/lib/match-digest-service';
import { isOutboundPaused } from '@/lib/outbound-kill-switch';
import {
    jobMatchesAlert,
    type AlertMatchableJob,
    type AlertMatchCriteria,
} from '@/lib/job-alerts-service';
const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com').replace(/\/$/, '');
const DAY_MS = 24 * 60 * 60 * 1000;

// ─── System profile identity ─────────────────────────────────────────────────
// The sentinel supabaseId satisfies the unique+required constraint without a
// real Supabase auth user; nothing can ever log in as this profile.
export const SYSTEM_PROFILE_SUPABASE_ID = 'system-pmhnp-hiring';
/**
 * Stand-in id returned by a read-only (dryRun) bootstrap when the sender
 * profile does not exist yet. It is not a real UserProfile.id, so every read
 * keyed on it returns nothing, and it is never written anywhere.
 */
export const SYSTEM_PROFILE_UNCREATED_ID = 'system-profile-not-created';
/**
 * Sender address on the profile row. UserProfile.email is required+unique, so
 * the system profile must carry SOME address.
 *
 * The profile is created with emailSuppressed=true, and the reply route
 * (app/api/conversations/[id]) now honors that flag, so a recipient replying
 * inside /messages no longer triggers mail to this address. It therefore does
 * not have to be a deliverable mailbox. Point SYSTEM_PROFILE_EMAIL at a real
 * inbox only if you actually want to read replies; the value must stay unique
 * across UserProfile.email either way.
 */
export const SYSTEM_PROFILE_EMAIL = process.env.SYSTEM_PROFILE_EMAIL || 'system@pmhnphiring.com';
export const SYSTEM_PROFILE_NAME = 'PMHNP Hiring Team';
/**
 * UserProfile.role of the platform sender. Every surface that lists or mails
 * "users" must exclude it: it is an identity, not a person. Candidate browse
 * and talent search already do (they filter role='job_seeker'); the admin
 * broadcast audience filters on this constant.
 */
export const SYSTEM_PROFILE_ROLE = 'system';
export const SYSTEM_PROFILE_HEADLINE = 'Automated updates from PMHNP Hiring';

// Subject prefix marks system threads unmistakably as platform mail.
export const SYSTEM_SUBJECT_PREFIX = 'PMHNP Hiring: ';

// ─── Tunables ────────────────────────────────────────────────────────────────
export const SYSTEM_MESSAGE_CAP_DAYS = 7;
export const SIGNAL_LOOKBACK_DAYS = 7;
/**
 * Combined signal strength (new applications + unviewed strong matches) a post
 * must clear before its employer is worth interrupting. Deliberately above 1:
 * a single application already triggers the per-application email when the post
 * has notifyOnApplication set, and this nudge exists for accumulated,
 * unattended signal, not for duplicating that.
 */
export const MIN_SIGNAL_STRENGTH = 2;
export const MAX_JOBS_PER_CANDIDATE_MESSAGE = 3;
export const MAX_RECIPIENTS_PER_SIDE = 200;
/** Upper bound on the recommendation scan, keeps the run inside maxDuration. */
const MAX_FRESH_RECOMMENDATION_ROWS = 5000;
const MAX_TITLE_CHARS = 80;
const MAX_DRY_RUN_PREVIEWS = 5;

/**
 * In-platform messages send by default. The only control is the shared
 * emergency brake (lib/outbound-kill-switch).
 */
export function isSystemMessagesEnabled(): boolean {
    return !isOutboundPaused();
}

/**
 * The employer email piggyback stays OPT-IN, and deliberately so. An
 * in-platform message costs nothing if it misfires: it sits in a thread the
 * recipient may never open. An email spends sender reputation on domains that
 * were warmed over weeks, and this particular mail is the least essential of
 * everything we send (it announces activity the recipient can already see on
 * their dashboard). Turning it on is a decision about deliverability budget,
 * not about whether the feature works, so it is not covered by "enable
 * everything": set SYSTEM_MESSAGE_EMAILS=1 when you want it.
 */
export function isSystemMessageEmailEnabled(): boolean {
    const value = process.env.SYSTEM_MESSAGE_EMAILS;
    return isSystemMessagesEnabled() && (value === '1' || value === 'true');
}

// ─── System profile bootstrap ────────────────────────────────────────────────

/**
 * Find or create the platform sender profile. Code-level bootstrap (no
 * migration): emailSuppressed so no lifecycle email ever targets it,
 * profileVisible=false + openToOffers=false so it can never surface in
 * employer talent search, role='system' so job_seeker-scoped crons
 * (candidate alerts, inactive-user purge) never touch it.
 */
export async function getOrCreateSystemProfile(
    options: { create?: boolean } = {},
): Promise<{ id: string }> {
    const create = options.create ?? true;
    const existing = await prisma.userProfile.findUnique({
        where: { supabaseId: SYSTEM_PROFILE_SUPABASE_ID },
        select: { id: true, email: true },
    });
    if (existing && !create) return { id: existing.id };
    // A dry run must write NOTHING, and creating the sender profile is a write:
    // it puts a real UserProfile row in the table (visible to admin listings and
    // user counts) purely because someone asked for a preview. Reads against
    // this sentinel id match no rows, which is the honest answer for "no system
    // message has ever been sent".
    if (!existing && !create) return { id: SYSTEM_PROFILE_UNCREATED_ID };
    if (existing) {
        // Let the operator re-point SYSTEM_PROFILE_EMAIL at a real inbox after
        // the row exists (see the constant's operator note). Best-effort: a
        // unique collision with a human account must not break the run.
        if (existing.email !== SYSTEM_PROFILE_EMAIL) {
            try {
                await prisma.userProfile.update({
                    where: { id: existing.id },
                    data: { email: SYSTEM_PROFILE_EMAIL },
                });
            } catch (err) {
                logger.error('[SystemMessages] could not reconcile system profile email', err, {
                    configured: SYSTEM_PROFILE_EMAIL,
                });
            }
        }
        return { id: existing.id };
    }

    try {
        return await prisma.userProfile.create({
            data: {
                supabaseId: SYSTEM_PROFILE_SUPABASE_ID,
                email: SYSTEM_PROFILE_EMAIL,
                role: SYSTEM_PROFILE_ROLE,
                firstName: SYSTEM_PROFILE_NAME,
                headline: SYSTEM_PROFILE_HEADLINE,
                emailSuppressed: true,
                profileVisible: false,
                openToOffers: false,
            },
            select: { id: true },
        });
    } catch (err) {
        // Unique-violation race: two runs bootstrapping at once. Re-read.
        const raced = await prisma.userProfile.findUnique({
            where: { supabaseId: SYSTEM_PROFILE_SUPABASE_ID },
            select: { id: true },
        });
        if (raced) return raced;
        throw err;
    }
}

// ─── Message content builders (pure, unit-testable) ──────────────────────────

export interface SystemMessageContent {
    subject: string;
    body: string;
}

export interface DigestJob {
    id: string;
    title: string;
    employer: string;
}

// Recipients CAN reply in /messages (the UI has no concept of a no-reply
// thread), so every body says so explicitly instead of pretending otherwise.
const AUTOMATED_FOOTER =
    'This is an automated update from the PMHNP Hiring Team. Replies to this thread are not monitored.';

function truncateTitle(title: string): string {
    const trimmed = title.trim();
    return trimmed.length > MAX_TITLE_CHARS ? `${trimmed.slice(0, MAX_TITLE_CHARS - 3)}...` : trimmed;
}

/**
 * Employer nudge: unviewed strong signals on a specific live post. New
 * applications lead when present; strong matches (surfaced by the match
 * digest, never recomputed here) carry the message on their own otherwise.
 */
export function buildEmployerSignalMessage(
    jobTitle: string,
    newApplicationCount: number,
    strongMatchCount = 0,
): SystemMessageContent {
    const title = truncateTitle(jobTitle);
    const appNoun = newApplicationCount === 1 ? 'new application' : 'new applications';
    const matchNoun = strongMatchCount === 1 ? 'strong candidate match' : 'strong candidate matches';

    if (newApplicationCount < 1) {
        return {
            subject: `Your ${title} post has ${strongMatchCount} ${matchNoun} waiting`,
            body: [
                `Your ${title} post has ${strongMatchCount} ${matchNoun} waiting for review.`,
                `See your matched candidates here: ${BASE_URL}/employer/talent-search`,
                AUTOMATED_FOOTER,
            ].join('\n\n'),
        };
    }

    const summary = strongMatchCount > 0
        ? `Your ${title} post has ${newApplicationCount} ${appNoun} and ${strongMatchCount} ${matchNoun} waiting for review.`
        : `Your ${title} post has ${newApplicationCount} ${appNoun} waiting for review.`;
    return {
        subject: `Your ${title} post has ${newApplicationCount} ${appNoun} waiting`,
        body: [
            summary,
            `Review your applicants here: ${BASE_URL}/employer/applicants`,
            AUTOMATED_FOOTER,
        ].join('\n\n'),
    };
}

/** Candidate digest: up to 3 picked jobs with links into the platform. */
export function buildCandidateDigestMessage(jobs: DigestJob[]): SystemMessageContent {
    const lines = jobs.slice(0, MAX_JOBS_PER_CANDIDATE_MESSAGE).map(
        (job, index) =>
            `${index + 1}. ${truncateTitle(job.title)} at ${job.employer}\n${BASE_URL}/jobs/${slugify(job.title, job.id)}`,
    );
    return {
        subject: 'Jobs picked for you this week',
        body: [
            'Here are jobs picked for you this week:',
            ...lines,
            `See all of your matches on your dashboard: ${BASE_URL}/dashboard`,
            AUTOMATED_FOOTER,
        ].join('\n\n'),
    };
}

// ─── Core send primitive ─────────────────────────────────────────────────────

export type SystemMessageStatus = 'sent' | 'dry_run' | 'capped' | 'disabled';

export interface SendSystemMessageParams {
    systemProfileId: string;
    recipientProfileId: string;
    /** Subject WITHOUT the prefix; SYSTEM_SUBJECT_PREFIX is applied here. */
    subject: string;
    body: string;
    jobId?: string | null;
    dryRun: boolean;
    /**
     * 'cron' enforces the env flag and the 7-day cap. 'admin_test' bypasses
     * both so the operator can iterate, but the admin endpoint hard-codes the
     * recipient to the authenticated admin's own profile.
     */
    context: 'cron' | 'admin_test';
    now?: Date;
}

export interface SendSystemMessageResult {
    status: SystemMessageStatus;
    subject: string;
    conversationId?: string;
    messageId?: string;
}

/** Recipient profile ids the system already messaged since `since` (batched cap check). */
export async function getRecentlyMessagedProfileIds(
    systemProfileId: string,
    recipientProfileIds: string[],
    since: Date,
): Promise<Set<string>> {
    if (recipientProfileIds.length === 0) return new Set();
    const rows = await prisma.employerMessage.findMany({
        where: {
            senderId: systemProfileId,
            recipientId: { in: recipientProfileIds },
            sentAt: { gt: since },
        },
        select: { recipientId: true },
        distinct: ['recipientId'],
    });
    return new Set(rows.map((row) => row.recipientId));
}

/**
 * System conversations always put the system profile as participantA so the
 * pair is deterministic. jobId=null rows are NOT covered by the DB unique
 * constraint (Postgres treats NULLs as distinct), hence find-first-then-create
 * with a race re-read instead of upsert.
 */
async function findOrCreateSystemConversation(
    systemProfileId: string,
    recipientProfileId: string,
    jobId: string | null,
    subject: string,
): Promise<string> {
    const where = { participantA: systemProfileId, participantB: recipientProfileId, jobId };
    const existing = await prisma.conversation.findFirst({ where, select: { id: true } });
    if (existing) return existing.id;
    try {
        const created = await prisma.conversation.create({
            data: { ...where, subject },
            select: { id: true },
        });
        return created.id;
    } catch (err) {
        const raced = await prisma.conversation.findFirst({ where, select: { id: true } });
        if (raced) return raced.id;
        throw err;
    }
}

/**
 * Send one system message. Enforces (for cron context) the env flag and the
 * 1-per-recipient-per-7-days cap; supports dryRun. The EmployerMessage insert
 * is both the delivery and the frequency-cap claim (see module docblock).
 */
export async function sendSystemMessage(
    params: SendSystemMessageParams,
): Promise<SendSystemMessageResult> {
    const now = params.now ?? new Date();
    const subject = params.subject.startsWith(SYSTEM_SUBJECT_PREFIX)
        ? params.subject
        : `${SYSTEM_SUBJECT_PREFIX}${params.subject}`;

    // Defense in depth: the cron route already gates on the flag, but a real
    // cron-context send is refused here too so no future caller can bypass it.
    if (!params.dryRun && params.context === 'cron' && !isSystemMessagesEnabled()) {
        return { status: 'disabled', subject };
    }

    if (params.context === 'cron') {
        const capCutoff = new Date(now.getTime() - SYSTEM_MESSAGE_CAP_DAYS * DAY_MS);
        const recent = await prisma.employerMessage.findFirst({
            where: {
                senderId: params.systemProfileId,
                recipientId: params.recipientProfileId,
                sentAt: { gt: capCutoff },
            },
            select: { id: true },
        });
        if (recent) return { status: 'capped', subject };
    }

    if (params.dryRun) return { status: 'dry_run', subject };

    const conversationId = await findOrCreateSystemConversation(
        params.systemProfileId,
        params.recipientProfileId,
        params.jobId ?? null,
        subject,
    );

    const message = await prisma.employerMessage.create({
        data: {
            senderId: params.systemProfileId,
            recipientId: params.recipientProfileId,
            conversationId,
            jobId: params.jobId ?? null,
            subject,
            body: params.body,
        },
        select: { id: true },
    });

    // Same behavior as a human reply: bump recency and undo soft-deletes so
    // the thread reappears in both inboxes.
    await prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: now, deletedByA: false, deletedByB: false },
    });

    return { status: 'sent', subject, conversationId, messageId: message.id };
}

// ─── Employer side ───────────────────────────────────────────────────────────

interface LivePost {
    /** Job.id (application counts, message jobId link). */
    jobId: string;
    /** EmployerJob.id (MatchDigestEmail.employerJobId anchor). */
    employerJobRowId: string;
    title: string;
    notifyOnApplication: boolean;
    notifyDigest: string;
}

interface EmployerRecipient {
    id: string;
    supabaseId: string;
    email: string | null;
    firstName: string | null;
    emailSuppressed: boolean;
}

export interface SideRunMetrics {
    /** Recipients actually evaluated this run (after the per-run ceiling). */
    considered: number;
    /** Real sends, or would-be sends when dryRun is true. */
    sent: number;
    capped: number;
    skipped: number;
    /** Eligible recipients left for the next run by MAX_RECIPIENTS_PER_SIDE. */
    deferred: number;
    previews: { recipientProfileId: string; subject: string }[];
}

function emptyMetrics(): SideRunMetrics {
    return { considered: 0, sent: 0, capped: 0, skipped: 0, deferred: 0, previews: [] };
}

/**
 * Unviewed strong matches per post, REUSED from the match digest's
 * MatchDigestEmail ledger (the match source of truth), never recomputed:
 * candidates surfaced in still-unclicked digests inside the lookback window,
 * deduped per post. Keyed by EmployerJob.id.
 *
 * The ledger records who was surfaced at SEND time, and this count is rendered
 * into employer-facing copy ("N strong candidate matches waiting"). A candidate
 * can hide their profile, withdraw from offers or delete their account between
 * that send and this run, so the stored ids are re-checked against the same
 * visibility gates the match digest and talent search apply before they are
 * counted. Without that, the message would promise matches the employer cannot
 * actually see when they follow the link, and it would leak the fact that a
 * now-hidden candidate had been surfaced.
 */
async function countUnviewedMatchesByPost(
    employerJobRowIds: string[],
    since: Date,
): Promise<Map<string, number>> {
    if (employerJobRowIds.length === 0) return new Map();
    const digests = await prisma.matchDigestEmail.findMany({
        where: {
            employerJobId: { in: employerJobRowIds },
            sentAt: { gt: since },
            clickedAt: null,
        },
        select: { employerJobId: true, profileIds: true },
    });
    if (digests.length === 0) return new Map();

    const allProfileIds = [...new Set(digests.flatMap((digest) => digest.profileIds))];
    const stillVisible = new Set(
        (
            await prisma.userProfile.findMany({
                where: {
                    supabaseId: { in: allProfileIds },
                    profileVisible: true,
                    openToOffers: true,
                    role: 'job_seeker',
                    deletedAt: null,
                },
                select: { supabaseId: true },
            })
        ).map((profile) => profile.supabaseId),
    );

    const surfacedByPost = new Map<string, Set<string>>();
    for (const digest of digests) {
        const surfaced = surfacedByPost.get(digest.employerJobId) ?? new Set<string>();
        for (const profileId of digest.profileIds) {
            if (stillVisible.has(profileId)) surfaced.add(profileId);
        }
        surfacedByPost.set(digest.employerJobId, surfaced);
    }
    return new Map([...surfacedByPost.entries()].map(([id, set]) => [id, set.size]));
}

async function fetchLivePostsByEmployer(now: Date): Promise<Map<string, LivePost[]>> {
    const posts = await prisma.employerJob.findMany({
        where: {
            userId: { not: null },
            job: {
                isPublished: true,
                OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
        },
        select: {
            id: true,
            jobId: true,
            userId: true,
            notifyOnApplication: true,
            notifyDigest: true,
            job: { select: { title: true } },
        },
    });
    const byUser = new Map<string, LivePost[]>();
    for (const post of posts) {
        if (!post.userId) continue;
        const list = byUser.get(post.userId) ?? [];
        byUser.set(post.userId, [
            ...list,
            {
                jobId: post.jobId,
                employerJobRowId: post.id,
                title: post.job.title,
                notifyOnApplication: post.notifyOnApplication,
                notifyDigest: post.notifyDigest,
            },
        ]);
    }
    return byUser;
}

async function countNewApplicationsByJob(jobIds: string[], since: Date): Promise<Map<string, number>> {
    if (jobIds.length === 0) return new Map();
    const rows = await prisma.jobApplication.groupBy({
        by: ['jobId'],
        where: {
            jobId: { in: jobIds },
            status: 'applied',
            withdrawnAt: null,
            appliedAt: { gt: since },
        },
        _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.jobId, row._count._all]));
}

/**
 * Email piggyback for the employer nudge. Every one of these must pass before
 * a byte leaves the building, and any failure leaves the nudge message-only:
 *   1. ENABLE_SYSTEM_MESSAGE_EMAILS (which itself requires ENABLE_SYSTEM_MESSAGES)
 *   2. the recipient's own per-post prefs (notifyOnApplication, digest not 'off')
 *   3. opt-out: the profile flag plus isMarketingOptedOut, which also honours
 *      an explicit unsubscribe (EmailLead.isSubscribed=false). This nudge is
 *      marketing-class mail nobody opted into, so a hand unsubscribe is the
 *      only consent signal there is and isEmailSuppressed cannot see it.
 *   4. the shared connect-feature cap: 1 lifecycle-ish email per address per
 *      7 days across the match digest, lifecycle emails, and this nudge. The
 *      send is logged as 'system_message_nudge' (NOT 'employer_message') so it
 *      consumes the cap it just checked.
 */
async function maybeNotifyEmployerByEmail(
    recipient: EmployerRecipient,
    post: LivePost,
    content: SystemMessageContent,
    now: Date,
): Promise<void> {
    if (!isSystemMessageEmailEnabled()) return;
    if (!post.notifyOnApplication || post.notifyDigest === 'off') return;
    if (!recipient.email || recipient.emailSuppressed) return;
    if (await isMarketingOptedOut(recipient.email)) return;
    if (!(await isUnderSharedLifecycleCap(recipient.email, now))) return;
    try {
        const unsubToken = await getOrCreateUnsubToken(recipient.email);
        await sendEmployerMessageNotification(
            recipient.email,
            recipient.firstName,
            SYSTEM_PROFILE_NAME,
            null,
            content.subject,
            content.body,
            post.title,
            {
                emailType: 'system_message_nudge',
                // The default lead sentence says a candidate reached out. The
                // sender here is the platform, so that would be untrue.
                intro: 'here is an automated update on your live posting.',
                unsubscribeUrl: `${BASE_URL}/unsubscribe?token=${unsubToken}`,
            },
        );
    } catch (err) {
        logger.error('[SystemMessages] employer email notification failed', err, {
            recipientProfileId: recipient.id,
        });
    }
}

async function runEmployerSide(
    systemProfileId: string,
    now: Date,
    dryRun: boolean,
): Promise<SideRunMetrics> {
    const metrics = emptyMetrics();
    const byUser = await fetchLivePostsByEmployer(now);
    if (byUser.size === 0) return metrics;

    const allRecipients: EmployerRecipient[] = await prisma.userProfile.findMany({
        where: { supabaseId: { in: [...byUser.keys()] }, deletedAt: null },
        select: { id: true, supabaseId: true, email: true, firstName: true, emailSuppressed: true },
    });
    const recipients = allRecipients.slice(0, MAX_RECIPIENTS_PER_SIDE);
    metrics.considered = recipients.length;
    metrics.deferred = allRecipients.length - recipients.length;

    // Non-capped recipients have no system message in the last 7 days, so the
    // "since last system message" cutoff collapses to the 7-day lookback.
    const since = new Date(now.getTime() - SIGNAL_LOOKBACK_DAYS * DAY_MS);
    const posts = [...byUser.values()].flat();
    const appCounts = await countNewApplicationsByJob(posts.map((post) => post.jobId), since);
    // Batched (never per-post inside the loop): strong matches come from the
    // match digest's own ledger, keyed by EmployerJob.id.
    const matchCounts = await countUnviewedMatchesByPost(
        posts.map((post) => post.employerJobRowId),
        since,
    );
    const capCutoff = new Date(now.getTime() - SYSTEM_MESSAGE_CAP_DAYS * DAY_MS);
    const cappedSet = await getRecentlyMessagedProfileIds(
        systemProfileId,
        recipients.map((recipient) => recipient.id),
        capCutoff,
    );

    for (const recipient of recipients) {
        if (cappedSet.has(recipient.id)) {
            metrics.capped++;
            continue;
        }
        // Applications and matches are tracked separately all the way into the
        // copy: collapsing them into one number would make the message claim
        // applications that do not exist.
        let best: { post: LivePost; apps: number; matches: number; total: number } | null = null;
        for (const post of byUser.get(recipient.supabaseId) ?? []) {
            const apps = appCounts.get(post.jobId) ?? 0;
            const matches = matchCounts.get(post.employerJobRowId) ?? 0;
            const total = apps + matches;
            if (!best || total > best.total) best = { post, apps, matches, total };
        }
        if (!best || best.total < MIN_SIGNAL_STRENGTH) {
            metrics.skipped++;
            continue;
        }
        const content = buildEmployerSignalMessage(best.post.title, best.apps, best.matches);
        const result = await sendSystemMessage({
            systemProfileId,
            recipientProfileId: recipient.id,
            subject: content.subject,
            body: content.body,
            jobId: best.post.jobId,
            dryRun,
            context: 'cron',
            now,
        });
        recordSendResult(metrics, result, recipient.id);
        if (result.status === 'sent') {
            await maybeNotifyEmployerByEmail(recipient, best.post, content, now);
        }
    }
    return metrics;
}

function recordSendResult(
    metrics: SideRunMetrics,
    result: SendSystemMessageResult,
    recipientProfileId: string,
): void {
    if (result.status === 'sent' || result.status === 'dry_run') {
        metrics.sent++;
        if (metrics.previews.length < MAX_DRY_RUN_PREVIEWS) {
            metrics.previews.push({ recipientProfileId, subject: result.subject });
        }
    } else if (result.status === 'capped') {
        metrics.capped++;
    } else {
        metrics.skipped++;
    }
}

// ─── Candidate side ──────────────────────────────────────────────────────────

interface CandidateTarget {
    profileId: string;
    jobs: DigestJob[];
}

/** Fresh (unclicked, undismissed, last 7 days) recommendations per candidate. */
async function fetchFreshRecommendationTargets(since: Date): Promise<Map<string, DigestJob[]>> {
    const recommendations = await prisma.candidateRecommendation.findMany({
        where: { createdAt: { gt: since }, clickedAt: null, dismissedAt: null },
        // Global rank ordering under a bound: the ceiling trims the weakest
        // recommendations across the board, never a whole candidate's set.
        orderBy: { rank: 'asc' },
        take: MAX_FRESH_RECOMMENDATION_ROWS,
        select: {
            supabaseId: true,
            job: { select: { id: true, title: true, employer: true, isPublished: true } },
        },
    });
    const bySupabaseId = new Map<string, DigestJob[]>();
    for (const rec of recommendations) {
        if (!rec.job.isPublished) continue;
        const jobs = bySupabaseId.get(rec.supabaseId) ?? [];
        if (jobs.length >= MAX_JOBS_PER_CANDIDATE_MESSAGE) continue;
        if (jobs.some((job) => job.id === rec.job.id)) continue;
        bySupabaseId.set(rec.supabaseId, [
            ...jobs,
            { id: rec.job.id, title: rec.job.title, employer: rec.job.employer },
        ]);
    }
    return bySupabaseId;
}

const ALERT_JOB_SELECT = {
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
} as const;

/**
 * Fallback source: candidates with an account and a confirmed active JobAlert
 * whose filters match employer posts published in the last 7 days. Reuses the
 * shared jobMatchesAlert matcher so this never drifts from the email digest.
 */
async function fetchAlertFallbackTargets(
    coveredProfileIds: Set<string>,
    since: Date,
    now: Date,
): Promise<CandidateTarget[]> {
    const recentEmployerJobs = await prisma.job.findMany({
        where: {
            isPublished: true,
            createdAt: { gt: since },
            employerJobs: { isNot: null },
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: ALERT_JOB_SELECT,
    });
    if (recentEmployerJobs.length === 0) return [];

    const alerts = await prisma.jobAlert.findMany({
        where: { isActive: true, confirmedAt: { not: null } },
        select: {
            email: true,
            keyword: true,
            location: true,
            mode: true,
            jobType: true,
            minSalary: true,
            maxSalary: true,
            newGradFriendly: true,
            minYearsExperience: true,
        },
    });
    if (alerts.length === 0) return [];

    // Keyed case-insensitively: JobAlert.email and UserProfile.email are
    // entered by humans in two different forms, and Prisma's `in` is exact.
    const alertsByEmail = new Map<string, AlertMatchCriteria[]>();
    for (const alert of alerts) {
        const key = alert.email.toLowerCase();
        alertsByEmail.set(key, [...(alertsByEmail.get(key) ?? []), alert]);
    }
    const profiles = await prisma.userProfile.findMany({
        where: {
            email: { in: alerts.map((alert) => alert.email), mode: 'insensitive' },
            role: 'job_seeker',
            deletedAt: null,
        },
        select: { id: true, email: true },
    });

    const targets: CandidateTarget[] = [];
    for (const profile of profiles) {
        if (coveredProfileIds.has(profile.id)) continue;
        const criteria = alertsByEmail.get(profile.email.toLowerCase()) ?? [];
        const jobs: DigestJob[] = [];
        for (const job of recentEmployerJobs) {
            if (jobs.length >= MAX_JOBS_PER_CANDIDATE_MESSAGE) break;
            const matchable: AlertMatchableJob = job;
            if (criteria.some((alert) => jobMatchesAlert(matchable, alert))) {
                jobs.push({ id: job.id, title: job.title, employer: job.employer });
            }
        }
        if (jobs.length > 0) targets.push({ profileId: profile.id, jobs });
    }
    return targets;
}

async function runCandidateSide(
    systemProfileId: string,
    now: Date,
    dryRun: boolean,
): Promise<SideRunMetrics> {
    const metrics = emptyMetrics();
    const since = new Date(now.getTime() - SIGNAL_LOOKBACK_DAYS * DAY_MS);

    const recTargets = await fetchFreshRecommendationTargets(since);
    const targets: CandidateTarget[] = [];
    if (recTargets.size > 0) {
        // Candidate side requires an ACCOUNT; profileVisible is irrelevant here
        // because the message goes TO the candidate about jobs.
        const profiles = await prisma.userProfile.findMany({
            where: { supabaseId: { in: [...recTargets.keys()] }, role: 'job_seeker', deletedAt: null },
            select: { id: true, supabaseId: true },
        });
        for (const profile of profiles) {
            const jobs = recTargets.get(profile.supabaseId);
            if (jobs && jobs.length > 0) targets.push({ profileId: profile.id, jobs });
        }
    }
    const covered = new Set(targets.map((target) => target.profileId));
    targets.push(...(await fetchAlertFallbackTargets(covered, since, now)));

    const batch = targets.slice(0, MAX_RECIPIENTS_PER_SIDE);
    metrics.considered = batch.length;
    metrics.deferred = targets.length - batch.length;

    const capCutoff = new Date(now.getTime() - SYSTEM_MESSAGE_CAP_DAYS * DAY_MS);
    const cappedSet = await getRecentlyMessagedProfileIds(
        systemProfileId,
        batch.map((target) => target.profileId),
        capCutoff,
    );

    for (const target of batch) {
        if (cappedSet.has(target.profileId)) {
            metrics.capped++;
            continue;
        }
        const content = buildCandidateDigestMessage(target.jobs);
        const result = await sendSystemMessage({
            systemProfileId,
            recipientProfileId: target.profileId,
            subject: content.subject,
            body: content.body,
            jobId: null,
            dryRun,
            context: 'cron',
            now,
        });
        recordSendResult(metrics, result, target.profileId);
    }
    return metrics;
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

export interface SystemMessagesRunSummary {
    enabled: boolean;
    dryRun: boolean;
    employer: SideRunMetrics;
    candidate: SideRunMetrics;
}

export interface RunSystemMessagesOptions {
    dryRun: boolean;
    side?: 'employer' | 'candidate';
    now?: Date;
}

/** Run both sides (or one, via `side`) and return per-side metrics. */
export async function runSystemMessages(
    options: RunSystemMessagesOptions,
): Promise<SystemMessagesRunSummary> {
    const now = options.now ?? new Date();
    // dryRun is read-only all the way down, bootstrap included.
    const system = await getOrCreateSystemProfile({ create: !options.dryRun });

    const employer =
        options.side === 'candidate'
            ? emptyMetrics()
            : await runEmployerSide(system.id, now, options.dryRun);
    const candidate =
        options.side === 'employer'
            ? emptyMetrics()
            : await runCandidateSide(system.id, now, options.dryRun);

    const summary: SystemMessagesRunSummary = {
        enabled: isSystemMessagesEnabled(),
        dryRun: options.dryRun,
        employer,
        candidate,
    };
    logger.info('[SystemMessages] run complete', {
        dryRun: options.dryRun,
        employerSent: employer.sent,
        employerCapped: employer.capped,
        candidateSent: candidate.sent,
        candidateCapped: candidate.capped,
    });
    return summary;
}
