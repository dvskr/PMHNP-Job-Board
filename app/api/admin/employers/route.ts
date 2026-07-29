import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';
import { logAudit } from '@/lib/audit-log';
import { captureException } from '@/lib/sentry';
import { createClient } from '@/lib/supabase/server';
import {
    TRACKED_APPLICATION_STATUSES,
    type AdminEmployerRow,
    type AdminEmployerSummary,
    type EmployerApplicationCounts,
    type EmployerHiringStatus,
    type EmployerPostCounts,
    type TrackedApplicationStatus,
} from '@/lib/admin/employer-overview-types';

/**
 * GET /api/admin/employers
 *
 * One row per employer identity: how much they posted, how many applicants
 * they received, and whether they ever triaged those applicants.
 *
 * PII: this endpoint exposes EMPLOYER contact data to an admin (which is why
 * the access is audit logged). It exposes NO candidate identity: applications
 * are only ever aggregated into counts, never listed.
 *
 * Cost: a fixed number of queries in two waves regardless of how many employers
 * exist. Nothing here loops per employer.
 */

/**
 * Never cached, never prerendered. Today this is already guaranteed transitively
 * (createClient reads cookies, which forces the route dynamic), but that is an
 * implicit side effect of the audit block rather than a stated guarantee: refactor
 * how the actor email is resolved and the marker silently disappears. The payload
 * is per-admin, audit logged, and carries employer contact data, so the guarantee
 * is pinned explicitly here, matching app/api/admin/health/route.ts.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Re-exported for callers that would rather import the contract from the route.
// Type only, so this adds nothing to any client bundle.
export type {
    AdminEmployerRow,
    AdminEmployerSummary,
    AdminEmployersResponse,
    EmployerApplicationCounts,
    EmployerHiringStatus,
    EmployerPostCounts,
} from '@/lib/admin/employer-overview-types';

const EMPLOYER_ROLE = 'employer';
const WITHDRAWN_STATUS = 'withdrawn';

const PAYMENT_PAID = 'paid';
const PAYMENT_FREE = 'free';
const PAYMENT_PENDING = 'pending';

type EmployerJobRow = {
    userId: string | null;
    jobId: string;
    employerName: string;
    contactEmail: string;
    quotaDomain: string | null;
    paymentStatus: string;
    createdAt: Date;
    job: {
        isPublished: boolean;
        expiresAt: Date | null;
        viewCount: number;
        applyClickCount: number;
    };
};

type EmployerProfileRow = {
    supabaseId: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    createdAt: Date;
};

interface EmployerAccumulator {
    id: string;
    hasAccount: boolean;
    supabaseId: string | null;
    /** employerName / contactEmail off the most recent post, used when there is no profile value. */
    fallbackName: string;
    fallbackEmail: string;
    posts: EmployerPostCounts;
    firstPostedAt: Date | null;
    lastPostedAt: Date | null;
    applications: EmployerApplicationCounts;
    views: number;
    applyClicks: number;
}

/* ─── Counting primitives ─── */

function emptyPostCounts(): EmployerPostCounts {
    return { total: 0, active: 0, inactive: 0, paid: 0, free: 0, pending: 0 };
}

function emptyApplicationCounts(): EmployerApplicationCounts {
    return {
        total: 0,
        applied: 0,
        screening: 0,
        interview: 0,
        offered: 0,
        hired: 0,
        rejected: 0,
        withdrawn: 0,
    };
}

function isTrackedStatus(status: string): status is TrackedApplicationStatus {
    return (TRACKED_APPLICATION_STATUSES as readonly string[]).includes(status);
}

