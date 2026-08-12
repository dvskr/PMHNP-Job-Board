/**
 * In-platform system messages — behavioral unit tests.
 *
 * Nothing here touches a real database or Resend: Prisma, the email service
 * and the shared-cap helper are all mocked, so the only things under test are
 * the pure copy builders and the send gate (env flag, 7-day cap, dryRun).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks (override tests/setup.ts for this file) ───────────────────────────

// vi.mock is hoisted above the file body, so the mock object has to be built
// inside vi.hoisted to exist by the time the factory runs.
const prismaMock = vi.hoisted(() => ({
    userProfile: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    conversation: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    employerMessage: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    employerJob: { findMany: vi.fn() },
    jobApplication: { groupBy: vi.fn() },
    matchDigestEmail: { findMany: vi.fn() },
    candidateRecommendation: { findMany: vi.fn() },
    job: { findMany: vi.fn() },
    jobAlert: { findMany: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/email-service', () => ({
    isEmailSuppressed: vi.fn().mockResolvedValue(false),
    sendEmployerMessageNotification: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock('@/lib/match-digest-service', () => ({
    isUnderSharedLifecycleCap: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/lib/job-alerts-service', () => ({ jobMatchesAlert: vi.fn().mockReturnValue(false) }));

import {
    buildCandidateDigestMessage,
    buildEmployerSignalMessage,
    getOrCreateSystemProfile,
    getRecentlyMessagedProfileIds,
    isSystemMessageEmailEnabled,
    isSystemMessagesEnabled,
    sendSystemMessage,
    MAX_JOBS_PER_CANDIDATE_MESSAGE,
    SYSTEM_PROFILE_NAME,
    SYSTEM_PROFILE_SUPABASE_ID,
    SYSTEM_SUBJECT_PREFIX,
} from '@/lib/system-messages';

const SYSTEM_ID = 'system-profile-id';
const RECIPIENT_ID = 'recipient-profile-id';

beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OUTBOUND_MESSAGING_PAUSED;
    delete process.env.SYSTEM_MESSAGE_EMAILS;
});

afterEach(() => {
    delete process.env.OUTBOUND_MESSAGING_PAUSED;
    delete process.env.SYSTEM_MESSAGE_EMAILS;
});

// ─── Copy builders ───────────────────────────────────────────────────────────

describe('buildEmployerSignalMessage', () => {
    it('reports applications when applications are the signal', () => {
        const { subject, body } = buildEmployerSignalMessage('Outpatient PMHNP', 3);
        expect(subject).toBe('Your Outpatient PMHNP post has 3 new applications waiting');
        expect(body).toContain('3 new applications waiting for review');
        expect(body).toContain('/employer/applicants');
    });

    it('uses singular wording for exactly one application', () => {
        const { subject } = buildEmployerSignalMessage('Outpatient PMHNP', 1);
        expect(subject).toContain('1 new application waiting');
        expect(subject).not.toContain('applications');
    });

    /**
     * Regression: an earlier revision summed applications and matches into one
     * number and passed the total as the application count, so a post with 0
     * applications and 3 matches told the employer it had "3 new applications".
     */
    it('never claims applications when the signal is matches only', () => {
        const { subject, body } = buildEmployerSignalMessage('Outpatient PMHNP', 0, 3);
        expect(subject).toBe('Your Outpatient PMHNP post has 3 strong candidate matches waiting');
        expect(subject).not.toMatch(/application/i);
        expect(body).not.toMatch(/application/i);
        expect(body).toContain('/employer/talent-search');
    });

    it('keeps the two counts distinct when both signals are present', () => {
        const { subject, body } = buildEmployerSignalMessage('Outpatient PMHNP', 2, 5);
        expect(subject).toContain('2 new applications waiting');
        expect(body).toContain('2 new applications and 5 strong candidate matches');
    });

    it('truncates a very long post title', () => {
        const { subject } = buildEmployerSignalMessage('P'.repeat(300), 2);
        expect(subject.length).toBeLessThan(140);
        expect(subject).toContain('...');
    });

    it('carries no candidate identity, only counts', () => {
        const { body } = buildEmployerSignalMessage('Outpatient PMHNP', 4, 2);
        expect(body).not.toMatch(/@/); // no candidate email ever reaches an employer
    });
});

describe('buildCandidateDigestMessage', () => {
    const jobs = [
        { id: 'job-1', title: 'PMHNP Telehealth', employer: 'Acme Psych' },
        { id: 'job-2', title: 'Child PMHNP', employer: 'Northwind Health' },
        { id: 'job-3', title: 'Adult PMHNP', employer: 'Contoso Behavioral' },
        { id: 'job-4', title: 'Geriatric PMHNP', employer: 'Fabrikam Care' },
    ];

    it('caps the digest at three jobs', () => {
        const { body } = buildCandidateDigestMessage(jobs);
        expect(MAX_JOBS_PER_CANDIDATE_MESSAGE).toBe(3);
        expect(body).toContain('PMHNP Telehealth');
        expect(body).toContain('Adult PMHNP');
        expect(body).not.toContain('Geriatric PMHNP');
    });

    it('links each job into the platform and closes with the dashboard', () => {
        const { subject, body } = buildCandidateDigestMessage(jobs.slice(0, 1));
        expect(subject).toBe('Jobs picked for you this week');
        expect(body).toContain('/jobs/pmhnp-telehealth-job-1');
        expect(body).toContain('/dashboard');
    });
});

