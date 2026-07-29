/**
 * /api/admin/employers — one row per employer identity with post, payment and
 * ATS aggregates.
 *
 * Pins the aggregation invariants that are easy to break silently:
 *  - the guard short-circuits before any database work
 *  - withdrawn applications never reach the live total
 *  - the active predicate matches lib/tier-limits.ts getEmployerActivePostings
 *    (null expiresAt means never expires, a past expiresAt means inactive)
 *  - userId NULL posts fold into stable orphan rows and never collide
 *  - employer accounts with no posts still get a zeroed row
 *  - 'pending' is never reported as paid
 *  - hiringStatus precedence: hired outranks all_rejected
 *  - every summary field equals the sum over the returned rows
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';

vi.mock('@/lib/auth/require-api-admin', () => ({
    requireApiAdmin: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
    prisma: {
        employerJob: { findMany: vi.fn() },
        userProfile: { findMany: vi.fn() },
        jobApplication: { groupBy: vi.fn() },
    },
}));

vi.mock('@/lib/audit-log', () => ({
    logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/supabase/server', () => ({
    createClient: vi.fn().mockResolvedValue({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { email: 'admin@example.com' } } }) },
    }),
}));

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/sentry', () => ({
    captureException: vi.fn(),
}));

const DAY_MS = 24 * 60 * 60 * 1000;
const past = () => new Date(Date.now() - DAY_MS);
const future = () => new Date(Date.now() + DAY_MS);

type JobShape = {
    isPublished: boolean;
    expiresAt: Date | null;
    viewCount: number;
    applyClickCount: number;
};

function employerJob(
    over: Partial<{
        userId: string | null;
        jobId: string;
        employerName: string;
        contactEmail: string;
        quotaDomain: string | null;
        paymentStatus: string;
        createdAt: Date;
        job: Partial<JobShape>;
    }>
) {
    return {
        userId: null,
        jobId: 'j-default',
        employerName: 'Employer',
        contactEmail: 'contact@example.com',
        quotaDomain: null,
        paymentStatus: 'free',
        createdAt: new Date('2026-07-01T00:00:00Z'),
        ...over,
        job: {
            isPublished: true,
            expiresAt: null,
            viewCount: 0,
            applyClickCount: 0,
            ...(over.job ?? {}),
        },
    };
}

function profile(over: Partial<{ supabaseId: string; email: string; firstName: string | null; lastName: string | null; company: string | null; createdAt: Date }>) {
    return {
        supabaseId: 'u-x',
        email: 'user@example.com',
        firstName: null,
        lastName: null,
        company: null,
        createdAt: new Date('2026-06-01T00:00:00Z'),
        ...over,
    };
}

/** Wire the two disjoint groupBy calls off a per-job fixture. */
function wireApplications(live: Array<{ jobId: string; status: string; n: number }>, withdrawn: Array<{ jobId: string; n: number }>) {
    vi.mocked(prisma.jobApplication.groupBy).mockImplementation((args: unknown) => {
        const where = (args as { where: { withdrawnAt: unknown } }).where;
        if (where.withdrawnAt === null) {
            return Promise.resolve(
                live.map(g => ({ jobId: g.jobId, status: g.status, _count: { _all: g.n } }))
            ) as never;
        }
        return Promise.resolve(
            withdrawn.map(g => ({ jobId: g.jobId, _count: { _all: g.n } }))
        ) as never;
    });
}

function wireProfiles(employerRole: ReturnType<typeof profile>[], others: ReturnType<typeof profile>[]) {
    vi.mocked(prisma.userProfile.findMany).mockImplementation((args: unknown) => {
        const where = (args as { where: { role?: string } }).where;
        if (where?.role === 'employer') return Promise.resolve(employerRole) as never;
        return Promise.resolve(others) as never;
    });
}

function req(): Request {
    return new Request('https://example.com/api/admin/employers', { method: 'GET' });
}

async function callGet() {
    const { GET } = await import('@/app/api/admin/employers/route');
    return GET(req() as never);
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireApiAdmin).mockResolvedValue(null);
});

describe('GET /api/admin/employers — guard', () => {
    it('returns the auth error without touching the database', async () => {
        vi.mocked(requireApiAdmin).mockResolvedValue(
            NextResponse.json({ error: 'Admin access required' }, { status: 403 })
        );
        const res = await callGet();
        expect(res.status).toBe(403);
        expect(prisma.employerJob.findMany).not.toHaveBeenCalled();
        expect(prisma.jobApplication.groupBy).not.toHaveBeenCalled();
    });
});

