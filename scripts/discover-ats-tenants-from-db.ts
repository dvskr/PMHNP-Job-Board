/**
 * Scan the production catalog (both `jobs` and `rejected_jobs`) for
 * ATS apply-link patterns, extract org slugs, and surface tenants we
 * don't yet have configured.
 *
 * Why this exists: rejected_jobs contains every URL the ingest pipeline
 * saw but couldn't normalize — most often because the source returned
 * something whose hosting ATS we have an adapter for, but whose tenant
 * slug isn't in our config. This script finds those silent misses.
 *
 * It also surfaces ATSes we have NO adapter for (Paylocity, Workable,
 * JazzHR, Jobvite, Recruitee, iCIMS, BambooHR, TeamTailor, Breezy) so
 * we can size the opportunity before building one.
 *
 * Read-only. Never writes.
 *
 * Run:
 *   npx tsx scripts/discover-ats-tenants-from-db.ts
 */

import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { prisma } from '@/lib/prisma';
import { isRelevantJob } from '@/lib/utils/job-filter';
import { GREENHOUSE_SLUGS } from '@/lib/aggregators/tenants/greenhouse';
import { LEVER_SLUGS } from '@/lib/aggregators/tenants/lever';
import { WORKDAY_TENANTS } from '@/lib/aggregators/tenants/workday';
import { SMARTRECRUITERS_TENANTS } from '@/lib/aggregators/tenants/smartrecruiters';
import { ASHBY_TENANTS } from '@/lib/aggregators/tenants/ashby';

// ── Existing configured tenants (set membership for fast lookup) ──
const KNOWN_GREENHOUSE = new Set(GREENHOUSE_SLUGS.map((s) => s.toLowerCase()));
const KNOWN_LEVER = new Set(LEVER_SLUGS.map((s) => s.toLowerCase()));
const KNOWN_WORKDAY = new Set(
    WORKDAY_TENANTS.map((t) => `${t.slug}|${t.instance}|${t.site}`.toLowerCase()),
);
const KNOWN_SMARTRECRUITERS = new Set(SMARTRECRUITERS_TENANTS.map((t) => t.slug.toLowerCase()));
const KNOWN_ASHBY = new Set(ASHBY_TENANTS.map((t) => t.slug.toLowerCase()));

// ── ATS URL detectors (parse slug from any matching URL) ──
interface AtsDetection {
    ats: string;
    /** Org-identifier within the ATS (slug, hostname prefix, etc.). */
    slug: string;
    /** Extra context for ATSes that need more than slug to scrape (e.g. Workday tenant tuple). */
    extra?: string;
}

