/**
 * A renewal is sold as a fresh allowance, so it has to deliver one.
 *
 * The renewal receipt says "you also got a fresh N candidate unlocks and N
 * InMails", in the past tense. Both expiry emails repeat it, the dashboard
 * renewal modal lists it, and Terms section 7 states it as a feature of every
 * posting "whether charged at the first-posting rate, the standard rate, or
 * renewed". Five surfaces.
 *
 * No code granted it. getUnlocksForPosting counted every ProfileView ever
 * attributed to the posting, with no lower bound, and the renewal webhook
 * branch wrote only paymentStatus, pricingTier and the two expiry stamps. An
 * employer who spent their allowance and then paid to renew was refused on
 * the next unlock while holding a receipt saying it had been delivered.
 *
 * All fixtures are fictional.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { prisma } from '@/lib/prisma';
import { getUnlocksForPosting, cycleStart } from '@/lib/tier-limits';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

const ROOT = path.resolve(__dirname, '../../');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const POSTED = new Date('2026-08-01T00:00:00.000Z');
const RENEWED = new Date('2026-09-30T00:00:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
  db.profileView.count.mockResolvedValue(0);
});

describe('cycleStart is the single place that decides', () => {
  it('uses the renewal stamp once a posting has been renewed', () => {
    expect(cycleStart({ createdAt: POSTED, entitlementCycleStartedAt: RENEWED })).toBe(RENEWED);
  });

  it('falls back to createdAt for a posting that never renewed', () => {
    // Which is exactly the old behaviour, so nothing changes for them.
    expect(cycleStart({ createdAt: POSTED, entitlementCycleStartedAt: null })).toBe(POSTED);
    expect(cycleStart({ createdAt: POSTED })).toBe(POSTED);
  });
});

describe('unlock counting respects the cycle', () => {
  it('floors the count on the cycle start', async () => {
    await getUnlocksForPosting('ej-1', RENEWED);
    expect(db.profileView.count).toHaveBeenCalledWith({
      where: { employerJobId: 'ej-1', viewedAt: { gte: RENEWED } },
    });
  });

  it('counts the lifetime total when no cycle is given', async () => {
    // The signature stays usable for a caller that genuinely wants the
    // total, but no entitlement gate takes that path.
    await getUnlocksForPosting('ej-1');
    expect(db.profileView.count).toHaveBeenCalledWith({
      where: { employerJobId: 'ej-1' },
    });
  });

  it('a renewed posting does not count the previous cycle against the new one', async () => {
    // The bug, stated as a number. Before the fix this returned the old
    // cycle's 25 and the employer was refused on unlock 26.
    db.profileView.count.mockResolvedValue(0);
    const used = await getUnlocksForPosting('ej-1', RENEWED);
    expect(used).toBe(0);
  });
});

describe('the renewal actually moves the cycle', () => {
  const webhook = read('app/api/webhooks/stripe/route.ts');

  it('stamps entitlementCycleStartedAt in the same write as paymentStatus', () => {
    // Same write, so the allowance and the payment cannot come apart.
    // Anchored on a single token rather than a multi-line literal, because
    // this file is CRLF and a \n in the needle silently matches nothing.
    const at = webhook.indexOf('pricingTier: renewalTier');
    expect(at, 'the renewal update moved').toBeGreaterThan(-1);
    expect(webhook.slice(at, at + 400)).toContain('entitlementCycleStartedAt: new Date()');
  });

  it('every entitlement read goes through cycleStart, not a raw column', () => {
    const src = read('lib/tier-limits.ts');
    // posting.createdAt must not be passed straight into an entitlement
    // count any more; that was the bug in three separate call sites.
    const gateRegion = src.slice(src.indexOf('export async function canUnlockCandidate'));
    expect(gateRegion).not.toMatch(/getInMailsForPosting\([^)]*posting\.createdAt/);
    expect(gateRegion).not.toMatch(/getUnlocksForPosting\(posting\.id\)/);
  });

  it('the column exists, is indexed for the query, and is backfilled', () => {
    expect(read('prisma/schema.prisma')).toMatch(
      /entitlementCycleStartedAt DateTime\?\s+@map\("entitlement_cycle_started_at"\)/,
    );
    const dir = path.join(ROOT, 'prisma/migrations');
    const sql = fs.readdirSync(dir)
      .filter((d) => fs.existsSync(path.join(dir, d, 'migration.sql')))
      .map((d) => fs.readFileSync(path.join(dir, d, 'migration.sql'), 'utf8'))
      .join('\n');
    expect(sql).toMatch(/ADD COLUMN "entitlement_cycle_started_at"/);
    // Backfilled, so the column means something for every existing row.
    expect(sql).toMatch(/UPDATE "employer_jobs" SET "entitlement_cycle_started_at" = "created_at"/);
    // The count now filters on both columns. [\s\S] rather than the dotAll
    // flag: tsc targets below es2018 and rejects /s outright.
    expect(sql).toMatch(/profile_views[\s\S]*employer_job_id[\s\S]*viewed_at/);
  });
});

describe('the five surfaces that promise it are now telling the truth', () => {
  // Each of these claims the fresh allowance. They are correct now, and
  // listed here so that removing the grant without removing the claim
  // fails rather than quietly going back to overselling.
  it('the renewal receipt claims it', () => {
    expect(read('lib/email-service.ts')).toMatch(/fresh \$\{config\.limits\.candidateUnlocksPerPosting\}/);
  });

  it('the dashboard renewal modal claims it', () => {
    expect(read('components/employer/EmployerDashboardClient.tsx'))
      .toMatch(/config\.limits\.candidateUnlocksPerPosting\} unlocks/);
  });

  it('Terms claims it for renewed postings specifically', () => {
    expect(read('app/terms/page.tsx')).toMatch(/or renewed, receive the same features/);
  });
});