describe('GET /api/admin/employers — aggregation', () => {
    beforeEach(() => {
        // j2 expired, j3 unpublished, j1/j4/j5 live.
        vi.mocked(prisma.employerJob.findMany).mockResolvedValue([
            employerJob({
                userId: 'u-a', jobId: 'j2', employerName: 'Acme Behavioral', contactEmail: 'hr@acme.com',
                quotaDomain: 'acme.com', paymentStatus: 'pending', createdAt: new Date('2026-07-20T00:00:00Z'),
                job: { isPublished: true, expiresAt: past(), viewCount: 5, applyClickCount: 1 },
            }),
            employerJob({
                userId: 'u-c', jobId: 'j5', employerName: 'Drifted Role Co', contactEmail: 'ops@drift.com',
                quotaDomain: 'drift.com', paymentStatus: 'refunded', createdAt: new Date('2026-07-18T00:00:00Z'),
                job: { isPublished: true, expiresAt: null, viewCount: 2, applyClickCount: 0 },
            }),
            employerJob({
                userId: null, jobId: 'j4', employerName: 'Other Health', contactEmail: 'HR@Other.COM',
                quotaDomain: null, paymentStatus: 'free', createdAt: new Date('2026-07-15T00:00:00Z'),
                job: { isPublished: true, expiresAt: future(), viewCount: 3, applyClickCount: 0 },
            }),
            employerJob({
                userId: null, jobId: 'j3', employerName: 'Legacy Clinic', contactEmail: 'jobs@legacy.org',
                quotaDomain: 'legacy.org', paymentStatus: 'free', createdAt: new Date('2026-07-10T00:00:00Z'),
                job: { isPublished: false, expiresAt: null, viewCount: 1, applyClickCount: 0 },
            }),
            employerJob({
                userId: 'u-a', jobId: 'j1', employerName: 'Acme Behavioral', contactEmail: 'hr@acme.com',
                quotaDomain: 'acme.com', paymentStatus: 'paid', createdAt: new Date('2026-07-01T00:00:00Z'),
                job: { isPublished: true, expiresAt: null, viewCount: 10, applyClickCount: 2 },
            }),
        ] as never);

        wireProfiles(
            [
                profile({ supabaseId: 'u-a', email: 'hr@acme.com', company: 'Acme Behavioral Health' }),
                profile({ supabaseId: 'u-b', email: 'never@posted.com', firstName: 'Never', lastName: 'Posted' }),
            ],
            [profile({ supabaseId: 'u-c', email: 'ops@drift.com', company: 'Drifted Role Co' })]
        );

        wireApplications(
            [
                { jobId: 'j1', status: 'applied', n: 3 },
                { jobId: 'j1', status: 'hired', n: 1 },
                { jobId: 'j2', status: 'rejected', n: 2 },
                { jobId: 'j4', status: 'applied', n: 1 },
                { jobId: 'j5', status: 'screening', n: 1 },
                // Employer marked this one withdrawn via the ATS, which does not
                // stamp withdrawnAt. It must not land in the live total.
                { jobId: 'j5', status: 'withdrawn', n: 1 },
            ],
            [{ jobId: 'j1', n: 2 }]
        );
    });

    it('folds posts, payments and applications onto the right employer identity', async () => {
        const res = await callGet();
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);

        const rows: Record<string, any> = Object.fromEntries(
            body.employers.map((row: any) => [row.id, row])
        );

        // Account backed poster: two posts, one live and one expired.
        expect(rows['u-a'].hasAccount).toBe(true);
        expect(rows['u-a'].name).toBe('Acme Behavioral Health');
        expect(rows['u-a'].posts).toEqual({ total: 2, active: 1, inactive: 1, paid: 1, free: 0, pending: 1 });
        expect(rows['u-a'].applications).toEqual({
            total: 6, applied: 3, screening: 0, interview: 0, offered: 0, hired: 1, rejected: 2, withdrawn: 2,
        });
        expect(rows['u-a'].hiringStatus).toBe('hired');
        expect(rows['u-a'].views).toBe(15);
        expect(rows['u-a'].applyClicks).toBe(3);
        expect(rows['u-a'].firstPostedAt).toBe(new Date('2026-07-01T00:00:00Z').toISOString());
        expect(rows['u-a'].lastPostedAt).toBe(new Date('2026-07-20T00:00:00Z').toISOString());

        // Orphans keyed off quotaDomain and contactEmail, lowercased, never merged.
        expect(rows['orphan:legacy.org'].hasAccount).toBe(false);
        expect(rows['orphan:legacy.org'].posts.active).toBe(0);
        expect(rows['orphan:legacy.org'].hiringStatus).toBe('no_applicants');
        expect(rows['orphan:hr@other.com'].posts.active).toBe(1);
        expect(rows['orphan:hr@other.com'].applications.applied).toBe(1);
        expect(rows['orphan:hr@other.com'].hiringStatus).toBe('untriaged');

        // Status 'withdrawn' without a withdrawnAt stamp stays out of the total.
        expect(rows['u-c'].applications.total).toBe(1);
        expect(rows['u-c'].applications.withdrawn).toBe(1);
        expect(rows['u-c'].hiringStatus).toBe('in_progress');
        // A refunded post is never claimed as paid.
        expect(rows['u-c'].posts.paid).toBe(0);
        // u-c posted while carrying a non employer role. The row is still shown
        // in full rather than being dropped.
        expect(rows['u-c'].hasAccount).toBe(true);
        expect(rows['u-c'].posts.total).toBe(1);

        // Signup that never posted still appears.
        expect(rows['u-b'].posts.total).toBe(0);
        expect(rows['u-b'].hiringStatus).toBe('no_posts');
        expect(rows['u-b'].accountCreatedAt).not.toBeNull();
    });

    it('never issues a query per employer', async () => {
        await callGet();
        expect(prisma.employerJob.findMany).toHaveBeenCalledTimes(1);
        expect(prisma.jobApplication.groupBy).toHaveBeenCalledTimes(2);
        expect(vi.mocked(prisma.userProfile.findMany).mock.calls.length).toBeLessThanOrEqual(2);
    });

    it('scopes application aggregates to employer posted jobs and splits withdrawn into a disjoint pass', async () => {
        await callGet();
        const calls = vi.mocked(prisma.jobApplication.groupBy).mock.calls.map(c => c[0] as any);
        const live = calls.find(c => c.where.withdrawnAt === null);
        const gone = calls.find(c => c.where.withdrawnAt !== null);

        // Scoped to employer posted jobs, so applications on ingested jobs never
        // reach the aggregate. Expressed as a relation filter rather than an
        // unbounded `jobId: { in: [...] }` bind list.
        expect(live.where.job).toEqual({ employerJobs: { isNot: null } });
        expect(gone.where.job).toEqual({ employerJobs: { isNot: null } });

        // Disjoint where clauses: nothing can be counted by both passes.
        expect(live.where.withdrawnAt).toBeNull();
        expect(gone.where.withdrawnAt).toEqual({ not: null });
    });

    it('reports every summary field as the exact sum over the returned rows', async () => {
        const res = await callGet();
        const { summary, employers } = await res.json();
        const sum = (pick: (r: any) => number) => employers.reduce((a: number, r: any) => a + pick(r), 0);

        expect(summary.totalPosts).toBe(sum(r => r.posts.total));
        expect(summary.activePosts).toBe(sum(r => r.posts.active));
        expect(summary.inactivePosts).toBe(sum(r => r.posts.inactive));
        expect(summary.activePosts + summary.inactivePosts).toBe(summary.totalPosts);
        expect(summary.paidPosts).toBe(sum(r => r.posts.paid));
        expect(summary.freePosts).toBe(sum(r => r.posts.free));
        expect(summary.pendingCheckouts).toBe(sum(r => r.posts.pending));
        expect(summary.totalApplications).toBe(sum(r => r.applications.total));
        expect(summary.untriagedApplications).toBe(sum(r => r.applications.applied));
        expect(summary.employersWithUntriaged).toBe(
            employers.filter((r: any) => r.applications.applied > 0).length
        );
        expect(summary.orphanPosters).toBe(employers.filter((r: any) => !r.hasAccount).length);

        // The three account numbers partition the same population, so they must
        // add up even though u-c posted while carrying a non employer role.
        expect(summary.accountsWithPosts + summary.accountsNeverPosted).toBe(summary.totalAccounts);
        expect(summary.accountsWithPosts).toBe(1);

        // Concrete values, so a regression in one bucket cannot cancel out in another.
        expect(summary.totalAccounts).toBe(2);
        expect(summary.accountsNeverPosted).toBe(1);
        expect(summary.totalPosts).toBe(5);
        expect(summary.activePosts).toBe(3);
        expect(summary.paidPosts).toBe(1);
        expect(summary.pendingCheckouts).toBe(1);
        expect(summary.totalApplications).toBe(8);
        expect(summary.untriagedApplications).toBe(4);
    });

    it('exposes no candidate identity', async () => {
        const res = await callGet();
        const raw = JSON.stringify(await res.json());
        expect(raw).not.toContain('candidate');
        expect(raw).not.toContain('applicantName');
    });
});

