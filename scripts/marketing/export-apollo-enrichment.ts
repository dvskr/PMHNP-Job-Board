/**
 * Apollo enrichment export — READ-ONLY.
 *
 * Builds the outbound target list from what the platform already knows:
 * every employer with ACTIVE PMHNP jobs (ingested in the last cycle) is a
 * company hiring for this exact role RIGHT NOW — the highest-intent
 * audience possible for "post it free on the PMHNP-only board".
 *
 * Outputs (tmp/marketing/, gitignored — business data stays out of git):
 *   apollo-accounts.csv        — companies for Apollo bulk enrichment
 *                                 (keyed on domain where we have one;
 *                                 Apollo matches by name otherwise)
 *   apollo-contacts-known.csv  — contacts we ALREADY have emails for
 *                                 (skip enrichment; verify + sequence)
 *   inventory-summary.txt      — coverage report (counts, tiers, gaps)
 *
 * Tiering:
 *   A  = ≥3 active jobs, not a platform customer  (hot — hiring volume now)
 *   B  = 1-2 active jobs, not a platform customer
 *   C  = no active jobs but a known lead (past hirer — nurture)
 * Excluded: aggregator-artifact employer names, platform customers
 * (employer-posted jobs), and leads already marked converted.
 *
 * Usage:
 *   npx tsx scripts/marketing/export-apollo-enrichment.ts
 */
import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

