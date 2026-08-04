/**
 * Organization grouping and folding for the admin employers view.
 *
 * Pure in-memory logic, no I/O: app/api/admin/employers/route.ts loads the
 * rows and this module turns them into AdminOrganizationRow aggregates.
 *
 * An organization is the connected component of employer accounts and posts
 * that share ANY quota identity key. The keys are EXACTLY the ones the free
 * post quota gate stores and compares (lib/employer-quota.ts buildQuotaKeys /
 * quotaKeysOverlap): acct:<supabase id>, dom:<non-consumer signup domain>,
 * org:<normalized locked company name>. Reusing those semantics is the whole
 * point: when the gate routes a clinic's second account to paid because their
 * identity keys overlap, the admin table must show ONE organization telling
 * that story, not a second grouping rule that disagrees with the gate.
 *
 * The per-account era deliberately refused to group by raw contactEmail
 * because the email ownership fallback was narrowed on purpose to close an
 * impersonation surface (toggle-publish route), and that rationale still holds
 * here: contactEmail is unverified form input, so it NEVER participates
 * directly. For legacy rows with no stored keys, only its DOMAIN is used, only
 * after the same consumer-provider screen the quota gate applies (a shared
 * gmail.com must not fuse strangers), and a row with no usable domain at all
 * gets a synthetic per-row key so it stands alone rather than vanishing or
 * merging blindly.
 */
import { buildQuotaKeys, domainFromEmail } from '@/lib/employer-quota';
import type {
    AdminEmployerSummary,
    AdminOrganizationAccount,
    AdminOrganizationRow,
    EmployerApplicationCounts,
    EmployerHiringStatus,
    EmployerPostCounts,
} from '@/lib/admin/employer-overview-types';

const PAYMENT_PAID = 'paid';
const PAYMENT_FREE = 'free';
const PAYMENT_PENDING = 'pending';
const PAYMENT_REFUNDED = 'refunded';

/** Account id of the per-organization segment that holds userId NULL posts. */
const NO_ACCOUNT_ID = 'no-account';

export type EmployerJobRow = {
    userId: string | null;
    jobId: string;
    employerName: string;
    contactEmail: string;
    quotaDomain: string | null;
    quotaKeys: string[];
    paymentStatus: string;
    createdAt: Date;
    job: {
        isPublished: boolean;
        expiresAt: Date | null;
        viewCount: number;
        applyClickCount: number;
    };
};

export type EmployerProfileRow = {
    supabaseId: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    createdAt: Date;
};

interface AccountAccumulator {
    id: string;
    hasAccount: boolean;
    profile: EmployerProfileRow | undefined;
    /** employerName / contactEmail off the account's most recent post. */
    fallbackName: string;
    fallbackEmail: string;
    posts: EmployerPostCounts;
    firstPostedAt: Date | null;
    lastPostedAt: Date | null;
    applications: EmployerApplicationCounts;
    views: number;
    applyClicks: number;
}

/** Profiles and posts that share a union-find root: one organization. */
interface OrganizationComponent {
    profiles: EmployerProfileRow[];
    posts: EmployerJobRow[];
}

/* ─── Counting primitives ─── */

export function emptyPostCounts(): EmployerPostCounts {
    return { total: 0, active: 0, inactive: 0, paid: 0, free: 0, pending: 0, refunded: 0 };
}