describe('GET /api/admin/employers — orphan identity', () => {
    it('merges account-less posts that share an anchor and keeps distinct anchors apart', async () => {
        vi.mocked(prisma.employerJob.findMany).mockResolvedValue([
            // Same contact email, different casing and padding: one identity.
            employerJob({ userId: null, jobId: 'j1', contactEmail: 'Jobs@Legacy.ORG', quotaDomain: null, employerName: 'Legacy Clinic', createdAt: new Date('2026-07-05T00:00:00Z') }),
            employerJob({ userId: null, jobId: 'j2', contactEmail: ' jobs@legacy.org ', quotaDomain: null, employerName: 'Legacy Clinic', createdAt: new Date('2026-07-04T00:00:00Z') }),
            // A different account-less poster must not fold into it.
            employerJob({ userId: null, jobId: 'j3', contactEmail: 'hr@somewhere.com', quotaDomain: null, employerName: 'Somewhere Health', createdAt: new Date('2026-07-03T00:00:00Z') }),
        ] as never);
        wireProfiles([], []);
        wireApplications([{ jobId: 'j1', status: 'applied', n: 2 }, { jobId: 'j3', status: 'hired', n: 1 }], []);

        const { summary, employers } = await (await callGet()).json();
        const ids = employers.map((r: any) => r.id).sort();
        expect(ids).toEqual(['orphan:hr@somewhere.com', 'orphan:jobs@legacy.org']);
        expect(summary.orphanPosters).toBe(2);

        const legacy = employers.find((r: any) => r.id === 'orphan:jobs@legacy.org');
        expect(legacy.hasAccount).toBe(false);
        expect(legacy.accountCreatedAt).toBeNull();
        expect(legacy.posts.total).toBe(2);
        expect(legacy.applications.applied).toBe(2);
        expect(legacy.name).toBe('Legacy Clinic');

        // Applications never bleed across identities.
        const other = employers.find((r: any) => r.id === 'orphan:hr@somewhere.com');
        expect(other.applications.total).toBe(1);
        expect(other.applications.hired).toBe(1);
        expect(summary.totalApplications).toBe(3);
    });

    it('prefers quotaDomain as the anchor when it is present', async () => {
        vi.mocked(prisma.employerJob.findMany).mockResolvedValue([
            employerJob({ userId: null, jobId: 'j1', contactEmail: 'a@acme.com', quotaDomain: 'ACME.com' }),
            employerJob({ userId: null, jobId: 'j2', contactEmail: 'b@acme.com', quotaDomain: 'acme.com' }),
        ] as never);
        wireProfiles([], []);
        wireApplications([], []);
        const { employers } = await (await callGet()).json();
        expect(employers).toHaveLength(1);
        expect(employers[0].id).toBe('orphan:acme.com');
        expect(employers[0].posts.total).toBe(2);
    });
});

