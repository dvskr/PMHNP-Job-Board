/**
 * InMail credits are counted per posting, by conversation.jobId.
 *
 * Omitting jobId used to create the conversation with jobId = null, which no
 * posting's counter ever saw: the cap read used = 0 for ever, so the whole
 * allowance was bypassed by leaving one field out of the request body. The
 * "replies are free" short-circuit had the same shape: it matched on the
 * participant pair alone, so once any conversation existed with a candidate,
 * every later conversation about a different posting skipped both the active
 * featured posting gate and the credit check.
 *
 * Every conversation is now attributed to a posting, and a supplied jobId is
 * ownership-checked on every path (its title is echoed into the candidate's
 * notification email).
 *
 * All fixtures are fictional.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const EMPLOYER_SUPABASE_ID = 'supabase-employer-fic-1';
const EMPLOYER_PROFILE_ID = 'profile-employer-fic-1';
const RECIPIENT_SUPABASE_ID = 'supabase-candidate-fic-1';
const RECIPIENT_PROFILE_ID = 'profile-candidate-fic-1';
const OWNED_JOB_A = 'job-owned-fic-a';
const OWNED_JOB_B = 'job-owned-fic-b';
const FOREIGN_JOB = 'job-owned-by-someone-else-fic-9';

vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({
        auth: {
            getUser: async () => ({
                data: { user: { id: EMPLOYER_SUPABASE_ID, email: 'hiring@examplepsych.example' } },
                error: null,
            }),
        },
    }),
}));

vi.mock('@/lib/rate-limit', () => ({
    rateLimit: async () => null,
    RATE_LIMITS: { employer: { limit: 100, windowSeconds: 60 } },
}));

vi.mock('@/lib/email-service', () => ({
    sendEmployerMessageNotification: vi.fn().mockResolvedValue({ success: true }),
}));

const canSendInMail = vi.fn();
vi.mock('@/lib/tier-limits', () => ({
    getEmployerTier: async () => 'pro',
    canSendInMail: (...a: unknown[]) => canSendInMail(...a),
}));

interface ConversationRow { id: string; participantA: string; participantB: string; jobId: string | null }
let conversationRows: ConversationRow[] = [];

const jobFindFirst = vi.fn();
const jobFindUnique = vi.fn();
const employerJobFindFirst = vi.fn();
const conversationCreate = vi.fn();
const conversationUpdate = vi.fn();
const messageCreate = vi.fn();

/** Honours the where clause so the test exercises the real scoping predicate. */
const conversationFindFirst = vi.fn(({ where }: { where: { OR: Partial<ConversationRow>[] } }) =>
    Promise.resolve(
        conversationRows.find(row =>
            where.OR.some(clause =>
                clause.participantA === row.participantA &&
                clause.participantB === row.participantB &&
                (!('jobId' in clause) || clause.jobId === row.jobId),
            ),
        ) ?? null,
    ),
);

vi.mock('@/lib/prisma', () => ({
    prisma: {
        userProfile: {
            findUnique: ({ where }: { where: { supabaseId: string } }) =>
                Promise.resolve(
                    where.supabaseId === EMPLOYER_SUPABASE_ID
                        ? { id: EMPLOYER_PROFILE_ID, firstName: 'Fixture', lastName: 'Recruiter', company: 'Example Psychiatry (Fixture)', role: 'employer' }
                        : { id: RECIPIENT_PROFILE_ID, email: 'candidate@examplemail.example', firstName: 'Fixture' },
                ),
        },
        job: {
            findFirst: (...a: unknown[]) => jobFindFirst(...a),
            findUnique: (...a: unknown[]) => jobFindUnique(...a),
        },
        employerJob: { findFirst: (...a: unknown[]) => employerJobFindFirst(...a) },
        conversation: {
            findFirst: (...a: unknown[]) => conversationFindFirst(...(a as [{ where: { OR: Partial<ConversationRow>[] } }])),
            create: (...a: unknown[]) => conversationCreate(...a),
            update: (...a: unknown[]) => conversationUpdate(...a),
        },
        employerMessage: { create: (...a: unknown[]) => messageCreate(...a) },
    },
}));

import { POST } from '@/app/api/employer/messages/route';

