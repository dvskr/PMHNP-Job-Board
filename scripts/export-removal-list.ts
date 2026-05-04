/**
 * GSC Indexing Crisis (P2.2 — Option 2, no-HEAD edition):
 * Trust GSC's own classifications. The CSVs in `GSC ISSUES/` are Google's
 * authoritative report of which URLs are broken — we don't need to re-verify.
 *
 * This script splits the 8,841 URLs into two buckets:
 *   - SAFE: categories where removal is unambiguously correct (Google itself
 *           says the URL is broken: Not Found / Soft 404 / Server Error /
 *           Discovered-not-indexed)
 *   - RISKY: categories where the URL might still be a real page that we
 *           shouldn't accidentally hide (Crawled-not-indexed = 200 OK but
 *           thin; Duplicate-canonical = real page just not the canonical;
 *           Page-with-redirect = real page that redirects)
 *
 * Outputs:
 *   gsc-removal-safe.txt    — submit these to GSC's Removal Tool
 *   gsc-removal-risky.txt   — review manually before submitting
 *
 * Optional --enqueue flag pushes the SAFE bucket into deindex_queue so the
 * historical-deindex cron also processes them via Google Indexing API.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });
dotenvConfig({ path: '.env' });
dotenvConfig({ path: '.env.prod' });

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const GSC_DIR = join(process.cwd(), 'GSC ISSUES');
const ENQUEUE = process.argv.includes('--enqueue');

type PrismaModule = typeof import('@/lib/prisma');
let prismaCache: PrismaModule['prisma'] | null = null;
async function getPrisma() {
    if (!prismaCache) prismaCache = (await import('@/lib/prisma')).prisma;
    return prismaCache;
}

function parseTableCsv(content: string): string[] {
    const lines = content.split(/\r?\n/);
    const urls: string[] = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        let url: string;
        if (line.startsWith('"')) {
            const closeIdx = line.indexOf('"', 1);
            if (closeIdx < 0) continue;
            url = line.slice(1, closeIdx);
        } else {
            const commaIdx = line.indexOf(',');
            url = commaIdx < 0 ? line : line.slice(0, commaIdx);
        }
        url = url.trim();
        if (url.startsWith('http')) urls.push(url);
    }
    return urls;
}

function inferIssue(metadata: string): string {
    const m = metadata.match(/Issue,(.+)/i);
    if (!m) return '';
    return m[1].trim().replace(/^"|"$/g, '').toLowerCase();
}

// SAFE = Google itself says this URL is broken/dead.
// RISKY = URL might still be a real page; manual review needed.
function classify(issue: string): 'safe' | 'risky' | 'skip' {
    if (issue.includes('not found')) return 'safe';
    if (issue.includes('soft 404')) return 'safe';
    if (issue.includes('server error')) return 'safe';
    if (issue.includes('discovered') && issue.includes('not indexed')) return 'safe';
    if (issue.includes('blocked by robots.txt') && issue.includes('indexed')) return 'safe'; // auth pages we want gone
    if (issue.includes('crawled') && issue.includes('not indexed')) return 'risky'; // 200 OK but thin
    if (issue.includes('duplicate')) return 'risky'; // real page, just not canonical
    if (issue.includes('redirect')) return 'risky'; // resolves to real page
    if (issue.includes('alternative')) return 'skip'; // working as intended
    if (issue.includes('blocked by robots.txt')) return 'skip'; // already blocked
    return 'skip';
}

interface Bucket {
    safe: Map<string, string>; // url → label
    risky: Map<string, string>;
    safeBySource: Map<string, number>;
    riskyBySource: Map<string, number>;
}

function loadBuckets(): Bucket {
    if (!existsSync(GSC_DIR)) {
        console.error(`GSC ISSUES directory not found at ${GSC_DIR}`);
        process.exit(1);
    }
    const folders = readdirSync(GSC_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);

    const safe = new Map<string, string>();
    const risky = new Map<string, string>();
    const safeBySource = new Map<string, number>();
    const riskyBySource = new Map<string, number>();

    for (const folder of folders) {
        const tablePath = join(GSC_DIR, folder, 'Table.csv');
        const metaPath = join(GSC_DIR, folder, 'Metadata.csv');
        if (!existsSync(tablePath) || !existsSync(metaPath)) continue;

        const issue = inferIssue(readFileSync(metaPath, 'utf8'));
        const verdict = classify(issue);
        if (verdict === 'skip') continue;

        const urls = parseTableCsv(readFileSync(tablePath, 'utf8'));
        for (const url of urls) {
            // Skip non-canonical surfaces — never appropriate for the Removal Tool.
            if (url.includes('/_next/')) continue;
            if (url.includes('/api/')) continue;

            if (verdict === 'safe') {
                if (!safe.has(url)) safe.set(url, issue);
                safeBySource.set(issue, (safeBySource.get(issue) ?? 0) + 1);
            } else {
                // SAFE wins — if a URL is in both buckets, prefer SAFE.
                if (!safe.has(url) && !risky.has(url)) {
                    risky.set(url, issue);
                    riskyBySource.set(issue, (riskyBySource.get(issue) ?? 0) + 1);
                }
            }
        }
    }

    return { safe, risky, safeBySource, riskyBySource };
}

// Build a set of URLs that are currently LIVE on the site, so we never
// classify them as SAFE-to-remove. GSC labels can be 3+ weeks stale —
// a URL flagged "not found" then might be a healthy page now after the
// fixes shipped in P1.
async function loadLiveUrlSet(): Promise<Set<string>> {
    const live = new Set<string>();
    const BASE = 'https://pmhnphiring.com';
    const prisma = await getPrisma();

    // Active jobs (slug-based detail pages)
    const jobs = await prisma.job.findMany({
        where: {
            isPublished: true,
            OR: [
                { expiresAt: null },
                { expiresAt: { gt: new Date() } },
            ],
        },
        select: { id: true, title: true },
    });
    for (const j of jobs) {
        const slug = `${j.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${j.id}`;
        live.add(`${BASE}/jobs/${slug}`);
    }

    // Companies with at least 1 active job — page route uses normalizedName
    const companies = await prisma.company.findMany({
        where: {
            jobs: {
                some: {
                    isPublished: true,
                    OR: [
                        { expiresAt: null },
                        { expiresAt: { gt: new Date() } },
                    ],
                },
            },
        },
        select: { normalizedName: true },
    });
    for (const c of companies) {
        live.add(`${BASE}/companies/${c.normalizedName}`);
        // Also the URL-encoded variant — Google may have indexed both.
        live.add(`${BASE}/companies/${encodeURIComponent(c.normalizedName)}`);
    }

    // City pages with ≥1 active job
    const cityRows = await prisma.job.groupBy({
        by: ['city', 'state'],
        where: {
            isPublished: true,
            OR: [
                { expiresAt: null },
                { expiresAt: { gt: new Date() } },
            ],
            city: { not: null },
            state: { not: null },
        },
        _count: { _all: true },
    });
    const STATE_TO_CODE: Record<string, string> = {
        'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
        'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
        'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
        'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
        'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
        'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH',
        'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC',
        'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA',
        'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', 'Tennessee': 'TN',
        'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA',
        'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC',
    };
    for (const row of cityRows) {
        if (!row.city || !row.state) continue;
        const stateRaw = row.state.trim();
        const code = stateRaw.length === 2 ? stateRaw.toUpperCase() : STATE_TO_CODE[stateRaw];
        if (!code) continue;
        const slug = `${row.city.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${code.toLowerCase()}`;
        live.add(`${BASE}/jobs/city/${slug}`);
    }

    // Blog posts — query directly via Prisma (lib/blog.ts uses Supabase client
    // which can fail silently in script context without proper env setup).
    const blogPosts = await prisma.blogPost.findMany({
        where: { status: 'published' },
        select: { slug: true },
    });
    for (const post of blogPosts) {
        live.add(`${BASE}/blog/${post.slug}`);
    }

    // Static surfaces that are always live
    for (const path of [
        '/', '/jobs', '/blog', '/companies', '/post-job', '/for-employers',
        '/for-job-seekers', '/about', '/faq', '/contact', '/job-alerts',
        '/terms', '/privacy', '/pricing', '/salary-guide', '/resources',
        '/jobs/locations', '/new-grad',
    ]) {
        live.add(`${BASE}${path}`);
    }

    return live;
}

async function main() {
    const buckets = loadBuckets();

    console.log(`Cross-checking against live URLs in DB...`);
    const liveUrls = await loadLiveUrlSet();
    console.log(`  ${liveUrls.size} URLs currently live (jobs/companies/cities/blog/static)`);

    // Move any SAFE URL that's actually live to a separate "stale-gsc" bucket.
    // These are GSC false alarms — they may have been broken when GSC indexed
    // them, but they're alive now after our fixes shipped in P1.
    const staleGsc: Map<string, string> = new Map();
    for (const [url, label] of buckets.safe) {
        // Strip query string for matching (Google sometimes indexes ?utm_*)
        const bare = url.split('?')[0];
        if (liveUrls.has(url) || liveUrls.has(bare)) {
            staleGsc.set(url, label);
        }
    }
    for (const url of staleGsc.keys()) buckets.safe.delete(url);

    console.log(`  ${staleGsc.size} URLs removed from SAFE bucket — they're alive now (GSC label is stale).`);

    console.log(`\nSAFE bucket (submit to GSC Removal Tool):  ${buckets.safe.size} URLs`);
    for (const [src, n] of [...buckets.safeBySource.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${n.toString().padStart(5)}  ${src}`);
    }
    console.log(`\nRISKY bucket (review manually):  ${buckets.risky.size} URLs`);
    for (const [src, n] of [...buckets.riskyBySource.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${n.toString().padStart(5)}  ${src}`);
    }

    // Sort SAFE by URL alphabetically (groups same-prefix URLs together for easier batched submission).
    const safeUrls = [...buckets.safe.keys()].sort();
    const riskyUrls = [...buckets.risky.keys()].sort();

    const safePath = resolve(process.cwd(), 'gsc-removal-safe.txt');
    const riskyPath = resolve(process.cwd(), 'gsc-removal-risky.txt');
    const staleGscPath = resolve(process.cwd(), 'gsc-stale-labels.txt');
    writeFileSync(safePath, safeUrls.join('\n'), 'utf8');
    writeFileSync(riskyPath, riskyUrls.join('\n'), 'utf8');
    writeFileSync(staleGscPath, [...staleGsc.keys()].sort().join('\n'), 'utf8');

    console.log(`\nWrote:`);
    console.log(`  ${safePath}  (${safeUrls.length} URLs — submit these to GSC Removal)`);
    console.log(`  ${riskyPath}  (${riskyUrls.length} URLs — review manually)`);
    console.log(`  ${staleGscPath}  (${staleGsc.size} URLs — currently live; GSC labels are stale)`);

    if (ENQUEUE) {
        console.log(`\nEnqueueing ${safeUrls.length} SAFE URLs into deindex_queue...`);
        const prisma = await getPrisma();
        let inserted = 0;
        for (const url of safeUrls) {
            const issue = buckets.safe.get(url) ?? 'gsc-other';
            try {
                await prisma.deindexQueue.upsert({
                    where: { url },
                    update: {},
                    create: { url, source: issue },
                });
                inserted++;
            } catch (err) {
                console.error(`  upsert failed for ${url}:`, err);
            }
            if (inserted % 500 === 0) console.log(`  ...${inserted}/${safeUrls.length}`);
        }
        console.log(`Enqueued ${inserted}.`);
    }

    console.log(`\nNext step: paste each URL from gsc-removal-safe.txt into`);
    console.log(`https://search.google.com/search-console/removals → Remove this URL only.`);
    console.log(`(GSC quota: 1,000 URLs/day per property.)`);
}

main()
    .catch((err) => { console.error(err); process.exit(1); })
    .finally(async () => { if (prismaCache) await prismaCache.$disconnect(); });
