import { prisma } from '@/lib/prisma';
import { config, PricingTier } from '@/lib/config';

/**
 * Get ALL active employer job postings (published + not expired).
 * Returns them ordered by tier rank (highest first).
 */
export async function getEmployerActivePostings(employerId: string) {
    const now = new Date();

    const activePostings = await prisma.employerJob.findMany({
        where: {
            userId: employerId,
            job: {
                isPublished: true,
                OR: [
                    { expiresAt: null },
                    { expiresAt: { gt: now } },
                ],
            },
        },
        select: {
            id: true,
            pricingTier: true,
            createdAt: true,
            // The lower bound on this posting's CURRENT unlock and InMail
            // buckets. A renewal moves it forward; see cycleStart below.
            entitlementCycleStartedAt: true,
            jobId: true,
            job: {
                select: { id: true, createdAt: true, expiresAt: true },
            },
        },
        orderBy: { createdAt: 'desc' },
    });

    return activePostings;
}

/**
 * When a posting's current entitlement cycle began.
 *
 * Falls back to createdAt, which is both what the backfill wrote and the
 * correct answer for any posting that has never been renewed. Every
 * entitlement count goes through this rather than reading either column
 * directly, so the two cannot drift apart.
 */
export function cycleStart(posting: {
    createdAt: Date;
    entitlementCycleStartedAt?: Date | null;
}): Date {
    return posting.entitlementCycleStartedAt ?? posting.createdAt;
}

/**
 * Get the employer's most recent active posting (single-tier model — all postings
 * are equivalent, so "best" is just "most recent").
 */
export async function getEmployerActivePosting(employerId: string) {
    const postings = await getEmployerActivePostings(employerId);
    if (postings.length === 0) return null;
    // postings are already ordered by createdAt desc — return the newest
    return postings[0];
}

/**
 * Get the employer's current pricing tier. Always 'pro' in the single-tier
 * model — kept as a function only for callers that destructure or pass it through.
 *
 * Important: callers should NOT use the returned tier as a gate for "do they
 * have an active posting?" — use `getEmployerActivePostings(...).length > 0`
 * directly. Tier represents the plan; active-posting count represents the state.
 */
export async function getEmployerTier(_employerId: string): Promise<PricingTier> {
    return 'pro';
}

/**
 * Count profile unlocks charged to a posting's CURRENT entitlement cycle.
 *
 * `since` is the cycle start, from cycleStart(posting). Without it this
 * counted every view the posting had ever received, so renewing an exhausted
 * posting bought nothing: the count stayed at the cap for ever while the
 * receipt, both expiry emails, the dashboard modal and Terms section 7 all
 * said a fresh allowance had been delivered.
 *
 * `since` is optional only so a caller that genuinely wants the lifetime
 * total does not have to invent a date. Every entitlement gate passes it.
 */
export async function getUnlocksForPosting(
    employerJobId: string,
    since?: Date,
): Promise<number> {
    return prisma.profileView.count({
        where: {
            employerJobId,
            ...(since ? { viewedAt: { gte: since } } : {}),
        },
    });
}

/**
 * Count how many InMails (unique conversations) are tied to a specific job posting.
 * Only counts unique conversations, not total messages — follow-up replies are free.
 *
 * Unattributed conversations (jobId = null) opened since this posting started
 * count against it. /api/employer/messages now always names a posting, but the
 * rows written while it did not were counted against nothing at all, which is
 * exactly how the cap was bypassed: send with no jobId, stay at used = 0 for
 * ever. Charging them to the posting that was live at the time is the closest
 * honest attribution available.
 */
export async function getInMailsForPosting(
    senderId: string,
    jobId: string,
    postingCreatedAt: Date
): Promise<number> {
    return prisma.conversation.count({
        where: {
            // participantA ONLY, because participantA is always the party who
            // STARTED the thread, at all three creation sites:
            //   app/api/employer/messages   employer  -> candidate  (the InMail)
            //   app/api/candidate/messages  candidate -> employer
            //   lib/system-messages         system    -> employer
            //
            // This used to be `participantA OR participantB`, which counted
            // the last two as well. An employer's paid InMail allowance was
            // therefore spent by candidates writing TO them, and by our own
            // weekly nudge, neither of which they sent and neither of which
            // they can prevent. A popular posting could exhaust its own
            // outreach budget on inbound mail before the employer sent a
            // single message.
            participantA: senderId,
            // jobId null covers legacy threads written before conversations
            // carried one; they still belong to whoever started them.
            OR: [
                { jobId },
                { jobId: null },
            ],
            createdAt: { gte: postingCreatedAt },
        },
    });
}

