/**
 * Widen the lead-mining funnel by scraping employer websites' contact /
 * about / team / careers pages — captures contacts that NEVER appear in
 * job descriptions (HR director, recruiter, generic info@).
 *
 * Sources of candidate domains:
 *   1. employer_leads.website (already populated by prior description-mining)
 *   2. Job.applyLink — derive the apex domain from any non-aggregator URL
 *   3. Heuristic: slugify(employer) + ".com" / ".health" / ".org" as a fallback
 *
 * Aggregator hosts are SKIPPED (greenhouse.io, lever.co, workday.com,
 * jooble.org, adzuna.com, jsearch, etc.) — those serve their tenants'
 * postings, not the employer's own site.
 *
 * Probed paths per domain: /contact, /contact-us, /about, /about-us,
 * /team, /our-team, /careers (employer's own site usually has emails on
 * one of these).
 *
 * Idempotent: only INSERTs new emails into employer_leads with
 * source='employer_site'. Skips emails already present (no counter
 * bumping — these aren't job postings).
 *
 * Usage:
 *   npx tsx scripts/mine-leads-employer-sites.ts            # dry run
 *   npx tsx scripts/mine-leads-employer-sites.ts --execute  # write to DB
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}
if (process.env.PROD_DIRECT_URL && !process.env.DIRECT_URL) {
    process.env.DIRECT_URL = process.env.PROD_DIRECT_URL;
}

const DRY_RUN = !process.argv.includes('--execute');
const CONCURRENCY = 6;
const PER_PAGE_TIMEOUT_MS = 8_000;
const PAGE_SUFFIXES = ['/', '/contact', '/contact-us', '/about', '/about-us', '/team', '/our-team', '/careers'];

const AGGREGATOR_HOSTS = new Set([
    // ATS / aggregator hosts — we want the employer's own site, not theirs
    'greenhouse.io', 'boards.greenhouse.io', 'job-boards.greenhouse.io',
    'lever.co', 'jobs.lever.co',
    'workday.com', 'myworkdayjobs.com', 'wd.myworkdayjobs.com',
    'jooble.org', 'www.jooble.org',
    'adzuna.com', 'www.adzuna.com',
    'ziprecruiter.com', 'www.ziprecruiter.com',
    'indeed.com', 'www.indeed.com',
    'linkedin.com', 'www.linkedin.com',
    'glassdoor.com', 'www.glassdoor.com',
    'smartrecruiters.com', 'jobs.smartrecruiters.com',
    'icims.com',
    'jazzhr.com', 'app.jazzhr.com',
    'ashbyhq.com', 'jobs.ashbyhq.com',
    'usajobs.gov', 'www.usajobs.gov',
    'fantasticjobs.com', 'fantastic-jobs.com',
    'tealhq.com', 'www.tealhq.com',
    'recruiter.com',
]);

function isAggregatorHost(hostname: string): boolean {
    const h = hostname.toLowerCase();
    if (AGGREGATOR_HOSTS.has(h)) return true;
    for (const agg of AGGREGATOR_HOSTS) {
        if (h.endsWith('.' + agg)) return true;
    }
    return false;
}

/**
 * Filter junk emails harvested from page HTML — Sentry hash addresses,
 * placeholders ("example@..."), .invalid sentinel TLDs, etc. The mining
 * regex catches anything matching `local@host.tld`, but pages routinely
 * embed telemetry tokens and template literals that look email-shaped
 * without being real human contacts.
 */
function isJunkEmail(email: string): boolean {
    const lc = email.toLowerCase();
    const [local, host] = lc.split('@');
    if (!local || !host) return true;

    // Sentinel TLDs / obvious placeholders
    if (host.endsWith('.invalid') || host.endsWith('.test') || host.endsWith('.example')) return true;
    if (host === 'mysite.com' || host === 'example.com' || host === 'domain.com' || host === 'site.com') return true;

    // Sentry / Wix / monitoring telemetry — long hex local-parts on these hosts
    if (host.includes('sentry') || host.includes('wixpress') || host.includes('cloudflareinsights')) return true;

    // Local-part is a 32+ char hex blob (Sentry-style hashed subject)
    if (/^[a-f0-9]{24,}$/.test(local)) return true;

    // Placeholder local-parts
    const placeholders = new Set([
        'example', 'test', 'sample', 'demo', 'placeholder', 'your', 'youremail',
        'name', 'firstname', 'lastname', 'email',
    ]);
    if (placeholders.has(local)) return true;

    // Helpdesk / library / IT / press / privacy / abuse / no-reply boilerplate
    // — keep these ONLY if you want them; for outreach they're noise.
    const skipLocalPrefixes = ['noreply', 'no-reply', 'donotreply', 'do-not-reply', 'postmaster', 'mailer-daemon', 'abuse', 'webmaster', 'hostmaster'];
    if (skipLocalPrefixes.some(p => local === p || local.startsWith(p + '+'))) return true;

    // Generic "helpdesk / libanswers / support" — generic, not hiring
    const skipHostFragments = ['libanswers.com', 'helpdesk', 'sentry.io'];
    if (skipHostFragments.some(p => host.includes(p))) return true;

    return false;
}

function apexFromUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
        const u = new URL(url.startsWith('http') ? url : `https://${url}`);
        return u.hostname.toLowerCase().replace(/^www\./, '');
    } catch {
        return null;
    }
}

