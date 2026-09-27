/**
 * Prepaid posting credit packs.
 *
 * A pack is ONE payment that funds N postings later, which makes it unlike
 * every other money path in this repo: the charge and the delivery are
 * separated by weeks, there is no jobId on the purchase, and the entitlement
 * is a counter rather than a row per thing bought. Each of those is a place
 * the money and the delivery can come apart, so each gets a test.
 *
 * Behavioural tests where the behaviour is in TypeScript; source assertions
 * where it is in a UNIQUE index, a conditional UPDATE, or the ORDER of two
 * branches in a webhook, none of which a mocked client can enforce.
 *
 * All fixtures are fictional.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { config } from '@/lib/config';
import { prisma } from '@/lib/prisma';
import {
  getCreditBalance,
  spendOneCredit,
  refundOneCredit,
  creditPackExpiry,
} from '@/lib/credit-packs';

const ROOT = path.resolve(__dirname, '../../');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const packRoute = read('app/api/create-pack-checkout/route.ts');
const checkout = read('app/api/create-checkout/route.ts');
const quote = read('app/api/employer/post-price/route.ts');
const webhook = read('app/api/webhooks/stripe/route.ts');

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the pack catalogue is internally coherent', () => {
  it('every pack has a unique id', () => {
    const ids = config.creditPacks.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every pack beats the standard per-post price', () => {
    // A "bulk discount" that is not a discount is the one bug here nobody
    // would report: the buyer just quietly pays more than list.
    for (const pack of config.creditPacks) {
      expect(
        config.creditPackPerPostPrice(pack),
        `${pack.id} is not cheaper than a single post`,
      ).toBeLessThan(config.postingPrice);
    }
  });

  it('the advertised savings percent matches the real one', () => {
    // The card renders savingsPercent as a claim. Prices are rounded to
    // salable numbers, so allow a point of drift, but not a wrong claim.
    for (const pack of config.creditPacks) {
      const real = (1 - pack.priceCents / (pack.credits * config.postingPrice * 100)) * 100;
      expect(
        Math.abs(real - pack.savingsPercent),
        `${pack.id} advertises ${pack.savingsPercent}% but is really ${real.toFixed(1)}%`,
      ).toBeLessThanOrEqual(1);
    }
  });

  it('bigger packs are cheaper per post, so the ladder makes sense', () => {
    const sorted = [...config.creditPacks].sort((a, b) => a.credits - b.credits);
    for (let i = 1; i < sorted.length; i++) {
      expect(config.creditPackPerPostPrice(sorted[i]))
        .toBeLessThanOrEqual(config.creditPackPerPostPrice(sorted[i - 1]));
    }
  });

  it('prices are whole dollars, so no card ever renders cents', () => {
    for (const pack of config.creditPacks) {
      expect(pack.priceCents % 100, `${pack.id} has cents`).toBe(0);
    }
  });

  it('creditPackById never resolves something outside the catalogue', () => {
    expect(config.creditPackById('pack3')).toBeDefined();
    expect(config.creditPackById('nope')).toBeUndefined();
    expect(config.creditPackById('')).toBeUndefined();
    expect(config.creditPackById('__proto__')).toBeUndefined();
  });
});

describe('the pack pitch has to be true for the reader being pitched', () => {
  // savingsPercent is measured against the STANDARD price, which is the
  // right claim for a returning employer and the wrong one for a first
  // purchase: buying a pack forfeits the discounted entry, so the buyer is
  // really comparing against firstPostPrice + (n-1) * postingPrice.
  const payAsYouGoCents = (n: number): number =>
    (config.firstPostPrice + (n - 1) * config.postingPrice) * 100;

  it('the smallest pack does NOT beat pay-as-you-go before the first post', () => {
    // Not a defect, a fact about the price ladder, pinned so nobody writes
    // "packs from 3 posts save you money" on a cold marketing surface. If a
    // repricing ever makes this false, this test should be deleted, not
    // worked around.
    const smallest = [...config.creditPacks].sort((a, b) => a.credits - b.credits)[0];
    expect(smallest.priceCents).toBeGreaterThan(payAsYouGoCents(smallest.credits));
  });

  it('smallestPackWorthItBeforeFirstPost skips the ones that lose', () => {
    const worthIt = config.smallestPackWorthItBeforeFirstPost();
    expect(worthIt, 'no pack beats pay-as-you-go for a first-time buyer').not.toBeNull();
    expect(worthIt!.priceCents).toBeLessThan(payAsYouGoCents(worthIt!.credits));
    // And it really is the smallest such pack.
    const smaller = config.creditPacks.filter((p) => p.credits < worthIt!.credits);
    for (const p of smaller) {
      expect(p.priceCents, `${p.id} was skipped but actually wins`)
        .toBeGreaterThanOrEqual(payAsYouGoCents(p.credits));
    }
  });

  it('maxPackSavingsPercent scans instead of trusting array order', () => {
    expect(config.maxPackSavingsPercent())
      .toBe(Math.max(...config.creditPacks.map((p) => p.savingsPercent)));
    // Reordering the catalogue must not change the advertised number.
    const reversed = [...config.creditPacks].reverse();
    expect(reversed.reduce((b, p) => Math.max(b, p.savingsPercent), 0))
      .toBe(config.maxPackSavingsPercent());
  });

  it('the config rationale no longer claims packs always win', () => {
    // The comment asserted the opposite of the arithmetic and was the
    // premise every piece of pack copy would have been built on.
    const src = read('lib/config.ts');
    expect(src).not.toMatch(/pays less per post than the discounted entry/);
    expect(src).toMatch(/NOT FREE FOR THE BUYER/);
  });
});

describe('renewal savings are derived, not typed', () => {
  it('renewalDiscountPercent matches the real discount', () => {
    expect(config.renewalDiscountPercent())
      .toBe(Math.round((1 - config.renewalPrice / config.postingPrice) * 100));
  });

  it('the renewal modal interpolates it instead of hardcoding a number', () => {
    // It said "Save 10%" beside an interpolated price. The real figure is
    // nearly three times that, and the literal had already survived one
    // repricing, which is what a literal always does.
    const src = read('components/employer/EmployerDashboardClient.tsx');
    expect(src).toContain('config.renewalDiscountPercent()');
    expect(src).not.toMatch(/Save 10%/);
  });
});

describe('creditPackExpiry', () => {
  it('lands creditPackValidDays out, not at some hardcoded year', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const got = creditPackExpiry(from);
    const days = (got.getTime() - from.getTime()) / 86_400_000;
    expect(days).toBe(config.creditPackValidDays);
  });
});

describe('getCreditBalance', () => {
  it('sums what is left across packs and ignores exhausted ones', () => {
    db.postingCreditPack.findMany.mockResolvedValue([
      { id: 'a', creditsTotal: 3, creditsUsed: 3, expiresAt: new Date('2026-02-01') },
      { id: 'b', creditsTotal: 5, creditsUsed: 1, expiresAt: new Date('2026-03-01') },
      { id: 'c', creditsTotal: 10, creditsUsed: 0, expiresAt: new Date('2026-04-01') },
    ]);

    return getCreditBalance('user-1', ['acct:user-1']).then((balance) => {
      expect(balance.available).toBe(14);
      // The exhausted pack expires soonest but has nothing to give, so the
      // next spend must come from 'b'. Naming 'a' here would send
      // spendOneCredit to a pack that can never satisfy it.
      expect(balance.nextPackId).toBe('b');
      expect(balance.nextExpiry).toEqual(new Date('2026-03-01'));
    });
  });

  it('reports a clean zero when there are no packs', async () => {
    db.postingCreditPack.findMany.mockResolvedValue([]);
    const balance = await getCreditBalance('user-1');
    expect(balance).toEqual({ available: 0, nextPackId: null, nextExpiry: null });
  });

  it('only ever looks at live, unrefunded packs', async () => {
    db.postingCreditPack.findMany.mockResolvedValue([]);
    await getCreditBalance('user-1', ['acct:user-1', 'dom:example.test']);

    const where = db.postingCreditPack.findMany.mock.calls[0][0].where;
    expect(where.refundedAt).toBeNull();
    expect(where.expiresAt.gt).toBeInstanceOf(Date);
    // Matched on the account OR a key snapshotted at purchase, so a pack one
    // person bought is spendable by their team.
    expect(where.OR).toEqual([
      { userId: 'user-1' },
      { quotaKeys: { hasSome: ['acct:user-1', 'dom:example.test'] } },
    ]);
  });

  it('an org: key never unlocks spending', async () => {
    // buildQuotaKeys is a DENY key set: a false match there costs one
    // discount, and lib/employer-quota.ts accepts a stated residual risk to
    // get it. `org:` is a company name the account typed for itself at
    // signup, verified by nobody, and its documented worst case is burning
    // a rival's single discounted post.
    //
    // Reused to GRANT, that same risk buys a whole pack: sign up on any
    // company domain, type a rival's company name, spend what they paid
    // for. The verified keys stay; this one does not.
    db.postingCreditPack.findMany.mockResolvedValue([]);
    await getCreditBalance('user-1', ['acct:user-1', 'dom:example.test', 'org:acmehealth']);

    const or = db.postingCreditPack.findMany.mock.calls[0][0].where.OR;
    expect(or).toEqual([
      { userId: 'user-1' },
      { quotaKeys: { hasSome: ['acct:user-1', 'dom:example.test'] } },
    ]);
  });

  it('an org: key alone leaves nothing but the buyer themselves', async () => {
    db.postingCreditPack.findMany.mockResolvedValue([]);
    await getCreditBalance('user-1', ['org:acmehealth']);
    expect(db.postingCreditPack.findMany.mock.calls[0][0].where.OR)
      .toEqual([{ userId: 'user-1' }]);
  });

  it('the spend path filters the keys the same way the balance does', async () => {
    // Two predicates that disagree would show a balance nobody can spend.
    db.postingCreditPack.findMany.mockResolvedValue([]);
    await spendOneCredit('user-1', ['acct:user-1', 'org:acmehealth']);
    expect(db.postingCreditPack.findMany.mock.calls[0][0].where.OR)
      .toEqual([{ userId: 'user-1' }, { quotaKeys: { hasSome: ['acct:user-1'] } }]);
  });

  it('drops the key arm entirely when there are no keys', async () => {
    // An empty hasSome matches nothing in Postgres, but leaving the arm in
    // is still noise in a predicate that decides entitlement.
    db.postingCreditPack.findMany.mockResolvedValue([]);
    await getCreditBalance('user-1', []);
    expect(db.postingCreditPack.findMany.mock.calls[0][0].where.OR)
      .toEqual([{ userId: 'user-1' }]);
  });

  it('asks for the soonest-expiring pack first', async () => {
    db.postingCreditPack.findMany.mockResolvedValue([]);
    await getCreditBalance('user-1');
    expect(db.postingCreditPack.findMany.mock.calls[0][0].orderBy)
      .toEqual({ expiresAt: 'asc' });
  });
});

describe('spendOneCredit', () => {
  it('returns the pack it actually decremented', async () => {
    db.postingCreditPack.findMany.mockResolvedValue([{ id: 'pack-a' }]);
    db.$executeRaw.mockResolvedValue(1);
    await expect(spendOneCredit('user-1', ['acct:user-1'])).resolves.toBe('pack-a');
  });

  it('moves to the next pack when it loses the race on the first', async () => {
    // Losing the soonest-expiring pack does NOT mean the identity is out of
    // credits. Returning null here would send a paying agency to Stripe with
    // credits still on the books.
    db.postingCreditPack.findMany.mockResolvedValue([{ id: 'pack-a' }, { id: 'pack-b' }]);
    db.$executeRaw.mockResolvedValueOnce(0).mockResolvedValueOnce(1);

    await expect(spendOneCredit('user-1')).resolves.toBe('pack-b');
    expect(db.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it('returns null when every pack is taken, rather than overdrawing', async () => {
    db.postingCreditPack.findMany.mockResolvedValue([{ id: 'pack-a' }, { id: 'pack-b' }]);
    db.$executeRaw.mockResolvedValue(0);
    await expect(spendOneCredit('user-1')).resolves.toBeNull();
  });

  it('returns null with no packs at all, without touching the database', async () => {
    db.postingCreditPack.findMany.mockResolvedValue([]);
    await expect(spendOneCredit('user-1')).resolves.toBeNull();
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });

  it('spends soonest-to-expire first, so nobody loses paid credits', async () => {
    db.postingCreditPack.findMany.mockResolvedValue([]);
    await spendOneCredit('user-1');
    expect(db.postingCreditPack.findMany.mock.calls[0][0].orderBy)
      .toEqual({ expiresAt: 'asc' });
  });

  it('tests the balance inside the UPDATE, not in a prior read', () => {
    // The whole point. A read-then-write degrades to "usually once" under
    // exactly the concurrency it exists to survive, and the repo has already
    // paid for that lesson on the discount hold and on alert sends.
    const src = read('lib/credit-packs.ts');
    const spend = src.slice(src.indexOf('export async function spendOneCredit'));
    expect(spend).toContain('$executeRaw');
    expect(spend).toMatch(/UPDATE posting_credit_packs/);
    expect(spend).toMatch(/SET credits_used = credits_used \+ 1/);
    // Column against column, in one statement.
    expect(spend).toMatch(/credits_used < credits_total/);
    expect(spend).toMatch(/refunded_at IS NULL/);
    expect(spend).toMatch(/expires_at > now\(\)/);
    // The row count is the verdict.
    expect(spend).toMatch(/claimed === 1/);
  });
});

describe('refundOneCredit', () => {
  it('hands the credit back', async () => {
    await refundOneCredit('pack-a');
    expect(db.postingCreditPack.updateMany).toHaveBeenCalledWith({
      where: { id: 'pack-a', creditsUsed: { gt: 0 } },
      data: { creditsUsed: { decrement: 1 } },
    });
  });

  it('cannot drive the counter below zero', async () => {
    // A double refund on the same pack would otherwise mint a credit.
    await refundOneCredit('pack-a');
    expect(db.postingCreditPack.updateMany.mock.calls[0][0].where.creditsUsed)
      .toEqual({ gt: 0 });
  });
});

describe('buying a pack never trusts the buyer', () => {
  it('resolves the pack from the catalogue and prices it from config', () => {
    expect(packRoute).toContain('config.creditPackById(packId)');
    expect(packRoute).toContain('unit_amount: pack.priceCents');
    // No price, amount or credit count may arrive in the body.
    expect(packRoute).not.toMatch(/body\.(priceCents|amount|credits)/);
  });

  it('refuses an unknown pack id instead of inventing one', () => {
    expect(packRoute).toMatch(/if \(!pack\)[\s\S]{0,120}status: 400/);
  });

  it('keys the pack on session identity, never on anything form-typed', () => {
    expect(packRoute).toMatch(/buildQuotaKeys\(\{[\s\S]{0,400}userId: user\.id/);
    expect(packRoute).toContain('signupEmail: user.email');
    // The company name comes off the authenticated profile row.
    expect(packRoute).toContain('lockedCompanyName: profile.company');
    expect(packRoute).not.toMatch(/lockedCompanyName: body\./);
  });

  it('requires an employer session', () => {
    expect(packRoute).toMatch(/status: 401/);
    expect(packRoute).toContain("['employer', 'admin'].includes(profile.role)");
  });

  it('writes nothing to the database, so an abandoned pack checkout leaves no row', () => {
    expect(packRoute).not.toMatch(/prisma\.postingCreditPack\.create/);
    expect(packRoute).not.toMatch(/prisma\.employerJob\.create/);
  });
});

describe('the webhook delivers the pack', () => {
  it('handles credit_pack ABOVE the missing-jobId guard', () => {
    // The single highest-consequence line ordering in this feature. A pack
    // purchase carries no jobId, and the guard below deliberately KEEPS the
    // dedupe row so Stripe stops retrying. Handled after it, the first pack
    // ever sold is paid for and never delivered.
    const packAt = webhook.indexOf("type === 'credit_pack'");
    const jobIdGuardAt = webhook.indexOf('No job ID in session metadata');
    expect(packAt, 'the credit_pack branch is gone').toBeGreaterThan(-1);
    expect(jobIdGuardAt, 'the jobId guard moved').toBeGreaterThan(-1);
    expect(packAt).toBeLessThan(jobIdGuardAt);
  });

  it('a replayed event cannot mint a second pack', () => {
    const branch = webhook.slice(
      webhook.indexOf("type === 'credit_pack'"),
      webhook.indexOf('No job ID in session metadata'),
    );
    expect(branch).toContain('skipDuplicates: true');
    expect(branch).toContain('stripeSessionId: session.id');
    // And the index that actually enforces it.
    expect(read('prisma/schema.prisma')).toMatch(/stripeSessionId\s+String\s+@unique/);
  });

  it('credits come from the catalogue, not from the Stripe payload', () => {
    const branch = webhook.slice(
      webhook.indexOf("type === 'credit_pack'"),
      webhook.indexOf('No job ID in session metadata'),
    );
    expect(branch).toContain('creditsTotal: option.credits');
    expect(branch).not.toMatch(/creditsTotal: session\./);
  });

  it('a failed pack write returns 500 and clears dedupe, so Stripe retries', () => {
    const branch = webhook.slice(
      webhook.indexOf("type === 'credit_pack'"),
      webhook.indexOf('No job ID in session metadata'),
    );
    expect(branch).toContain('cleanupDedupe()');
    expect(branch).toMatch(/status: 500/);
  });
});

describe('refunding a pack takes the credits back', () => {
  const refundBlock = webhook.slice(
    webhook.indexOf("event.type === 'charge.refunded'"),
    webhook.indexOf('const refundedAmount = charge.amount_refunded'),
  );

  it('looks for a pack BEFORE the no-matching-JobCharge return', () => {
    // A pack is deliberately not in the JobCharge ledger, so after that
    // early return the money is back and every credit is still spendable.
    //
    // Scoped to this handler. invoice.paid, charge.dispute.created and
    // charge.dispute.closed all log the same phrase, so a whole-file
    // indexOf matches one of those instead and the ordering it compares is
    // between two unrelated blocks.
    const packAt = refundBlock.indexOf('prisma.postingCreditPack.findUnique');
    const bailAt = refundBlock.indexOf("note: 'no matching JobCharge'");
    expect(packAt, 'the pack lookup is gone from charge.refunded').toBeGreaterThan(-1);
    expect(bailAt, 'the JobCharge bail-out moved').toBeGreaterThan(-1);
    expect(packAt).toBeLessThan(bailAt);
  });

  it('matches the pack on the payment intent', () => {
    expect(refundBlock).toMatch(/postingCreditPack\.findUnique\(\{\s*where: \{ stripePaymentIntentId: paymentIntentId \}/);
  });

  it('a full refund sets refundedAt, which is what stops further spending', () => {
    // spendableWhere filters on refundedAt. Anything else here is decoration.
    expect(refundBlock).toMatch(/postingCreditPack\.update\(\{[\s\S]{0,160}refundedAt: new Date\(\)/);
    expect(read('lib/credit-packs.ts')).toContain('refundedAt: null');
  });

  it('a full refund revokes the postings the pack already funded', () => {
    // The revocation itself lives in revokePackPostings, shared with the
    // dispute path so the two cannot drift; what this pins is that the
    // refund branch actually calls it, and with the right status.
    expect(refundBlock).toContain("revokePackPostings(pack.id, 'refunded')");
  });

  it('a partial refund leaves the credits alone', () => {
    // There is no per-credit ledger to book a partial against, and killing
    // the remainder over a goodwill reversal takes back posts still paid for.
    //
    // Asserted by slicing the branch rather than by a distance-bounded
    // regex: the comment explaining the decision sits inside the branch, so
    // any {0,N} bound is really a limit on how well the code is commented.
    const guardAt = refundBlock.indexOf('if (!packFullyRefunded)');
    const returnAt = refundBlock.indexOf("note: 'partial credit pack refund'");
    expect(guardAt, 'the partial-refund guard is gone').toBeGreaterThan(-1);
    expect(returnAt).toBeGreaterThan(guardAt);

    const partial = refundBlock.slice(guardAt, returnAt);
    expect(partial).not.toContain('refundedAt: new Date()');
    expect(partial).not.toContain("paymentStatus: 'refunded'");
    expect(partial).not.toContain('isPublished: false');
  });
});

describe('a chargeback on a pack revokes it, the same as a refund', () => {
  // Found in review. Both dispute handlers matched only on the JobCharge
  // ledger, and a pack is deliberately not in that ledger, so a chargeback
  // on a $2,790 pack fell through the bail-out: every remaining credit
  // stayed spendable and every posting it had already funded stayed live
  // and featured, with no admin route that writes this table to undo it.
  const created = webhook.slice(
    webhook.indexOf("event.type === 'charge.dispute.created'"),
    webhook.indexOf("event.type === 'charge.dispute.closed'"),
  );
  const closed = webhook.slice(webhook.indexOf("event.type === 'charge.dispute.closed'"));

  it('dispute.created checks for a pack before the JobCharge bail-out', () => {
    const packAt = created.indexOf('postingCreditPack.findUnique');
    const bailAt = created.indexOf("note: 'no matching JobCharge'");
    expect(packAt, 'dispute.created is not pack-aware').toBeGreaterThan(-1);
    expect(bailAt).toBeGreaterThan(-1);
    expect(packAt).toBeLessThan(bailAt);
  });

  it('dispute.closed checks for a pack before the JobCharge bail-out', () => {
    const packAt = closed.indexOf('postingCreditPack.findUnique');
    const bailAt = closed.indexOf("note: 'no matching JobCharge'");
    expect(packAt, 'dispute.closed is not pack-aware').toBeGreaterThan(-1);
    expect(bailAt).toBeGreaterThan(-1);
    expect(packAt).toBeLessThan(bailAt);
  });

  it('an open dispute freezes the pack with disputedAt, not refundedAt', () => {
    // A dispute can be WON. Freezing with refundedAt would have to be undone
    // by clearing it, recording that money was never taken back.
    expect(created).toContain('disputedAt: new Date()');
    expect(created).not.toContain('refundedAt: new Date()');
    expect(created).toContain("revokePackPostings(disputedPack.id, 'disputed')");
  });

  it('winning the dispute unfreezes the pack and restores its postings', () => {
    expect(closed).toContain('disputedAt: null');
    expect(closed).toContain('restorePackPostings');
    // And only when we actually kept the money.
    expect(closed.indexOf('merchantKeptTheFunds'))
      .toBeLessThan(closed.indexOf('disputedAt: null'));
  });

  it('losing the dispute leaves the pack frozen', () => {
    const lost = closed.slice(
      closed.indexOf('if (!merchantKeptTheFunds)'),
      closed.indexOf("note: 'credit pack dispute lost'"),
    );
    expect(lost.length).toBeGreaterThan(0);
    expect(lost).not.toContain('disputedAt: null');
  });

  it('a frozen pack cannot be spent, in both the balance and the claim', () => {
    // The column is only worth adding if both predicates read it. The
    // balance read alone would still show credits; the raw UPDATE alone
    // would let the quote promise a post that checkout then charges for.
    const src = read('lib/credit-packs.ts');
    expect(src).toContain('disputedAt: null');
    expect(src).toMatch(/disputed_at IS NULL/);
  });

  it('the disputed column exists in a migration', () => {
    const dir = path.join(ROOT, 'prisma/migrations');
    const sql = fs.readdirSync(dir)
      .filter((d) => fs.existsSync(path.join(dir, d, 'migration.sql')))
      .map((d) => fs.readFileSync(path.join(dir, d, 'migration.sql'), 'utf8'))
      .join('\n');
    expect(sql).toMatch(/ALTER TABLE "posting_credit_packs" ADD COLUMN "disputed_at"/);
  });

  it('revoke touches only postings still sitting at paid', () => {
    // A posting already revoked by another event keeps the status that
    // revoked it, rather than being relabelled by whichever event is second.
    const src = read('lib/credit-packs.ts');
    const revoke = src.slice(src.indexOf('export async function revokePackPostings'));
    expect(revoke).toContain("paymentStatus: 'paid'");
    expect(revoke).toContain('isPublished: false, isFeatured: false');
  });

  it('restore touches only postings this dispute revoked', () => {
    const src = read('lib/credit-packs.ts');
    const restore = src.slice(src.indexOf('export async function restorePackPostings'));
    expect(restore).toContain("paymentStatus: 'disputed'");
    // Not republished: that is the employer's call, matching the JobCharge
    // dispute path.
    expect(restore).not.toContain('isPublished: true');
  });
});

describe('a credit-funded post is not given an invoice it never earned', () => {
  const invoice = read('app/api/employer/invoice/route.ts');

  it('refuses before the config price fallback can invent an amount', () => {
    // Found in review. A credit post has no JobCharge and no Checkout
    // session, so it fell through to `config.getStripePriceInCents(tier)`
    // and printed a standard price as the amount billed for that posting.
    // Nobody was charged that: the pack was one lump sum at a different
    // per-post rate. On a document that also carries tax ids.
    const guardAt = invoice.indexOf("employerJob.fundingSource === 'credit_pack'");
    const fallbackAt = invoice.indexOf('config.getStripePriceInCents(tier)');
    expect(guardAt, 'the credit-pack guard is gone').toBeGreaterThan(-1);
    expect(fallbackAt, 'the config fallback moved').toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(fallbackAt);
  });

  it('says where the real invoice is, rather than just refusing', () => {
    const guard = invoice.slice(
      invoice.indexOf("employerJob.fundingSource === 'credit_pack'"),
      invoice.indexOf('config.getStripePriceInCents(tier)'),
    );
    expect(guard).toMatch(/status: 404/);
    expect(guard).toMatch(/prepaid/i);
  });
});

describe('spending a credit on a post', () => {
  it('claims the credit before the posting exists, and returns it on failure', () => {
    const branch = checkout.slice(
      checkout.indexOf('Spend a prepaid credit'),
      checkout.indexOf('let job: Awaited<ReturnType<typeof createPosting>>'),
    );
    expect(branch.indexOf('spendOneCredit')).toBeLessThan(branch.indexOf('await createPosting()'));
    expect(branch).toContain('refundOneCredit');
  });

  it('never takes the discount hold', () => {
    const branch = checkout.slice(
      checkout.indexOf('Spend a prepaid credit'),
      checkout.indexOf('let job: Awaited<ReturnType<typeof createPosting>>'),
    );
    expect(branch).toMatch(/discountHoldKey = null/);
  });

  it('publishes the post itself, because no payment event is coming', () => {
    const branch = checkout.slice(
      checkout.indexOf('Spend a prepaid credit'),
      checkout.indexOf('let job: Awaited<ReturnType<typeof createPosting>>'),
    );
    expect(branch).toContain('isPublished: true');
    expect(branch).toContain("fundingSource: 'credit_pack'");
    expect(branch).toContain('creditPackId: packId');
  });

  it("marks the row 'paid', not a fourth payment status", () => {
    // A new status would pass the renewal route's denylist while breaking
    // invoice, receipt, toggle-publish, sorting and the admin org rollup,
    // all of which test for 'paid' exactly.
    const branch = checkout.slice(
      checkout.indexOf('Spend a prepaid credit'),
      checkout.indexOf('let job: Awaited<ReturnType<typeof createPosting>>'),
    );
    expect(branch).toContain("paymentStatus: 'paid'");
  });

  it('does everything on publish that the webhook does', () => {
    // A credit post never reaches the Stripe webhook, so every side effect
    // the webhook fires on publish has to be repeated here. The webhook
    // itself carries the scar: "Distribution audit A1" records that the
    // paid path once flipped isPublished without firing the embedding
    // refresh, leaving PAID posts invisible to AI search and recs. Omitting
    // any of these is that same bug on a new path.
    const branch = checkout.slice(
      checkout.indexOf('Spend a prepaid credit'),
      checkout.indexOf('let job: Awaited<ReturnType<typeof createPosting>>'),
    );

    for (const effect of [
      'embedding.refresh.job',      // AI search + recommendations
      'job/employer.published',     // instant alert fan-out to subscribers
      'pingAllSearchEngines',       // indexing
      'sendConfirmationEmail',      // the employer's dashboard link
      'jobDraft',                   // or the dashboard offers to resume a live job
    ]) {
      expect(branch, `credit publish skips ${effect}`).toContain(effect);
      expect(webhook, `${effect} is no longer a webhook publish effect`).toContain(effect);
    }
  });

  it('none of those side effects can fail the request', () => {
    // The posting is live and paid for by the time they run.
    const branch = checkout.slice(
      checkout.indexOf('Spend a prepaid credit'),
      checkout.indexOf('let job: Awaited<ReturnType<typeof createPosting>>'),
    );
    const effects = branch.slice(branch.indexOf('Everything the webhook does on publish'));
    // Every one is fire-and-forget with its own catch, so a dead Inngest or
    // a bounced email cannot roll the employer back into the 500 branch,
    // which would refund a credit for a post that is already published.
    expect(effects.match(/\.catch\(/g) ?? []).toHaveLength(5);
    expect(effects).not.toMatch(/await inngest\.send/);
    expect(effects).not.toMatch(/await sendConfirmationEmail/);
  });

  it('books no invoice for a post that had no charge', () => {
    // There is no JobCharge row for a credit post, so an invoice link would
    // point at nothing. The pack purchase carries its own Stripe invoice.
    const branch = checkout.slice(
      checkout.indexOf('Spend a prepaid credit'),
      checkout.indexOf('let job: Awaited<ReturnType<typeof createPosting>>'),
    );
    expect(branch).not.toContain('jobCharge.create');
    expect(branch).not.toContain('invoicePdfUrl');
  });

  it('is reachable only for a signed-in poster', () => {
    const branch = checkout.slice(
      checkout.indexOf('Spend a prepaid credit'),
      checkout.indexOf('let job: Awaited<ReturnType<typeof createPosting>>'),
    );
    expect(branch).toMatch(/if \(userId\)/);
  });
});

describe('credits do not expire silently', () => {
  // getCreditBalance always computed nextExpiry and it always reached the
  // dashboard, but nothing read it on a schedule, so a buyer who used six
  // of ten simply lost the other four on day 365 having paid for them.
  const cron = read('app/api/cron/credit-expiry-warnings/route.ts');

  it('the sweep exists and is cron authenticated', () => {
    expect(cron).toContain('verifyCronOrAdmin');
    expect(cron).toContain("withCronTracking('credit-expiry-warnings'");
  });

  it('is scheduled', () => {
    const vercel = JSON.parse(read('vercel.json')) as { crons: { path: string }[] };
    expect(vercel.crons.map((c) => c.path)).toContain('/api/cron/credit-expiry-warnings');
  });

  it('warns while the credits can still be used, not after', () => {
    // A pack that already expired cannot be rescued by an email.
    expect(cron).toMatch(/expiresAt: \{ gt: now, lte: horizon \}/);
  });

  it('never mails a pack with nothing left to lose', () => {
    expect(cron).toMatch(/creditsRemaining <= 0/);
    expect(cron).toContain('skippedNoCredits');
  });

  it('never mails a refunded or disputed pack', () => {
    const where = cron.slice(cron.indexOf('findMany({'), cron.indexOf('orderBy'));
    expect(where).toContain('refundedAt: null');
    expect(where).toContain('disputedAt: null');
  });

  it('claims before sending, so a daily sweep mails once per pack', () => {
    // The pack sits in the window for two weeks. Without a claim this is a
    // fortnight of identical mail.
    const claimAt = cron.indexOf('expiryWarningSentAt: now');
    const sendAt = cron.indexOf('sendCreditExpiryWarningEmail(');
    expect(claimAt).toBeGreaterThan(-1);
    expect(sendAt).toBeGreaterThan(claimAt);
    // Scalar-only predicate, same discipline as the posting expiry sweep.
    expect(cron).toMatch(/where: \{ id: pack\.id, expiryWarningSentAt: null \}/);
    expect(cron).toMatch(/claimed\.count === 0/);
  });

  it('hands the claim back only on a definitive rejection', () => {
    expect(cron).toMatch(/if \(result\.rejected\)/);
    // Guarded on our own stamp, so a concurrent writer is never clobbered.
    expect(cron).toMatch(/where: \{ id: pack\.id, expiryWarningSentAt: now \}/);
    // Ambiguous failure keeps the claim.
    expect(cron).toContain('claim kept');
  });

  it('skips a suppressed address without stamping it', () => {
    const suppressAt = cron.indexOf('isEmailSuppressed');
    const claimAt = cron.indexOf('expiryWarningSentAt: now');
    expect(suppressAt).toBeGreaterThan(-1);
    // Checked BEFORE the claim, so the pack is reconsidered if the address
    // is ever un-suppressed.
    expect(suppressAt).toBeLessThan(claimAt);
  });

  it('has a dedupe column and an index behind the selection', () => {
    expect(read('prisma/schema.prisma')).toMatch(/expiryWarningSentAt\s+DateTime\?\s+@map\("expiry_warning_sent_at"\)/);
    const dir = path.join(ROOT, 'prisma/migrations');
    const sql = fs.readdirSync(dir)
      .filter((d) => fs.existsSync(path.join(dir, d, 'migration.sql')))
      .map((d) => fs.readFileSync(path.join(dir, d, 'migration.sql'), 'utf8'))
      .join('\n');
    expect(sql).toMatch(/ADD COLUMN "expiry_warning_sent_at"/);
  });

  it('the email is transactional, so an unsubscribe cannot suppress it', () => {
    // It is notice that something already paid for is about to stop
    // existing. Marketing-typing it would let one click cost a buyer posts.
    const types = read('lib/email/email-types.ts');
    expect(types).toContain("'credit_expiry_warning'");
    const marketing = types.slice(types.indexOf('MARKETING_EMAIL_TYPES'));
    expect(marketing).not.toContain('credit_expiry_warning');
  });

  it('the email names the count and the date, which is the whole point', () => {
    const svc = read('lib/email-service.ts');
    const fn = svc.slice(svc.indexOf('export async function sendCreditExpiryWarningEmail'));
    expect(fn).toContain('creditsRemaining');
    expect(fn).toContain('dateLabel');
    // And says what a credit is worth, so the reader knows what they lose.
    expect(fn).toContain('config.durationDays');
  });

  it('supports a dry run that writes nothing', () => {
    expect(cron).toContain("dryRun");
    const dry = cron.slice(cron.indexOf('if (dryRun) {'), cron.indexOf('isEmailSuppressed'));
    expect(dry).not.toContain('updateMany');
  });
});

describe('the quote agrees with the charge about credits', () => {
  it('both resolve the balance the same way, from the same keys', () => {
    for (const src of [quote, checkout]) {
      expect(src).toContain('getCreditBalance(');
      expect(src).toMatch(/buildQuotaKeys\(\{[\s\S]{0,200}userId/);
    }
  });

  it('the quote says a credit covers the post, so the UI stops naming a price', () => {
    expect(quote).toContain('fundedByCredit');
    expect(quote).toMatch(/fundedByCredit: balance\.available > 0/);
  });

  it('a failed lookup claims no credit, the same way it claims no discount', () => {
    const neutral = quote.slice(quote.indexOf('function ineligible'), quote.indexOf('export async function GET'));
    expect(neutral).toContain('fundedByCredit: false');
    expect(neutral).toContain('creditsAvailable: 0');
  });
});

describe('every page in the funnel knows a credit covers the post', () => {
  // The preview page shipped credit-blind: its PostPriceStatus dropped
  // fundedByCredit, so it showed "Continue to Payment: $349" to an employer
  // who was then charged nothing. Checked as a set, because the bug was
  // fixing one page of a two-page funnel and not the other.
  for (const page of ['app/post-job/preview/page.tsx', 'app/post-job/checkout/page.tsx']) {
    it(`${page} reads fundedByCredit from the quote`, () => {
      const src = read(page);
      expect(src).toContain('fundedByCredit');
      expect(src).toContain('creditsAvailable');
    });

    it(`${page} lets the credit state outrank the price flags`, () => {
      const src = read(page);
      // isFirstPost must not win over a credit: create-checkout draws the
      // credit before it prices anything.
      expect(src).toMatch(/paysWithCredit/);
    });

    it(`${page} never puts a dollar amount on the button for a credit post`, () => {
      const src = read(page);
      const creditLabel = /paysWithCredit \?[\s\S]{0,400}[Cc]redit/;
      expect(src).toMatch(creditLabel);
    });
  }
});

describe('the checkout page survives a post that was never charged', () => {
  const page = read('app/post-job/checkout/page.tsx');

  it('follows redirectUrl on the credit path instead of erroring on a missing url', () => {
    // The credit branch returns { paidWithCredit, redirectUrl } and no `url`.
    // Reading only `url` showed "No checkout URL returned" over a post that
    // had gone live, and the obvious retry spent a second credit.
    const handler = page.slice(page.indexOf('const handlePayment'), page.indexOf('const getPrice'));
    expect(handler).toContain('paidWithCredit');
    expect(handler.indexOf('paidWithCredit && redirectUrl'))
      .toBeLessThan(handler.indexOf('No checkout URL returned'));
  });

  it('does not book checkout revenue for a post nothing was charged for', () => {
    expect(page).toMatch(/if \(!paysWithCredit\) \{\s*\n\s*trackBeginCheckout/);
  });

  it('never quotes a dollar amount when a credit covers the post', () => {
    expect(page).toContain("paysWithCredit ? '1 credit'");
  });
});
