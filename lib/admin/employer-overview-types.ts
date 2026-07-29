/**
 * Shared types for the admin employer accounts table.
 *
 * Producer: app/api/admin/employers/route.ts (GET)
 * Consumer: app/admin/employers/page.tsx
 *
 * These live outside the route file on purpose. A client page that imports from
 * a route.ts pulls that module into the client graph unless every import site
 * remembers `import type`, so the contract lives here instead. The route
 * re-exports these names as types for convenience.
 *
 * Nothing in this file is a metric or a measurement. Every number in the
 * response is computed live from the database on each request.
 */

/**
 * Application statuses the employer ATS actually moves a candidate through.
 * Mirrors the documented `JobApplication.status` values in prisma/schema.prisma.
 * 'withdrawn' is deliberately NOT here: a withdrawal is a candidate action, it
 * is reported separately and never counts toward a live applicant total.
 */
export const TRACKED_APPLICATION_STATUSES = [
    'applied',
    'screening',
    'interview',
    'offered',
    'hired',
    'rejected',
] as const;

export type TrackedApplicationStatus = (typeof TRACKED_APPLICATION_STATUSES)[number];

/**
 * Where an employer stands on the candidates they have received.
 *
 * 'untriaged' is the load bearing one: applicants exist and every single one is
 * still sitting at 'applied', meaning the employer has never opened the pipeline.
 */
export type EmployerHiringStatus =
    | 'no_posts'
    | 'no_applicants'
    | 'untriaged'
    | 'in_progress'
    | 'all_rejected'
    | 'hired';

export interface EmployerPostCounts {
    total: number;
    /**
     * Live right now, using the canonical predicate reused from
     * lib/tier-limits.ts getEmployerActivePostings.
     */
    active: number;
    inactive: number;
    /** paymentStatus 'paid'. */
    paid: number;
    /** paymentStatus 'free'. */
    free: number;
    /** paymentStatus 'pending': checkout started, never completed. Not paid. */
    pending: number;
}

export interface EmployerApplicationCounts {
    /** Excludes withdrawn applications. */
    total: number;
    applied: number;
    screening: number;
    interview: number;
    offered: number;
    hired: number;
    rejected: number;
    /** Reported for context, never included in `total`. */
    withdrawn: number;
}

export interface AdminEmployerRow {
    /**
     * For an account backed row this is the Supabase auth id (UserProfile.supabaseId),
     * because EmployerJob.userId references supabaseId. It is NOT the same
     * identifier that /api/admin/users calls `id` (that one is the UserProfile
     * CUID) and it cannot be passed to /api/admin/users/[id].
     * For an account-less poster this is 'orphan:<quotaDomain or contactEmail>'.
     */
    id: string;
    hasAccount: boolean;
    name: string;
    email: string;
    accountCreatedAt: string | null;
    posts: EmployerPostCounts;
    firstPostedAt: string | null;
    lastPostedAt: string | null;
    applications: EmployerApplicationCounts;
    hiringStatus: EmployerHiringStatus;
    /** Sum of Job.viewCount across this employer's posts. */
    views: number;
    /** Sum of Job.applyClickCount. Naturally zero for on platform apply jobs. */
    applyClicks: number;
}

export interface AdminEmployerSummary {
    /** UserProfile rows with role 'employer'. */
    totalAccounts: number;
    accountsWithPosts: number;
    accountsNeverPosted: number;
    /** Distinct employer identities that have posts but no linked account. */
    orphanPosters: number;
    totalPosts: number;
    activePosts: number;
    inactivePosts: number;
    paidPosts: number;
    freePosts: number;
    /** Checkouts started and never completed. These are not paid posts. */
    pendingCheckouts: number;
    /** Excludes withdrawn applications. */
    totalApplications: number;
    /** Applications still sitting at 'applied'. */
    untriagedApplications: number;
    /** Employer identities sitting on at least one untriaged applicant. */
    employersWithUntriaged: number;
}

export interface AdminEmployersResponse {
    success: true;
    summary: AdminEmployerSummary;
    employers: AdminEmployerRow[];
}