async function fetchPage(domain: string, path: string): Promise<string | null> {
    const url = `https://${domain}${path}`;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), PER_PAGE_TIMEOUT_MS);
        const res = await fetch(url, {
            redirect: 'follow',
            signal: controller.signal,
            headers: { 'user-agent': 'PMHNP-Lead-Mining/1.0 (research)' },
        });
        clearTimeout(timer);
        if (!res.ok) return null;
        const ct = res.headers.get('content-type') ?? '';
        if (!ct.includes('text/html') && !ct.includes('text/plain')) return null;
        return await res.text();
    } catch {
        return null;
    }
}

async function processDomain(
    domain: string,
    employer: string,
    mineFn: (text: string) => { emails: string[]; phones: string[]; websites: string[] },
): Promise<{ emails: string[]; phones: string[] }> {
    const allEmails = new Set<string>();
    const allPhones = new Set<string>();
    for (const path of PAGE_SUFFIXES) {
        const html = await fetchPage(domain, path);
        if (!html) continue;
        const mined = mineFn(html);
        mined.emails.forEach(e => allEmails.add(e));
        mined.phones.forEach(p => allPhones.add(p));
    }
    void employer;
    return { emails: [...allEmails], phones: [...allPhones] };
}

async function processBatch<T>(items: T[], worker: (t: T) => Promise<void>, concurrency: number) {
    let cursor = 0;
    async function loop() {
        while (true) {
            const i = cursor++;
            if (i >= items.length) return;
            try { await worker(items[i]); } catch (e) { console.warn(' worker error:', e); }
        }
    }
    await Promise.all(Array.from({ length: concurrency }, loop));
}

async function main() {
    const { prisma } = await import('@/lib/prisma');
    const { mineLeadsFromText } = await import('@/lib/lead-mining');

    console.log(`\n--- EMPLOYER-SITE LEAD MINING (${DRY_RUN ? 'DRY RUN' : 'EXECUTING'}) ---\n`);

    // 1. Existing emails (so we know what's a "new" lead)
    const existing = await prisma.employerLead.findMany({ select: { contactEmail: true } });
    const existingEmails = new Set(existing.map(e => e.contactEmail.toLowerCase()));
    console.log(`Existing leads: ${existingEmails.size}`);

    // 2. Build domain → employer map
    const domainToEmployer = new Map<string, string>();

    // Source 1: employer_leads.website
    const leadSites = await prisma.employerLead.findMany({
        where: { website: { not: null } },
        select: { companyName: true, website: true },
    });
    for (const l of leadSites) {
        const apex = apexFromUrl(l.website);
        if (apex && !isAggregatorHost(apex) && !domainToEmployer.has(apex)) {
            domainToEmployer.set(apex, l.companyName);
        }
    }

    // Source 2: derive from Job.applyLink
    const jobs = await prisma.job.findMany({
        where: { applyLink: { not: '' } },
        select: { employer: true, applyLink: true },
    });
    for (const j of jobs) {
        const apex = apexFromUrl(j.applyLink);
        if (apex && !isAggregatorHost(apex) && !domainToEmployer.has(apex)) {
            domainToEmployer.set(apex, j.employer);
        }
    }

    console.log(`Unique non-aggregator domains to probe: ${domainToEmployer.size}`);
    const domains = [...domainToEmployer.entries()];

    // 3. Crawl each domain — concurrency-bounded
    let domainsProbed = 0;
    let domainsWithEmails = 0;
    const newEmails = new Map<string, { domain: string; employer: string }>();

    await processBatch(domains, async ([domain, employer]) => {
        domainsProbed++;
        const { emails } = await processDomain(domain, employer, mineLeadsFromText);
        if (emails.length > 0) domainsWithEmails++;

        for (const email of emails) {
            const lc = email.toLowerCase();
            if (existingEmails.has(lc)) continue;
            if (isJunkEmail(lc)) continue;
            if (!newEmails.has(lc)) newEmails.set(lc, { domain, employer });
        }

        if (domainsProbed % 25 === 0) {
            console.log(`  ...probed ${domainsProbed}/${domains.length} domains, ${newEmails.size} new emails so far`);
        }
    }, CONCURRENCY);

    console.log(`\n=== Crawl summary ===`);
    console.log(`Domains probed:        ${domainsProbed}`);
    console.log(`Domains yielding ≥1:   ${domainsWithEmails}`);
    console.log(`New unique emails:     ${newEmails.size}`);

    if (newEmails.size > 0) {
        console.log(`\nSample of new leads:`);
        const sample = [...newEmails.entries()].slice(0, 15);
        for (const [email, { employer }] of sample) {
            console.log(`  ${email.padEnd(40)} ← ${employer}`);
        }
    }

    if (!DRY_RUN && newEmails.size > 0) {
        console.log(`\nInserting ${newEmails.size} new leads...`);
        let created = 0;
        for (const [email, { employer }] of newEmails) {
            try {
                await prisma.employerLead.create({
                    data: {
                        companyName: employer,
                        contactEmail: email,
                        source: 'employer_site',
                        status: 'prospect',
                        jobsPosted: 0,
                    },
                });
                created++;
            } catch (e) {
                console.warn(`  skip ${email}:`, (e as Error).message);
            }
        }
        console.log(`Inserted: ${created}`);
    } else if (DRY_RUN) {
        console.log(`\nDRY RUN — re-run with \`--execute\` to persist.`);
    }

    await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
