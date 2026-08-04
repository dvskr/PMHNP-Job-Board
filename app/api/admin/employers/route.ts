import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireApiAdmin } from '@/lib/auth/require-api-admin';
import { logAudit } from '@/lib/audit-log';
import { captureException } from '@/lib/sentry';
import { createClient } from '@/lib/supabase/server';
import {
    TRACKED_APPLICATION_STATUSES,
    type EmployerApplicationCounts,
    type TrackedApplicationStatus,
} from '@/lib/admin/employer-overview-types';
import {
    buildOrganizations,
    buildSummary,
    emptyApplicationCounts,
    type EmployerJobRow,
    type EmployerProfileRow,
} from '@/lib/admin/employer-organizations';

/**
 * GET /api/admin/employers
 *
 * One row per ORGANIZATION: the connected component of employer accounts and
 * posts that share ANY quota identity key (lib/employer-quota.ts). This is the
 * same grouping the free post quota gate applies, so the table explains quota
 * decisions instead of contradicting them. The real case that forced this:
 * one clinic, one mail domain, two accounts. Account A posted the free job and
 * received every application; account B was routed to paid precisely because
 * the quota already saw both accounts as one organization. A per-account table
 * showed B as an unrelated zero-application row. Here they are one row, with
 * the per-account story nested under it.
 *
 * The grouping, folding, and shaping logic lives in
 * lib/admin/employer-organizations.ts; this route only loads rows, delegates,
 * and guards access.
 *
 * PII: this endpoint exposes EMPLOYER contact data to an admin (which is why
 * the access is audit logged). It exposes NO candidate identity: applications
 * are only ever aggregated into counts, never listed.
 *
 * Cost: a fixed number of queries in two waves regardless of how many
 * employers exist, then an in-memory union-find. Nothing loops per employer.
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
    AdminEmployersResponse,
    AdminEmployerSummary,
    AdminOrganizationAccount,
    AdminOrganizationRow,
    EmployerApplicationCounts,
    EmployerHiringStatus,
    EmployerPostCounts,
} from '@/lib/admin/employer-overview-types';

const EMPLOYER_ROLE = 'employer';
const WITHDRAWN_STATUS = 'withdrawn';

function isTrackedStatus(status: string): status is TrackedApplicationStatus {
    return (TRACKED_APPLICATION_STATUSES as readonly string[]).includes(status);
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
            quotaKeys: true,
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

        const organizations = buildOrganizations(
            employerProfiles,
            employerJobs,
            applicationsByJob,
            profilesById,
            now
        );

        const employerAccountIds = new Set(employerProfiles.map(profile => profile.supabaseId));
        const postedUserIds = new Set(
            employerJobs.map(row => row.userId).filter((id): id is string => id !== null)
        );

        return NextResponse.json({
            success: true,
            summary: buildSummary(organizations, employerAccountIds, postedUserIds),
            organizations,
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
