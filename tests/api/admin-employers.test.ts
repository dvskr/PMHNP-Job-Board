/**
 * /api/admin/employers — one row per ORGANIZATION (the connected component of
 * employer accounts and posts sharing any quota identity key) with post,
 * payment and ATS aggregates, plus a per-account breakdown nested in each row.
 *
 * Pins the aggregation invariants that are easy to break silently:
 *  - the guard short-circuits before any database work
 *  - grouping reuses lib/employer-quota.ts semantics EXACTLY: shared dom: keys
 *    merge accounts, consumer mailboxes and generic company names never do
 *  - the legacy quotaDomain gmail trap: a stored consumer domain must not fuse
 *    unrelated orphan posts into one organization
 *  - stored quotaKeys get the same screen: a consumer or junk dom: key that
 *    survived migration hygiene (20260727d stripped by exact match, so
 *    'dom:gmail.com.' with trailing-dot junk survived) is inert at the gate
 *    and must not merge strangers here either
 *  - an orphan post with a company domain folds into the account org on that
 *    domain; an orphan with no usable signal stands alone per row
 *  - employer accounts with no posts still get an organization
 *  - withdrawn applications never reach the live total
 *  - the active predicate matches lib/tier-limits.ts getEmployerActivePostings
 *    (null expiresAt means never expires, a past expiresAt means inactive)
 *  - 'pending' is never reported as paid; 'refunded' has its own bucket
 *  - hiringStatus precedence: hired outranks all_rejected
 *  - every organization equals the exact sum of its accounts, and every
 *    summary field equals the sum over the returned rows
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
        quotaKeys: string[];
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
        quotaKeys: [] as string[],
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

/* eslint-disable @typescript-eslint/no-explicit-any */
function byId(organizations: any[]): Record<string, any> {
    return Object.fromEntries(organizations.map((org: any) => [org.id, org]));
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
                quotaDomain: 'acme.com', quotaKeys: ['acct:u-a', 'dom:acme.com'],
                paymentStatus: 'pending', createdAt: new Date('2026-07-20T00:00:00Z'),
                job: { isPublished: true, expiresAt: past(), viewCount: 5, applyClickCount: 1 },
            }),
            // Legacy non-free row: acct-only stored keys, quotaDomain survives but
            // must be ignored because the stored keys are authoritative.
            employerJob({
                userId: 'u-c', jobId: 'j5', employerName: 'Drifted Role Co', contactEmail: 'ops@drift.com',
                quotaDomain: 'drift.com', quotaKeys: ['acct:u-c'],
                paymentStatus: 'refunded', createdAt: new Date('2026-07-18T00:00:00Z'),
                job: { isPublished: true, expiresAt: null, viewCount: 2, applyClickCount: 0 },
            }),
            employerJob({
                userId: null, jobId: 'j4', employerName: 'Other Health', contactEmail: 'HR@Other.COM',
                quotaDomain: null, quotaKeys: [],
                paymentStatus: 'free', createdAt: new Date('2026-07-15T00:00:00Z'),
                job: { isPublished: true, expiresAt: future(), viewCount: 3, applyClickCount: 0 },
            }),
            employerJob({
                userId: null, jobId: 'j3', employerName: 'Legacy Clinic', contactEmail: 'jobs@legacy.org',
                quotaDomain: 'legacy.org', quotaKeys: [],
                paymentStatus: 'free', createdAt: new Date('2026-07-10T00:00:00Z'),
                job: { isPublished: false, expiresAt: null, viewCount: 1, applyClickCount: 0 },
            }),
            employerJob({
                userId: 'u-a', jobId: 'j1', employerName: 'Acme Behavioral', contactEmail: 'hr@acme.com',
                quotaDomain: 'acme.com', quotaKeys: ['acct:u-a', 'dom:acme.com'],
                paymentStatus: 'paid', createdAt: new Date('2026-07-01T00:00:00Z'),
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

    it('folds posts, payments and applications onto the right organization', async () => {
        const res = await callGet();
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);

        const rows = byId(body.organizations);

        // Account backed poster: two posts, one live and one expired. The org
        // wears the name it most recently posted under, and the account keeps
        // its own identity (the profile company) in the breakdown.
        expect(rows['u-a'].name).toBe('Acme Behavioral');
        expect(rows['u-a'].allNames).toEqual(['Acme Behavioral', 'Acme Behavioral Health']);
        expect(rows['u-a'].email).toBe('hr@acme.com');
        expect(rows['u-a'].posts).toEqual({ total: 2, active: 1, inactive: 1, paid: 1, free: 0, pending: 1, refunded: 0 });
        expect(rows['u-a'].applications).toEqual({
            total: 6, applied: 3, screening: 0, interview: 0, offered: 0, hired: 1, rejected: 2, withdrawn: 2,
        });
        expect(rows['u-a'].hiringStatus).toBe('hired');
        expect(rows['u-a'].views).toBe(15);
        expect(rows['u-a'].applyClicks).toBe(3);
        expect(rows['u-a'].firstPostedAt).toBe(new Date('2026-07-01T00:00:00Z').toISOString());
        expect(rows['u-a'].lastPostedAt).toBe(new Date('2026-07-20T00:00:00Z').toISOString());
        expect(rows['u-a'].accounts).toHaveLength(1);
        expect(rows['u-a'].accounts[0].id).toBe('u-a');
        expect(rows['u-a'].accounts[0].hasAccount).toBe(true);
        expect(rows['u-a'].accounts[0].name).toBe('Acme Behavioral Health');

        // Orphans anchored on their non-consumer domains, never merged.
        expect(rows['orphan:job:j3'].accounts).toEqual([
            expect.objectContaining({ id: 'no-account', hasAccount: false, accountCreatedAt: null }),
        ]);
        expect(rows['orphan:job:j3'].posts.active).toBe(0);
        expect(rows['orphan:job:j3'].hiringStatus).toBe('no_applicants');
        expect(rows['orphan:job:j4'].posts.active).toBe(1);
        expect(rows['orphan:job:j4'].applications.applied).toBe(1);
        expect(rows['orphan:job:j4'].hiringStatus).toBe('untriaged');

        // Status 'withdrawn' without a withdrawnAt stamp stays out of the total.
        expect(rows['u-c'].applications.total).toBe(1);
        expect(rows['u-c'].applications.withdrawn).toBe(1);
        expect(rows['u-c'].hiringStatus).toBe('in_progress');
        // A refunded post is never claimed as paid; it gets its own bucket.
        expect(rows['u-c'].posts.paid).toBe(0);
        expect(rows['u-c'].posts.refunded).toBe(1);
        // u-c posted while carrying a non employer role. The organization is
        // still shown in full, with the recovered profile on its account.
        expect(rows['u-c'].posts.total).toBe(1);
        expect(rows['u-c'].accounts[0].hasAccount).toBe(true);
        expect(rows['u-c'].accounts[0].email).toBe('ops@drift.com');

        // Signup that never posted still appears as its own organization.
        expect(rows['u-b'].posts.total).toBe(0);
        expect(rows['u-b'].hiringStatus).toBe('no_posts');
        expect(rows['u-b'].accounts[0].accountCreatedAt).not.toBeNull();
    });

    it('reports every organization as the exact sum of its account breakdown', async () => {
        const { organizations } = await (await callGet()).json();
        for (const org of organizations) {
            const sum = (pick: (a: any) => number) =>
                org.accounts.reduce((running: number, account: any) => running + pick(account), 0);
            expect(org.posts.total).toBe(sum(a => a.posts.total));
            expect(org.posts.active).toBe(sum(a => a.posts.active));
            expect(org.posts.paid).toBe(sum(a => a.posts.paid));
            expect(org.applications.total).toBe(sum(a => a.applications.total));
            expect(org.applications.applied).toBe(sum(a => a.applications.applied));
            expect(org.applications.withdrawn).toBe(sum(a => a.applications.withdrawn));
        }
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
        const { summary, organizations } = await res.json();
        const sum = (pick: (org: any) => number) =>
            organizations.reduce((a: number, org: any) => a + pick(org), 0);

        expect(summary.totalPosts).toBe(sum(org => org.posts.total));
        expect(summary.activePosts).toBe(sum(org => org.posts.active));
        expect(summary.inactivePosts).toBe(sum(org => org.posts.inactive));
        expect(summary.activePosts + summary.inactivePosts).toBe(summary.totalPosts);
        expect(summary.paidPosts).toBe(sum(org => org.posts.paid));
        expect(summary.freePosts).toBe(sum(org => org.posts.free));
        expect(summary.pendingCheckouts).toBe(sum(org => org.posts.pending));
        expect(summary.totalApplications).toBe(sum(org => org.applications.total));
        expect(summary.untriagedApplications).toBe(sum(org => org.applications.applied));
        expect(summary.employersWithUntriaged).toBe(
            organizations.filter((org: any) => org.applications.applied > 0).length
        );
        expect(summary.orphanPosters).toBe(
            organizations.filter((org: any) => !org.accounts.some((a: any) => a.hasAccount)).length
        );
        expect(summary.totalOrganizations).toBe(organizations.length);

        // The three account numbers partition the same population, so they must
        // add up even though u-c posted while carrying a non employer role.
        expect(summary.accountsWithPosts + summary.accountsNeverPosted).toBe(summary.totalAccounts);
        expect(summary.accountsWithPosts).toBe(1);

        // Concrete values, so a regression in one bucket cannot cancel out in another.
        expect(summary.totalAccounts).toBe(2);
        expect(summary.accountsNeverPosted).toBe(1);
        expect(summary.orphanPosters).toBe(2);
        expect(summary.totalPosts).toBe(5);
        expect(summary.activePosts).toBe(3);
        expect(summary.paidPosts).toBe(1);
        expect(summary.pendingCheckouts).toBe(1);
        expect(summary.totalApplications).toBe(8);
        expect(summary.untriagedApplications).toBe(4);
        expect(summary.employersWithUntriaged).toBe(2);
        expect(summary.totalOrganizations).toBe(5);
        expect(summary.organizationsWithMultipleAccounts).toBe(0);
    });

    it('exposes no candidate identity', async () => {
        const res = await callGet();
        const raw = JSON.stringify(await res.json());
        expect(raw).not.toContain('candidate');
        expect(raw).not.toContain('applicantName');
    });
});

