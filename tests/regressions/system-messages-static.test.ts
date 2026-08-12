/**
 * In-platform system messages — source locks.
 *
 * Reads the real source (employer-distribution-plumbing.test.ts style) so the
 * operator-safety rails cannot be silently removed:
 *
 *   1. The cron is double-gated: ENABLE_SYSTEM_MESSAGES (default off) AND
 *      dryRun support, behind cron-secret/admin auth and run tracking.
 *   2. The env flag is re-enforced inside the send primitive, so the route is
 *      never the only thing between "off" and a bulk send.
 *   3. dryRun returns before any write, and the 7-day per-recipient cap is
 *      read from the system profile's own sent messages.
 *   4. The sender is a dedicated, suppressed, non-login platform identity that
 *      cannot surface in employer talent search or impersonate a person.
 *   5. The admin test endpoint messages ONLY the authenticated admin's own
 *      account, resolved from the session and never from the request.
 *   6. The employer email piggyback is gated a second time, respects the
 *      recipient's own prefs and suppression, and honours the shared
 *      connect-feature frequency cap.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const read = (rel: string): string =>
    fs.readFileSync(path.resolve(__dirname, '../../', rel), 'utf8');

const LIB = 'lib/system-messages.ts';
const CRON = 'app/api/cron/system-messages/route.ts';
const ADMIN = 'app/api/admin/system-message-test/route.ts';

describe('cron route safety rails', () => {
    const src = read(CRON);

    it('authenticates before doing any work', () => {
        expect(src).toMatch(/verifyCronOrAdmin\(req\)/);
        expect(src.indexOf('verifyCronOrAdmin(req)')).toBeLessThan(
            src.indexOf('isSystemMessagesEnabled()'),
        );
    });

    it('refuses real runs unless ENABLE_SYSTEM_MESSAGES is on', () => {
        expect(src).toMatch(/if \(!isSystemMessagesEnabled\(\) && !dryRun\)/);
        expect(src).toMatch(/skipped: true/);
    });

    it('supports ?dryRun=1', () => {
        expect(src).toMatch(/searchParams\.get\('dryRun'\) === '1'/);
        expect(src).toMatch(/runSystemMessages\(\{ dryRun, side \}\)/);
    });

    it('reports through the shared cron tracking and failure alerting', () => {
        expect(src).toMatch(/withCronTracking\('system-messages'/);
        expect(src).toMatch(/sendCronFailureAlert\('system-messages', error\)/);
        expect(src).toMatch(/export const maxDuration = \d+/);
    });

    it('is registered exactly once in vercel.json', () => {
        const crons = JSON.parse(read('vercel.json')).crons as { path: string }[];
        const mine = crons.filter((c) => c.path === '/api/cron/system-messages');
        expect(mine).toHaveLength(1);
    });
});

describe('send primitive gates', () => {
    const src = read(LIB);

    it('re-enforces the env flag for cron sends (defense in depth)', () => {
        expect(src).toMatch(
            /if \(!params\.dryRun && params\.context === 'cron' && !isSystemMessagesEnabled\(\)\)/,
        );
        expect(src).toMatch(/return \{ status: 'disabled', subject \};/);
    });

    it('returns on dryRun before touching the database', () => {
        const dryRunReturn = src.indexOf("if (params.dryRun) return { status: 'dry_run', subject };");
        expect(dryRunReturn).toBeGreaterThan(-1);
        expect(src.indexOf('prisma.employerMessage.create')).toBeGreaterThan(dryRunReturn);
        expect(src.indexOf('findOrCreateSystemConversation(')).toBeLessThan(dryRunReturn);
        // ...only the helper DEFINITION precedes it; the call must come after.
        expect(src.lastIndexOf('await findOrCreateSystemConversation(')).toBeGreaterThan(dryRunReturn);
    });

    it('caps at one message per recipient per 7 days from its own sent rows', () => {
        expect(src).toMatch(/export const SYSTEM_MESSAGE_CAP_DAYS = 7;/);
        expect(src).toMatch(/senderId: params\.systemProfileId,\s*\n\s*recipientId: params\.recipientProfileId,\s*\n\s*sentAt: \{ gt: capCutoff \}/);
        expect(src).toMatch(/return \{ status: 'capped', subject \};/);
    });

    it('rides the existing Conversation + EmployerMessage models', () => {
        expect(src).toMatch(/prisma\.conversation\.create/);
        expect(src).toMatch(/prisma\.employerMessage\.create/);
        // No bespoke system-message table: the /messages UI needs zero changes.
        expect(src).not.toMatch(/prisma\.systemMessage/);
    });
});

describe('platform sender identity', () => {
    const src = read(LIB);

    it('is a suppressed, invisible, non-login system profile', () => {
        // The role is exported as a constant so listing/broadcast surfaces can
        // filter on it (see MAILABLE_USER_PROFILES in the admin email routes)
        // instead of each one re-typing the literal.
        expect(src).toMatch(/SYSTEM_PROFILE_ROLE = 'system'/);
        expect(src).toMatch(/role: SYSTEM_PROFILE_ROLE/);
        expect(src).toMatch(/emailSuppressed: true/);
        expect(src).toMatch(/profileVisible: false/);
        expect(src).toMatch(/openToOffers: false/);
        expect(src).toMatch(/SYSTEM_PROFILE_SUPABASE_ID = 'system-pmhnp-hiring'/);
    });

    it('is visibly the platform, never a person', () => {
        expect(src).toMatch(/SYSTEM_PROFILE_NAME = 'PMHNP Hiring Team'/);
        expect(src).toMatch(/SYSTEM_SUBJECT_PREFIX = 'PMHNP Hiring: '/);
    });

    it('tells recipients the thread is automated and unmonitored', () => {
        expect(src).toMatch(/Replies to this thread are not monitored/);
    });
});

describe('employer privacy', () => {
    const src = read(LIB);

    it('sends employers counts only, never candidate identity', () => {
        // The employer builder's whole input surface is a title plus two counts.
        expect(src).toMatch(
            /export function buildEmployerSignalMessage\(\s*jobTitle: string,\s*newApplicationCount: number,\s*strongMatchCount = 0,\s*\)/,
        );
        // Employer-side queries never select candidate contact fields.
        expect(src).not.toMatch(/candidateEmail|resumeUrl|phone: true/);
    });

    it('reuses the match digest ledger rather than recomputing matches', () => {
        expect(src).toMatch(/prisma\.matchDigestEmail\.findMany/);
        expect(src).not.toMatch(/semanticCandidateSearch/);
    });
});

describe('employer email piggyback', () => {
    const src = read(LIB);

    it('stays opt-in even though in-platform messages send by default', () => {
        expect(src).toMatch(/process\.env\.SYSTEM_MESSAGE_EMAILS/);
        expect(src).toMatch(
            /return isSystemMessagesEnabled\(\) && \(value === '1' \|\| value === 'true'\)/,
        );
        expect(src).toMatch(/if \(!isSystemMessageEmailEnabled\(\)\) return;/);
    });

    it('respects the recipient prefs, opt-out and the shared cap', () => {
        expect(src).toMatch(/if \(!post\.notifyOnApplication \|\| post\.notifyDigest === 'off'\) return;/);
        // isMarketingOptedOut, not isEmailSuppressed: this nudge is
        // marketing-class mail nobody asked for, so an explicit unsubscribe
        // (EmailLead.isSubscribed=false) must stop it.
        expect(src).toMatch(/if \(await isMarketingOptedOut\(recipient\.email\)\) return;/);
        expect(src).toMatch(/if \(!\(await isUnderSharedLifecycleCap\(recipient\.email, now\)\)\) return;/);
    });

    it('reuses the existing notification plumbing instead of a new sender', () => {
        expect(src).toMatch(/sendEmployerMessageNotification\(/);
        expect(src).not.toMatch(/resend\.emails\.send/);
    });

    it('logs under its own email type so the shared cap it checks also counts it', () => {
        // 'employer_message' is the human-to-human type and must never be
        // capped; if the nudge logged as that, it would check the shared cap
        // without ever consuming it and two connect-feature emails could land
        // on the same employer in one day.
        expect(src).toMatch(/emailType: 'system_message_nudge'/);
        expect(src).not.toMatch(/emailType: 'employer_message'/);
    });

    it('overrides the human-message lead sentence, which would be a false claim', () => {
        // The default copy says a candidate reached out. The sender here is
        // the platform, so the nudge must pass its own intro.
        expect(src).toMatch(/intro:/);
        expect(src).not.toMatch(/a candidate has reached out/);
    });
});

describe('admin test endpoint', () => {
    const src = read(ADMIN);

    it('is admin-only', () => {
        expect(src).toMatch(/requireApiAdmin\(request\)/);
        const firstPost = src.indexOf('export async function POST');
        expect(src.indexOf('requireApiAdmin(request)', firstPost)).toBeLessThan(
            src.indexOf('sendSystemMessage(', firstPost),
        );
    });

    it('resolves the recipient from the session, never from the request', () => {
        expect(src).toMatch(/supabase\.auth\.getUser\(\)/);
        expect(src).toMatch(/where: \{ supabaseId: user\.id \}/);
        expect(src).toMatch(/recipientProfileId: adminProfile\.id/);
        // No caller-supplied recipient of any kind.
        expect(src).not.toMatch(/body\.(email|recipient|profileId)/);
        expect(src).not.toMatch(/searchParams\.get\('(email|recipient|to|profileId)'\)\s*\|\|/);
    });

    it('emails only the admin own address, and only on request', () => {
        expect(src).toMatch(/adminProfile\.email, \/\/ the authenticated admin's own address, only/);
        expect(src).toMatch(/if \(withEmail && !dryRun && result\.status === 'sent' && adminProfile\.email\)/);
    });

    it('marks its sends as tests so they cannot be mistaken for real traffic', () => {
        expect(src).toMatch(/\[Test\] \$\{content\.subject\}/);
    });
});

describe('house rules', () => {
    it('uses the shared logger, never console', () => {
        for (const file of [LIB, CRON, ADMIN]) {
            expect(read(file)).not.toMatch(/console\.(log|error|warn)\(/);
        }
    });

    it('keeps em and en dashes out of the source', () => {
        for (const file of [LIB, CRON, ADMIN]) {
            expect(read(file)).not.toMatch(/[–—]/);
        }
    });
});

describe('candidate side speaks only when it has something personal to say', () => {
    const src = read(LIB);

    // 2026-08-12, first live run: 206 candidates each received an identical
    // one-job "Jobs picked for you this week" message, because the fallback
    // required a confirmed JobAlert and then handed everyone the same recent
    // employer posts the alert digest had already emailed them. Removed.
    it('has no JobAlert fallback path', () => {
        expect(src).not.toMatch(/fetchAlertFallbackTargets/);
        expect(src).not.toMatch(/jobMatchesAlert/);
    });

    it('builds candidate messages from fresh recommendations only', () => {
        expect(src).toMatch(/fetchFreshRecommendationTargets/);
        expect(src).toMatch(/no JobAlert fallback|NO ALERT FALLBACK/i);
    });
});