/**
 * Check if the employer can unlock another candidate profile.
 * Per-posting: each posting gets its own independent credit pool.
 * Returns the posting ID to charge if allowed.
 *
 * Audit #13 fix: only counts views attributed to *currently active* postings,
 * plus orphan legacy views (employerJobId=null) that fit within the active
 * postings' remaining capacity. Views from expired postings no longer count
 * against the new posting's cap — an employer with 75 historical views from
 * three expired postings is no longer locked out of their fresh 25/25 bucket.
 */
export async function canUnlockCandidate(
    employerId: string,
    tier: PricingTier
): Promise<{ allowed: boolean; used: number; limit: number; postingId?: string; reason?: 'no_posting' | 'posting_cap' | 'daily_cap' }> {
    const limits = config.getTierLimits(tier);
    const limit = limits.candidateUnlocksPerPosting;

    // Unlimited tier
    if (!Number.isFinite(limit)) {
        return { allowed: true, used: 0, limit: Infinity };
    }

    // Cross-posting daily cap (anti-scrape). Even if per-posting headroom exists,
    // refuse if the employer has unlocked >= dailyUnlockCap unique candidates in
    // the last 24h. Bypasses the rest of the math when triggered so we don't
    // reveal posting-level state to abusers via error responses.
    const dailyCap = config.dailyUnlockCap;
    if (Number.isFinite(dailyCap) && dailyCap > 0) {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentUnlocks = await prisma.profileView.count({
            where: { viewerId: employerId, viewedAt: { gte: since } },
        });
        if (recentUnlocks >= dailyCap) {
            return {
                allowed: false,
                used: recentUnlocks,
                limit: dailyCap,
                reason: 'daily_cap',
            };
        }
    }

    // Get all active postings
    const postings = await getEmployerActivePostings(employerId);
    if (postings.length === 0) {
        return { allowed: false, used: 0, limit, reason: 'no_posting' };
    }

    // Calculate total limit across all currently-active postings
    let totalLimit = 0;
    for (const posting of postings) {
        const postingLimits = config.getTierLimits(posting.pricingTier as PricingTier);
        const postingLimit = postingLimits.candidateUnlocksPerPosting;
        if (!Number.isFinite(postingLimit)) {
            totalLimit = Infinity;
            break;
        }
        totalLimit += postingLimit;
    }

    // Count views attributed to active postings + legacy (unattributed) views.
    // Views from EXPIRED postings (employerJobId pointing to a non-active row)
    // are deliberately excluded — they were paid for under that posting's cap
    // and shouldn't penalize a new active posting (audit #13).
    //
    // Summed per posting rather than fetched in one query, because each
    // posting carries its OWN cycle start and a single `employerJobId IN
    // (...)` predicate cannot express a different lower bound per row. The
    // total is identical: every ProfileView has exactly one employerJobId or
    // null, so the arms cannot double count. This also becomes the single
    // source for the per-posting numbers used further down, which the two
    // loops below previously re-queried once each.
    const attributedPerPosting = new Map<string, number>();
    for (const posting of postings) {
        attributedPerPosting.set(
            posting.id,
            await getUnlocksForPosting(posting.id, cycleStart(posting)),
        );
    }

    // Legacy views predate posting attribution, so they belong to no cycle
    // and are counted once, whole.
    const legacyViews = await prisma.profileView.count({
        where: { viewerId: employerId, employerJobId: null },
    });

    const activeAndLegacyViews =
        [...attributedPerPosting.values()].reduce((sum, n) => sum + n, 0) + legacyViews;

    // Global safety check using the active-scoped count
    if (Number.isFinite(totalLimit) && activeAndLegacyViews >= totalLimit) {
        return { allowed: false, used: activeAndLegacyViews, limit: totalLimit };
    }

    // Per-posting check: distribute legacy views to postings (oldest first so
    // the newest posting keeps its full bucket for fresh unlocks).
    //
    // Iterate oldest-to-newest for legacy distribution, then return the first
    // (newest) posting with remaining capacity for the new charge.
    const oldestToNewest = [...postings].reverse();
    const legacyChargedPerPosting = new Map<string, number>();
    let legacyRemaining = legacyViews;
    for (const posting of oldestToNewest) {
        const postingLimits = config.getTierLimits(posting.pricingTier as PricingTier);
        const postingLimit = postingLimits.candidateUnlocksPerPosting;
        if (!Number.isFinite(postingLimit)) continue;

        const attributedViews = attributedPerPosting.get(posting.id) ?? 0;
        const headroom = Math.max(0, postingLimit - attributedViews);
        const charged = Math.min(legacyRemaining, headroom);
        legacyChargedPerPosting.set(posting.id, charged);
        legacyRemaining -= charged;
    }

    // Now find a posting with remaining capacity (newest first)
    for (const posting of postings) {
        const postingLimits = config.getTierLimits(posting.pricingTier as PricingTier);
        const postingLimit = postingLimits.candidateUnlocksPerPosting;

        if (!Number.isFinite(postingLimit)) {
            return { allowed: true, used: activeAndLegacyViews, limit: Infinity, postingId: posting.id };
        }

        const attributedViews = attributedPerPosting.get(posting.id) ?? 0;
        const legacyCharge = legacyChargedPerPosting.get(posting.id) ?? 0;
        const effectiveUsed = attributedViews + legacyCharge;

        if (effectiveUsed < postingLimit) {
            return { allowed: true, used: activeAndLegacyViews, limit: totalLimit, postingId: posting.id };
        }
    }

    // All postings exhausted
    return { allowed: false, used: activeAndLegacyViews, limit: totalLimit };
}