/**
 * CANONICAL ACTIVE PREDICATE. Reused from lib/tier-limits.ts
 * getEmployerActivePostings (isPublished AND (expiresAt is null OR expiresAt in
 * the future)), which is the same rule behind the liveCount the employer sees on
 * their own dashboard (components/employer/EmployerDashboardClient.tsx) and
 * behind quota, candidate unlock, and InMail entitlement. Evaluated in memory
 * here because the rows are already loaded, but the semantics are identical.
 *
 * A null expiresAt means "never expires", not "expired".
 *
 * Archive and Pause both force isPublished to false in the same write, and a
 * pending post can never be published, so no archivedAt / isManuallyUnpublished
 * clause is needed: they are all covered transitively by isPublished.
 *
 * Deliberately NOT reused: lib/filters.ts buildWhereClause (no expiry clause, it
 * leans on a cron, so it over counts inside the cron lag window) and
 * lib/active-job-filter.ts activeIndexableJobWhere (adds sitemap only health
 * gates the employer cannot see, so it under counts).
 */
function isActivePost(job: EmployerJobRow['job'], now: Date): boolean {
    if (!job.isPublished) return false;
    return job.expiresAt === null || job.expiresAt.getTime() > now.getTime();
}

/**
 * Precedence is fixed and order sensitive: a hire outranks rejections, and an
 * employer only reads as 'untriaged' once every applicant is still at 'applied'.
 */
function deriveHiringStatus(
    posts: EmployerPostCounts,
    apps: EmployerApplicationCounts
): EmployerHiringStatus {
    if (posts.total === 0) return 'no_posts';
    if (apps.total === 0) return 'no_applicants';
    if (apps.hired > 0) return 'hired';

    const inFlight = apps.screening + apps.interview + apps.offered;
    if (apps.rejected > 0 && apps.applied === 0 && inFlight === 0) return 'all_rejected';
    if (inFlight > 0) return 'in_progress';

    return 'untriaged';
}

/* ─── Data loading ─── */

async function loadEmployerJobs(): Promise<EmployerJobRow[]> {
    return prisma.employerJob.findMany({
        select: {
            userId: true,
            jobId: true,
            employerName: true,
            contactEmail: true,
            quotaDomain: true,
            paymentStatus: true,
            createdAt: true,
            job: {
                select: {
                    isPublished: true,
                    expiresAt: true,
                    viewCount: true,
                    applyClickCount: true,
                },
            },
        },
        orderBy: { createdAt: 'desc' },
    });
}

const PROFILE_SELECT = {
    supabaseId: true,
    email: true,
    firstName: true,
    lastName: true,
    company: true,
    createdAt: true,
} as const;

/**
 * Applications per job, split into live buckets and a withdrawn count.
 *
 * Two groupBy queries with disjoint where clauses, so nothing is counted twice.
 * Scoped to employer posted jobs only, which keeps applications on ingested
 * (non employer) jobs out of the aggregate.
 *
 * The scoping is expressed as a RELATION filter (the application's job has an
 * employer_jobs row) rather than `jobId: { in: [...every employer job id] }`.
 * An `in` list sends one bind parameter per employer post, so it grows without
 * bound with the table: Postgres refuses a statement past 65535 bind parameters,
 * and the planner degrades well before that. The relation filter is the same set
 * of rows, resolved server side through the unique index on employer_jobs.job_id,
 * at a constant parameter count.
 */