describe('message copy house rules', () => {
    const bodies = [
        buildEmployerSignalMessage('Outpatient PMHNP', 3, 2),
        buildEmployerSignalMessage('Outpatient PMHNP', 0, 2),
        buildCandidateDigestMessage([{ id: 'job-1', title: 'PMHNP Telehealth', employer: 'Acme Psych' }]),
    ];

    it('uses no em or en dashes anywhere in user-facing copy', () => {
        for (const { subject, body } of bodies) {
            expect(subject).not.toMatch(/[–—]/);
            expect(body).not.toMatch(/[–—]/);
        }
    });

    it('always says the thread is automated and unmonitored', () => {
        for (const { body } of bodies) {
            expect(body).toContain('automated update from the PMHNP Hiring Team');
            expect(body).toContain('Replies to this thread are not monitored');
        }
    });
});

// ─── Send gate ───────────────────────────────────────────────────────────────

function baseParams(overrides: Record<string, unknown> = {}) {
    return {
        systemProfileId: SYSTEM_ID,
        recipientProfileId: RECIPIENT_ID,
        subject: 'Jobs picked for you this week',
        body: 'body',
        dryRun: false,
        context: 'cron' as const,
        ...overrides,
    };
}

function expectNoWrites() {
    expect(prismaMock.employerMessage.create).not.toHaveBeenCalled();
    expect(prismaMock.conversation.create).not.toHaveBeenCalled();
    expect(prismaMock.conversation.update).not.toHaveBeenCalled();
}

describe('sendSystemMessage', () => {
    it('refuses a real cron send while outbound messaging is paused', async () => {
        process.env.OUTBOUND_MESSAGING_PAUSED = '1';
        const result = await sendSystemMessage(baseParams());
        expect(result.status).toBe('disabled');
        expect(prismaMock.employerMessage.findFirst).not.toHaveBeenCalled();
        expectNoWrites();
        delete process.env.OUTBOUND_MESSAGING_PAUSED;
    });

    it('previews without writing when dryRun is set, flag on or off', async () => {
        prismaMock.employerMessage.findFirst.mockResolvedValue(null);
        for (const flag of [undefined, '1']) {
            vi.clearAllMocks();
            prismaMock.employerMessage.findFirst.mockResolvedValue(null);
            if (flag) process.env.OUTBOUND_MESSAGING_PAUSED = flag;
            else delete process.env.OUTBOUND_MESSAGING_PAUSED;

            const result = await sendSystemMessage(baseParams({ dryRun: true }));
            expect(result.status).toBe('dry_run');
            expectNoWrites();
        }
    });

    it('honours the 7-day cap using the system profile own sent messages', async () => {
        delete process.env.OUTBOUND_MESSAGING_PAUSED;
        prismaMock.employerMessage.findFirst.mockResolvedValue({ id: 'recent-message' });

        const result = await sendSystemMessage(baseParams());

        expect(result.status).toBe('capped');
        const where = prismaMock.employerMessage.findFirst.mock.calls[0][0].where;
        expect(where.senderId).toBe(SYSTEM_ID);
        expect(where.recipientId).toBe(RECIPIENT_ID);
        const capWindowDays =
            (Date.now() - new Date(where.sentAt.gt).getTime()) / (24 * 60 * 60 * 1000);
        expect(Math.round(capWindowDays)).toBe(7);
        expectNoWrites();
    });

    it('sends through the existing conversation models once enabled and uncapped', async () => {
        delete process.env.OUTBOUND_MESSAGING_PAUSED;
        prismaMock.employerMessage.findFirst.mockResolvedValue(null);
        prismaMock.conversation.findFirst.mockResolvedValue(null);
        prismaMock.conversation.create.mockResolvedValue({ id: 'conversation-1' });
        prismaMock.employerMessage.create.mockResolvedValue({ id: 'message-1' });

        const result = await sendSystemMessage(baseParams({ jobId: 'job-1' }));

        expect(result.status).toBe('sent');
        expect(result.subject).toBe(`${SYSTEM_SUBJECT_PREFIX}Jobs picked for you this week`);
        // System profile is always participantA, so the pair is deterministic.
        expect(prismaMock.conversation.create.mock.calls[0][0].data).toMatchObject({
            participantA: SYSTEM_ID,
            participantB: RECIPIENT_ID,
            jobId: 'job-1',
        });
        expect(prismaMock.employerMessage.create.mock.calls[0][0].data).toMatchObject({
            senderId: SYSTEM_ID,
            recipientId: RECIPIENT_ID,
            conversationId: 'conversation-1',
        });
        // Thread resurfaces in both inboxes, same as a human reply.
        expect(prismaMock.conversation.update.mock.calls[0][0].data).toMatchObject({
            deletedByA: false,
            deletedByB: false,
        });
    });

    it('reuses an existing system conversation instead of duplicating it', async () => {
        delete process.env.OUTBOUND_MESSAGING_PAUSED;
        prismaMock.employerMessage.findFirst.mockResolvedValue(null);
        prismaMock.conversation.findFirst.mockResolvedValue({ id: 'conversation-existing' });
        prismaMock.employerMessage.create.mockResolvedValue({ id: 'message-2' });

        const result = await sendSystemMessage(baseParams());

        expect(result.conversationId).toBe('conversation-existing');
        expect(prismaMock.conversation.create).not.toHaveBeenCalled();
    });

    it('does not double-prefix a subject that already carries the prefix', async () => {
        const result = await sendSystemMessage(
            baseParams({ subject: `${SYSTEM_SUBJECT_PREFIX}Already prefixed`, dryRun: true }),
        );
        expect(result.subject).toBe(`${SYSTEM_SUBJECT_PREFIX}Already prefixed`);
    });

    it('lets the admin test path bypass the flag and the cap (own account only)', async () => {
        prismaMock.conversation.findFirst.mockResolvedValue({ id: 'conversation-admin' });
        prismaMock.employerMessage.create.mockResolvedValue({ id: 'message-admin' });

        const result = await sendSystemMessage(baseParams({ context: 'admin_test' }));

        expect(result.status).toBe('sent');
        // The cap query belongs to the cron path only.
        expect(prismaMock.employerMessage.findFirst).not.toHaveBeenCalled();
    });
});