describe('GET /api/admin/employers — empty states', () => {
    it('returns a zeroed summary and no rows when nothing exists', async () => {
        vi.mocked(prisma.employerJob.findMany).mockResolvedValue([] as never);
        wireProfiles([], []);
        wireApplications([], []);
        const { summary, employers } = await (await callGet()).json();
        expect(employers).toEqual([]);
        expect(Object.values(summary).every(v => v === 0)).toBe(true);
        // No posts means no reason to aggregate applications at all.
        expect(prisma.jobApplication.groupBy).not.toHaveBeenCalled();
    });

    it('lists employer accounts that never posted as zeroed no_posts rows', async () => {
        vi.mocked(prisma.employerJob.findMany).mockResolvedValue([] as never);
        wireProfiles(
            [
                profile({ supabaseId: 'u-1', email: 'one@example.com', company: 'One Clinic' }),
                profile({ supabaseId: 'u-2', email: 'two@example.com', firstName: 'Two', lastName: 'Person' }),
            ],
            []
        );
        wireApplications([], []);
        const { summary, employers } = await (await callGet()).json();
        expect(employers).toHaveLength(2);
        expect(employers.every((r: any) => r.hiringStatus === 'no_posts')).toBe(true);
        expect(employers.every((r: any) => r.posts.total === 0 && r.applications.total === 0)).toBe(true);
        expect(summary.totalAccounts).toBe(2);
        expect(summary.accountsNeverPosted).toBe(2);
        expect(summary.accountsWithPosts).toBe(0);
        expect(summary.orphanPosters).toBe(0);
    });
});

/**
 * The route evaluates the active predicate in memory over rows it already
 * loaded, so it cannot literally share the Prisma clause with
 * lib/tier-limits.ts getEmployerActivePostings, which is the rule behind the
 * employer's own dashboard liveCount and behind quota entitlement. That is the
 * hand-mirrored-predicate shape this repo has already been burned by (see
 * tests/lib/filter-clauses-parity.test.ts), so pin both halves here: if anyone
 * changes the canonical clause, this fails and names the admin route.
 */
