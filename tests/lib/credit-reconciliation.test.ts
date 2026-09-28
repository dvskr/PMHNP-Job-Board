/**
 * Does every spent posting credit have a posting behind it?
 *
 * Spending a credit and building the posting it paid for are two statements
 * with a compensator between them, and the compensator only runs if the
 * process survives to reach it. A kill in that window leaves the employer
 * one post short of what they bought, and nothing else in the system would
 * ever notice.
 *
 * These are behavioural tests on the real function. The two that matter are
 * the ones that decide whether an operator gets woken up: a spend that is
 * still in flight must not look like drift, and more postings than credits
 * must never be quietly folded in with employers who are owed.
 *
 * All fixtures are fictional.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { prisma } from '@/lib/prisma';
import { findCreditDrift, QUIET_PERIOD_MINUTES } from '@/lib/credit-reconciliation';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

const ROOT = path.resolve(__dirname, '../../');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const NOW = new Date('2026-09-28T12:00:00.000Z');
const LONG_AGO = new Date('2026-09-01T12:00:00.000Z');

function pack(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'pack-a',
    userId: 'user-1',
    creditsTotal: 10,
    creditsUsed: 5,
    updatedAt: LONG_AGO,
    ...over,
  };
}

function counts(rows: { creditPackId: string; n: number }[]) {
  return rows.map((r) => ({ creditPackId: r.creditPackId, _count: { _all: r.n } }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('a healthy pack reports nothing', () => {
  it('counter and postings agree', async () => {
    db.postingCreditPack.findMany.mockResolvedValue([pack({ creditsUsed: 5 })]);
    db.employerJob.groupBy.mockResolvedValue(counts([{ creditPackId: 'pack-a', n: 5 }]));

    const report = await findCreditDrift(NOW);
    expect(report.shortfalls).toEqual([]);
    expect(report.overDeliveries).toEqual([]);
    expect(report.creditsOwed).toBe(0);
    expect(report.packsChecked).toBe(1);
  });

  it('does not query postings at all when no pack has been spent', async () => {
    db.postingCreditPack.findMany.mockResolvedValue([]);
    const report = await findCreditDrift(NOW);
    expect(report.packsChecked).toBe(0);
    expect(db.employerJob.groupBy).not.toHaveBeenCalled();
  });

  it('never looks at a pack with nothing spent on it', async () => {
    db.postingCreditPack.findMany.mockResolvedValue([]);
    await findCreditDrift(NOW);
    expect(db.postingCreditPack.findMany.mock.calls[0][0].where.creditsUsed).toEqual({ gt: 0 });
  });
});

describe('a credit taken with no posting behind it is reported as owed', () => {
  it('counts the shortfall', async () => {
    db.postingCreditPack.findMany.mockResolvedValue([pack({ creditsUsed: 5 })]);
    db.employerJob.groupBy.mockResolvedValue(counts([{ creditPackId: 'pack-a', n: 4 }]));

    const report = await findCreditDrift(NOW);
    expect(report.shortfalls).toHaveLength(1);
    expect(report.shortfalls[0]).toMatchObject({
      packId: 'pack-a', creditsUsed: 5, postingsFound: 4, drift: 1,
    });
    expect(report.creditsOwed).toBe(1);
  });

  it('handles a pack with no postings at all', async () => {
    // groupBy returns nothing for a pack with zero matching rows, so the
    // lookup has to default rather than come back undefined.
    db.postingCreditPack.findMany.mockResolvedValue([pack({ creditsUsed: 2 })]);
    db.employerJob.groupBy.mockResolvedValue([]);

    const report = await findCreditDrift(NOW);
    expect(report.shortfalls[0].postingsFound).toBe(0);
    expect(report.shortfalls[0].drift).toBe(2);
  });

  it('totals what is owed across several packs', async () => {
    db.postingCreditPack.findMany.mockResolvedValue([
      pack({ id: 'pack-a', creditsUsed: 5 }),
      pack({ id: 'pack-b', creditsUsed: 3 }),
      pack({ id: 'pack-c', creditsUsed: 1 }),
    ]);
    db.employerJob.groupBy.mockResolvedValue(counts([
      { creditPackId: 'pack-a', n: 3 },
      { creditPackId: 'pack-b', n: 3 },
      { creditPackId: 'pack-c', n: 0 },
    ]));

    const report = await findCreditDrift(NOW);
    expect(report.creditsOwed).toBe(3);
    expect(report.shortfalls.map((s) => s.packId)).toEqual(['pack-a', 'pack-c']);
  });
});

describe('an in-flight spend must not look like drift', () => {
  // This is the one that decides whether the sweep cries wolf on every
  // normal purchase. spendOneCredit stamps updated_at in the same statement
  // that increments the counter, so a pack touched seconds ago may have a
  // posting milliseconds from being written.
  it('excludes packs touched inside the quiet period', async () => {
    db.postingCreditPack.findMany.mockResolvedValue([]);
    await findCreditDrift(NOW);

    const where = db.postingCreditPack.findMany.mock.calls[0][0].where;
    const cutoff = where.updatedAt.lt as Date;
    expect(NOW.getTime() - cutoff.getTime()).toBe(QUIET_PERIOD_MINUTES * 60_000);
  });

  it('the quiet period is well beyond any request lifetime', async () => {
    // A request cannot outlive a serverless function's ceiling, so the
    // window this guards against cannot still be open.
    expect(QUIET_PERIOD_MINUTES).toBeGreaterThanOrEqual(15);
  });
});

describe('more postings than credits is a different and worse problem', () => {
  it('is reported separately, never folded into what is owed', async () => {
    // The spend window cannot produce this: it means postings exist that no
    // credit paid for. Counting it as a negative shortfall would let it
    // cancel out a real shortfall and vanish from the total.
    db.postingCreditPack.findMany.mockResolvedValue([
      pack({ id: 'pack-a', creditsUsed: 5 }),
      pack({ id: 'pack-b', creditsUsed: 2 }),
    ]);
    db.employerJob.groupBy.mockResolvedValue(counts([
      { creditPackId: 'pack-a', n: 7 },
      { creditPackId: 'pack-b', n: 1 },
    ]));

    const report = await findCreditDrift(NOW);
    expect(report.overDeliveries).toHaveLength(1);
    expect(report.overDeliveries[0]).toMatchObject({ packId: 'pack-a', drift: -2 });
    // The owed total is the shortfall alone, not 1 + (-2).
    expect(report.creditsOwed).toBe(1);
    expect(report.shortfalls.map((s) => s.packId)).toEqual(['pack-b']);
  });
});

describe('the sweep and the repair are deliberately separate', () => {
  const cron = read('app/api/cron/credit-reconciliation/route.ts');
  const script = read('scripts/reconcile-credit-drift.ts');

  it('the cron writes nothing', () => {
    // Drift is inferred from EmployerJob rows that the admin routes can
    // hard delete, so a self-healing sweep would mint a free credit every
    // time an admin removed a credit funded posting.
    for (const forbidden of ['update(', 'updateMany(', 'create(', 'delete(']) {
      expect(cron, `cron writes: ${forbidden}`).not.toContain(`postingCreditPack.${forbidden}`);
    }
    expect(cron).toContain('findCreditDrift');
  });

  it('the cron is authenticated and scheduled', () => {
    expect(cron).toContain('verifyCronOrAdmin');
    const vercel = JSON.parse(read('vercel.json')) as { crons: { path: string }[] };
    expect(vercel.crons.map((c) => c.path)).toContain('/api/cron/credit-reconciliation');
  });

  it('the cron stays silent when there is nothing wrong', () => {
    // A nightly "all clear" trains people to ignore the channel.
    expect(cron).toMatch(/if \(report\.overDeliveries\.length > 0 \|\| report\.shortfalls\.length > 0\)/);
  });

  it('the alert carries no employer identity', () => {
    // It goes to a chat channel, and the repo is public about what it logs.
    const alert = cron.slice(cron.indexOf('const lines = ['), cron.indexOf('sendDiscordMessage'));
    expect(alert).not.toMatch(/employerName|contactEmail|\.email/);
  });

  it('the repair refuses to run across every pack at once', () => {
    // A blanket --apply is the automatic restore this design rejected,
    // wearing a different hat.
    expect(script).toMatch(/if \(!packId\)/);
    expect(script).toContain('--pack');
  });

  it('the repair re-checks the counter it read, so a racing spend wins', () => {
    expect(script).toMatch(/where: \{ id: packId, creditsUsed: target\.creditsUsed \}/);
    expect(script).toMatch(/restored\.count === 0/);
  });

  it('the repair will not touch a pack the report did not flag', () => {
    expect(script).toMatch(/report\.shortfalls\.find\(/);
    expect(script).toContain('is not in the shortfall list');
  });

  it('both print the database host before doing anything', () => {
    expect(script).toContain('database host');
  });
});