describe('GET /api/admin/employers — organization grouping', () => {
    it('merges two accounts sharing a dom: key into one organization (the paid-routing story)', async () => {
        // The prod case this view exists for: account A posted the free job and
        // received every application; colleague account B on the same company
        // mail domain typed a different company name at signup and was routed
        // to paid because the quota already saw one organization.
        wireProfiles(
            [
                profile({ supabaseId: 'u-free', email: 'frontdesk@example-clinic.com', company: 'Mind Example LLC', createdAt: new Date('2026-06-01T00:00:00Z') }),
                profile({ supabaseId: 'u-paid', email: 'md@example-clinic.com', company: 'Example Psychiatry Associates', createdAt: new Date('2026-07-01T00:00:00Z') }),
            ],
            []
        );
        vi.mocked(prisma.employerJob.findMany).mockResolvedValue([
            employerJob({
                userId: 'u-paid', jobId: 'jp', employerName: 'Example Psychiatry', contactEmail: 'md@example-clinic.com',
                quotaKeys: ['acct:u-paid', 'dom:example-clinic.com'], paymentStatus: 'paid',
                createdAt: new Date('2026-07-10T00:00:00Z'),
            }),
            employerJob({
                userId: 'u-free', jobId: 'jf', employerName: 'Mind Example', contactEmail: 'frontdesk@example-clinic.com',
                quotaKeys: ['acct:u-free', 'dom:example-clinic.com'], paymentStatus: 'free',
                createdAt: new Date('2026-06-10T00:00:00Z'),
            }),
        ] as never);
        wireApplications(
            [
                { jobId: 'jf', status: 'applied', n: 2 },
                { jobId: 'jf', status: 'screening', n: 1 },
            ],
            []
        );

        const { summary, organizations } = await (await callGet()).json();

        expect(organizations).toHaveLength(1);
        const org = organizations[0];
        expect(org.id).toBe('u-paid');
        expect(org.name).toBe('Example Psychiatry');
        expect(org.allNames).toEqual([
            'Example Psychiatry', 'Mind Example', 'Example Psychiatry Associates', 'Mind Example LLC',
        ]);
        // The organization's totals are the SUM of its accounts: two posts, one
        // paid plus one free, and every application from the free post.
        expect(org.posts).toEqual({ total: 2, active: 2, inactive: 0, paid: 1, free: 1, pending: 0, refunded: 0 });
        expect(org.applications.total).toBe(3);
        expect(org.applications.applied).toBe(2);
        expect(org.applications.screening).toBe(1);

        // Per-account story stays one click away: newest account first.
        expect(org.accounts.map((a: any) => a.id)).toEqual(['u-paid', 'u-free']);
        expect(org.accounts[0].posts.paid).toBe(1);
        expect(org.accounts[0].applications.total).toBe(0);
        expect(org.accounts[1].posts.free).toBe(1);
        expect(org.accounts[1].applications.total).toBe(3);

        expect(summary.totalOrganizations).toBe(1);
        expect(summary.organizationsWithMultipleAccounts).toBe(1);
        expect(summary.accountsWithPosts).toBe(2);
        expect(summary.employersWithUntriaged).toBe(1);
    });

    it('never merges consumer mailbox posters, including the legacy quotaDomain gmail trap', async () => {
        wireProfiles(
            [
                profile({ supabaseId: 'g-1', email: 'x1@gmail.com', createdAt: new Date('2026-05-01T00:00:00Z') }),
                profile({ supabaseId: 'g-2', email: 'y2@gmail.com', createdAt: new Date('2026-05-02T00:00:00Z') }),
            ],
            []
        );
        vi.mocked(prisma.employerJob.findMany).mockResolvedValue([
            employerJob({ userId: 'g-1', jobId: 'pg1', quotaKeys: ['acct:g-1'], contactEmail: 'x1@gmail.com', createdAt: new Date('2026-07-01T00:00:00Z') }),
            employerJob({ userId: 'g-2', jobId: 'pg2', quotaKeys: ['acct:g-2'], contactEmail: 'y2@gmail.com', createdAt: new Date('2026-07-02T00:00:00Z') }),
            // Migration 20260727d stripped consumer dom: keys from quota_keys
            // but left quota_domain itself untouched, so this shape is real in
            // prod. If the consumer screen were skipped, these two strangers
            // would fuse on dom:gmail.com.
            employerJob({ userId: null, jobId: 'o1', quotaKeys: [], quotaDomain: 'gmail.com', contactEmail: 'one@gmail.com', createdAt: new Date('2026-07-03T00:00:00Z') }),
            employerJob({ userId: null, jobId: 'o2', quotaKeys: [], quotaDomain: 'gmail.com', contactEmail: 'two@gmail.com', createdAt: new Date('2026-07-04T00:00:00Z') }),
        ] as never);
        wireApplications([], []);

        const { summary, organizations } = await (await callGet()).json();
        const ids = organizations.map((org: any) => org.id).sort();
        expect(ids).toEqual(['g-1', 'g-2', 'orphan:job:o1', 'orphan:job:o2']);
        expect(summary.totalOrganizations).toBe(4);
        expect(summary.organizationsWithMultipleAccounts).toBe(0);
        expect(summary.orphanPosters).toBe(2);
    });

    it('screens stored dom: keys, so gate-inert junk that survived migration hygiene never fuses strangers', async () => {
        wireProfiles([], []);
        vi.mocked(prisma.employerJob.findMany).mockResolvedValue([
            // The shape that beats the fallback screen alone: 20260501 backfilled
            // quota_domain by raw split (trailing dot kept), 20260727b minted
            // 'dom:gmail.com.' from it into quota_keys, and 20260727d stripped
            // consumer dom: keys by EXACT string match, so the dotted key
            // SURVIVED in quota_keys. It can never match a computed key at the
            // quota gate, so it must not merge two strangers here either.
            employerJob({ userId: null, jobId: 'k1', quotaKeys: ['dom:gmail.com.'], quotaDomain: 'gmail.com.', contactEmail: 'one@gmail.com.', createdAt: new Date('2026-07-02T00:00:00Z') }),
            employerJob({ userId: null, jobId: 'k2', quotaKeys: ['dom:gmail.com.'], quotaDomain: 'gmail.com.', contactEmail: 'two@gmail.com.', createdAt: new Date('2026-07-01T00:00:00Z') }),
            // A COMPANY domain with the same trailing-dot junk normalizes to the
            // exact key the gate would compute, so it still folds into that org.
            employerJob({ userId: null, jobId: 'k3', quotaKeys: ['dom:acme-example.com.'], quotaDomain: null, contactEmail: 'a@acme-example.com', createdAt: new Date('2026-07-03T00:00:00Z') }),
            employerJob({ userId: null, jobId: 'k4', quotaKeys: ['dom:acme-example.com'], quotaDomain: null, contactEmail: 'b@acme-example.com', createdAt: new Date('2026-07-04T00:00:00Z') }),
        ] as never);
        wireApplications([], []);

        const { summary, organizations } = await (await callGet()).json();
        const ids = organizations.map((org: any) => org.id).sort();
        // k1 and k2 stand alone on per-row synthetic keys; k3 joins k4.
        expect(ids).toEqual(['orphan:job:k1', 'orphan:job:k2', 'orphan:job:k4']);
        expect(summary.totalOrganizations).toBe(3);
        const merged = organizations.find((org: any) => org.id === 'orphan:job:k4');
        expect(merged.posts.total).toBe(2);
    });

    it('never bridges organizations on a generic company name, but does on a distinctive one', async () => {
        wireProfiles(
            [
                // 'Wellness' is in the library's generic list: no org: key, so
                // these two unrelated clinics must stay separate.
                profile({ supabaseId: 'w-1', email: 'hello@alpha-example.com', company: 'Wellness', createdAt: new Date('2026-05-01T00:00:00Z') }),
                profile({ supabaseId: 'w-2', email: 'hi@beta-example.com', company: 'Wellness', createdAt: new Date('2026-05-02T00:00:00Z') }),
                // Distinctive name on two different domains: the org: key is the
                // only bridge, and normalization strips 'The' and 'LLC'.
                profile({ supabaseId: 'm-1', email: 'a@gamma-example.com', company: 'Example Mind Collective', createdAt: new Date('2026-05-01T00:00:00Z') }),
                profile({ supabaseId: 'm-2', email: 'b@delta-example.com', company: 'The Example Mind Collective LLC', createdAt: new Date('2026-06-01T00:00:00Z') }),
            ],
            []
        );
        vi.mocked(prisma.employerJob.findMany).mockResolvedValue([] as never);
        wireApplications([], []);

        const { summary, organizations } = await (await callGet()).json();
        expect(summary.totalOrganizations).toBe(3);
        expect(summary.organizationsWithMultipleAccounts).toBe(1);

        const merged = organizations.find((org: any) => org.accounts.length === 2);
        expect(merged.id).toBe('m-2');
        expect(merged.accounts.map((a: any) => a.id).sort()).toEqual(['m-1', 'm-2']);

        const wellnessOrgs = organizations.filter((org: any) => org.name === 'Wellness');
        expect(wellnessOrgs).toHaveLength(2);
    });

    it('folds an orphan post with a company domain into the account organization on that domain', async () => {
        wireProfiles(
            [profile({ supabaseId: 'u-1', email: 'hr@example-clinic.com', createdAt: new Date('2026-06-01T00:00:00Z') })],
            []
        );
        vi.mocked(prisma.employerJob.findMany).mockResolvedValue([
            employerJob({
                userId: 'u-1', jobId: 'ja', employerName: 'Example Clinic', contactEmail: 'hr@example-clinic.com',
                quotaKeys: ['acct:u-1', 'dom:example-clinic.com'], createdAt: new Date('2026-06-15T00:00:00Z'),
            }),
            // Legacy orphan carrying the same company domain in quota_domain.
            employerJob({
                userId: null, jobId: 'jb', employerName: 'Example Clinic Careers', contactEmail: 'jobs@example-clinic.com',
                quotaKeys: [], quotaDomain: 'example-clinic.com', createdAt: new Date('2026-06-10T00:00:00Z'),
            }),
            // Even older orphan: no quotaDomain, only the contact email domain,
            // case-normalized.
            employerJob({
                userId: null, jobId: 'jc', employerName: 'Example Clinic', contactEmail: 'Jobs@Example-Clinic.com',
                quotaKeys: [], quotaDomain: null, createdAt: new Date('2026-06-05T00:00:00Z'),
            }),
        ] as never);
        wireApplications([], []);

        const { summary, organizations } = await (await callGet()).json();
        expect(organizations).toHaveLength(1);
        const org = organizations[0];
        expect(org.id).toBe('u-1');
        expect(org.posts.total).toBe(3);
        expect(org.accounts.map((a: any) => a.id)).toEqual(['u-1', 'no-account']);
        expect(org.accounts[0].posts.total).toBe(1);
        expect(org.accounts[1].hasAccount).toBe(false);
        expect(org.accounts[1].posts.total).toBe(2);
        // The organization has a linked account, so it is not an orphan poster.
        expect(summary.orphanPosters).toBe(0);
        expect(summary.totalOrganizations).toBe(1);
    });

    it('keeps a zero-post employer account visible as its own organization', async () => {
        wireProfiles(
            [
                profile({ supabaseId: 'z-1', email: 'solo@zeta-example.com', company: 'Zeta Example Collective', createdAt: new Date('2026-06-01T00:00:00Z') }),
                profile({ supabaseId: 'u-2', email: 'hr@omega-example.com', createdAt: new Date('2026-06-02T00:00:00Z') }),
            ],
            []
        );
        vi.mocked(prisma.employerJob.findMany).mockResolvedValue([
            employerJob({ userId: 'u-2', jobId: 'jo', quotaKeys: ['acct:u-2', 'dom:omega-example.com'], contactEmail: 'hr@omega-example.com' }),
        ] as never);
        wireApplications([], []);

        const { summary, organizations } = await (await callGet()).json();
        expect(summary.totalOrganizations).toBe(2);

        const zeroPost = organizations.find((org: any) => org.id === 'z-1');
        expect(zeroPost.posts.total).toBe(0);
        expect(zeroPost.hiringStatus).toBe('no_posts');
        expect(zeroPost.name).toBe('Zeta Example Collective');
        expect(zeroPost.accounts).toHaveLength(1);
        expect(summary.accountsNeverPosted).toBe(1);
    });
});