async function loadApplicationsByJob(
    hasEmployerPosts: boolean
): Promise<Map<string, EmployerApplicationCounts>> {
    const byJob = new Map<string, EmployerApplicationCounts>();
    if (!hasEmployerPosts) return byJob;

    // Job.employerJobs is an optional to-one back relation (EmployerJob.jobId is
    // unique), so `isNot: null` reads as "this job was posted by an employer".
    const employerPostedJob = { job: { employerJobs: { isNot: null } } } as const;

    const bucketFor = (jobId: string): EmployerApplicationCounts => {
        const existing = byJob.get(jobId);
        if (existing) return existing;
        const created = emptyApplicationCounts();
        byJob.set(jobId, created);
        return created;
    };

    const [liveGroups, withdrawnGroups] = await Promise.all([
        prisma.jobApplication.groupBy({
            by: ['jobId', 'status'],
            where: { ...employerPostedJob, withdrawnAt: null },
            _count: { _all: true },
        }),
        prisma.jobApplication.groupBy({
            by: ['jobId'],
            where: { ...employerPostedJob, withdrawnAt: { not: null } },
            _count: { _all: true },
        }),
    ]);

    for (const group of liveGroups) {
        const bucket = bucketFor(group.jobId);
        const count = group._count._all;
        // Defensive: a row marked withdrawn by status but missing withdrawnAt is
        // still a withdrawal and must stay out of the live total.
        if (group.status === WITHDRAWN_STATUS) {
            bucket.withdrawn += count;
            continue;
        }
        bucket.total += count;
        if (isTrackedStatus(group.status)) bucket[group.status] += count;
    }

    for (const group of withdrawnGroups) {
        bucketFor(group.jobId).withdrawn += group._count._all;
    }

    return byJob;
}

/* ─── Folding ─── */

function orphanKey(row: EmployerJobRow): string {
    const anchor = (row.quotaDomain || row.contactEmail || '').trim().toLowerCase();
    return `orphan:${anchor || 'unknown'}`;
}

function createAccumulator(id: string, userId: string | null): EmployerAccumulator {
    return {
        id,
        hasAccount: userId !== null,
        supabaseId: userId,
        fallbackName: '',
        fallbackEmail: '',
        posts: emptyPostCounts(),
        firstPostedAt: null,
        lastPostedAt: null,
        applications: emptyApplicationCounts(),
        views: 0,
        applyClicks: 0,
    };
}

function addApplications(target: EmployerApplicationCounts, source: EmployerApplicationCounts): void {
    target.total += source.total;
    target.applied += source.applied;
    target.screening += source.screening;
    target.interview += source.interview;
    target.offered += source.offered;
    target.hired += source.hired;
    target.rejected += source.rejected;
    target.withdrawn += source.withdrawn;
}

function applyPostToAccumulator(
    acc: EmployerAccumulator,
    row: EmployerJobRow,
    applicationsByJob: Map<string, EmployerApplicationCounts>,
    now: Date
): void {
    acc.posts.total += 1;
    if (isActivePost(row.job, now)) acc.posts.active += 1;
    else acc.posts.inactive += 1;

    if (row.paymentStatus === PAYMENT_PAID) acc.posts.paid += 1;
    else if (row.paymentStatus === PAYMENT_FREE) acc.posts.free += 1;
    else if (row.paymentStatus === PAYMENT_PENDING) acc.posts.pending += 1;
    // Any other lifecycle value (a refund or dispute, for example) still counts
    // in total but is not claimed as paid.

    if (!acc.firstPostedAt || row.createdAt < acc.firstPostedAt) acc.firstPostedAt = row.createdAt;
    if (!acc.lastPostedAt || row.createdAt >= acc.lastPostedAt) {
        acc.lastPostedAt = row.createdAt;
        acc.fallbackName = row.employerName;
        acc.fallbackEmail = row.contactEmail;
    }

    acc.views += row.job.viewCount;
    acc.applyClicks += row.job.applyClickCount;

    // EmployerJob.jobId is unique, so each job's applications land on exactly one
    // employer identity. That is what keeps counts from multiplying across joins.
    const apps = applicationsByJob.get(row.jobId);
    if (apps) addApplications(acc.applications, apps);
}

/**
 * Identity rule: posts with a userId group by that userId. Posts without one
 * group under a synthetic orphan key so legacy account-less posts stay visible.
 *
 * Known and intentional drift: the employer dashboard resolves ownership by
 * userId OR contactEmail (app/employer/dashboard/page.tsx), so a userId null row
 * whose contactEmail matches a live account shows on that employer's own
 * dashboard yet appears here as an orphan. The admin grouping is deliberately
 * NOT widened to contactEmail, because the email fallback was narrowed on
 * purpose to close an impersonation surface (toggle-publish route).
 */
