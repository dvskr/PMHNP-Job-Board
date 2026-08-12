/**
 * Cross-feature privacy + compliance locks for the three "connect" features
 * (employer match digests, lifecycle emails, system messages).
 *
 * These pin the invariants that a privacy review found broken, so a later edit
 * cannot quietly reopen them. Each block names the failure it prevents.
 *
 * NO email is sent by this file: it reads source text and pure policy modules.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CONNECT_LIFECYCLE_EMAIL_TYPES } from '@/lib/email/match-digest-policy';

const read = (rel: string): string =>
  fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

describe('match digests never mail an unverified address', () => {
  const src = read('lib/match-digest-service.ts');

  it('resolves the recipient from the owning account, never EmployerJob.contactEmail', () => {
    // contactEmail is free text on the post form: a poster can type any
    // address at all. Mailing it ships candidate profile data and recurring
    // unsolicited marketing to a third party who never touched the platform.
    // Comments may name the column to explain why; no CODE may read it.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(code).not.toMatch(/contactEmail/);
    expect(src).toMatch(/user:\s*\{\s*select:\s*\{\s*email:\s*true/);
    expect(src).toMatch(/recipientEmail/);
  });

  it('only selects postings that have a live, non-deleted owning account', () => {
    expect(src).toMatch(/userId:\s*\{\s*not:\s*null\s*\}/);
    expect(src).toMatch(/user:\s*\{\s*is:\s*\{\s*deletedAt:\s*null\s*\}\s*\}/);
  });

  it('the follow-up pass re-resolves the owner and skips when it is gone', () => {
    const followUpIdx = src.indexOf('async function runFollowUps');
    expect(followUpIdx).toBeGreaterThan(-1);
    const block = src.slice(followUpIdx);
    expect(block).toMatch(/const owner = digest\.employerJob\.user/);
    expect(block).toMatch(/if \(!owner\?\.email \|\| owner\.deletedAt\)/);
  });
});

describe('explicit unsubscribe is honored by every connect-feature send', () => {
  // isEmailSuppressed reads only the hard-suppression flags. The visible
  // Unsubscribe control on /email-preferences sets EmailLead.isSubscribed=false
  // and leaves isSuppressed alone, so a hand unsubscribe is invisible to it.
  // These features mail people who never opted into a list, so that unsubscribe
  // is the only consent signal they have.
  it('lib/email-service exports a marketing-grade opt-out that reads isSubscribed', () => {
    const svc = read('lib/email-service.ts');
    const declIdx = svc.indexOf('export async function isMarketingOptedOut');
    expect(declIdx).toBeGreaterThan(-1);
    const body = svc.slice(declIdx, svc.indexOf('\n}', declIdx));
    expect(body).toMatch(/isSubscribed === false/);
    expect(body).toMatch(/isSuppressed/);
    expect(body).toMatch(/emailSuppressed/);
  });

  it('the match digest gates on it, not on isEmailSuppressed', () => {
    const src = read('lib/match-digest-service.ts');
    expect(src).toMatch(/isMarketingOptedOut\(/);
    expect(src).not.toMatch(/isEmailSuppressed\(/);
  });

  it('the system message email piggyback gates on it', () => {
    const src = read('lib/system-messages.ts');
    expect(src).toMatch(/isMarketingOptedOut\(/);
    expect(src).not.toMatch(/isEmailSuppressed\(/);
  });

  it('the lifecycle cron gates on it in both the batch and last-minute check', () => {
    const src = read('app/api/cron/lifecycle-emails/route.ts');
    expect(src).toMatch(/isMarketingOptedOut\(target\.email\)/);
    expect(src).toMatch(/OR: \[\{ isSuppressed: true \}, \{ isSubscribed: false \}\]/);
    expect(src).not.toMatch(/isEmailSuppressed\(/);
  });
});

describe('the shared 7-day cap cannot be bypassed by the system nudge', () => {
  it('the nudge has its own email type and that type counts against the cap', () => {
    // Logging it as 'employer_message' would let it check the cap without ever
    // consuming it: an employer could get a nudge and a match digest inside the
    // same window. Human-to-human 'employer_message' must stay out of the list.
    expect(CONNECT_LIFECYCLE_EMAIL_TYPES).toContain('system_message_nudge');
    expect(CONNECT_LIFECYCLE_EMAIL_TYPES).toContain('employer_match_digest');
    expect(CONNECT_LIFECYCLE_EMAIL_TYPES).toContain('lifecycle');
    expect(CONNECT_LIFECYCLE_EMAIL_TYPES).not.toContain('employer_message');
  });

  it('the piggyback passes that type through to sendAndLog', () => {
    const src = read('lib/system-messages.ts');
    expect(src).toMatch(/emailType: 'system_message_nudge'/);
  });

  it("the nudge does not reuse the template's candidate-reached-out claim", () => {
    // The shared template's default lead says a candidate reached out. The
    // sender here is the platform, so that sentence would be untrue.
    const src = read('lib/system-messages.ts');
    expect(src).toMatch(/intro: 'here is an automated update on your live posting\.'/);
  });

  it('the nudge carries List-Unsubscribe via the standard helper', () => {
    const src = read('lib/system-messages.ts');
    expect(src).toMatch(/getOrCreateUnsubToken\(/);
    expect(src).toMatch(/unsubscribeUrl: `\$\{BASE_URL\}\/unsubscribe\?token=/);
  });
});

describe('the platform sender profile is not a user', () => {
  it('never lands in an admin broadcast audience', () => {
    for (const rel of ['app/api/admin/email/send/route.ts', 'app/api/admin/email/audience/route.ts']) {
      const src = read(rel);
      expect(src).toMatch(/role: \{ not: SYSTEM_PROFILE_ROLE \}/);
      // The 'all' branch is the default case, so an unfiltered findMany there
      // would mail the system mailbox on any broadcast.
      expect(src).not.toMatch(/userProfile\.findMany\(\{ select: \{ email: true, firstName: true \} \}\)/);
    }
  });

  it('replies to the system thread do not turn into mail at its address', () => {
    const src = read('app/api/conversations/[id]/route.ts');
    expect(src).toMatch(/emailSuppressed: true/);
    expect(src).toMatch(/recipientProfile\.email && !recipientProfile\.emailSuppressed/);
  });
});

describe('employer-facing counts describe candidates who are still visible', () => {
  it('the nudge re-checks the match ledger against the live visibility gates', () => {
    // MatchDigestEmail.profileIds records who was surfaced at SEND time. A
    // candidate can hide their profile, withdraw from offers or delete their
    // account afterwards, so counting the raw stored ids would tell an employer
    // "N strong candidate matches waiting" for people they cannot see, and
    // would surface the existence of a now-hidden candidate.
    const src = read('lib/system-messages.ts');
    const fnIdx = src.indexOf('async function countUnviewedMatchesByPost');
    expect(fnIdx).toBeGreaterThan(-1);
    const block = src.slice(fnIdx, src.indexOf('\n}', src.indexOf('surfacedByPost.entries()', fnIdx)));
    expect(block).toMatch(/profileVisible: true/);
    expect(block).toMatch(/openToOffers: true/);
    expect(block).toMatch(/role: 'job_seeker'/);
    expect(block).toMatch(/deletedAt: null/);
    expect(block).toMatch(/if \(stillVisible\.has\(profileId\)\) surfaced\.add\(profileId\)/);
  });
});

describe('the admin test send mirrors the real send', () => {
  const src = read('app/api/admin/system-message-test/route.ts');

  it('passes the production email options, not the template defaults', () => {
    // The shared template's default lead claims a candidate reached out, and
    // the default emailType is the human 'employer_message'. Testing with those
    // would show the operator copy no real recipient ever gets, with no
    // List-Unsubscribe header on marketing-class mail.
    expect(src).toMatch(/emailType: 'system_message_nudge'/);
    expect(src).toMatch(/intro: 'here is an automated update on your live posting\.'/);
    expect(src).toMatch(/unsubscribeUrl: `\$\{BASE_URL\}\/unsubscribe\?token=/);
  });

  it("marks the test send '[TEST]' so it cannot consume the tester's own cap", () => {
    // isUnderSharedLifecycleCap excludes subjects starting with '[TEST]'.
    // Without the prefix, an operator testing against their own address would
    // burn their own 7 day allowance and mask the traffic they are observing.
    expect(src).toMatch(/subjectPrefix: '\[TEST\] '/);
    const svc = read('lib/email-service.ts');
    expect(svc).toMatch(/subject: `\$\{options\.subjectPrefix \?\? ''\}/);
  });
});

describe('dryRun writes nothing at all', () => {
  it('the admin test endpoint does not bootstrap the sender profile on a dry run', () => {
    const src = read('app/api/admin/system-message-test/route.ts');
    expect(src).toMatch(/getOrCreateSystemProfile\(\{ create: !dryRun \}\)/);
  });

  it('the system-message run does not bootstrap the sender profile on a dry run', () => {
    const src = read('lib/system-messages.ts');
    expect(src).toMatch(/getOrCreateSystemProfile\(\{ create: !options\.dryRun \}\)/);
    expect(src).toMatch(/SYSTEM_PROFILE_UNCREATED_ID/);
    const declIdx = src.indexOf('export async function getOrCreateSystemProfile');
    const createIdx = src.indexOf('userProfile.create', declIdx);
    const guardIdx = src.indexOf('if (!existing && !create)', declIdx);
    expect(guardIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(createIdx);
  });
});