/**
 * Check if the employer can send another InMail.
 * Per-posting: each posting gets its own credit pool for InMails.
 */
export async function canSendInMail(
    senderId: string,
    employerId: string,
    tier: PricingTier
): Promise<{ allowed: boolean; used: number; limit: number }> {
    const limits = config.getTierLimits(tier);
    const limit = limits.inmailsPerPosting;

    // Unlimited tier
    if (!Number.isFinite(limit)) {
        return { allowed: true, used: 0, limit: Infinity };
    }

    // Get all active postings
    const postings = await getEmployerActivePostings(employerId);
    if (postings.length === 0) {
        return { allowed: false, used: 0, limit };
    }

    // Check each posting for remaining InMail credits
    let totalUsed = 0;
    for (const posting of postings) {
        const postingLimits = config.getTierLimits(posting.pricingTier as PricingTier);
        const postingLimit = postingLimits.inmailsPerPosting;
        const used = await getInMailsForPosting(senderId, posting.job.id, cycleStart(posting));
        totalUsed += used;

        if (Number.isFinite(postingLimit) && used < postingLimit) {
            return { allowed: true, used: totalUsed, limit: postingLimit };
        }
        if (!Number.isFinite(postingLimit)) {
            return { allowed: true, used: totalUsed, limit: Infinity };
        }
    }

    // All postings exhausted
    return { allowed: false, used: totalUsed, limit };
}

/**
 * Get a summary of the employer's total usage vs total limits across all postings.
 * Each posting contributes its own pool to the totals.
 */