function foldEmployerJobs(
    rows: EmployerJobRow[],
    applicationsByJob: Map<string, EmployerApplicationCounts>,
    now: Date
): Map<string, EmployerAccumulator> {
    const groups = new Map<string, EmployerAccumulator>();

    for (const row of rows) {
        const key = row.userId ?? orphanKey(row);
        let acc = groups.get(key);
        if (!acc) {
            acc = createAccumulator(key, row.userId);
            groups.set(key, acc);
        }
        applyPostToAccumulator(acc, row, applicationsByJob, now);
    }

    return groups;
}

/* ─── Row shaping ─── */

function resolveName(acc: EmployerAccumulator, profile: EmployerProfileRow | undefined): string {
    const company = profile?.company?.trim();
    if (company) return company;
    if (acc.fallbackName.trim()) return acc.fallbackName.trim();

    const contactName = `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim();
    if (contactName) return contactName;

    return profile?.email || acc.fallbackEmail || 'Unknown employer';
}

function toEmployerRow(
    acc: EmployerAccumulator,
    profile: EmployerProfileRow | undefined
): AdminEmployerRow {
    return {
        id: acc.id,
        hasAccount: acc.hasAccount,
        name: resolveName(acc, profile),
        email: profile?.email || acc.fallbackEmail || '',
        accountCreatedAt: profile?.createdAt.toISOString() ?? null,
        posts: acc.posts,
        firstPostedAt: acc.firstPostedAt?.toISOString() ?? null,
        lastPostedAt: acc.lastPostedAt?.toISOString() ?? null,
        applications: acc.applications,
        hiringStatus: deriveHiringStatus(acc.posts, acc.applications),
        views: acc.views,
        applyClicks: acc.applyClicks,
    };
}

/**
 * Most actionable first: employers sitting on untriaged applicants, then the
 * busiest, then most recent activity, then alphabetical so the order is stable.
 */
function compareRows(a: AdminEmployerRow, b: AdminEmployerRow): number {
    if (b.applications.applied !== a.applications.applied) {
        return b.applications.applied - a.applications.applied;
    }
    if (b.applications.total !== a.applications.total) {
        return b.applications.total - a.applications.total;
    }
    if (b.posts.total !== a.posts.total) return b.posts.total - a.posts.total;

    const aLast = a.lastPostedAt ?? '';
    const bLast = b.lastPostedAt ?? '';
    if (aLast !== bLast) return bLast.localeCompare(aLast);

    return a.name.localeCompare(b.name);
}

/**
 * @param employerAccountIds supabaseIds of every UserProfile with role
 * 'employer'. This is the population totalAccounts counts, and it is what
 * accountsWithPosts / accountsNeverPosted must partition.
 */
function buildSummary(
    rows: AdminEmployerRow[],
    employerAccountIds: ReadonlySet<string>
): AdminEmployerSummary {
    // Scoped to employer role accounts, NOT to every row that happens to carry a
    // userId. A post can be linked to a profile whose role is not 'employer':
    // the OAuth signup path defaulted real employers to 'job_seeker' until the
    // profile route learned to upgrade them, so those posters exist in prod
    // today. They still get their own row (nothing is hidden), but counting them
    // here while totalAccounts cannot see them made accountsWithPosts +
    // accountsNeverPosted overshoot totalAccounts, i.e. the summary strip could
    // read "Accounts With Posts 12" above "Employer Accounts 10".
    //
    // accountsNeverPosted was already implicitly employer-role scoped (only
    // employer-role profiles are seeded as zero-post rows), so scoping its
    // counterpart the same way is what makes the three numbers agree. Every
    // employer-role profile lands in exactly one row, either from the fold or
    // from the zero-post seeding, so the partition is exact.
    const accountRows = rows.filter(row => employerAccountIds.has(row.id));
    const sum = (pick: (row: AdminEmployerRow) => number): number =>
        rows.reduce((running, row) => running + pick(row), 0);

    return {
        totalAccounts: employerAccountIds.size,
        accountsWithPosts: accountRows.filter(row => row.posts.total > 0).length,
        accountsNeverPosted: accountRows.filter(row => row.posts.total === 0).length,
        orphanPosters: rows.filter(row => !row.hasAccount).length,
        totalPosts: sum(row => row.posts.total),
        activePosts: sum(row => row.posts.active),
        inactivePosts: sum(row => row.posts.inactive),
        paidPosts: sum(row => row.posts.paid),
        freePosts: sum(row => row.posts.free),
        pendingCheckouts: sum(row => row.posts.pending),
        totalApplications: sum(row => row.applications.total),
        untriagedApplications: sum(row => row.applications.applied),
        employersWithUntriaged: rows.filter(row => row.applications.applied > 0).length,
    };
}

/* ─── Handler ─── */

export async function GET(request: NextRequest) {
    // Verify admin session
    const authError = await requireApiAdmin(request);
    if (authError) return authError;

    // Audit log: admin accessing employer account data
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    void logAudit({
        action: 'admin.employers.list',
        actorType: 'admin',
        metadata: { email: user?.email || 'unknown' },
    });

    try {
        const now = new Date();

        // Wave 1: every employer post, and every employer role account.
        const [employerJobs, employerProfiles] = await Promise.all([
            loadEmployerJobs(),
            prisma.userProfile.findMany({
                where: { role: EMPLOYER_ROLE },
                select: PROFILE_SELECT,
                orderBy: { createdAt: 'desc' },
            }),
        ]);

        const profilesById = new Map<string, EmployerProfileRow>(
            employerProfiles.map(profile => [profile.supabaseId, profile])
        );

        // A post can be linked to a profile whose role is no longer 'employer'.
        // One bounded extra query recovers those names, never one per employer.
        const unresolvedIds = [
            ...new Set(
                employerJobs
                    .map(row => row.userId)
                    .filter((id): id is string => id !== null && !profilesById.has(id))
            ),
        ];

        // Wave 2: application aggregates plus any profile the first wave missed.
        const [applicationsByJob, extraProfiles] = await Promise.all([
            loadApplicationsByJob(employerJobs.length > 0),
            unresolvedIds.length > 0
                ? prisma.userProfile.findMany({
                      where: { supabaseId: { in: unresolvedIds } },
                      select: PROFILE_SELECT,
                  })
                : Promise.resolve([] as EmployerProfileRow[]),
        ]);

        for (const profile of extraProfiles) profilesById.set(profile.supabaseId, profile);

        const groups = foldEmployerJobs(employerJobs, applicationsByJob, now);

        // Employer accounts that never posted are a real funnel leak, so they
        // appear as zeroed rows rather than being dropped.
        const employerAccountIds = new Set<string>();
        for (const profile of employerProfiles) {
            employerAccountIds.add(profile.supabaseId);
            if (groups.has(profile.supabaseId)) continue;
            groups.set(profile.supabaseId, createAccumulator(profile.supabaseId, profile.supabaseId));
        }

        const employers = [...groups.values()]
            .map(acc => toEmployerRow(acc, acc.supabaseId ? profilesById.get(acc.supabaseId) : undefined))
            .sort(compareRows);

        return NextResponse.json({
            success: true,
            summary: buildSummary(employers, employerAccountIds),
            employers,
        });
    } catch (error) {
        // console.* is compiled out of production builds (next.config.ts
        // compiler.removeConsole), and Sentry only auto-captures UNHANDLED
        // errors, so a caught failure here would otherwise be completely silent
        // in production: the client gates on `success`, so the admin just sees
        // an empty table with no server-side record of why. Report it
        // explicitly. The error object never reaches the client.
        captureException(error, { tags: { route: 'api/admin/employers' } });
        console.error('[Admin Employers] Error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch employer data' },
            { status: 500 }
        );
    }
}
