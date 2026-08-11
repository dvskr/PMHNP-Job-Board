/**
 * Employer match digests — source locks. Reads real source (same style as
 * employer-distribution-plumbing.test.ts) so the operator-safety and privacy
 * rails cannot be silently removed:
 *
 *   1. The cron is double-gated: ENABLE_EMPLOYER_MATCH_DIGESTS (default off)
 *      AND ?dryRun=1, behind cron-secret/admin auth and cron tracking.
 *   2. Claim-first sending: the MatchDigestEmail row is written BEFORE the
 *      send, released only on a definitive rejection, and the single
 *      follow-up is claimed with a null guard so concurrent runs cannot
 *      double-send.
 *   3. Privacy: employers never receive candidate contact details, and only
 *      visible / open-to-offers / non-deleted job seekers are surfaced.
 *   4. The click tracker cannot open-redirect and always redirects.
 *   5. The admin test endpoint mails ONLY the authenticated admin's own
 *      address, marks the subject [TEST], and never consumes a posting's
 *      cooldown or candidate-exclusion history.
 *   6. Schema, migration, email-type wiring, and cron registration are present.
 *
 * NO email is sent by this file: it only reads source text.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const read = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

describe('cron route safety rails', () => {
  const src = read('app/api/cron/employer-match-digest/route.ts');

  it('authenticates via verifyCronOrAdmin before any work', () => {
    const authIdx = src.indexOf('verifyCronOrAdmin(req)');
    expect(authIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeLessThan(src.indexOf('runMatchDigestCron('));
  });

  it('supports ?dryRun=1 and passes it through to the service', () => {
    expect(src).toMatch(/searchParams\.get\('dryRun'\) === '1'/);
    expect(src).toMatch(/runMatchDigestCron\(\{ dryRun \}\)/);
  });

  it('reports through withCronTracking and alerts on failure', () => {
    expect(src).toMatch(/withCronTracking\('employer-match-digest'/);
    expect(src).toMatch(/sendCronFailureAlert\('employer-match-digest'/);
  });

  it('never calls the mailer directly: sending lives behind the service', () => {
    expect(src).not.toMatch(/sendAndLog\(/);
  });
});

describe('service send gating', () => {
  const src = read('lib/match-digest-service.ts');
  const policy = read('lib/email/match-digest-policy.ts');

  it('the env flag is ENABLE_EMPLOYER_MATCH_DIGESTS and defaults off', () => {
    expect(policy).toMatch(/MATCH_DIGEST_ENV_FLAG = 'ENABLE_EMPLOYER_MATCH_DIGESTS'/);
    // Strict equality to '1' means unset, '0', 'true' and anything else are
    // all off. There is no other way to enable sending.
    expect(src).toMatch(/process\.env\[MATCH_DIGEST_ENV_FLAG\] === '1'/);
    expect(src.match(/isMatchDigestSendingEnabled\(\)/g)?.length).toBeGreaterThan(0);
  });

  it('a disabled run exits before spending any matching compute', () => {
    // Scoped to the orchestrator's own body: buildDigestForPosting (which is
    // what calls semanticCandidateSearch) is DEFINED earlier in the file, so
    // a whole-file index comparison would be measuring declaration order
    // rather than execution order and would pass or fail for the wrong reason.
    const start = src.indexOf('export async function runMatchDigestCron');
    const end = src.indexOf('async function runFollowUps');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = src.slice(start, end);

    const guardIdx = body.indexOf('if (!enabled && !dryRun)');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(body.indexOf('prisma.employerJob.findMany'));
    expect(guardIdx).toBeLessThan(body.indexOf('buildDigestForPosting('));
  });

  it('dry runs never write and never send', () => {
    const dryRunBranch = src.indexOf('if (dryRun) {');
    expect(dryRunBranch).toBeGreaterThan(-1);
    // The claim write and the send both sit after the dryRun short-circuit.
    expect(src.indexOf('prisma.matchDigestEmail.create')).toBeGreaterThan(dryRunBranch);
    expect(src.indexOf('sendAndLog(')).toBeGreaterThan(dryRunBranch);
  });

  it('skips the LLM rerank: digests are embeddings-only by cost design', () => {
    expect(src).toMatch(/semanticCandidateSearch\(/);
    // Assert on the CALLS an LLM rerank would require, not on the word
    // "rerank", which legitimately appears in this module's design comment.
    expect(src).not.toMatch(/\bcomplete\(/);
    expect(src).not.toMatch(/loadPrompt\(/);
    expect(src).not.toMatch(/from '@\/lib\/ai\/prompts/);
  });

  it('respects suppression and attaches an unsubscribe URL to every send', () => {
    // isMarketingOptedOut, not isEmailSuppressed: a digest is marketing-class
    // mail, so an explicit unsubscribe (EmailLead.isSubscribed=false) has to
    // stop it, and the plain suppression check cannot see that flag.
    expect(src).toMatch(/isMarketingOptedOut\(/);
    expect(src).not.toMatch(/isEmailSuppressed\(/);
    expect(src).toMatch(/getOrCreateUnsubToken\(/);
    expect(src.match(/\/unsubscribe\?token=\$\{unsubToken\}/g)?.length).toBe(2);
  });

  it('backs the cooldown with a DB unique so overlapping runs cannot double-send', () => {
    // The cooldown check is a read followed by a write, so two overlapping
    // invocations can both clear it. The claim row carries sentDay and the
    // schema makes (employerJobId, sentDay) unique, which turns the loser of
    // that race into a P2002 the run skips on instead of a second email.
    expect(src).toMatch(/sentDay: digestSentDay\(now\)/);
    expect(src).toMatch(/code === 'P2002'/);
    const claimIdx = src.indexOf('matchDigestEmail.create');
    const guardIdx = src.indexOf("code === 'P2002'");
    expect(claimIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(claimIdx);

    const schema = read('prisma/schema.prisma');
    expect(schema).toMatch(/@@unique\(\[employerJobId, sentDay\]\)/);
    const migration = read('prisma/migrations/20260812_add_match_digest_emails/migration.sql');
    expect(migration).toMatch(/CREATE UNIQUE INDEX[^\n]*"employer_job_id", "sent_day"/);
    expect(migration).toMatch(/"sent_day" TEXT NOT NULL/);
  });

  it('enforces the shared connect-feature cap and the per-posting cooldown', () => {
    expect(src).toMatch(/isUnderSharedLifecycleCap\(/);
    expect(src).toMatch(/CONNECT_LIFECYCLE_EMAIL_TYPES/);
    expect(src).toMatch(/sentAt: \{ gte: cooldownCutoff \}/);
    expect(policy).toMatch(/DIGEST_COOLDOWN_DAYS = 7/);
    expect(policy).toMatch(/SHARED_LIFECYCLE_CAP_DAYS = 7/);
  });

  it('one recipient can receive at most one email per run, digest or follow-up', () => {
    // An employer commonly has several live postings, and the DB-backed cap
    // reads EmailSend rows that sendAndLog writes non-blockingly. The in-run
    // set is what actually guarantees this, so it must be consulted on BOTH
    // paths and written on both.
    expect(src).toMatch(/const sentThisRun = new Set<string>\(\)/);
    expect(src.match(/sentThisRun\.has\(/g)?.length).toBe(2);
    expect(src.match(/sentThisRun\.add\(/g)?.length).toBe(2);
    // The follow-up pass receives the same set the digest pass populated.
    expect(src).toMatch(/runFollowUps\(results, \{ dryRun, now, sentThisRun \}\)/);
  });
});

describe('claim-first concurrency discipline', () => {
  const src = read('lib/match-digest-service.ts');

  it('writes the MatchDigestEmail claim BEFORE handing the email to Resend', () => {
    const claim = src.indexOf('prisma.matchDigestEmail.create');
    const send = src.indexOf('sendAndLog(');
    expect(claim).toBeGreaterThan(-1);
    expect(claim).toBeLessThan(send);
  });

  it('releases the claim only on a definitive rejection, never on an ambiguous throw', () => {
    expect(src).toMatch(/prisma\.matchDigestEmail\.delete\(\{ where: \{ id: claim\.id \} \}\)/);
    // The catch arm keeps the claim: fail closed, never double-send.
    expect(src).toMatch(/claim kept/);
  });

  it('claims the single follow-up with a null guard and walks away on a lost race', () => {
    expect(src).toMatch(/where: \{ id: digest\.id, followUpSentAt: null \}/);
    expect(src).toMatch(/if \(claimed\.count === 0\) continue;/);
  });

  it('the click token is random, not a guessable id', () => {
    expect(src).toMatch(/randomBytes\(\d+\)\.toString\('base64url'\)/);
    expect(src).not.toMatch(/clickToken:\s*claim\.id/);
  });

  it('bounds the expensive stage so one run cannot exceed the route budget', () => {
    expect(src).toMatch(/builtThisRun >= MAX_DIGESTS_PER_RUN/);
    expect(src).toMatch(/take: MAX_FOLLOW_UPS_PER_RUN/);
  });
});

describe('candidate privacy in digests', () => {
  const src = read('lib/match-digest-service.ts');
  const template = read('lib/email/match-digest-template.ts');

  it('only surfaces visible, open-to-offers, non-deleted job seekers', () => {
    const gates = src.match(
      /profileVisible: true,\s*openToOffers: true,\s*role: 'job_seeker',\s*deletedAt: null,/g,
    );
    // Both the initial build and the follow-up re-hydration must gate.
    expect(gates?.length).toBe(2);
  });

  it('never selects a candidate contact channel or resume from the database', () => {
    for (const forbidden of ['phone: true', 'resumeUrl: true', 'bio: true']) {
      expect(src).not.toContain(forbidden);
    }
    // `email: true` IS selected in this module, but only ever for the OWNING
    // EMPLOYER ACCOUNT (the recipient of the digest). Assert per candidate
    // hydration block instead of file-wide, so the guarantee stays exactly
    // "no candidate contact channel" rather than accidentally passing or
    // accidentally failing on the recipient lookup.
    const hydrationBlocks = src.split(/profileVisible: true,/).slice(1);
    // The initial build and the follow-up re-hydration.
    expect(hydrationBlocks.length).toBe(2);
    for (const block of hydrationBlocks) {
      const selectBlock = block.slice(0, block.indexOf('});'));
      for (const forbidden of ['email', 'phone', 'resumeUrl', 'bio']) {
        expect(selectBlock).not.toContain(`${forbidden}: true`);
      }
    }
  });

  it('applies the first-name-plus-initial transform, never a raw last name', () => {
    expect(src).toMatch(/formatCandidateDisplayName\(p\.firstName, p\.lastName\)/);
    expect(src).not.toMatch(/displayName: `\$\{[^}]*lastName/);
  });

  it('excludes candidates already surfaced for the posting or already applied', () => {
    expect(src).toMatch(/prisma\.matchDigestEmail\.findMany\(\{[\s\S]*?select: \{ profileIds: true \}/);
    expect(src).toMatch(/prisma\.jobApplication\.findMany/);
    expect(src).toMatch(/!surfaced\.has\(h\.supabaseId\) && !applied\.has\(h\.supabaseId\)/);
  });

  it('the template escapes every employer- and candidate-supplied string', () => {
    for (const field of ['card.displayName', 'card.headline', 'jobTitle']) {
      expect(template).toMatch(new RegExp(`escapeDigestHtml\\(${field.replace('.', '\\.')}`));
    }
    // Regression: the preheader once used the raw title while the body used
    // the escaped one, which let an employer inject markup into the digest.
    expect(template).not.toMatch(/\$\{count\} PMHNP \$\{plural\} match \$\{jobTitle\}/);
  });
});

describe('click tracker cannot open-redirect', () => {
  const route = read('app/api/track/email-click/route.ts');
  const allowlist = read('lib/email/email-click-allowlist.ts');

  it('validates the destination through the allowlist before redirecting', () => {
    expect(route).toMatch(/resolveClickDestination\(searchParams\.get\('d'\)\)/);
    // The redirect target is built from the VALIDATED value plus our own base
    // URL, never from raw user input.
    expect(route).toMatch(/new URL\(destination, baseUrl\)/);
  });

  it('the allowlist only ever returns a relative path it approved or the default', () => {
    expect(allowlist).toMatch(/if \(!raw\.startsWith\('\/'\)\) return DEFAULT_CLICK_DESTINATION/);
    expect(allowlist).toMatch(/return allowed \? raw : DEFAULT_CLICK_DESTINATION/);
    expect(allowlist).toMatch(/DEFAULT_CLICK_DESTINATION = '\/employer\//);
    for (const prefix of ['/employer/candidates', '/employer/talent-search', '/employer/dashboard']) {
      expect(allowlist).toContain(`'${prefix}'`);
    }
  });

  it('stamps clickedAt only on the first hit for a token', () => {
    expect(route).toMatch(/where: \{ clickToken: token, clickedAt: null \}/);
  });

  it('always redirects: a rate limit or DB failure never strands the reader', () => {
    expect(route).toMatch(/if \(limited\) return redirect;/);
    expect(route).toMatch(/catch \(err\) \{[\s\S]*?logger\.error/);
    expect(route.trimEnd().endsWith('return redirect;\n}')).toBe(true);
  });
});

describe('admin test endpoint', () => {
  const src = read('app/api/admin/match-digest-test/route.ts');

  it('requires an admin session on both verbs', () => {
    expect(src.match(/requireApiAdmin\(request\)/g)?.length).toBe(2);
  });

  it('sends ONLY to the authenticated admin, never to an address from the body', () => {
    expect(src).toMatch(/const adminEmail = user\.email;/);
    expect(src).toMatch(/to: adminEmail/);
    // The request body schema has no recipient field at all.
    expect(src).not.toMatch(/to:\s*parsed\.data/);
    expect(src).not.toMatch(/to:\s*(body|raw)\./);
    expect(src).not.toMatch(/digest\.contactEmail,?\s*$/m);
  });

  it('marks the send [TEST] so it cannot be mistaken for production traffic', () => {
    expect(src).toMatch(/isTest: true/);
  });

  it('never writes a digest row: a test must not burn cooldown or exclusions', () => {
    expect(src).not.toMatch(/matchDigestEmail\.(create|update|updateMany|delete)/);
  });

  it('exposes outcome counts so tracking does not need an admin UI redesign', () => {
    expect(src).toMatch(/getMatchDigestStats\(/);
  });
});

describe('persistence and wiring', () => {
  it('the schema carries the cadence, tracking and follow-up columns', () => {
    const schema = read('prisma/schema.prisma');
    const model = schema.slice(
      schema.indexOf('model MatchDigestEmail'),
      schema.indexOf('model MatchDigestEmail') + 1600,
    );
    expect(model).toMatch(/employerJobId\s+String/);
    expect(model).toMatch(/profileIds\s+String\[\]/);
    expect(model).toMatch(/clickToken\s+String\s+@unique/);
    expect(model).toMatch(/clickedAt\s+DateTime\?/);
    expect(model).toMatch(/followUpSentAt\s+DateTime\?/);
    expect(model).toMatch(/onDelete: Cascade/);
  });

  it('the migration matches the model, including the unique click token', () => {
    const sql = read('prisma/migrations/20260812_add_match_digest_emails/migration.sql');
    expect(sql).toMatch(/CREATE TABLE "match_digest_emails"/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX "match_digest_emails_click_token_key"/);
    expect(sql).toMatch(/ON DELETE CASCADE/);
  });

  it('the email type is registered as a marketing type in email-service', () => {
    const svc = read('lib/email-service.ts');
    expect(svc).toMatch(/\| 'employer_match_digest'/);
    // Anchor on the DECLARATION: the identifier is also named in a comment
    // above it, and slicing from that comment misses the Set literal.
    const declIdx = svc.indexOf('const MARKETING_EMAIL_TYPES = new Set');
    expect(declIdx).toBeGreaterThan(-1);
    const marketingBlock = svc.slice(declIdx, svc.indexOf(']);', declIdx));
    expect(marketingBlock).toContain("'employer_match_digest'");
  });

  it('the cron is registered in vercel.json on its own slot', () => {
    const vercel = JSON.parse(read('vercel.json')) as { crons: Array<{ path: string; schedule: string }> };
    const mine = vercel.crons.filter((c) => c.path === '/api/cron/employer-match-digest');
    expect(mine).toHaveLength(1);
    // No other cron may share the slot: sends should not pile onto one minute.
    const sameSlot = vercel.crons.filter((c) => c.schedule === mine[0].schedule);
    expect(sameSlot).toHaveLength(1);
  });
});
