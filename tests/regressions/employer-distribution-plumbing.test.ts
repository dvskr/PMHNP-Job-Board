/**
 * Distribution audit A1/A4/A5/A7 — regression locks on the employer
 * distribution plumbing. Reads real source (renewal-cta.test.ts style) so the
 * paid side's events, tripwire, and operator gates cannot be silently
 * stubbed out again.
 *
 * A1: both Stripe webhook publish branches must fire embedding.refresh.job
 *     (paid posts previously NEVER got embeddings — invisible to AI search
 *     and recommendations).
 * A4: all three employer publish paths emit job/employer.published and the
 *     Inngest handler honors the cadence rule (instant send replaces the
 *     daily digest, stamped via lastSentAt).
 * A5: the recommendation dead-man cron exists and alerts through the shared
 *     Discord helper.
 * A7: the weekly newsletter is double-gated (env flag + unregistered cron).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const read = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

describe('Stripe webhook fires distribution events (A1 + A4)', () => {
  const src = read('app/api/webhooks/stripe/route.ts');
  const renewalStart = src.indexOf("if (type === 'renewal')");
  const newPostStart = src.indexOf('// Original flow: new job posting');
  const afterBranches = src.indexOf("event.type === 'invoice.paid'");

  it('the two publish branches are where this test thinks they are', () => {
    expect(renewalStart).toBeGreaterThan(-1);
    expect(newPostStart).toBeGreaterThan(renewalStart);
    expect(afterBranches).toBeGreaterThan(newPostStart);
  });

  const renewalBranch = src.slice(renewalStart, newPostStart);
  const newPostBranch = src.slice(newPostStart, afterBranches);

  it('renewal branch fires embedding.refresh.job (fire-and-forget)', () => {
    expect(renewalBranch).toMatch(/name: 'embedding\.refresh\.job'/);
    expect(renewalBranch).toMatch(/embedding\.refresh\.job'[\s\S]{0,200}?\}\)\.catch\(/);
  });

  it('renewal branch fires job/employer.published', () => {
    expect(renewalBranch).toMatch(/name: 'job\/employer\.published'/);
  });

  it('renewal branch stamps Job.lastRenewedAt (A3 alert re-entry anchor)', () => {
    expect(renewalBranch).toMatch(/lastRenewedAt:\s*new Date\(\)/);
  });

  it('new-post branch fires embedding.refresh.job (fire-and-forget)', () => {
    expect(newPostBranch).toMatch(/name: 'embedding\.refresh\.job'/);
    expect(newPostBranch).toMatch(/embedding\.refresh\.job'[\s\S]{0,200}?\}\)\.catch\(/);
  });

  it('new-post branch fires job/employer.published', () => {
    expect(newPostBranch).toMatch(/name: 'job\/employer\.published'/);
  });
});

describe('post-free emits the instant fan-out event (A4)', () => {
  const src = read('app/api/jobs/post-free/route.ts');

  it('fires job/employer.published alongside the embedding refresh', () => {
    expect(src).toMatch(/name: 'job\/employer\.published'/);
    expect(src).toMatch(/name: 'embedding\.refresh\.job'/);
  });
});

describe('Inngest serve route registers the fan-out handler (A4)', () => {
  const src = read('app/api/inngest/route.ts');

  it('imports and spreads employerPublishedFunctions', () => {
    expect(src).toMatch(/from '@\/lib\/inngest\/functions\/employer-published'/);
    expect(src).toMatch(/\.\.\.employerPublishedFunctions/);
  });
});

describe('instant fan-out handler contract (A4)', () => {
  const src = read('lib/inngest/functions/employer-published.ts');
  const serviceSrc = read('lib/job-alerts-service.ts');

  it('listens on job/employer.published', () => {
    expect(src).toMatch(/event: 'job\/employer\.published'/);
  });

  it('targets only DUE daily-frequency alerts via the shared eligibility builder', () => {
    expect(src).toMatch(/buildAlertEligibilityWhere\(now\)/);
    expect(src).toMatch(/frequency: 'daily'/);
  });

  it('matches through the shared pure matcher, not a private reimplementation', () => {
    expect(src).toMatch(/jobMatchesAlert\(job, alert\)/);
  });

  it('delivers the FULL due digest via sendJobAlerts scoped by EMAIL, never a hand-built single-job email', () => {
    // The digest freshness cutoff IS lastSentAt: a single-job email that
    // stamps lastSentAt advances the cutoff past every other match
    // accumulated since the previous send and permanently drops them.
    // Scoping by email also folds the recipient's other due daily alerts
    // into the same send so the daily cron cannot email them again today.
    expect(src).toMatch(/sendJobAlerts\(\{\s*\n?\s*restrictToEmails/);
    // No private send pipeline in the handler — sending, suppression,
    // logging, unsubscribe headers, and the cadence stamp are inherited.
    expect(src).not.toMatch(/resend\.batch\.send/);
    expect(src).not.toMatch(/totalCount: 1/);
  });

  it('CADENCE RULE: the service claims lastSentAt BEFORE handing the batch to Resend', () => {
    // A crash (or Inngest retry) between send and stamp must never
    // double-send: the claim comes first, so the failure mode is a missed
    // email that degrades to the next digest, not a duplicate.
    const phase2 = serviceSrc.slice(serviceSrc.indexOf('Phase 2: Send in batches'));
    expect(phase2.length).toBeGreaterThan(0);
    const claimIdx = phase2.indexOf('data: { lastSentAt: now }');
    const sendIdx = phase2.indexOf('resend.batch.send');
    expect(claimIdx).toBeGreaterThan(-1);
    expect(sendIdx).toBeGreaterThan(-1);
    expect(claimIdx).toBeLessThan(sendIdx);
  });

  it('definitive rejections revert the claim; ambiguous failures keep it (fail closed)', () => {
    expect(serviceSrc).toMatch(/ambiguousSendFailure = true/);
    expect(serviceSrc).toMatch(/revertLastSentAtClaim\(alertIds/);
  });

  it('handler retries stay duplicate-safe and a duplicate event is throttled per job', () => {
    expect(src).toMatch(/throttle: \{ limit: 1, period: '1h', key: 'event\.data\.jobId' \}/);
  });

  it('respects suppression through the shared digest pipeline', () => {
    expect(src).toMatch(/sendJobAlerts\(/);
    expect(serviceSrc).toMatch(/isEmailSuppressed\(alert\.email\)/);
  });
});

describe('recommendation dead-man tripwire (A5)', () => {
  const src = read('app/api/cron/recommendation-deadman/route.ts');

  it('trips when the newest rec batch is older than 48h while embeddings exist', () => {
    expect(src).toMatch(/STALE_AFTER_HOURS = 48/);
    expect(src).toMatch(/candidateRecommendation\.findFirst/);
    expect(src).toMatch(/candidateEmbedding\.count\(\)/);
    expect(src).toMatch(/embeddedCandidates > 0/);
  });

  it('alerts through the shared Discord cron-failure helper', () => {
    expect(src).toMatch(/sendCronFailureAlert\('recommendation-deadman'/);
  });

  it('is cron-secret protected and run-tracked', () => {
    expect(src).toMatch(/verifyCronOrAdmin/);
    expect(src).toMatch(/withCronTracking\('recommendation-deadman'/);
  });
});

describe('weekly newsletter is operator gated (A7)', () => {
  const src = read('app/api/cron/weekly-newsletter/route.ts');

  it('refuses to run without the explicit env flag', () => {
    expect(src).toMatch(/ENABLE_WEEKLY_NEWSLETTER['"]?\]?\s*!==\s*'true'/);
  });

  it('the flag check happens before any job or audience query', () => {
    const flagIdx = src.indexOf('ENABLE_WEEKLY_NEWSLETTER');
    const queryIdx = src.indexOf('prisma.job.findMany');
    expect(flagIdx).toBeGreaterThan(-1);
    expect(queryIdx).toBeGreaterThan(flagIdx);
  });

  it('orders employer posts first via the canonical job sort + shared card renderer', () => {
    expect(src).toMatch(/buildJobsOrderBy\('best'\)/);
    expect(src).toMatch(/renderJobCardHtml\(/);
  });

  it('audience is newsletter opt-in AND unsuppressed', () => {
    expect(src).toMatch(/newsletterOptIn: true/);
    expect(src).toMatch(/isSuppressed: false/);
    expect(src).toMatch(/emailSuppressed: true/);
  });

  it('a duplicate trigger within the guard window cannot re-send the bulk email', () => {
    expect(src).toMatch(/RESEND_GUARD_DAYS/);
    expect(src).toMatch(/emailType: 'broadcast',\s*\n\s*subject: NEWSLETTER_SUBJECT,\s*\n\s*status: 'sent'/);
    // The guard checks BEFORE any batch is handed to Resend.
    const guardIdx = src.indexOf('RESEND_GUARD_DAYS * 24');
    const sendIdx = src.indexOf('resend.batch.send');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(sendIdx).toBeGreaterThan(guardIdx);
  });
});