describe('GET /api/admin/employers — active predicate parity with lib/tier-limits.ts', () => {
    it('still matches the canonical getEmployerActivePostings clause', async () => {
        vi.mocked(prisma.employerJob.findMany).mockResolvedValue([] as never);
        const { getEmployerActivePostings } = await import('@/lib/tier-limits');
        await getEmployerActivePostings('u-1');

        const canonical = (vi.mocked(prisma.employerJob.findMany).mock.calls[0][0] as any).where.job;
        expect(Object.keys(canonical).sort()).toEqual(['OR', 'isPublished']);
        expect(canonical.isPublished).toBe(true);
        expect(canonical.OR).toHaveLength(2);
        expect(canonical.OR[0]).toEqual({ expiresAt: null });
        expect(Object.keys(canonical.OR[1].expiresAt)).toEqual(['gt']);
        expect(canonical.OR[1].expiresAt.gt).toBeInstanceOf(Date);
    });

    it('classifies the same matrix the canonical clause would select', async () => {
        // A null expiresAt means never expires, not expired. Getting that
        // backwards is the easiest way to break parity with the dashboard.
        vi.mocked(prisma.employerJob.findMany).mockResolvedValue([
            employerJob({ userId: 'u-1', jobId: 'j0', job: { isPublished: true, expiresAt: null } }),
            employerJob({ userId: 'u-1', jobId: 'j1', job: { isPublished: true, expiresAt: future() } }),
            employerJob({ userId: 'u-1', jobId: 'j2', job: { isPublished: true, expiresAt: past() } }),
            employerJob({ userId: 'u-1', jobId: 'j3', job: { isPublished: false, expiresAt: null } }),
            employerJob({ userId: 'u-1', jobId: 'j4', job: { isPublished: false, expiresAt: future() } }),
        ] as never);
        wireProfiles([profile({ supabaseId: 'u-1', email: 'a@b.com', company: 'Solo' })], []);
        wireApplications([], []);

        const { summary, employers } = await (await callGet()).json();
        expect(summary.activePosts).toBe(2);
        expect(summary.inactivePosts).toBe(3);
        expect(summary.activePosts + summary.inactivePosts).toBe(summary.totalPosts);
        expect(employers[0].posts.active).toBe(2);
    });
});

describe('GET /api/admin/employers — hiringStatus precedence', () => {
    async function statusFor(live: Array<{ status: string; n: number }>): Promise<string> {
        vi.mocked(prisma.employerJob.findMany).mockResolvedValue([
            employerJob({ userId: 'u-1', jobId: 'j1', paymentStatus: 'paid' }),
        ] as never);
        wireProfiles([profile({ supabaseId: 'u-1', email: 'a@b.com', company: 'Solo' })], []);
        wireApplications(live.map(l => ({ jobId: 'j1', status: l.status, n: l.n })), []);
        const res = await callGet();
        const body = await res.json();
        return body.employers[0].hiringStatus;
    }

    it('lets a hire outrank rejections', async () => {
        expect(await statusFor([{ status: 'rejected', n: 4 }, { status: 'hired', n: 1 }])).toBe('hired');
    });

    it('reports all_rejected only when nothing is still open', async () => {
        expect(await statusFor([{ status: 'rejected', n: 3 }])).toBe('all_rejected');
        expect(await statusFor([{ status: 'rejected', n: 3 }, { status: 'applied', n: 1 }])).toBe('untriaged');
        expect(await statusFor([{ status: 'rejected', n: 3 }, { status: 'interview', n: 1 }])).toBe('in_progress');
    });

    it('reports untriaged when every applicant is still at applied', async () => {
        expect(await statusFor([{ status: 'applied', n: 9 }])).toBe('untriaged');
    });

    it('reports no_applicants when the only applications were withdrawn', async () => {
        vi.mocked(prisma.employerJob.findMany).mockResolvedValue([
            employerJob({ userId: 'u-1', jobId: 'j1', paymentStatus: 'paid' }),
        ] as never);
        wireProfiles([profile({ supabaseId: 'u-1', email: 'a@b.com', company: 'Solo' })], []);
        wireApplications([], [{ jobId: 'j1', n: 3 }]);
        const body = await (await callGet()).json();
        expect(body.employers[0].applications.total).toBe(0);
        expect(body.employers[0].applications.withdrawn).toBe(3);
        expect(body.employers[0].hiringStatus).toBe('no_applicants');
    });
});