function detect(rawUrl: string): AtsDetection | null {
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        return null;
    }
    const host = url.hostname.toLowerCase();
    const path = url.pathname;

    // Greenhouse — boards.greenhouse.io/{slug}/jobs/{id}  or job-boards.greenhouse.io/{slug}/jobs/{id}
    if (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') {
        const m = /^\/([^/]+)\//.exec(path);
        if (m) return { ats: 'greenhouse', slug: m[1].toLowerCase() };
    }
    // Greenhouse-embedded boards: boards.greenhouse.io/embed/job_app
    if (host.endsWith('.greenhouse.io')) {
        const m = /^\/([^/]+)/.exec(path);
        if (m && m[1] !== 'embed') return { ats: 'greenhouse', slug: m[1].toLowerCase() };
    }
    // Lever — jobs.lever.co/{slug}/{uuid}
    if (host === 'jobs.lever.co') {
        const m = /^\/([^/]+)\//.exec(path);
        if (m) return { ats: 'lever', slug: m[1].toLowerCase() };
    }
    // Workday — three URL shapes:
    //   1. canonical:        {slug}.wd{N}.myworkdayjobs.com/wday/cxs/{slug}/{site}/jobs/...
    //   2. locale-prefixed:  {slug}.wd{N}.myworkdayjobs.com/{locale}/{site}/job/...
    //   3. direct:           {slug}.wd{N}.myworkdayjobs.com/{site}/job/...
    // We must skip the locale segment (en-US, en-GB, fr-CA, etc.) when
    // present, otherwise we mis-extract "en-US" as the site and the slug
    // looks novel when it's the same tenant we already have configured.
    if (host.endsWith('.myworkdayjobs.com')) {
        const hostMatch = /^([^.]+)\.wd(\d+)\.myworkdayjobs\.com$/.exec(host);
        if (hostMatch) {
            const slug = hostMatch[1];
            const instance = hostMatch[2];
            // Try canonical /wday/cxs/{slug}/{site}/...
            const cxs = /\/wday\/cxs\/[^/]+\/([^/]+)/.exec(path);
            let site: string | null = null;
            if (cxs) {
                site = cxs[1];
            } else {
                // Walk path segments, skipping any locale-shaped segment.
                const localeRe = /^[a-z]{2}(-[A-Z]{2})?$/;
                const segments = path.split('/').filter((s) => s.length > 0);
                for (const seg of segments) {
                    if (localeRe.test(seg)) continue;
                    // Skip the action keywords that aren't sites
                    if (seg === 'job' || seg === 'jobs' || seg === 'login') break;
                    site = seg;
                    break;
                }
            }
            return { ats: 'workday', slug, extra: `${instance}|${site ?? 'unknown'}` };
        }
    }
    // SmartRecruiters — jobs.smartrecruiters.com/{slug}/{id}
    if (host === 'jobs.smartrecruiters.com' || host === 'careers.smartrecruiters.com') {
        const m = /^\/([^/]+)\//.exec(path);
        if (m) return { ats: 'smartrecruiters', slug: m[1].toLowerCase() };
    }
    // Ashby — jobs.ashbyhq.com/{slug}/{id}
    if (host === 'jobs.ashbyhq.com') {
        const m = /^\/([^/]+)\//.exec(path);
        if (m) return { ats: 'ashby', slug: m[1].toLowerCase() };
    }
    // iCIMS — {org}.icims.com or careers-{org}.icims.com
    if (host.endsWith('.icims.com')) {
        const slug = host.replace('.icims.com', '').replace(/^careers-/, '').replace(/-careers$/, '');
        return { ats: 'icims', slug: slug.toLowerCase() };
    }
    // JazzHR — {org}.applytojob.com or jobs.jazzhr.com/{slug}/...
    if (host.endsWith('.applytojob.com')) {
        return { ats: 'jazzhr', slug: host.replace('.applytojob.com', '').toLowerCase() };
    }
    if (host === 'jobs.jazzhr.com' || host === 'app.jazz.co') {
        const m = /^\/([^/]+)\//.exec(path);
        if (m) return { ats: 'jazzhr', slug: m[1].toLowerCase() };
    }
    // Paylocity — recruiting.paylocity.com/recruiting/jobs/Details/{id}/{Org-Name}
    if (host === 'recruiting.paylocity.com') {
        const m = /\/recruiting\/jobs\/(?:Details|Apply)\/\d+\/([^/?#]+)/.exec(path);
        if (m) return { ats: 'paylocity', slug: m[1].toLowerCase() };
    }
    // Workable — apply.workable.com/{slug}/j/{id} or {slug}.workable.com
    if (host === 'apply.workable.com') {
        const m = /^\/([^/]+)\//.exec(path);
        if (m) return { ats: 'workable', slug: m[1].toLowerCase() };
    }
    if (host.endsWith('.workable.com')) {
        return { ats: 'workable', slug: host.replace('.workable.com', '').toLowerCase() };
    }
    // Jobvite — jobs.jobvite.com/{slug}/job/... or {slug}.jobvite.com
    if (host === 'jobs.jobvite.com') {
        const m = /^\/([^/]+)\//.exec(path);
        if (m) return { ats: 'jobvite', slug: m[1].toLowerCase() };
    }
    if (host.endsWith('.jobvite.com')) {
        return { ats: 'jobvite', slug: host.replace('.jobvite.com', '').toLowerCase() };
    }
    // Recruitee — {slug}.recruitee.com
    if (host.endsWith('.recruitee.com')) {
        return { ats: 'recruitee', slug: host.replace('.recruitee.com', '').toLowerCase() };
    }
    // BambooHR — {slug}.bamboohr.com
    if (host.endsWith('.bamboohr.com')) {
        return { ats: 'bamboohr', slug: host.replace('.bamboohr.com', '').toLowerCase() };
    }
    // TeamTailor — {slug}.teamtailor.com
    if (host.endsWith('.teamtailor.com')) {
        return { ats: 'teamtailor', slug: host.replace('.teamtailor.com', '').toLowerCase() };
    }
    // Breezy — {slug}.breezy.hr
    if (host.endsWith('.breezy.hr')) {
        return { ats: 'breezy', slug: host.replace('.breezy.hr', '').toLowerCase() };
    }
    // UKG / Ultimate — recruiting.ultipro.com/{ORG}/JobBoard/{uuid}/...
    if (host === 'recruiting.ultipro.com' || host.endsWith('.ultipro.com')) {
        const m = /^\/([^/]+)\//.exec(path);
        if (m) return { ats: 'ukg', slug: m[1].toLowerCase() };
    }
    // Paycor — careers.smartrecruiters.com handled above; Paycor's recruiter
    // domain is hire.paycor.com/...?ID={id}&clientID={uuid}.
    if (host === 'hire.paycor.com') {
        const id = url.searchParams.get('clientId') ?? url.searchParams.get('clientID');
        if (id) return { ats: 'paycor', slug: id.toLowerCase() };
    }
    return null;
}

function isKnown(d: AtsDetection): boolean {
    switch (d.ats) {
        case 'greenhouse': return KNOWN_GREENHOUSE.has(d.slug);
        case 'lever': return KNOWN_LEVER.has(d.slug);
        case 'workday': return KNOWN_WORKDAY.has(`${d.slug}|${d.extra ?? ''}`.toLowerCase());
        case 'smartrecruiters': return KNOWN_SMARTRECRUITERS.has(d.slug);
        case 'ashby': return KNOWN_ASHBY.has(d.slug);
        default: return false; // ATSes without an adapter are never "known"
    }
}

interface SlugAggregate {
    ats: string;
    slug: string;
    extra?: string;
    totalSeen: number;
    pmhnpRelevant: number;
    sampleTitles: Set<string>;
    sampleEmployers: Set<string>;
    sourcesObserved: Set<string>;
}

function key(d: AtsDetection): string {
    return d.extra ? `${d.ats}::${d.slug}::${d.extra}` : `${d.ats}::${d.slug}`;
}

async function main(): Promise<void> {
    const out = new Map<string, SlugAggregate>();
    let totalUrls = 0;
    let parseable = 0;

    function record(
        url: string,
        title: string,
        employer: string | null,
        sourceProvider: string | null,
    ): void {
        totalUrls++;
        const d = detect(url);
        if (!d) return;
        parseable++;
        const k = key(d);
        let agg = out.get(k);
        if (!agg) {
            agg = {
                ats: d.ats,
                slug: d.slug,
                extra: d.extra,
                totalSeen: 0,
                pmhnpRelevant: 0,
                sampleTitles: new Set(),
                sampleEmployers: new Set(),
                sourcesObserved: new Set(),
            };
            out.set(k, agg);
        }
        agg.totalSeen++;
        if (isRelevantJob(title, '')) agg.pmhnpRelevant++;
        if (agg.sampleTitles.size < 5) agg.sampleTitles.add(title);
        if (employer && agg.sampleEmployers.size < 3) agg.sampleEmployers.add(employer);
        if (sourceProvider) agg.sourcesObserved.add(sourceProvider);
    }

    // ── 1) Live + unpublished jobs ──
    console.log('Scanning jobs.applyLink...');
    const jobCursor = await prisma.job.findMany({
        where: { applyLink: { not: null } },
        select: { applyLink: true, title: true, employer: true, sourceProvider: true },
    });
    console.log(`  Loaded ${jobCursor.length} job rows with applyLink`);
    for (const j of jobCursor) {
        if (j.applyLink) record(j.applyLink, j.title, j.employer ?? null, j.sourceProvider);
    }

    // ── 2) Rejected jobs (where our ingest funnel left signal) ──
    console.log('Scanning rejected_jobs.applyLink...');
    const rejCursor = await prisma.rejectedJob.findMany({
        where: { applyLink: { not: null } },
        select: { applyLink: true, title: true, employer: true, sourceProvider: true },
    });
    console.log(`  Loaded ${rejCursor.length} rejected_job rows with applyLink`);
    for (const r of rejCursor) {
        if (r.applyLink) record(r.applyLink, r.title, r.employer ?? null, r.sourceProvider);
    }

    console.log();
    console.log(`Parsed ${parseable}/${totalUrls} URLs into ATS+slug pairs`);
    console.log();

    // ── 3) Bucket & sort ──
    const buckets = new Map<string, SlugAggregate[]>();
    for (const agg of out.values()) {
        const list = buckets.get(agg.ats) ?? [];
        list.push(agg);
        buckets.set(agg.ats, list);
    }

    // ATSes we have adapters for → only surface UNKNOWN slugs
    const ADAPTED_ATSES = new Set(['greenhouse', 'lever', 'workday', 'smartrecruiters', 'ashby']);

    for (const [ats, list] of [...buckets.entries()].sort()) {
        list.sort((a, b) => b.pmhnpRelevant - a.pmhnpRelevant || b.totalSeen - a.totalSeen);

        const isAdapted = ADAPTED_ATSES.has(ats);
        const novel = isAdapted ? list.filter((a) => !isKnown(a)) : list;
        if (novel.length === 0) {
            console.log(`\n=== ${ats.toUpperCase()} ===  (no new slugs to add)`);
            continue;
        }

        console.log();
        console.log(`=== ${ats.toUpperCase()} ===  ${isAdapted ? 'NEW slugs (we have the adapter)' : 'NO ADAPTER — opportunity-size only'}`);
        console.log(`slug                                       seen  pmhnp  sample titles`);
        console.log('─'.repeat(120));
        for (const a of novel.slice(0, 50)) {
            const slugCol = (a.extra ? `${a.slug}|${a.extra}` : a.slug).slice(0, 42).padEnd(42);
            const seen = String(a.totalSeen).padStart(5);
            const pmhnp = String(a.pmhnpRelevant).padStart(6);
            const titles = [...a.sampleTitles].slice(0, 2).map((t) => t.slice(0, 50)).join('  |  ');
            console.log(`${slugCol} ${seen} ${pmhnp}  ${titles}`);
        }
        if (novel.length > 50) {
            console.log(`  …and ${novel.length - 50} more (truncated)`);
        }
    }

    // ── 4) Quick KEEPER ledger for adapted ATSes (high-confidence adds) ──
    console.log('\n\n=== SUGGESTED ADDS (adapter-ready slugs with ≥1 PMHNP-relevant title) ===');
    for (const ats of ['greenhouse', 'lever', 'workday', 'smartrecruiters', 'ashby']) {
        const list = (buckets.get(ats) ?? []).filter((a) => !isKnown(a) && a.pmhnpRelevant >= 1);
        if (list.length === 0) continue;
        console.log(`\n--- ${ats} (${list.length}) ---`);
        for (const a of list.slice(0, 30)) {
            const employer = [...a.sampleEmployers][0] ?? '?';
            const slugLabel = a.extra ? `${a.slug} (${a.extra})` : a.slug;
            console.log(`  ${slugLabel.padEnd(42)} pmhnp=${a.pmhnpRelevant}  employer="${employer}"`);
        }
    }

    // ── 5) ATS adapter-opportunity sizing (PMHNP-relevant counts only) ──
    console.log('\n\n=== ATS ADAPTER OPPORTUNITY (no adapter today) ===');
    for (const ats of ['icims', 'jazzhr', 'paylocity', 'workable', 'jobvite', 'recruitee', 'bamboohr', 'teamtailor', 'breezy', 'ukg', 'paycor']) {
        const list = (buckets.get(ats) ?? []).filter((a) => a.pmhnpRelevant >= 1);
        const totalPmhnp = list.reduce((acc, a) => acc + a.pmhnpRelevant, 0);
        if (totalPmhnp === 0) continue;
        console.log(`\n  ${ats}: ${list.length} unique orgs · ${totalPmhnp} PMHNP-relevant titles seen historically`);
        for (const a of list.slice(0, 10)) {
            const employer = [...a.sampleEmployers][0] ?? '?';
            console.log(`    ${a.slug.padEnd(35)} pmhnp=${a.pmhnpRelevant}  employer="${employer}"`);
        }
        if (list.length > 10) console.log(`    …and ${list.length - 10} more`);
    }

    await prisma.$disconnect();
}

main().catch((err) => {
    console.error('Discovery crashed:', err);
    process.exit(1);
});
