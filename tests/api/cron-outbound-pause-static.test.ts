/**
 * OUTBOUND_MESSAGING_PAUSED is documented as the one brake that stops every
 * automated sender. It reached three of them: the lifecycle cron, employer
 * match digests and the system-message nudge. Job alert digests, candidate
 * alerts, saved-job reminders, the monthly employer report, admin broadcasts
 * and the weekly recommendation digest all kept mailing through a pause, which
 * is the worst possible time to discover that a brake is decorative.
 *
 * The same senders were also the ones ignoring a hand unsubscribe
 * (EmailLead.isSubscribed=false, what the visible Unsubscribe control writes).
 *
 * Source assertions: these paths need a live cron trigger, an Inngest run or a
 * database to exercise, and what has to hold is structural. Neighbouring
 * pattern: tests/regressions/*-static.test.ts.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

/** [file, the first line of real work the brake has to come before]. */
const PAUSED_BEFORE_WORK: ReadonlyArray<readonly [string, string]> = [
  ['app/api/cron/send-alerts/route.ts', 'sendJobAlerts('],
  ['app/api/cron/candidate-alerts/route.ts', 'prisma.employerCandidateAlert'],
  ['app/api/cron/saved-job-reminder/route.ts', 'prisma.savedJob'],
  ['app/api/cron/employer-report/route.ts', 'prisma.employerJob'],
  ['app/api/cron/lifecycle-emails/route.ts', 'def.findEligible'],
  ['app/api/admin/email/send/route.ts', 'prisma.userProfile'],
  ['lib/inngest/functions/recommendation-digest.ts', 'list-eligible-candidate-ids'],
];

describe('the emergency brake reaches every automated sender', () => {
  it.each(PAUSED_BEFORE_WORK)('%s checks isOutboundPaused before it does any work', (rel, workMarker) => {
    const src = read(rel);
    const pauseIdx = src.indexOf('isOutboundPaused()');
    const workIdx = src.indexOf(workMarker);

    expect(pauseIdx).toBeGreaterThan(-1);
    expect(workIdx).toBeGreaterThan(-1);
    expect(pauseIdx).toBeLessThan(workIdx);
  });

  it('the broadcast sender refuses to run while paused instead of mailing quietly', () => {
    const src = read('lib/broadcast-sender.ts');
    const pauseIdx = src.indexOf('isOutboundPaused()');
    expect(pauseIdx).toBeGreaterThan(-1);
    // Before the row is flipped to 'sending' and before any recipient is read.
    expect(pauseIdx).toBeLessThan(src.indexOf('emailBroadcast.findUnique'));
  });

  it('the choke point every sender passes through also honours it', () => {
    const src = read('lib/email-service.ts');
    const sendIdx = src.indexOf('await resend.emails.send(');
    expect(src.indexOf('isOutboundPaused()')).toBeLessThan(sendIdx);
  });
});

describe('a hand unsubscribe is honoured by the legacy marketing senders', () => {
  it('job alert digests exclude alerts whose lead unsubscribed', () => {
    // These digests go out through Resend's batch API, not sendAndLog, so the
    // predicate lives in the alert query itself.
    const src = read('lib/job-alerts-service.ts');
    expect(src).toMatch(/emailLead: \{ isSubscribed: true \}/);
  });

  it('saved-job reminders read isSubscribed, not just the suppression flag', () => {
    const src = read('app/api/cron/saved-job-reminder/route.ts');
    expect(src).toMatch(/isSubscribed: true/);
    expect(src).toMatch(/emailLead\?\.isSubscribed === false/);
  });

  it('the recommendation digest filters unsubscribed leads in both queries', () => {
    const src = read('lib/inngest/functions/recommendation-digest.ts');
    const matches = src.match(/el\.is_subscribed = true/g) ?? [];
    expect(matches).toHaveLength(2);
  });

  it('the monthly employer report gates on the marketing opt-out', () => {
    const src = read('app/api/cron/employer-report/route.ts');
    expect(src).toMatch(/isMarketingOptedOut\(email\)/);
  });

  it('admin broadcast audiences exclude opted-out addresses on both count and send', () => {
    for (const rel of ['app/api/admin/email/send/route.ts', 'app/api/admin/email/audience/route.ts']) {
      const src = read(rel);
      expect(src).toMatch(/loadOptedOutEmails/);
      expect(src).toMatch(/OR: \[\{ isSubscribed: false \}, \{ isSuppressed: true \}\]/);
    }
  });
});

describe('the admin test send goes to the admin who clicked it', () => {
  it('resolves the recipient from the session instead of a bundled address', () => {
    const page = read('app/admin/email/page.tsx');
    expect(page).toMatch(/audience: 'self'/);
    // A client component ships every literal in it to the browser, so no real
    // recipient address may appear here. The reserved example.com placeholders
    // in the merge-tag help text and the custom-list input are fine: nothing
    // receives for that domain, and sendAndLog refuses it outright.
    expect(page).not.toMatch(/customEmails: \[/);
    expect(page).not.toMatch(/[A-Za-z0-9._%+-]+@(?!example\.com)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);

    const route = read('app/api/admin/email/send/route.ts');
    expect(route).toMatch(/case 'self'/);
    expect(route).toMatch(/auth\.getUser\(\)/);
  });
});
