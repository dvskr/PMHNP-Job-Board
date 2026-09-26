/**
 * Remaining unlock credits on one posting.
 *
 * Both unlock endpoints let the client name the posting an unlock should be
 * charged to (`?postingId=` / `body.postingId`) so the talent-pool counter the
 * employer is watching actually moves. They verified that the posting was owned
 * and active but never that it still had credits left, while the global cap in
 * canUnlockCandidate is computed across ALL active postings. A client could
 * therefore pin every unlock onto one exhausted posting: the per-posting ledger
 * that /api/employer/usage renders went wrong immediately (posting A showing
 * 50/25 used while posting B shows 25 credits it can never spend), and once
 * posting A expired its views dropped out of the active-scoped count in
 * canUnlockCandidate and handed out a fresh bucket.
 *
 * Callers honor a requested posting only while this returns a positive number,
 * then fall back to canUnlockCandidate's own pick.
 */
import { config, PricingTier } from '@/lib/config';
import { getUnlocksForPosting } from '@/lib/tier-limits';

export async function postingUnlockHeadroom(
    employerJobId: string,
    pricingTier: string | null,
): Promise<number> {
    const limit = config.getTierLimits((pricingTier || 'pro') as PricingTier).candidateUnlocksPerPosting;
    if (!Number.isFinite(limit)) return Number.POSITIVE_INFINITY;
    const used = await getUnlocksForPosting(employerJobId);
    return Math.max(0, limit - used);
}
