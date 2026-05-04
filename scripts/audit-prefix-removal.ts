/**
 * GSC Indexing Crisis (P2.2 helper): audit a URL prefix BEFORE submitting it
 * to GSC's URL Removal Tool.
 *
 * The Removal Tool hides every URL under a prefix for ~6 months — including
 * any pages with active jobs. This script answers: "If I remove this prefix,
 * how much real traffic do I lose?"
 *
 * For each candidate prefix it reports:
 *   - Total category×city combinations under the prefix
 *   - Number with ≥1 active job (= the URLs that WOULD be temporarily hidden)
 *   - Top 10 currently-active pages by job count (sanity-check spot)
 *
 * Run:
 *   npx tsx scripts/audit-prefix-removal.ts                   # all candidate prefixes
 *   npx tsx scripts/audit-prefix-removal.ts /jobs/va/city/    # one specific prefix
 */
// Load env so the optional live-DB cross-check (--with-live-counts) can connect.
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });
dotenvConfig({ path: '.env' });
dotenvConfig({ path: '.env.prod' });

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const BASE_URL = 'https://pmhnphiring.com';
const GSC_DIR = join(process.cwd(), 'GSC ISSUES');
const WITH_LIVE = process.argv.includes('--with-live-counts');

// Candidate prefixes ordered by recommended priority (highest leverage, lowest risk first).
const DEFAULT_CANDIDATES = [
    '/jobs/va/city/',
    '/jobs/community-health/city/',
    '/jobs/hospital/city/',
    '/jobs/correctional/city/',
    '/jobs/per-diem/city/',
    '/jobs/private-practice/city/',
    '/jobs/lgbtq/city/',
    '/jobs/crisis/city/',
    '/jobs/geriatric/city/',
    '/jobs/veterans/city/',
];

function prefixToCategorySlug(prefix: string): string | null {
    // /jobs/{cat}/city/  or  /jobs/{cat}/  → return {cat}
    const m = prefix.match(/^\/jobs\/([^/]+)(?:\/city)?\/?$/);
    return m ? m[1] : null;
}

type PrismaModule = typeof import('@/lib/prisma');
let prismaCache: PrismaModule['prisma'] | null = null;
async function getPrisma() {
    if (!prismaCache) {
        const mod = await import('@/lib/prisma');
        prismaCache = mod.prisma;
    }
    return prismaCache;
}

// ─── GSC export reader ──────────────────────────────────────────────────────
// The GSC ISSUES/ folder holds the actual URLs Google has cached as broken.
// This is the *real* dataset for prefix audit — pseoStats is forward-looking;
// these CSVs show what's already polluting the index.

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

function loadAllGscUrls(): string[] {
    if (!existsSync(GSC_DIR)) return [];
    const folders = readdirSync(GSC_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    const urls = new Set<string>();
    for (const folder of folders) {
        const tablePath = join(GSC_DIR, folder, 'Table.csv');
        if (!existsSync(tablePath)) continue;
        for (const u of parseTableCsv(readFileSync(tablePath, 'utf8'))) {
            urls.add(u);
        }
    }
    return [...urls];
}

const ALL_GSC_URLS = loadAllGscUrls();

async function auditPrefix(prefix: string) {
    const cat = prefixToCategorySlug(prefix);
    if (!cat) {
        console.log(`\n${prefix}\n  ⚠ Unrecognized prefix shape — skipping.`);
        return;
    }

    const fullPrefix = `${BASE_URL}${prefix}`;

    // Primary signal: how many URLs Google has cached under this prefix?
    // (Sourced from GSC ISSUES/ exports — the actual list of polluted URLs.)
    const gscCached = ALL_GSC_URLS.filter((u) => u.startsWith(fullPrefix));

    // Optional secondary signal: how many of those URLs match a city/state
    // that currently has ANY active job? Requires the DB and is approximate
    // (catalog-wide count, not category-specific).
    let activeCityCount: number | null = null;
    let topActiveCities: { city: string | null; state: string | null; count: number }[] = [];
    if (WITH_LIVE) {
        try {
            const prisma = await getPrisma();
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
            activeCityCount = cityRows.length;
            topActiveCities = cityRows
                .map((r) => ({ city: r.city, state: r.state, count: r._count._all }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 10);
        } catch (err) {
            console.error('  (live count failed:', err instanceof Error ? err.message : String(err), ')');
        }
    }

    console.log(`\n${fullPrefix}`);
    console.log(`  URLs Google has cached under this prefix:  ${gscCached.length}`);
    if (gscCached.length > 0) {
        console.log(`  Sample cached URLs (first 5):`);
        for (const u of gscCached.slice(0, 5)) console.log(`    ${u}`);
    }

    if (WITH_LIVE && activeCityCount !== null) {
        console.log(`  Cities catalog-wide with ≥1 active job:    ${activeCityCount}`);
        console.log(`  (catalog-wide; not category-specific — overstates actual collateral)`);
    }

    // Risk assessment based on GSC cache footprint:
    if (gscCached.length === 0) {
        console.log(`  ⚪ NO CACHED URLs — prefix removal not needed (GSC index already clean).`);
    } else if (gscCached.length >= 1000) {
        console.log(`  ✅ HIGH-VALUE PREFIX REMOVAL — ${gscCached.length} cached URLs would be hidden. Strong recommend.`);
    } else if (gscCached.length >= 200) {
        console.log(`  ✅ GOOD — ${gscCached.length} cached URLs. Worth submitting.`);
    } else {
        console.log(`  🟡 LOW VOLUME — only ${gscCached.length} cached URLs. Per-URL removal may suffice.`);
    }
}

async function main() {
    // First positional arg that doesn't start with -- is the prefix override.
    const arg = process.argv.slice(2).find((a) => !a.startsWith('--'));
    const prefixes = arg ? [arg.startsWith('/') ? arg : `/${arg}`] : DEFAULT_CANDIDATES;

    console.log(`Loaded ${ALL_GSC_URLS.length} unique URLs from GSC ISSUES/ exports.`);
    console.log(`Auditing ${prefixes.length} prefix${prefixes.length === 1 ? '' : 'es'}...`);
    if (!WITH_LIVE) console.log(`(Pass --with-live-counts to also query the live jobs table.)`);

    for (const p of prefixes) {
        await auditPrefix(p);
    }

    console.log(`\nDone. Recommended order: highest cached-URL count first.`);
    console.log(`Submit at: https://search.google.com/search-console/removals`);
}

main()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    })
    .finally(async () => {
        if (prismaCache) await prismaCache.$disconnect();
    });