config({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
if (process.env.PROD_DIRECT_URL && !process.env.DIRECT_URL) process.env.DIRECT_URL = process.env.PROD_DIRECT_URL;

const OUT_DIR = path.join(process.cwd(), 'tmp', 'marketing');

// Aggregator / ATS hosts — an applyLink on these is NOT the employer's own
// domain. (ATS tenants: the job lives on greenhouse/lever/workday, but the
// company domain is elsewhere — Apollo resolves those by name instead.)
const NON_EMPLOYER_HOSTS = [
    'indeed.com', 'ziprecruiter.com', 'linkedin.com', 'glassdoor.com',
    'monster.com', 'simplyhired.com', 'snagajob.com', 'talent.com',
    'lensa.com', 'ladders.com', 'bebee.com', 'learn4good.com',
    'doccafe.com', 'practicematch.com', 'docjobs.com', 'doximity.com',
    'jobrapido.com', 'whatjobs.com', 'jooble.org', 'adzuna.com',
    'jobilize.com', 'getwork.com', 'tealhq.com', 'career.io',
    'boards.greenhouse.io', 'greenhouse.io', 'jobs.lever.co', 'lever.co',
    'myworkdayjobs.com', 'myworkdaysite.com', 'icims.com', 'bamboohr.com',
    'breezy.hr', 'workable.com', 'recruitee.com', 'jobvite.com',
    'smartrecruiters.com', 'paylocity.com', 'paycomonline.net',
    'ultipro.com', 'clearcompany.com', 'applytojob.com', 'pinpointhq.com',
    'usajobs.gov', 'governmentjobs.com', 'healthcaresource.com',
    'dayforce.com', 'ashbyhq.com', 'jazz.co', 'jobtarget.com',
    'enpnetwork.com', 'gothamenterprises.com', 'rapidapi.com',
];

function apexDomainFromUrl(url: string | null): string | null {
    if (!url) return null;
    try {
        const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
        if (NON_EMPLOYER_HOSTS.some(d => host === d || host.endsWith(`.${d}`))) return null;
        // Collapse deep subdomains to the apex (careers.acme.com -> acme.com).
        const parts = host.split('.');
        return parts.length > 2 ? parts.slice(-2).join('.') : host;
    } catch {
        return null;
    }
}

function normName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function csvCell(v: string | number | boolean | null | undefined): string {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeCsv(file: string, header: string[], rows: Array<Array<string | number | boolean | null | undefined>>) {
    const body = [header.join(','), ...rows.map(r => r.map(csvCell).join(','))].join('\n');
    fs.writeFileSync(file, body, 'utf-8');
}

async function main() {
    const { prisma } = await import('@/lib/prisma');
    const { isAggregatorArtifactName } = await import('@/lib/company-normalizer');

    fs.mkdirSync(OUT_DIR, { recursive: true });

    // 1. Active jobs per employer (published, unexpired) with locations.
    const activeJobs = await prisma.job.findMany({
        where: {
            isPublished: true,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { employer: true, city: true, state: true, applyLink: true, sourceType: true },
    });

    interface EmployerAgg {
        employer: string;
        activeCount: number;
        locations: Map<string, number>; // "city|state" -> count
        domains: Map<string, number>;   // derived from applyLink
        isCustomer: boolean;            // has employer-posted jobs
    }
    const byEmployer = new Map<string, EmployerAgg>();
    for (const j of activeJobs) {
        if (!j.employer) continue;
        const key = normName(j.employer);
        if (!key) continue;
        let agg = byEmployer.get(key);
        if (!agg) {
            agg = { employer: j.employer, activeCount: 0, locations: new Map(), domains: new Map(), isCustomer: false };
            byEmployer.set(key, agg);
        }
        agg.activeCount++;
        if (j.city && j.state) {
            const loc = `${j.city}|${j.state}`;
            agg.locations.set(loc, (agg.locations.get(loc) || 0) + 1);
        }
        const domain = apexDomainFromUrl(j.applyLink);
        if (domain) agg.domains.set(domain, (agg.domains.get(domain) || 0) + 1);
        if (j.sourceType === 'employer') agg.isCustomer = true;
    }

    // 2. Known leads (existing contact intel).
    const leads = await prisma.employerLead.findMany({
        select: {
            companyName: true, contactName: true, contactEmail: true, contactTitle: true,
            phone: true, website: true, linkedInUrl: true, status: true, source: true,
            jobsPosted: true, lastContactedAt: true,
        },
    });
    const leadsByCompany = new Map<string, typeof leads>();
    for (const l of leads) {
        const key = normName(l.companyName);
        if (!key) continue;
        const arr = leadsByCompany.get(key) || [];
        arr.push(l);
        leadsByCompany.set(key, arr);
    }

    // 3. Company registry (website fallback).
    const companies = await prisma.company.findMany({
        select: { name: true, website: true },
    });
    const companyWebsite = new Map<string, string>();
    for (const c of companies) {
        if (c.website) companyWebsite.set(normName(c.name), c.website);
    }

    // 4. Build the account rows.
    const EXCLUDED_LEAD_STATUSES = new Set(['converted', 'customer', 'do_not_contact', 'unsubscribed']);
    const accountRows: Array<Array<string | number | boolean | null>> = [];
    const seen = new Set<string>();
    let excludedArtifacts = 0;
    let excludedCustomers = 0;

    const pickDomain = (key: string, agg?: EmployerAgg): string | null => {
        const companyLeads = leadsByCompany.get(key) || [];
        const fromLead = companyLeads.map(l => apexDomainFromUrl(l.website)).find(Boolean);
        if (fromLead) return fromLead;
        const fromCompany = apexDomainFromUrl(companyWebsite.get(key) || null);
        if (fromCompany) return fromCompany;
        if (agg && agg.domains.size > 0) {
            return [...agg.domains.entries()].sort((a, b) => b[1] - a[1])[0][0];
        }
        return null;
    };

    const pushRow = (key: string, name: string, agg?: EmployerAgg) => {
        if (seen.has(key)) return;
        seen.add(key);
        if (isAggregatorArtifactName(name)) { excludedArtifacts++; return; }
        const companyLeads = leadsByCompany.get(key) || [];
        if (agg?.isCustomer || companyLeads.some(l => EXCLUDED_LEAD_STATUSES.has(l.status))) { excludedCustomers++; return; }

        const active = agg?.activeCount || 0;
        const tier = active >= 3 ? 'A' : active >= 1 ? 'B' : 'C';
        const topLoc = agg && agg.locations.size > 0
            ? [...agg.locations.entries()].sort((a, b) => b[1] - a[1])[0][0].split('|')
            : ['', ''];
        const bestLead = companyLeads.find(l => l.contactEmail) || companyLeads[0];

        accountRows.push([
            name,
            pickDomain(key, agg),
            topLoc[0], topLoc[1],
            active,
            tier,
            bestLead?.contactEmail || null,
            bestLead?.contactName || null,
            bestLead?.contactTitle || null,
            bestLead?.status || null,
            bestLead?.source || null,
            companyLeads.length,
        ]);
    };

    for (const [key, agg] of byEmployer) pushRow(key, agg.employer, agg);
    for (const [key, companyLeads] of leadsByCompany) pushRow(key, companyLeads[0].companyName);

    // Sort: tier A first, then by active-job volume.
    const tierRank: Record<string, number> = { A: 0, B: 1, C: 2 };
    accountRows.sort((a, b) =>
        (tierRank[a[5] as string] - tierRank[b[5] as string]) || ((b[4] as number) - (a[4] as number))
    );

    writeCsv(path.join(OUT_DIR, 'apollo-accounts.csv'),
        ['company_name', 'domain', 'city', 'state', 'active_pmhnp_jobs', 'tier',
         'known_email', 'known_contact', 'known_title', 'lead_status', 'lead_source', 'known_contact_count'],
        accountRows);

    // 5. Known contacts with emails — verify in Apollo, then sequence directly.
    const contactRows = leads
        .filter(l => l.contactEmail && !EXCLUDED_LEAD_STATUSES.has(l.status) && !isAggregatorArtifactName(l.companyName))
        .map(l => [
            l.contactName, l.contactEmail, l.contactTitle, l.companyName,
            apexDomainFromUrl(l.website), l.linkedInUrl, l.phone, l.status, l.source,
            l.lastContactedAt ? l.lastContactedAt.toISOString().split('T')[0] : null,
        ]);
    writeCsv(path.join(OUT_DIR, 'apollo-contacts-known.csv'),
        ['name', 'email', 'title', 'company_name', 'domain', 'linkedin_url', 'phone', 'lead_status', 'lead_source', 'last_contacted'],
        contactRows);

    // 6. Summary.
    const tiers = { A: 0, B: 0, C: 0 };
    let withDomain = 0;
    for (const r of accountRows) {
        tiers[r[5] as 'A' | 'B' | 'C']++;
        if (r[1]) withDomain++;
    }
    const statusCounts = new Map<string, number>();
    for (const l of leads) statusCounts.set(l.status, (statusCounts.get(l.status) || 0) + 1);

    const summary = [
        `Apollo enrichment export — ${new Date().toISOString()}`,
        ``,
        `TARGET ACCOUNTS: ${accountRows.length}`,
        `  Tier A (≥3 active jobs):  ${tiers.A}`,
        `  Tier B (1-2 active jobs): ${tiers.B}`,
        `  Tier C (lead, no active): ${tiers.C}`,
        `  With domain (Apollo exact-match ready): ${withDomain} (${Math.round(withDomain / Math.max(1, accountRows.length) * 100)}%)`,
        `  Needs name-match enrichment: ${accountRows.length - withDomain}`,
        ``,
        `KNOWN CONTACTS WITH EMAIL (skip enrichment, verify + sequence): ${contactRows.length}`,
        ``,
        `EXCLUDED: ${excludedArtifacts} aggregator-artifact names, ${excludedCustomers} existing customers/converted/do-not-contact`,
        ``,
        `LEAD TABLE BY STATUS:`,
        ...[...statusCounts.entries()].map(([s, n]) => `  ${s.padEnd(20)} ${n}`),
        ``,
        `Files: apollo-accounts.csv, apollo-contacts-known.csv (this dir)`,
    ].join('\n');
    fs.writeFileSync(path.join(OUT_DIR, 'inventory-summary.txt'), summary, 'utf-8');
    console.log(summary);

    await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
