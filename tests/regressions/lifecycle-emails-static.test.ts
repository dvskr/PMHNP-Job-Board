/**
 * Lifecycle emails — source locks. Reads real source (employer-distribution-
 * plumbing.test.ts style) so the operator-safety rails cannot be silently
 * removed:
 *
 *   1. The cron is double-gated: ENABLE_LIFECYCLE_EMAILS env flag (default
 *      off) AND dryRun support, with cron-secret/admin auth and tracking.
 *   2. Claim-first sending: the LifecycleEmailSend unique row is created
 *      BEFORE the send and reverted on failure (no duplicate sends, ever).
 *   3. The admin test endpoint mails ONLY the authenticated admin's own
 *      address and never burns a per-user emailId slot.
 *   4. Schema + migration carry the (userId, emailId) uniqueness the
 *      "never repeat" rule depends on.
 *   5. The 'lifecycle' email type is wired into sendAndLog's union, the
 *      marketing sender set, and the shared connect-feature cap list.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const read = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

describe('cron route safety rails', () => {
  const src = read('app/api/cron/lifecycle-emails/route.ts');

  it('authenticates via verifyCronOrAdmin before any work', () => {
    expect(src).toMatch(/verifyCronOrAdmin\(req\)/);
    const authIdx = src.indexOf('verifyCronOrAdmin(req)');
    // Anchor on the CODE reference, not the bare flag name: the route's doc
    // comment names ENABLE_LIFECYCLE_EMAILS above the handler, so matching
    // the bare string would compare against prose, not execution order.
    expect(authIdx).toBeLessThan(src.indexOf('process.env.ENABLE_LIFECYCLE_EMAILS'));
    // Nothing touches the DB or the mailer before the auth gate returns.
    expect(authIdx).toBeLessThan(src.indexOf('prisma.'));
    expect(authIdx).toBeLessThan(src.indexOf('sendAndLog('));
  });

  it('real sends are gated on ENABLE_LIFECYCLE_EMAILS=1 (default off)', () => {
    expect(src).toMatch(/process\.env\.ENABLE_LIFECYCLE_EMAILS === '1'/);
    expect(src).toMatch(/if \(!sendingEnabled && !dryRun\)/);
  });

  it('supports ?dryRun=1 and dry runs never send or claim', () => {
    expect(src).toMatch(/searchParams\.get\('dryRun'\) === '1'/);
    const dryRunReturn = src.indexOf('dryRun: true,');
    expect(dryRunReturn).toBeGreaterThan(-1);
    // The send loop (claim + sendAndLog) must come after the dryRun return.
    expect(src.indexOf('prisma.lifecycleEmailSend.create')).toBeGreaterThan(dryRunReturn);
    expect(src.indexOf('sendAndLog(')).toBeGreaterThan(dryRunReturn);
  });

  it('claims the unique row BEFORE handing the send to Resend', () => {
    const claimIdx = src.indexOf('prisma.lifecycleEmailSend.create');
    const sendIdx = src.indexOf('await sendAndLog(');
    expect(claimIdx).toBeGreaterThan(-1);
    expect(sendIdx).toBeGreaterThan(claimIdx);
  });

  it('reverts the claim when the send definitively fails', () => {
    expect(src).toMatch(/prisma\.lifecycleEmailSend\s*\n?\s*\.delete\(\{ where: \{ id: claimId \} \}\)/);
  });

  it('counts only P2002 as a dedupe conflict, never a real DB fault', () => {
    // A blanket catch would file a connection loss or FK violation as a
    // benign "claimConflict", which is exactly the signal the operator uses
    // to judge whether enabling sends is safe.
    expect(src).toMatch(/code === 'P2002'/);
    const p2002Idx = src.indexOf("code === 'P2002'");
    const branch = src.slice(p2002Idx, p2002Idx + 400);
    expect(branch).toMatch(/claimConflicts\+\+/);
    expect(branch).toMatch(/errors\+\+/);
  });

  it('re-checks opt-out immediately before sending', () => {
    // isMarketingOptedOut, not isEmailSuppressed: these are marketing-class
    // sends, so an explicit unsubscribe (EmailLead.isSubscribed=false) has to
    // stop them and plain suppression cannot see that flag.
    const supIdx = src.indexOf('await isMarketingOptedOut(target.email)');
    expect(supIdx).toBeGreaterThan(-1);
    expect(supIdx).toBeLessThan(src.indexOf('prisma.lifecycleEmailSend.create'));
  });

  it('reverts the claim on a definitive rejection but keeps it mid-flight', () => {
    // sendAndLog returns Resend's { data, error } envelope and only throws on
    // a transport fault. Treating the rejection path as success would leave
    // the unique (userId, emailId) claim in place, so that user could never
    // receive that lifecycle email again.
    const rejectIdx = src.indexOf('sendResult?.error');
    expect(rejectIdx).toBeGreaterThan(-1);
    const rejectBranch = src.slice(rejectIdx, rejectIdx + 600);
    expect(rejectBranch).toMatch(/lifecycleEmailSend\s*\n?\s*\.delete/);
    // The ambiguous catch must NOT delete: a throw can mean the request
    // already reached Resend, and a duplicate is worse than a miss.
    const catchIdx = src.indexOf('} catch (err) {', rejectIdx);
    expect(catchIdx).toBeGreaterThan(-1);
    expect(src.slice(catchIdx)).not.toMatch(/lifecycleEmailSend\s*\n?\s*\.delete/);
  });

  it('checks the shared cap against EmailSend and excludes [TEST] sends', () => {
    expect(src).toMatch(/SHARED_MARKETING_CAP_EMAIL_TYPES/);
    expect(src).toMatch(/startsWith: '\[TEST\]'/);
  });

  it('threads a real unsubscribe token into every send', () => {
    expect(src).toMatch(/getOrCreateUnsubToken\(target\.email\)/);
    expect(src).toMatch(/\/unsubscribe\?token=\$\{unsubToken\}/);
  });

  it('wires cron tracking, failure alerting, and a duration cap', () => {
    expect(src).toMatch(/withCronTracking\('lifecycle-emails'/);
    expect(src).toMatch(/sendCronFailureAlert\('lifecycle-emails'/);
    expect(src).toMatch(/export const maxDuration/);
  });

  it('contains no console.log', () => {
    expect(src).not.toMatch(/console\.log/);
  });
});

describe('vercel.json registration', () => {
  const raw = read('vercel.json');

  it('registers the lifecycle cron exactly once', () => {
    const config = JSON.parse(raw) as { crons: Array<{ path: string; schedule: string }> };
    const mine = config.crons.filter((c) => c.path === '/api/cron/lifecycle-emails');
    expect(mine).toHaveLength(1);
    // Daily cadence: five cron fields, no */N hourly spec.
    expect(mine[0].schedule).toMatch(/^\d+ \d+ \* \* \*$/);
  });
});