export function emptyApplicationCounts(): EmployerApplicationCounts {
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
 * organization only reads as 'untriaged' once every applicant is still at
 * 'applied'.
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

/* ─── Union-find over quota identity keys ─── */

function createUnionFind(size: number): {
    find: (node: number) => number;
    union: (a: number, b: number) => void;
} {
    const parent = Array.from({ length: size }, (_, index) => index);

    function find(node: number): number {
        let root = node;
        while (parent[root] !== root) root = parent[root];
        // Path compression keeps repeated finds effectively constant time.
        let current = node;
        while (parent[current] !== root) {
            const next = parent[current];
            parent[current] = root;
            current = next;
        }
        return root;
    }

    function union(a: number, b: number): void {
        const rootA = find(a);
        const rootB = find(b);
        if (rootA !== rootB) parent[rootB] = rootA;
    }

    return { find, union };
}

/**
 * EXACTLY the keys the quota gate would compute for this account's next post.
 * The library guarantees the safety properties this view relies on: consumer
 * signup domains emit NO dom: key and generic or too-short company names emit
 * NO org: key, so two gmail strangers or two clinics both named "Wellness"
 * never merge. Do not re-derive any of that here.
 */
function profileNodeKeys(profile: EmployerProfileRow): string[] {
    return buildQuotaKeys({
        userId: profile.supabaseId,
        signupEmail: profile.email,
        lockedCompanyName: profile.company,
    });
}

/**
 * 'dom:' key from a stored bare domain (EmployerJob.quotaDomain), or null.
 *
 * Routed through domainFromEmail via a synthetic mailbox so the exact same
 * malformed-input handling and consumer-provider screen applies as everywhere
 * else on the quota surface (trailing dots stripped, must contain a dot,
 * FREE_EMAIL_DOMAINS excluded). The screen is load bearing: the 2026-05-01
 * backfill wrote quota_domain from a raw split of contact_email with no
 * consumer check, and migration 20260727d stripped consumer dom: keys from
 * quota_keys but left quota_domain itself untouched, so a legacy free orphan
 * can still carry quotaDomain 'gmail.com'. Without this screen two unrelated
 * gmail posters would merge into one organization.
 */
function domainKeyFromStoredDomain(quotaDomain: string | null): string | null {
    const raw = quotaDomain?.trim();
    if (!raw) return null;
    const domain = domainFromEmail(`probe@${raw}`);
    return domain ? `dom:${domain}` : null;
}

/**
 * A stored key, screened. Non-dom: keys pass through untouched. A dom: key is
 * routed through the same normalization and consumer screen as everywhere else
 * on the quota surface, because the stored arrays still carry pre-hygiene junk:
 * migration 20260727d stripped consumer dom: keys by EXACT string match, so a
 * key like 'dom:gmail.com.' (trailing dot, from the raw 20260501 backfill of
 * quota_domain) survived it, and manual rows were never guaranteed clean.
 * Such a key is inert at the quota gate (buildQuotaKeys normalizes and screens,
 * so no poster's computed keys can ever match it), which means merging two rows
 * on it would connect strangers the gate itself would never connect. Consumer
 * junk is dropped; a valid domain with trailing-dot junk normalizes to the
 * exact key the gate would compute for it.
 */
function screenStoredKey(key: string): string | null {
    const trimmed = key.trim();
    if (!trimmed) return null;
    if (!trimmed.startsWith('dom:')) return trimmed;
    return domainKeyFromStoredDomain(trimmed.slice('dom:'.length));
}

/**
 * Grouping keys for a post row.
 *
 * Stored quotaKeys are authoritative: they are what the quota gate actually
 * compares against this row. Ownership is itself a quota key (buildQuotaKeys
 * emits acct:<userId> for the poster), so it is added defensively even though
 * every post-migration row already stores it; that keeps a post attached to
 * its posting account in every data era.
 *
 * Legacy rows with no usable stored keys fall back in order: the stored
 * quotaDomain, then the contact email's domain, both through the consumer
 * screen; a row with neither gets a synthetic per-row key and stands alone.
 */
function postNodeKeys(row: EmployerJobRow): string[] {
    const keys = new Set<string>();
    for (const storedKey of row.quotaKeys) {
        const screened = screenStoredKey(storedKey);
        if (screened) keys.add(screened);
    }
    if (row.userId && row.userId.trim()) {
        keys.add(`acct:${row.userId.trim().toLowerCase()}`);
    }
    if (keys.size > 0) return [...keys];

    const storedDomainKey = domainKeyFromStoredDomain(row.quotaDomain);
    if (storedDomainKey) return [storedDomainKey];

    const contactDomain = domainFromEmail(row.contactEmail);
    if (contactDomain) return [`dom:${contactDomain}`];

    // No verified signal at all: the orphan stands alone.
    return [`post:${row.jobId}`];
}

/**
 * Union-find across every employer-role profile and every post row. Nodes that
 * share any key collapse into one component; each component is one
 * organization. Employer accounts that never posted are nodes too, so the
 * never-posted cohort stays visible (a real funnel leak) either as its own
 * organization or folded into the component its keys connect it to.
 */
function groupIntoComponents(
    profiles: EmployerProfileRow[],
    posts: EmployerJobRow[]
): OrganizationComponent[] {
    const uf = createUnionFind(profiles.length + posts.length);
    const keyOwner = new Map<string, number>();

    const claim = (node: number, keys: readonly string[]): void => {
        for (const key of keys) {
            const owner = keyOwner.get(key);
            if (owner === undefined) keyOwner.set(key, node);
            else uf.union(owner, node);
        }
    };

    profiles.forEach((profile, index) => claim(index, profileNodeKeys(profile)));
    posts.forEach((row, index) => claim(profiles.length + index, postNodeKeys(row)));

    const components = new Map<number, OrganizationComponent>();
    const componentFor = (node: number): OrganizationComponent => {
        const root = uf.find(node);
        const existing = components.get(root);
        if (existing) return existing;
        const created: OrganizationComponent = { profiles: [], posts: [] };
        components.set(root, created);
        return created;
    };

    profiles.forEach((profile, index) => componentFor(index).profiles.push(profile));
    posts.forEach((row, index) => componentFor(profiles.length + index).posts.push(row));

    return [...components.values()];
}

/* ─── Folding ─── */

function createAccountAccumulator(
    id: string,
    hasAccount: boolean,
    profile: EmployerProfileRow | undefined
): AccountAccumulator {
    return {
        id,
        hasAccount,
        profile,
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

function addPostCounts(target: EmployerPostCounts, source: EmployerPostCounts): void {
    target.total += source.total;
    target.active += source.active;
    target.inactive += source.inactive;
    target.paid += source.paid;
    target.free += source.free;
    target.pending += source.pending;
    target.refunded += source.refunded;
}

function applyPostToAccumulator(
    acc: AccountAccumulator,
    row: EmployerJobRow,
    applicationsByJob: ReadonlyMap<string, EmployerApplicationCounts>,
    now: Date
): void {
    acc.posts.total += 1;
    if (isActivePost(row.job, now)) acc.posts.active += 1;
    else acc.posts.inactive += 1;

    if (row.paymentStatus === PAYMENT_PAID) acc.posts.paid += 1;
    else if (row.paymentStatus === PAYMENT_FREE) acc.posts.free += 1;
    else if (row.paymentStatus === PAYMENT_PENDING) acc.posts.pending += 1;
    else if (row.paymentStatus === PAYMENT_REFUNDED) acc.posts.refunded += 1;
    // Any other lifecycle value (a dispute, for example) still counts in total
    // but is not claimed by any bucket.

    if (!acc.firstPostedAt || row.createdAt < acc.firstPostedAt) acc.firstPostedAt = row.createdAt;
    if (!acc.lastPostedAt || row.createdAt >= acc.lastPostedAt) {
        acc.lastPostedAt = row.createdAt;
        acc.fallbackName = row.employerName;
        acc.fallbackEmail = row.contactEmail;
    }

    acc.views += row.job.viewCount;
    acc.applyClicks += row.job.applyClickCount;

    // EmployerJob.jobId is unique, so each job's applications land on exactly
    // one account and therefore exactly one organization. That is what keeps
    // counts from multiplying across joins.
    const apps = applicationsByJob.get(row.jobId);
    if (apps) addApplications(acc.applications, apps);
}

/** Real accounts newest first (unknown creation last), orphan segment at the end. */
function compareAccounts(a: AccountAccumulator, b: AccountAccumulator): number {
    if (a.hasAccount !== b.hasAccount) return a.hasAccount ? -1 : 1;
    const aCreated = a.profile?.createdAt.getTime() ?? Number.NEGATIVE_INFINITY;
    const bCreated = b.profile?.createdAt.getTime() ?? Number.NEGATIVE_INFINITY;
    if (aCreated !== bCreated) return bCreated - aCreated;
    return a.id.localeCompare(b.id);
}

/**
 * Fold a component's posts onto per-account accumulators. Every employer-role
 * profile in the component gets an entry even with zero posts; posts by a
 * profile whose role drifted away from 'employer' still land on that account
 * (recovered by the route's bounded wave-2 query); userId NULL posts collect
 * on the single account-less segment.
 */
function foldComponentAccounts(
    component: OrganizationComponent,
    applicationsByJob: ReadonlyMap<string, EmployerApplicationCounts>,
    profilesById: ReadonlyMap<string, EmployerProfileRow>,
    now: Date
): AccountAccumulator[] {
    const accounts = new Map<string, AccountAccumulator>();

    for (const profile of component.profiles) {
        accounts.set(profile.supabaseId, createAccountAccumulator(profile.supabaseId, true, profile));
    }

    for (const row of component.posts) {
        const accountId = row.userId ?? NO_ACCOUNT_ID;
        let account = accounts.get(accountId);
        if (!account) {
            account = createAccountAccumulator(
                accountId,
                row.userId !== null,
                row.userId !== null ? profilesById.get(row.userId) : undefined
            );
            accounts.set(accountId, account);
        }
        applyPostToAccumulator(account, row, applicationsByJob, now);
    }

    return [...accounts.values()].sort(compareAccounts);
}

/* ─── Row shaping ─── */

function latestPostOf(posts: readonly EmployerJobRow[]): EmployerJobRow | undefined {
    let latest: EmployerJobRow | undefined;
    for (const row of posts) {
        if (!latest || row.createdAt > latest.createdAt) latest = row;
    }
    return latest;
}

/** Account identity: company first, then the account's own most recent post name. */
function resolveAccountName(account: AccountAccumulator): string {
    const company = account.profile?.company?.trim();
    if (company) return company;
    if (account.fallbackName.trim()) return account.fallbackName.trim();

    const contactName = `${account.profile?.firstName ?? ''} ${account.profile?.lastName ?? ''}`.trim();
    if (contactName) return contactName;

    return account.profile?.email || account.fallbackEmail || 'Unknown employer';
}

/**
 * Organization identity: the name it most recently posted under, THEN account
 * attributes. Inverted from the account-level order on purpose: an org that
 * posts under one brand should read as that brand even when the newest account
 * signed up under a different legal name (allNames carries the rest).
 */
function resolveOrganizationName(
    latestPost: EmployerJobRow | undefined,
    newestAccount: AccountAccumulator | undefined
): string {
    const postName = latestPost?.employerName.trim();
    if (postName) return postName;

    const profile = newestAccount?.profile;
    const company = profile?.company?.trim();
    if (company) return company;

    const contactName = `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim();
    if (contactName) return contactName;

    return profile?.email || newestAccount?.fallbackEmail || latestPost?.contactEmail.trim() || 'Unknown employer';
}

/** Distinct names across the component: post names newest first, then companies. */
function collectNames(
    posts: readonly EmployerJobRow[],
    accounts: readonly AccountAccumulator[]
): string[] {
    const names: string[] = [];
    const seen = new Set<string>();
    const push = (raw: string | null | undefined): void => {
        const name = raw?.trim();
        if (!name) return;
        const key = name.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        names.push(name);
    };

    const newestFirst = [...posts].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    for (const row of newestFirst) push(row.employerName);
    for (const account of accounts) push(account.profile?.company);
    return names;
}

function toAccountRow(account: AccountAccumulator): AdminOrganizationAccount {
    return {
        id: account.id,
        hasAccount: account.hasAccount,
        email: account.profile?.email || account.fallbackEmail || '',
        name: resolveAccountName(account),
        accountCreatedAt: account.profile?.createdAt.toISOString() ?? null,
        posts: account.posts,
        applications: account.applications,
    };
}

function buildOrganization(
    component: OrganizationComponent,
    applicationsByJob: ReadonlyMap<string, EmployerApplicationCounts>,
    profilesById: ReadonlyMap<string, EmployerProfileRow>,
    now: Date
): AdminOrganizationRow {
    const accounts = foldComponentAccounts(component, applicationsByJob, profilesById, now);

    // Org totals are the exact sum of the account breakdown, so the row can
    // never disagree with its own expanded subrows.
    const posts = emptyPostCounts();
    const applications = emptyApplicationCounts();
    let views = 0;
    let applyClicks = 0;
    let firstPostedAt: Date | null = null;
    let lastPostedAt: Date | null = null;
    for (const account of accounts) {
        addPostCounts(posts, account.posts);
        addApplications(applications, account.applications);
        views += account.views;
        applyClicks += account.applyClicks;
        if (account.firstPostedAt && (!firstPostedAt || account.firstPostedAt < firstPostedAt)) {
            firstPostedAt = account.firstPostedAt;
        }
        if (account.lastPostedAt && (!lastPostedAt || account.lastPostedAt > lastPostedAt)) {
            lastPostedAt = account.lastPostedAt;
        }
    }

    const latestPost = latestPostOf(component.posts);
    const newestAccount = accounts.find(account => account.hasAccount);

    return {
        // Unique per row: account ids and jobIds are globally unique, and every
        // account and post belongs to exactly one component.
        id: newestAccount?.id ?? `orphan:job:${latestPost?.jobId ?? 'unknown'}`,
        name: resolveOrganizationName(latestPost, newestAccount),
        allNames: collectNames(component.posts, accounts),
        email: newestAccount?.profile?.email
            || newestAccount?.fallbackEmail
            || latestPost?.contactEmail.trim()
            || '',
        posts,
        firstPostedAt: firstPostedAt?.toISOString() ?? null,
        lastPostedAt: lastPostedAt?.toISOString() ?? null,
        applications,
        hiringStatus: deriveHiringStatus(posts, applications),
        views,
        applyClicks,
        accounts: accounts.map(toAccountRow),
    };
}

/**
 * Most actionable first: organizations sitting on untriaged applicants, then
 * the busiest, then most recent activity, then alphabetical so the order is
 * stable.
 */
function compareOrganizations(a: AdminOrganizationRow, b: AdminOrganizationRow): number {
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

/** Group, fold, shape, and sort: the whole in-memory pipeline in one call. */
export function buildOrganizations(
    profiles: EmployerProfileRow[],
    posts: EmployerJobRow[],
    applicationsByJob: ReadonlyMap<string, EmployerApplicationCounts>,
    profilesById: ReadonlyMap<string, EmployerProfileRow>,
    now: Date
): AdminOrganizationRow[] {
    return groupIntoComponents(profiles, posts)
        .map(component => buildOrganization(component, applicationsByJob, profilesById, now))
        .sort(compareOrganizations);
}

/**
 * @param employerAccountIds supabaseIds of every UserProfile with role
 * 'employer'. This is the population totalAccounts counts, and it is what
 * accountsWithPosts / accountsNeverPosted must partition.
 * @param postedUserIds distinct non-null EmployerJob.userId values.
 */
export function buildSummary(
    organizations: AdminOrganizationRow[],
    employerAccountIds: ReadonlySet<string>,
    postedUserIds: ReadonlySet<string>
): AdminEmployerSummary {
    // The account partition stays scoped to employer-role accounts, NOT to
    // every account that appears inside an organization. A post can be linked
    // to a profile whose role is not 'employer' (the OAuth signup path
    // defaulted real employers to 'job_seeker' until the profile route learned
    // to upgrade them, and those posters exist in prod). Their organizations
    // still show in full, but counting them here while totalAccounts cannot
    // see them would make accountsWithPosts + accountsNeverPosted overshoot
    // totalAccounts.
    let accountsWithPosts = 0;
    for (const id of employerAccountIds) {
        if (postedUserIds.has(id)) accountsWithPosts += 1;
    }

    const sum = (pick: (org: AdminOrganizationRow) => number): number =>
        organizations.reduce((running, org) => running + pick(org), 0);
    const realAccountCount = (org: AdminOrganizationRow): number =>
        org.accounts.filter(account => account.hasAccount).length;

    return {
        totalAccounts: employerAccountIds.size,
        accountsWithPosts,
        accountsNeverPosted: employerAccountIds.size - accountsWithPosts,
        // An organization with any linked account is not an orphan, even when
        // some of its posts are account-less legacy rows.
        orphanPosters: organizations.filter(org => realAccountCount(org) === 0).length,
        totalPosts: sum(org => org.posts.total),
        activePosts: sum(org => org.posts.active),
        inactivePosts: sum(org => org.posts.inactive),
        paidPosts: sum(org => org.posts.paid),
        freePosts: sum(org => org.posts.free),
        pendingCheckouts: sum(org => org.posts.pending),
        totalApplications: sum(org => org.applications.total),
        untriagedApplications: sum(org => org.applications.applied),
        // Organization level on purpose: this number drives the stat tile that
        // filters the table, and the table now shows organizations, so the
        // tile and the filtered row count must describe the same population.
        employersWithUntriaged: organizations.filter(org => org.applications.applied > 0).length,
        totalOrganizations: organizations.length,
        organizationsWithMultipleAccounts:
            organizations.filter(org => realAccountCount(org) > 1).length,
    };
}
