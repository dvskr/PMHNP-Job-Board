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
 * Get the employer's best (highest-tier) active posting.
 * Kept for backward compatibility.
 */
export async function getEmployerActivePosting(employerId: string) {
    const postings = await getEmployerActivePostings(employerId);
    if (postings.length === 0) return null;

    const tierRank: Record<string, number> = { premium: 3, growth: 2, starter: 1 };
    return postings.reduce((prev, curr) =>
        (tierRank[curr.pricingTier] || 0) > (tierRank[prev.pricingTier] || 0) ? curr : prev
    );
}

/**
 * Get the employer's current pricing tier from their best active posting.
 * Falls back to 'starter' if no active jobs.
 */
export async function getEmployerTier(employerId: string): Promise<PricingTier> {
    const posting = await getEmployerActivePosting(employerId);
    return (posting?.pricingTier as PricingTier) || 'starter';
}

/**
 * Count how many profile unlocks are tied to a specific posting.
 */
export async function getUnlocksForPosting(employerJobId: string): Promise<number> {
    return prisma.profileView.count({
        where: { employerJobId },
    });
}

/**
 * Count how many InMails are tied to a specific job posting.
 * Uses the Job ID (not EmployerJob ID) since EmployerMessage links to Job.
 */
export async function getInMailsForPosting(
    senderId: string,
    jobId: string,
    postingCreatedAt: Date
): Promise<number> {
    return prisma.employerMessage.count({
        where: {
            senderId,
            jobId,
            sentAt: { gte: postingCreatedAt },
        },
    });
}

/**
 * Check if the employer can unlock another candidate profile.
 * Per-posting: each posting gets its own independent credit pool.
 * Returns the posting ID to charge if allowed.
 * 
 * Also accounts for legacy views (employerJobId = NULL) by counting
 * them against the total limit as a safety check.
 */
export async function canUnlockCandidate(
    employerId: string,
    tier: PricingTier
): Promise<{ allowed: boolean; used: number; limit: number; postingId?: string }> {
    const limits = config.getTierLimits(tier);
    const limit = limits.candidateUnlocksPerPosting;

    // Unlimited tier
    if (!Number.isFinite(limit)) {
        return { allowed: true, used: 0, limit: Infinity };
    }

    // Get all active postings
    const postings = await getEmployerActivePostings(employerId);
    if (postings.length === 0) {
        return { allowed: false, used: 0, limit };
    }

    // Count ALL views by this employer (both attributed and legacy/unattributed)
    const totalViews = await prisma.profileView.count({
        where: { viewerId: employerId },
    });

    // Calculate total limit across all postings
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

    // Global safety check: if total views >= total limit, deny
    if (Number.isFinite(totalLimit) && totalViews >= totalLimit) {
        return { allowed: false, used: totalViews, limit: totalLimit };
    }

    // Per-posting check: find a posting with remaining credits
    // Count legacy (unattributed) views  
    const legacyViews = await prisma.profileView.count({
        where: { viewerId: employerId, employerJobId: null },
    });

    let legacyRemaining = legacyViews;
    for (const posting of postings) {
        const postingLimits = config.getTierLimits(posting.pricingTier as PricingTier);
        const postingLimit = postingLimits.candidateUnlocksPerPosting;
        const attributedViews = await getUnlocksForPosting(posting.id);

        // Charge legacy views to postings in order (oldest first)
        const legacyCharge = Number.isFinite(postingLimit)
            ? Math.min(legacyRemaining, postingLimit - attributedViews)
            : 0;
        legacyRemaining = Math.max(0, legacyRemaining - Math.max(0, legacyCharge));
        const effectiveUsed = attributedViews + Math.max(0, legacyCharge);

        if (!Number.isFinite(postingLimit)) {
            return { allowed: true, used: totalViews, limit: Infinity, postingId: posting.id };
        }
        if (effectiveUsed < postingLimit) {
            return { allowed: true, used: totalViews, limit: totalLimit, postingId: posting.id };
        }
    }

    // All postings exhausted
    return { allowed: false, used: totalViews, limit: totalLimit };
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
        const used = await getInMailsForPosting(senderId, posting.job.id, posting.createdAt);
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
        const limits = config.getTierLimits(tier);
        return {
            candidateUnlocks: { used: 0, limit: limits.candidateUnlocksPerPosting },
            inmails: { used: 0, limit: limits.inmailsPerPosting },
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
            const unlockCount = await getUnlocksForPosting(posting.id);
            totalUnlocksUsed += unlockCount;
            totalUnlocksLimit += unlockLimit;
        } else {
            totalUnlocksLimit = Infinity;
        }

        // InMails
        const inmailLimit = postingLimits.inmailsPerPosting;
        if (Number.isFinite(inmailLimit)) {
            const inmailCount = await prisma.employerMessage.count({
                where: { senderId: profileId, jobId: posting.job.id, sentAt: { gte: posting.createdAt } },
            });
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

        const unlockCount = await getUnlocksForPosting(posting.id);
        const unlockLimit = limits.candidateUnlocksPerPosting;
        const unlockRemaining = Number.isFinite(unlockLimit) ? Math.max(0, unlockLimit - unlockCount) : Infinity;

        const inmailCount = await prisma.employerMessage.count({
            where: { senderId: profileId, jobId: posting.job.id, sentAt: { gte: posting.createdAt } },
        });
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
