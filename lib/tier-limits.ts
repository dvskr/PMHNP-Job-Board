import { prisma } from '@/lib/prisma';
import { config, PricingTier } from '@/lib/config';

/**
 * Get the employer's best (highest) active job posting with its tier info.
 * Returns the posting's tier, creation date, and job ID.
 */
export async function getEmployerActivePosting(employerId: string) {
    const now = new Date();

    // Get all active employer jobs (published + not expired), ordered by tier rank
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
            job: {
                select: { id: true, createdAt: true, expiresAt: true },
            },
        },
        orderBy: { createdAt: 'desc' },
    });

    if (activePostings.length === 0) return null;

    // Pick the highest-tier posting (premium > growth > starter)
    const tierRank: Record<string, number> = { premium: 3, growth: 2, starter: 1 };
    const best = activePostings.reduce((prev, curr) =>
        (tierRank[curr.pricingTier] || 0) > (tierRank[prev.pricingTier] || 0) ? curr : prev
    );

    return best;
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
 * Count how many candidate profiles the employer has unlocked
 * since their current posting was created (per-posting lifecycle).
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
 * Check if the employer can unlock another candidate profile.
 * Limits are per posting lifecycle, not per month.
 */
export async function canUnlockCandidate(
    employerId: string,
    tier: PricingTier
): Promise<{ allowed: boolean; used: number; limit: number }> {
    const limits = config.getTierLimits(tier);
    const limit = limits.candidateUnlocksPerPosting;

    // Unlimited tier
    if (!Number.isFinite(limit)) {
        return { allowed: true, used: 0, limit: Infinity };
    }

    // Get the employer's best active posting to determine the lifecycle start
    const posting = await getEmployerActivePosting(employerId);
    if (!posting) {
        // No active posting — use starter defaults, count from epoch
        return { allowed: false, used: 0, limit };
    }

    const used = await getCandidateUnlocksForPosting(employerId, posting.job.createdAt);
    return { allowed: used < limit, used, limit };
}

/**
 * Count how many InMails the employer has sent for a specific job posting
 * since it was created.
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
 * Count total InMails sent by employer across all active postings
 * since each posting was created.
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

/**
 * Check if the employer can send another InMail.
 * Limits are per posting lifecycle, not per month.
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

    const posting = await getEmployerActivePosting(employerId);
    if (!posting) {
        return { allowed: false, used: 0, limit };
    }

    const used = await prisma.employerMessage.count({
        where: {
            senderId,
            sentAt: { gte: posting.job.createdAt },
        },
    });

    return { allowed: used < limit, used, limit };
}

/**
 * Get a summary of the employer's current usage vs limits.
 * Usage is tracked per posting lifecycle.
 */
export async function getUsageSummary(
    profileId: string,
    employerId: string,
    tier: PricingTier
): Promise<{
    candidateUnlocks: { used: number; limit: number };
    inmails: { used: number; limit: number };
}> {
    const limits = config.getTierLimits(tier);
    const posting = await getEmployerActivePosting(employerId);

    if (!posting) {
        return {
            candidateUnlocks: { used: 0, limit: limits.candidateUnlocksPerPosting },
            inmails: { used: 0, limit: limits.inmailsPerPosting },
        };
    }

    const [unlockCount, inmailCount] = await Promise.all([
        Number.isFinite(limits.candidateUnlocksPerPosting)
            ? getCandidateUnlocksForPosting(employerId, posting.job.createdAt)
            : Promise.resolve(0),
        Number.isFinite(limits.inmailsPerPosting)
            ? prisma.employerMessage.count({
                where: { senderId: profileId, sentAt: { gte: posting.job.createdAt } },
            })
            : Promise.resolve(0),
    ]);

    return {
        candidateUnlocks: {
            used: unlockCount,
            limit: limits.candidateUnlocksPerPosting,
        },
        inmails: {
            used: inmailCount,
            limit: limits.inmailsPerPosting,
        },
    };
}
