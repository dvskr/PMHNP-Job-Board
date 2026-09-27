/**
 * Prepaid posting credits: balance, and the spend.
 *
 * A pack is one Stripe payment that funds several postings later. That makes
 * the spend the delicate part, not the purchase: two tabs submitting the post
 * form at the same moment must not both draw the last credit.
 *
 * The guard is a conditional UPDATE, not a read followed by a write.
 * `updateMany` with `creditsUsed: { lt: creditsTotal }` in the WHERE clause
 * makes Postgres do the comparison and the increment in one statement, and
 * returns a count. Zero means somebody else took it. A read-then-write, which
 * is the obvious shape, degrades to "usually once" under exactly the
 * concurrency it is meant to survive, and the repo has already paid for that
 * lesson twice: once on the first-post discount, which needed a unique index
 * to become safe, and once on alert sends.
 */

import { prisma } from '@/lib/prisma';
import { config } from '@/lib/config';
import type { Prisma } from '@prisma/client';

export interface CreditBalance {
  /** Spendable credits across every live pack the identity owns. */
  available: number;
  /** The pack a spend would draw from next, or null. */
  nextPackId: string | null;
  /** When the soonest-expiring pack with credits runs out. */
  nextExpiry: Date | null;
}

/**
 * Quota keys that may unlock SPENDING, which is a strictly smaller set than
 * the keys that may block a discount.
 *
 * The two uses are not symmetric and must not share a key set.
 * buildQuotaKeys was designed to DENY: "has this identity already taken its
 * discount?" There, a false match costs one discount, and the module accepts
 * a stated residual risk to get that (see QuotaIdentity in
 * lib/employer-quota.ts): `org:` comes from a company name the account typed
 * for itself at signup, verified by nobody. Its documented worst case is an
 * attacker burning a rival's single discounted post.
 *
 * Here the same key would GRANT, and the identical risk buys a much larger
 * prize: sign up on any company domain, type a rival's company name, and
 * spend a pack they paid for. So `org:` is dropped.
 *
 * `dom:` stays, and is the point: it is the signup email domain, proven by
 * the account's own mailbox, and domainFromEmail already refuses consumer
 * providers. That is what lets a colleague spend what a teammate bought.
 * `acct:` is the buyer themselves.
 */
const SPENDABLE_KEY_PREFIXES = ['acct:', 'dom:'] as const;

function spendableKeys(quotaKeys: string[]): string[] {
  return quotaKeys.filter((k) => SPENDABLE_KEY_PREFIXES.some((p) => k.startsWith(p)));
}

/**
 * Packs an identity can spend from, soonest to expire first.
 *
 * Ordering matters: spending the pack that dies first is what stops a buyer
 * losing credits they had already paid for while a later pack sat untouched.
 *
 * Matched on the account id OR a spendable key snapshotted at purchase, so a
 * pack bought by one person on a team is spendable by the team. Deliberately
 * NOT matched on anything form-derived, for the reason lib/employer-quota.ts
 * states repeatedly: a form-typed identity lets one poster spend another's
 * entitlement.
 *
 * Filtering happens HERE rather than at purchase so it governs every pack,
 * including ones already sold with a wider key set snapshotted on them.
 */
function spendableWhere(userId: string, quotaKeys: string[]): Prisma.PostingCreditPackWhereInput {
  const keys = spendableKeys(quotaKeys);
  return {
    refundedAt: null,
    // An open chargeback freezes the pack. The money is provisionally gone,
    // so letting the rest of the credits out while the bank decides is the
    // one window where a buyer can spend funds they have already taken back.
    disputedAt: null,
    expiresAt: { gt: new Date() },
    OR: [
      { userId },
      ...(keys.length ? [{ quotaKeys: { hasSome: keys } }] : []),
    ],
  };
}

