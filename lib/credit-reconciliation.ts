/**
 * Does every spent credit have a posting behind it?
 *
 * THE WINDOW. Spending a credit and creating the posting it paid for are two
 * statements, with `refundOneCredit` as the compensator if the second fails.
 * That compensator only runs if the process survives to reach it. A kill or
 * a timeout in between leaves `credits_used` incremented with nothing to
 * show for it, and nothing else in the system would ever notice: the
 * employer just has one fewer post than they bought.
 *
 * WHY THIS ONLY REPORTS. The obvious fix, handing the credit back
 * automatically, is not safe. Drift is inferred by counting EmployerJob rows
 * carrying the pack id, and those rows can be hard deleted by the admin job
 * routes. A deleted posting is indistinguishable here from a posting that
 * never existed, so an automatic restore would mint a free credit every time
 * an admin removed a credit funded job. And "was that deletion our mistake
 * or their policy violation" decides whether the credit should come back at
 * all, which is a human question.
 *
 * So this detects, and `scripts/reconcile-credit-drift.ts` restores a
 * specific pack once somebody has looked at it.
 */

import { prisma } from '@/lib/prisma';

/**
 * How long a pack must have been untouched before its drift is believed.
 *
 * `spendOneCredit` stamps `updated_at` as part of the same statement that
 * increments the counter, so a recent timestamp means a spend may still be
 * in flight: the credit is taken and the posting is milliseconds from being
 * written. Reporting that as drift would cry wolf on every normal purchase.
 * Well beyond any request's lifetime.
 */
export const QUIET_PERIOD_MINUTES = 30;

export interface PackDrift {
  packId: string;
  userId: string;
  creditsTotal: number;
  creditsUsed: number;
  /** Postings actually carrying this pack id. */
  postingsFound: number;
  /**
   * creditsUsed minus postingsFound.
   *
   * POSITIVE means credits were taken with no posting behind them: the
   * employer is short, and this is the case the window produces.
   *
   * NEGATIVE means more postings than credits spent, which the window
   * cannot produce. That would be a far worse bug, free posts, and is
   * reported separately and loudly rather than folded in with the rest.
   */
  drift: number;
  lastTouchedAt: Date;
}

export interface ReconciliationReport {
  packsChecked: number;
  /** Packs owing the employer credits. */
  shortfalls: PackDrift[];
  /** Packs that delivered more postings than they were paid for. */
  overDeliveries: PackDrift[];
  creditsOwed: number;
}

/**
 * Compare every settled pack's counter against the postings behind it.
 *
 * Read only. Two queries regardless of how many packs there are: the packs,
 * then one grouped count over the postings.
 */
export async function findCreditDrift(now: Date = new Date()): Promise<ReconciliationReport> {
  const quietBefore = new Date(now.getTime() - QUIET_PERIOD_MINUTES * 60_000);

  const packs = await prisma.postingCreditPack.findMany({
    where: {
      // Nothing to reconcile on a pack that has never been spent.
      creditsUsed: { gt: 0 },
      updatedAt: { lt: quietBefore },
    },
    select: {
      id: true, userId: true, creditsTotal: true, creditsUsed: true, updatedAt: true,
    },
  });

  if (packs.length === 0) {
    return { packsChecked: 0, shortfalls: [], overDeliveries: [], creditsOwed: 0 };
  }

  // One grouped count rather than a query per pack.
  const counts = await prisma.employerJob.groupBy({
    by: ['creditPackId'],
    where: { creditPackId: { in: packs.map((p) => p.id) } },
    _count: { _all: true },
  });
  const foundByPack = new Map(
    counts.map((c) => [c.creditPackId as string, c._count._all]),
  );

  const shortfalls: PackDrift[] = [];
  const overDeliveries: PackDrift[] = [];

  for (const pack of packs) {
    const postingsFound = foundByPack.get(pack.id) ?? 0;
    const drift = pack.creditsUsed - postingsFound;
    if (drift === 0) continue;

    const row: PackDrift = {
      packId: pack.id,
      userId: pack.userId,
      creditsTotal: pack.creditsTotal,
      creditsUsed: pack.creditsUsed,
      postingsFound,
      drift,
      lastTouchedAt: pack.updatedAt,
    };
    if (drift > 0) shortfalls.push(row);
    else overDeliveries.push(row);
  }

  return {
    packsChecked: packs.length,
    shortfalls,
    overDeliveries,
    creditsOwed: shortfalls.reduce((sum, s) => sum + s.drift, 0),
  };
}
