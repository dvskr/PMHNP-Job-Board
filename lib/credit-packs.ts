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
 * Packs an identity can spend from, soonest to expire first.
 *
 * Ordering matters: spending the pack that dies first is what stops a buyer
 * losing credits they had already paid for while a later pack sat untouched.
 *
 * Matched on the account id OR any quota key snapshotted at purchase, so a
 * pack bought by one person on a team is spendable by the team. Deliberately
 * NOT matched on anything form-derived, for the reason lib/employer-quota.ts
 * states repeatedly: a form-typed identity lets one poster spend another's
 * entitlement.
 */
function spendableWhere(userId: string, quotaKeys: string[]): Prisma.PostingCreditPackWhereInput {
  return {
    refundedAt: null,
    expiresAt: { gt: new Date() },
    OR: [
      { userId },
      ...(quotaKeys.length ? [{ quotaKeys: { hasSome: quotaKeys } }] : []),
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