describe('env gates', () => {
    it('runs system messages by default, with no variable to set', () => {
        delete process.env.OUTBOUND_MESSAGING_PAUSED;
        expect(isSystemMessagesEnabled()).toBe(true);
    });

    it('stops on the emergency brake', () => {
        process.env.OUTBOUND_MESSAGING_PAUSED = '1';
        expect(isSystemMessagesEnabled()).toBe(false);
        delete process.env.OUTBOUND_MESSAGING_PAUSED;
    });

    it('keeps the email piggyback opt-in, and the brake overrides it', () => {
        // In-platform messages cost nothing if they misfire; this email spends
        // sender reputation, so it stays a deliberate choice.
        delete process.env.SYSTEM_MESSAGE_EMAILS;
        expect(isSystemMessageEmailEnabled()).toBe(false);

        process.env.SYSTEM_MESSAGE_EMAILS = '1';
        expect(isSystemMessageEmailEnabled()).toBe(true);

        process.env.OUTBOUND_MESSAGING_PAUSED = '1';
        expect(isSystemMessageEmailEnabled()).toBe(false);

        delete process.env.OUTBOUND_MESSAGING_PAUSED;
        delete process.env.SYSTEM_MESSAGE_EMAILS;
    });
});

describe('getRecentlyMessagedProfileIds', () => {
    it('skips the query entirely for an empty recipient list', async () => {
        const result = await getRecentlyMessagedProfileIds(SYSTEM_ID, [], new Date());
        expect(result.size).toBe(0);
        expect(prismaMock.employerMessage.findMany).not.toHaveBeenCalled();
    });

    it('returns the set of recipients already messaged in the window', async () => {
        prismaMock.employerMessage.findMany.mockResolvedValue([{ recipientId: 'a' }]);
        const result = await getRecentlyMessagedProfileIds(SYSTEM_ID, ['a', 'b'], new Date());
        expect(result.has('a')).toBe(true);
        expect(result.has('b')).toBe(false);
    });
});

describe('getOrCreateSystemProfile', () => {
    it('creates a suppressed, invisible, non-login platform identity', async () => {
        prismaMock.userProfile.findUnique.mockResolvedValue(null);
        prismaMock.userProfile.create.mockResolvedValue({ id: SYSTEM_ID });

        await getOrCreateSystemProfile();

        const data = prismaMock.userProfile.create.mock.calls[0][0].data;
        expect(data).toMatchObject({
            supabaseId: SYSTEM_PROFILE_SUPABASE_ID,
            role: 'system',
            firstName: SYSTEM_PROFILE_NAME,
            emailSuppressed: true,
            profileVisible: false,
            openToOffers: false,
        });
    });

    it('reuses the existing row without recreating it', async () => {
        prismaMock.userProfile.findUnique.mockResolvedValue({
            id: SYSTEM_ID,
            email: 'system@pmhnphiring.com',
        });

        const profile = await getOrCreateSystemProfile();

        expect(profile.id).toBe(SYSTEM_ID);
        expect(prismaMock.userProfile.create).not.toHaveBeenCalled();
        expect(prismaMock.userProfile.update).not.toHaveBeenCalled();
    });
});