export async function getCreditBalance(userId: string, quotaKeys: string[] = []): Promise<CreditBalance> {
  const packs = await prisma.postingCreditPack.findMany({
    where: spendableWhere(userId, quotaKeys),
    orderBy: { expiresAt: 'asc' },
    select: { id: true, creditsTotal: true, creditsUsed: true, expiresAt: true },
  });

  let available = 0;
  let nextPackId: string | null = null;
  let nextExpiry: Date | null = null;
  for (const pack of packs) {
    const left = pack.creditsTotal - pack.creditsUsed;
    if (left <= 0) continue;
    available += left;
    if (!nextPackId) {
      nextPackId = pack.id;
      nextExpiry = pack.expiresAt;
    }
  }
  return { available, nextPackId, nextExpiry };
}

/**
 * Take one credit, or return null.
 *
 * Returns the pack id that was actually decremented, so the caller can record
 * on the posting which pack funded it. Walks the packs in expiry order and
 * tries each with a conditional update, because losing the race on the
 * soonest-expiring pack does not mean the identity is out of credits.
 */
export async function spendOneCredit(userId: string, quotaKeys: string[] = []): Promise<string | null> {
  const candidates = await prisma.postingCreditPack.findMany({
    where: spendableWhere(userId, quotaKeys),
    orderBy: { expiresAt: 'asc' },
    select: { id: true },
  });

  for (const { id } of candidates) {
    // Raw, and column-against-column. The balance test and the increment
    // have to be one statement, and `credits_used < credits_total` compares
    // two columns of the same row, which is the part a plain Prisma filter
    // cannot express without a field reference. Money and entitlements are
    // the wrong place to depend on a feature this code cannot exercise
    // locally, so the comparison is written in SQL where its semantics are
    // not in question. $executeRaw returns the affected row count, so 1
    // means this process took the credit and 0 means another did.
    const claimed = await prisma.$executeRaw`
      UPDATE posting_credit_packs
         SET credits_used = credits_used + 1, updated_at = now()
       WHERE id = ${id}
         AND refunded_at IS NULL
         AND disputed_at IS NULL
         AND expires_at > now()
         AND credits_used < credits_total
    `;
    if (claimed === 1) return id;
  }
  return null;
}

/** Hand a credit back when the posting it funded could not be created. */
export async function refundOneCredit(packId: string): Promise<void> {
  await prisma.postingCreditPack.updateMany({
    where: { id: packId, creditsUsed: { gt: 0 } },
    data: { creditsUsed: { decrement: 1 } },
  });
}

/** When a pack bought now would stop being spendable. */
export function creditPackExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + config.creditPackValidDays * 24 * 60 * 60 * 1000);
}

/**
 * Revoke every posting a pack already funded, because the money for the pack
 * went back.
 *
 * Marking the pack alone is not enough: it stops FUTURE spending, but the
 * postings bought with earlier credits are live, featured, and carrying the
 * entitlements that ride on isFeatured (employer messaging, candidate
 * unlocks). isFeatured comes off with isPublished for that reason.
 *
 * Only rows still sitting at 'paid' are touched, so a posting already
 * revoked by a different event keeps the status that revoked it.
 *
 * Returns how many postings were revoked, for the log line.
 */
export async function revokePackPostings(
  packId: string,
  status: 'refunded' | 'disputed',
): Promise<number> {
  const funded = await prisma.employerJob.findMany({
    where: { creditPackId: packId, paymentStatus: 'paid' },
    select: { id: true, jobId: true },
  });
  if (funded.length === 0) return 0;

  await prisma.$transaction([
    prisma.employerJob.updateMany({
      where: { id: { in: funded.map((f) => f.id) } },
      data: { paymentStatus: status },
    }),
    prisma.job.updateMany({
      where: { id: { in: funded.map((f) => f.jobId) } },
      data: { isPublished: false, isFeatured: false },
    }),
  ]);
  return funded.length;
}

/**
 * Give back what a chargeback took, once the bank finds for us.
 *
 * Payment status only. The postings are deliberately NOT republished: they
 * came down during a dispute and whether they go back up is the employer's
 * call, which is the same decision the JobCharge dispute path already makes.
 *
 * Scoped to rows this dispute revoked, so a posting refunded after the
 * chargeback keeps its own status.
 */
export async function restorePackPostings(packId: string): Promise<number> {
  const restored = await prisma.employerJob.updateMany({
    where: { creditPackId: packId, paymentStatus: 'disputed' },
    data: { paymentStatus: 'paid' },
  });
  return restored.count;
}
