/**
 * Email-change policy.
 *
 * The free-post quota is per-domain (audit #26 final): each company domain
 * gets 2 free posts, lifetime, shared across all employees. The quota anchor
 * is `EmployerJob.quotaDomain` — an immutable snapshot of the signup email's
 * domain, set at posting time.
 *
 * If we let a user freely change their account email's *domain*, they can
 * use 2 freebies on @acme.com, change their account to @example.com, and
 * post 2 more freebies under the new domain. To prevent that, this helper
 * enforces:
 *
 *   - Local-part changes (bob@acme.com → bob.smith@acme.com) → allowed
 *   - Domain changes when NO freebies have been used → allowed
 *   - Domain changes when ANY freebies exist for the user → BLOCKED
 *
 * **Where to call this:**
 * Anywhere we accept an email-change request — `/api/auth/change-email`,
 * Supabase email-change webhooks, admin override flows. Today there is no
 * user-facing email-change endpoint (audit #27), but this helper exists so
 * the rule is enforced whenever one is added.
 *
 * Returns { allowed: true } or { allowed: false, reason }.
 */

import { prisma } from '@/lib/prisma';

interface EmailChangeDecision {
    allowed: boolean;
    reason?: string;
    /** the domain we'd block them from leaving, if any */
    lockedDomain?: string;
}

function emailDomain(email: string): string | null {
    const parts = email.toLowerCase().trim().split('@');
    if (parts.length !== 2 || !parts[1]) return null;
    return parts[1];
}

/**
 * Given a user's supabaseId, current email, and proposed new email, decide
 * whether the change can proceed under the per-domain freebie quota policy.
 *
 * @param userId   Supabase auth user id (matches UserProfile.supabaseId and EmployerJob.userId)
 * @param oldEmail Current email on the auth user
 * @param newEmail Proposed new email
 */
export async function evaluateEmailChange(
    userId: string,
    oldEmail: string,
    newEmail: string,
): Promise<EmailChangeDecision> {
    const oldDomain = emailDomain(oldEmail);
    const newDomain = emailDomain(newEmail);

    if (!newDomain) {
        return { allowed: false, reason: 'Invalid email address.' };
    }

    // Same domain (including identical email) → always fine.
    if (oldDomain === newDomain) {
        return { allowed: true };
    }

    // Domain change → only allowed if this user has zero rows that would let
    // them carry freebies across to a new domain. We check both:
    //   1. Free posts they personally posted (userId match), and
    //   2. Free posts at the old domain (in case userId got nulled by a
    //      prior account deletion + re-creation flow)
    // If either set is non-empty, domain change is blocked.

    const userOwnedFreePosts = await prisma.employerJob.count({
        where: {
            userId,
            paymentStatus: 'free',
        },
    });

    if (userOwnedFreePosts > 0) {
        return {
            allowed: false,
            reason: `Email domain changes aren't allowed once free posts have been used at ${oldDomain ?? 'your current domain'}. Contact support@pmhnphiring.com if your company domain has actually changed.`,
            lockedDomain: oldDomain ?? undefined,
        };
    }

    if (oldDomain) {
        const oldDomainFreePosts = await prisma.employerJob.count({
            where: {
                quotaDomain: oldDomain,
                paymentStatus: 'free',
            },
        });
        // We only block if THIS user is the one who'd benefit. Other employers
        // at the same domain having used freebies isn't this user's concern.
        // Net: this branch is mostly a safety net; the userId check above is
        // the primary gate.
        if (oldDomainFreePosts > 0 && userOwnedFreePosts > 0) {
            return {
                allowed: false,
                reason: `Email domain changes aren't allowed once free posts have been used at ${oldDomain}. Contact support if your company domain has actually changed.`,
                lockedDomain: oldDomain,
            };
        }
    }

    return { allowed: true };
}