function request(body: Record<string, unknown>): NextRequest {
    return new NextRequest('http://localhost/api/employer/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            recipientId: RECIPIENT_SUPABASE_ID,
            subject: 'Evening PMHNP opening (Fixture)',
            body: 'Fixture outreach body.',
            ...body,
        }),
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    conversationRows = [];
    canSendInMail.mockResolvedValue({ allowed: true, used: 0, limit: 25 });
    // Any owned job id resolves; the foreign one is filtered out below.
    jobFindFirst.mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(where.id === FOREIGN_JOB ? null : { id: where.id }),
    );
    jobFindUnique.mockResolvedValue({ title: 'PMHNP Outpatient (Fixture)' });
    employerJobFindFirst.mockResolvedValue({ job: { id: OWNED_JOB_A } });
    // Prisma assigns the id, so the create payload carries everything BUT the
    // id. Typing it as a full ConversationRow let the spread overwrite the
    // synthetic id this mock hands back.
    conversationCreate.mockImplementation(({ data }: { data: Omit<ConversationRow, 'id'> }) =>
        Promise.resolve({ ...data, id: 'conversation-fic-new' }),
    );
    messageCreate.mockResolvedValue({ id: 'message-fic-1', sentAt: new Date() });
});

describe('outreach with no jobId', () => {
    it('attributes the conversation to the active featured posting instead of null', async () => {
        const res = await POST(request({}));

        expect(res.status).toBe(200);
        expect(conversationCreate).toHaveBeenCalledTimes(1);
        expect(conversationCreate.mock.calls[0][0].data.jobId).toBe(OWNED_JOB_A);
        // The message row is attributed too, so per-job reporting matches.
        expect(messageCreate.mock.calls[0][0].data.jobId).toBe(OWNED_JOB_A);
    });

    it('spends an InMail credit rather than skipping the check', async () => {
        await POST(request({}));

        expect(canSendInMail).toHaveBeenCalledTimes(1);
    });

    it('refuses when no posting can be resolved to charge', async () => {
        employerJobFindFirst.mockResolvedValue(null);

        const res = await POST(request({}));

        expect(res.status).toBe(403);
        expect(conversationCreate).not.toHaveBeenCalled();
        expect(messageCreate).not.toHaveBeenCalled();
    });

    it('refuses when the featured posting row carries no job', async () => {
        employerJobFindFirst.mockResolvedValue({ job: null });

        const res = await POST(request({}));

        expect(res.status).toBe(403);
        expect(conversationCreate).not.toHaveBeenCalled();
    });
});

describe('a second posting, same candidate', () => {
    it('is charged as new outreach and not waved through as a reply', async () => {
        conversationRows = [{
            id: 'conversation-fic-a',
            participantA: EMPLOYER_PROFILE_ID,
            participantB: RECIPIENT_PROFILE_ID,
            jobId: OWNED_JOB_A,
        }];

        const res = await POST(request({ jobId: OWNED_JOB_B }));

        expect(res.status).toBe(200);
        expect(canSendInMail).toHaveBeenCalledTimes(1);
        expect(conversationCreate).toHaveBeenCalledTimes(1);
        expect(conversationCreate.mock.calls[0][0].data.jobId).toBe(OWNED_JOB_B);
    });

    it('leaves a real reply on the same posting free', async () => {
        conversationRows = [{
            id: 'conversation-fic-a',
            participantA: EMPLOYER_PROFILE_ID,
            participantB: RECIPIENT_PROFILE_ID,
            jobId: OWNED_JOB_A,
        }];

        const res = await POST(request({ jobId: OWNED_JOB_A }));

        expect(res.status).toBe(200);
        expect(canSendInMail).not.toHaveBeenCalled();
        expect(conversationCreate).not.toHaveBeenCalled();
    });
});

describe('jobId ownership', () => {
    it('refuses a posting the caller does not own, on the reply path too', async () => {
        conversationRows = [{
            id: 'conversation-fic-a',
            participantA: EMPLOYER_PROFILE_ID,
            participantB: RECIPIENT_PROFILE_ID,
            jobId: OWNED_JOB_A,
        }];

        const res = await POST(request({ jobId: FOREIGN_JOB }));

        expect(res.status).toBe(403);
        expect(messageCreate).not.toHaveBeenCalled();
        // The foreign posting's title must never reach the candidate's email.
        expect(jobFindUnique).not.toHaveBeenCalled();
    });
});