describe('admin test endpoint', () => {
  const src = read('app/api/admin/lifecycle-test/route.ts');

  it('gates both GET and POST behind requireApiAdmin', () => {
    const matches = src.match(/await requireApiAdmin\(request\)/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('sends ONLY to the session admin email, never a body-supplied address', () => {
    expect(src).toMatch(/to: user\.email/);
    expect(src).not.toMatch(/body[.?]*\.to\b/);
    expect(src).not.toMatch(/const \{[^}]*\bto\b[^}]*\} = body/);
  });

  it('prefixes test sends with [TEST] so they stay outside the shared cap', () => {
    expect(src).toMatch(/\[TEST\] \$\{def\.subject\(/);
  });

  it('never writes LifecycleEmailSend rows (tests must not burn slots)', () => {
    expect(src).not.toMatch(/lifecycleEmailSend\.create/);
  });
});

describe('schema + migration', () => {
  const schema = read('prisma/schema.prisma');

  it('LifecycleEmailSend enforces one emailId per user with cascade cleanup', () => {
    const start = schema.indexOf('model LifecycleEmailSend {');
    expect(start).toBeGreaterThan(-1);
    const block = schema.slice(start, schema.indexOf('}', start));
    expect(block).toMatch(/@@unique\(\[userId, emailId\]\)/);
    expect(block).toMatch(/@@map\("lifecycle_email_sends"\)/);
    expect(block).toMatch(/onDelete: Cascade/);
  });

  it('UserProfile carries the back-relation', () => {
    expect(schema).toMatch(/lifecycleEmailSends LifecycleEmailSend\[\]/);
  });

  it('the migration creates the table and the unique index', () => {
    const sql = read('prisma/migrations/20260812_add_lifecycle_email_sends/migration.sql');
    expect(sql).toMatch(/CREATE TABLE "lifecycle_email_sends"/);
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "lifecycle_email_sends_user_id_email_id_key" ON "lifecycle_email_sends"\("user_id", "email_id"\)/,
    );
    expect(sql).toMatch(/REFERENCES "user_profiles"\("id"\) ON DELETE CASCADE/);
  });
});

describe('eligibility guards', () => {
  const src = read('lib/lifecycle-emails.ts');

  it('the renewal pitch skips listings the employer deliberately archived', () => {
    // cleanup-expired force-unpublishes on expiry, so isPublished cannot be
    // the guard here; archivedAt is the only "taken down on purpose" signal.
    expect(src).toMatch(/expiresAt: \{ gte: earliest, lte: latest \}, archivedAt: null/);
  });

  it('every eligibility query filters out deleted and suppressed profiles', () => {
    expect(src).toMatch(/MAILABLE_PROFILE = \{ deletedAt: null, emailSuppressed: false \}/);
    // Each of the six findEligible bodies must reach the shared guard.
    const uses = src.match(/MAILABLE_PROFILE/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(5);
  });

  it('every trigger window carries an upper bound (no first-enable blast)', () => {
    const start = src.indexOf('LIFECYCLE_WINDOWS: Record');
    const block = src.slice(start, src.indexOf('};', start));
    const windows = block.match(/minDays: \d+, maxDays: \d+/g) ?? [];
    expect(windows).toHaveLength(6);
  });
});

describe('email-type wiring', () => {
  it("email-service knows 'lifecycle' and routes it via the marketing sender", () => {
    const src = read('lib/email-service.ts');
    expect(src).toMatch(/\| 'lifecycle'/);
    const setStart = src.indexOf('MARKETING_EMAIL_TYPES = new Set');
    const setBlock = src.slice(setStart, src.indexOf(']);', setStart));
    expect(setBlock).toContain("'lifecycle'");
  });

  it("the shared connect-feature cap list includes 'lifecycle'", () => {
    const src = read('lib/email/match-digest-policy.ts');
    const listStart = src.indexOf('CONNECT_LIFECYCLE_EMAIL_TYPES');
    const listBlock = src.slice(listStart, src.indexOf('];', listStart));
    expect(listBlock).toContain("'lifecycle'");
  });

  it('the registry module carries no console.log and no direct Resend import', () => {
    const src = read('lib/lifecycle-emails.ts');
    expect(src).not.toMatch(/console\.log/);
    expect(src).not.toMatch(/from 'resend'/);
    expect(src).not.toMatch(/@\/lib\/email-service/);
  });
});
