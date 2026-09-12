/**
 * The first-post discount must survive two checkouts racing.
 *
 * THE RACE. The gate COUNTS an identity's prior posts and the EmployerJob
 * insert ACTS on that count. Two requests fired at the same instant both read
 * "no prior posts", so both would mint a payable half-price Stripe session and
 * the employer could pay $149 twice. Expiring earlier sessions cannot close it:
 * when each request looks, the other has not created its session yet.
 *
 * THE FIX. EmployerJob.discountHoldKey is UNIQUE, so Postgres decides the
 * winner. The loser catches P2002 and resolves it by asking who holds the
 * claim, and the two answers are both correct rather than one being a
 * fallback:
 *
 *   holder still pending  an abandoned tab. Expire its session, release the
 *                         hold, take it. Backing out of Stripe must never cost
 *                         an employer the discount they were promised.
 *   holder already paid   the discount is genuinely spent. Price this post as
 *                         standard, which is what the count would have said
 *                         had it not raced.
 *
 * These are static source assertions plus the migration, because the behaviour
 * lives in a UNIQUE index that a mocked Prisma client cannot enforce: a unit
 * test with a fake client would pass whether or not the index exists, which is
 * the one thing worth pinning.
 *
 * All fixtures are fictional.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../../');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const route = read('app/api/create-checkout/route.ts');
const schema = read('prisma/schema.prisma');

describe('the discount hold is enforced by the database, not by a read', () => {
  it('EmployerJob.discountHoldKey exists and is UNIQUE', () => {
    // Without @unique this column is decoration: both racers would insert
    // their own hold and both would keep the discount.
    expect(schema).toMatch(/discountHoldKey\s+String\?\s+@unique\s+@map\("discount_hold_key"\)/);
  });

  it('a migration creates the column and its unique index', () => {
    const dir = path.join(ROOT, 'prisma/migrations');
    const sql = fs.readdirSync(dir)
      .filter((d) => fs.existsSync(path.join(dir, d, 'migration.sql')))
      .map((d) => fs.readFileSync(path.join(dir, d, 'migration.sql'), 'utf8'))
      .join('\n');
    expect(sql).toMatch(/ADD COLUMN "discount_hold_key"/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX[\s\S]{0,120}discount_hold_key/);
  });

  it('the hold is claimed on the insert, in the same write as the row', () => {
    // Claiming in a separate earlier statement would reopen the window it
    // exists to close.
    const start = route.indexOf('tx.employerJob.create');
    const end = route.indexOf('return { job: updatedJob', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(route.slice(start, end)).toContain('discountHoldKey');
  });

  it('the hold is keyed on the session account, never on anything form-typed', () => {
    expect(route).toMatch(/discountHoldKey = isFirstPost && userId \? `acct:\$\{userId\.toLowerCase\(\)\}` : null/);
  });

  it('only a first post claims a hold, so standard posts never collide', () => {
    // NULLs do not collide in a Postgres unique index. If a standard post
    // wrote a hold, the SECOND standard post from the same account would fail
    // to insert and the employer could not buy at all.
    expect(route).toMatch(/isFirstPost && userId \?/);
  });
});

describe('losing the race resolves to the right price', () => {
  const resolver = route.slice(
    route.indexOf('const yieldDiscountHold'),
    route.indexOf('let job:'),
  );

  it('the conflict handler is scoped to the hold index, not to any P2002', () => {
    // A P2002 on editToken or jobId is a different bug and must still throw.
    expect(route).toContain("=== 'P2002'");
    expect(route).toContain('discount_hold_key');
    expect(route).toMatch(/if \(!conflictedOnHold\) throw createErr/);
  });

  it('an unpaid holder is expired and its hold released, so the retry can take it', () => {
    expect(resolver).toContain('stripe.checkout.sessions.expire');
    expect(resolver).toMatch(/discountHoldKey: null/);
  });

  it('the release re-checks paymentStatus, so a webhook landing mid-flight wins', () => {
    // Between reading the holder and releasing it, its payment can complete.
    // Releasing unconditionally would hand a second discount to this request.
    expect(resolver).toMatch(/where: \{ id: holder\.id, paymentStatus: 'pending', discountHoldKey: holdKey \}/);
    expect(resolver).toMatch(/return released\.count > 0/);
  });

  it('a paid holder means the discount is spent and this post is standard', () => {
    expect(resolver).toMatch(/if \(holder\.paymentStatus !== 'pending'\)[\s\S]{0,220}return false/);
    expect(route).toMatch(/isFirstPost = false;[\s\S]{0,160}priceKind = 'standard'/);
  });

  it('the downgraded price is recomputed, so the Stripe line item follows', () => {
    // priceKind and price must both move. Changing only the label would charge
    // the discounted amount for a post sold as standard.
    expect(route).toMatch(/price = config\.priceInCentsFor\(priceKind\)/);
    expect(route).toMatch(/let priceKind: PostPriceKind/);
    expect(route).toMatch(/let price = config\.priceInCentsFor\(priceKind\)/);
  });

  it('retries exactly once, because both outcomes are terminal', () => {
    // Both branches settle the question, so a loop could only spin.
    expect(route).not.toMatch(/while \([\s\S]{0,40}conflictedOnHold/);
    const retries = route.match(/await createPosting\(\)/g) ?? [];
    expect(retries).toHaveLength(2);
  });
});

describe('the pre-existing guards are still in place', () => {
  it('the count still excludes abandoned checkouts', () => {
    expect(route).toContain("paymentStatus: { not: 'pending' }");
  });

  it('the gate still only chooses a price and never refuses the post', () => {
    // Same boundaries as tests/api/checkout-free-guard.test.ts: past
    // "Sanitize core fields" the route legitimately returns 4xx for invalid
    // input, which is a different concern from the discount decision.
    const gate = route.slice(
      route.indexOf('FIRST-POST DISCOUNT GATE'),
      route.indexOf('Sanitize core fields'),
    );
    expect(gate).not.toMatch(/return NextResponse/);
    expect(gate).not.toMatch(/status: \d{3}/);
  });
});