describe('GET /api/admin/employers — orphan identity', () => {
    it('merges account-less posts sharing a non-consumer contact domain and keeps other domains apart', async () => {
        vi.mocked(prisma.employerJob.findMany).mockResolvedValue([
            // Same contact domain, different casing and padding: one organization.
            employerJob({ userId: null, jobId: 'j1', contactEmail: 'Jobs@Legacy.ORG', quotaDomain: null, employerName: 'Legacy Clinic', createdAt: new Date('2026-07-05T00:00:00Z') }),
            employerJob({ userId: null, jobId: 'j2', contactEmail: ' jobs@legacy.org ', quotaDomain: null, employerName: 'Legacy Clinic', createdAt: new Date('2026-07-04T00:00:00Z') }),
            // A different account-less poster must not fold into it.
            employerJob({ userId: null, jobId: 'j3', contactEmail: 'hr@somewhere.com', quotaDomain: null, employerName: 'Somewhere Health', createdAt: new Date('2026-07-03T00:00:00Z') }),
        ] as never);
        wireProfiles([], []);
        wireApplications([{ jobId: 'j1', status: 'applied', n: 2 }, { jobId: 'j3', status: 'hired', n: 1 }], []);

        const { summary, organizations } = await (await callGet()).json();
        const ids = organizations.map((org: any) => org.id).sort();
        expect(ids).toEqual(['orphan:job:j1', 'orphan:job:j3']);
        expect(summary.orphanPosters).toBe(2);

        const legacy = organizations.find((org: any) => org.id === 'orphan:job:j1');
        expect(legacy.accounts).toEqual([
            expect.objectContaining({ id: 'no-account', hasAccount: false, accountCreatedAt: null }),
        ]);
        expect(legacy.posts.total).toBe(2);
        expect(legacy.applications.applied).toBe(2);
        expect(legacy.name).toBe('Legacy Clinic');

        // Applications never bleed across organizations.
        const other = organizations.find((org: any) => org.id === 'orphan:job:j3');
        expect(other.applications.total).toBe(1);
        expect(other.applications.hired).toBe(1);
        expect(summary.totalApplications).toBe(3);
    });

    it('prefers the stored quotaDomain as the anchor and normalizes its case', async () => {
        vi.mocked(prisma.employerJob.findMany).mockResolvedValue([
            employerJob({ userId: null, jobId: 'j1', contactEmail: 'a@acme.com', quotaDomain: 'ACME.com', createdAt: new Date('2026-07-02T00:00:00Z') }),
            employerJob({ userId: null, jobId: 'j2', contactEmail: 'b@acme.com', quotaDomain: 'acme.com', createdAt: new Date('2026-07-01T00:00:00Z') }),
        ] as never);
        wireProfiles([], []);
        wireApplications([], []);
        const { organizations } = await (await callGet()).json();
        expect(organizations).toHaveLength(1);
        expect(organizations[0].id).toBe('orphan:job:j1');
        expect(organizations[0].posts.total).toBe(2);
    });
});

