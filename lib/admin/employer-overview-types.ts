/**
 * Shared types for the admin employers table, grouped by ORGANIZATION.
 *
 * Producer: app/api/admin/employers/route.ts (GET)
 * Consumer: app/admin/employers/page.tsx
 *
 * These live outside the route file on purpose. A client page that imports from
 * a route.ts pulls that module into the client graph unless every import site
 * remembers `import type`, so the contract lives here instead. The route
 * re-exports these names as types for convenience.
 *
 * An ORGANIZATION is the connected component of employer accounts and posts
 * that share ANY quota identity key, using the exact key semantics of
 * lib/employer-quota.ts (buildQuotaKeys, orgKeyFromCompanyName,
 * domainFromEmail). That is the same rule the free post quota gate applies, so
 * this table always tells the same story the gate does: when two accounts on
 * one company mail domain count as one organization for quota purposes, they
 * are one row here, with the per-account breakdown nested under it.
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
 * Where an organization stands on the candidates it has received.
 *
 * 'untriaged' is the load bearing one: applicants exist and every single one is
 * still sitting at 'applied', meaning nobody has ever opened the pipeline.
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
    /**
     * paymentStatus 'refunded'. Any other lifecycle value the Stripe webhook
     * writes (a dispute, for example) still counts only toward `total`.
     */
    refunded: number;
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

/**
 * One member of an organization: a real employer account, or the single
 * account-less segment that carries the organization's legacy orphan posts.
 */
export interface AdminOrganizationAccount {
    /**
     * For a real account this is the Supabase auth id (UserProfile.supabaseId),
     * because EmployerJob.userId references supabaseId. It is NOT the same
     * identifier that /api/admin/users calls `id` (that one is the UserProfile
     * CUID) and it cannot be passed to /api/admin/users/[id].
     * For the account-less segment it is the literal 'no-account', unique only
     * within its organization.
     */
    id: string;
    /** False only for the account-less poster segment. */
    hasAccount: boolean;
    email: string;
    /** Account identity first: company, then the most recent post's name. */
    name: string;
    accountCreatedAt: string | null;
    posts: EmployerPostCounts;
    applications: EmployerApplicationCounts;
}

export interface AdminOrganizationRow {
    /**
     * Opaque and unique per row: the newest member account's Supabase auth id
     * when the organization has any account, else 'orphan:job:<jobId of the
     * most recent post>'. Never a UserProfile CUID; do not pass it to
     * /api/admin/users/[id].
     */
    id: string;
    /**
     * The organization wears the name it most recently posted under: the
     * employerName of the most recent post, else the newest account's company,
     * then contact name, then email.
     */
    name: string;
    /**
     * Every distinct post employerName and account company in the component,
     * deduped case insensitively, post names newest first. One clinic posting
     * under two brands shows both here.
     */
    allNames: string[];
    /** Representative contact email: newest account, else the most recent post. */
    email: string;
    /** Exact sum over `accounts`, so the row can never disagree with its own breakdown. */
    posts: EmployerPostCounts;
    firstPostedAt: string | null;
    lastPostedAt: string | null;
    /** Exact sum over `accounts`. Withdrawn stays out of `total`, as always. */
    applications: EmployerApplicationCounts;
    /** Computed org-wide from the summed counts, same precedence as before. */
    hiringStatus: EmployerHiringStatus;
    /** Sum of Job.viewCount across every post in the organization. */
    views: number;
    /** Sum of Job.applyClickCount. Naturally zero for on platform apply jobs. */
    applyClicks: number;
    /** Real accounts newest first, then the account-less segment last. */
    accounts: AdminOrganizationAccount[];
}

export interface AdminEmployerSummary {
    /** UserProfile rows with role 'employer'. Account-level, unchanged meaning. */
    totalAccounts: number;
    /** Employer-role accounts with at least one post. Partitions totalAccounts with the next field. */
    accountsWithPosts: number;
    accountsNeverPosted: number;
    /** Organizations that have posts but no linked account at all. */
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
    /**
     * Organizations sitting on at least one untriaged applicant. Counted at the
     * organization level so the stat tile and the table's 'has_untriaged'
     * filter always describe the same population of rows.
     */
    employersWithUntriaged: number;
    /** One per connected component of shared quota identity keys. */
    totalOrganizations: number;
    /** Organizations where two or more real accounts share one identity. */
    organizationsWithMultipleAccounts: number;
}

export interface AdminEmployersResponse {
    success: true;
    summary: AdminEmployerSummary;
    organizations: AdminOrganizationRow[];
}