export async function getUsageSummary(
    profileId: string,
    employerId: string,
    tier: PricingTier
): Promise<{
    candidateUnlocks: { used: number; limit: number };
    inmails: { used: number; limit: number };
}> {
    const postings = await getEmployerActivePostings(employerId);

    if (postings.length === 0) {
        // No active posting → no entitlement. Returning the per-posting tier
        // allowance here was misleading: the dashboard rendered "0/25 unlocks"
        // and the talent-pool cards showed "Unlock Profile" CTAs that always
        // failed at the API with `reason: 'no_posting'`. Reporting a 0-cap
        // makes the empty state explicit so the UI can prompt "Post a job".
        // `tier` is still useful upstream as the plan label, so we keep the
        // arg even though we no longer read its allowances here.
        void tier;
        return {
            candidateUnlocks: { used: 0, limit: 0 },
            inmails: { used: 0, limit: 0 },
        };
    }

    let totalUnlocksUsed = 0;
    let totalUnlocksLimit = 0;
    let totalInmailsUsed = 0;
    let totalInmailsLimit = 0;

    for (const posting of postings) {
        const postingLimits = config.getTierLimits(posting.pricingTier as PricingTier);

        // Unlocks
        const unlockLimit = postingLimits.candidateUnlocksPerPosting;
        if (Number.isFinite(unlockLimit)) {
            const unlockCount = await getUnlocksForPosting(posting.id, cycleStart(posting));
            totalUnlocksUsed += unlockCount;
            totalUnlocksLimit += unlockLimit;
        } else {
            totalUnlocksLimit = Infinity;
        }

        // InMails — count unique conversations, not individual messages
        const inmailLimit = postingLimits.inmailsPerPosting;
        if (Number.isFinite(inmailLimit)) {
            const inmailCount = await getInMailsForPosting(profileId, posting.job.id, cycleStart(posting));
            totalInmailsUsed += inmailCount;
            totalInmailsLimit += inmailLimit;
        } else {
            totalInmailsLimit = Infinity;
        }
    }

    return {
        candidateUnlocks: { used: totalUnlocksUsed, limit: totalUnlocksLimit },
        inmails: { used: totalInmailsUsed, limit: totalInmailsLimit },
    };
}

/**
 * Get per-posting credit breakdown with job titles.
 * Used by the posting selector dropdown in the Talent Pool.
 */
export async function getPerPostingUsage(
    profileId: string,
    employerId: string
): Promise<{
    id: string;
    jobId: string;
    jobTitle: string;
    tier: string;
    unlocks: { used: number; limit: number; remaining: number };
    inmails: { used: number; limit: number; remaining: number };
}[]> {
    const postings = await getEmployerActivePostings(employerId);

    const result = [];
    for (const posting of postings) {
        const limits = config.getTierLimits(posting.pricingTier as PricingTier);

        const unlockCount = await getUnlocksForPosting(posting.id, cycleStart(posting));
        const unlockLimit = limits.candidateUnlocksPerPosting;
        const unlockRemaining = Number.isFinite(unlockLimit) ? Math.max(0, unlockLimit - unlockCount) : Infinity;

        const inmailCount = await getInMailsForPosting(profileId, posting.job.id, cycleStart(posting));
        const inmailLimit = limits.inmailsPerPosting;
        const inmailRemaining = Number.isFinite(inmailLimit) ? Math.max(0, inmailLimit - inmailCount) : Infinity;

        // Fetch job title
        const job = await prisma.job.findUnique({
            where: { id: posting.jobId },
            select: { title: true },
        });

        result.push({
            id: posting.id,
            jobId: posting.jobId,
            jobTitle: job?.title || 'Untitled Job',
            tier: posting.pricingTier,
            unlocks: {
                used: unlockCount,
                limit: Number.isFinite(unlockLimit) ? unlockLimit : -1,
                remaining: Number.isFinite(unlockRemaining) ? unlockRemaining : -1,
            },
            inmails: {
                used: inmailCount,
                limit: Number.isFinite(inmailLimit) ? inmailLimit : -1,
                remaining: Number.isFinite(inmailRemaining) ? inmailRemaining : -1,
            },
        });
    }

    return result;
}

/**
 * Legacy helper: count unlocks for a posting by creation date.
 * Kept for backward compatibility but prefer getUnlocksForPosting.
 */
export async function getCandidateUnlocksForPosting(
    employerId: string,
    postingCreatedAt: Date
): Promise<number> {
    return prisma.profileView.count({
        where: {
            viewerId: employerId,
            viewedAt: { gte: postingCreatedAt },
        },
    });
}

/**
 * Legacy helper: count total InMails for employer.
 */
export async function getTotalInMailsForEmployer(
    senderId: string,
    employerId: string
): Promise<number> {
    const posting = await getEmployerActivePosting(employerId);
    if (!posting) return 0;

    return prisma.employerMessage.count({
        where: {
            senderId,
            sentAt: { gte: posting.job.createdAt },
        },
    });
}