describe('GET /api/admin/employers — empty states', () => {
    it('returns a zeroed summary and no rows when nothing exists', async () => {
        vi.mocked(prisma.employerJob.findMany).mockResolvedValue([] as never);
        wireProfiles([], []);
        wireApplications([], []);
        const { summary, organizations } = await (await callGet()).json();
        expect(organizations).toEqual([]);
        expect(Object.values(summary).every(v => v === 0)).toBe(true);
        // No posts means no reason to aggregate applications at all.
        expect(prisma.jobApplication.groupBy).not.toHaveBeenCalled();
    });

    it('lists employer accounts that never posted as zeroed no_posts organizations', async () => {
        vi.mocked(prisma.employerJob.findMany).mockResolvedValue([] as never);
        // Distinct signup domains: accounts on the SAME company domain would
        // correctly merge into one organization, which is covered above.
        wireProfiles(
            [
                profile({ supabaseId: 'u-1', email: 'one@example-one.com', company: 'One Example Clinic' }),
                profile({ supabaseId: 'u-2', email: 'two@example-two.com', firstName: 'Two', lastName: 'Person' }),
            ],
            []
        );
        wireApplications([], []);
        const { summary, organizations } = await (await callGet()).json();
        expect(organizations).toHaveLength(2);
        expect(organizations.every((org: any) => org.hiringStatus === 'no_posts')).toBe(true);
        expect(organizations.every((org: any) => org.posts.total === 0 && org.applications.total === 0)).toBe(true);
        expect(summary.totalAccounts).toBe(2);
        expect(summary.accountsNeverPosted).toBe(2);
        expect(summary.accountsWithPosts).toBe(0);
        expect(summary.orphanPosters).toBe(0);
        expect(summary.totalOrganizations).toBe(2);
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

        const { summary, organizations } = await (await callGet()).json();
        expect(summary.activePosts).toBe(2);
        expect(summary.inactivePosts).toBe(3);
        expect(summary.activePosts + summary.inactivePosts).toBe(summary.totalPosts);
        expect(organizations[0].posts.active).toBe(2);
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
        return body.organizations[0].hiringStatus;
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
        expect(body.organizations[0].applications.total).toBe(0);
        expect(body.organizations[0].applications.withdrawn).toBe(3);
        expect(body.organizations[0].hiringStatus).toBe('no_applicants');
    });
});
