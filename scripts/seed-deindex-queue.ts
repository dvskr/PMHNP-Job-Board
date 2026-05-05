/**
 * GSC Indexing Crisis (P2.1): seed the deindex_queue from GSC bulk exports.
 *
 * Reads the CSVs in `GSC ISSUES/` and enqueues the URLs into the
 * deindex_queue table. The historical-deindex cron then drains the queue,
 * HEAD-checking each URL and submitting URL_DELETED for dead ones.
 *
 * Run once after deploying P2.1, then re-run after each fresh GSC export.
 *
 *   npx tsx scripts/seed-deindex-queue.ts
 *   npx tsx scripts/seed-deindex-queue.ts --dry-run
 *
 * Idempotent: uses upsert with the url unique key, so re-running won't
 * duplicate rows. Already-submitted rows are not reset.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });
dotenvConfig({ path: '.env' });
dotenvConfig({ path: '.env.prod' });

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

// Dynamic import so dotenv runs first (tsx/ESM hoists static imports).
type PrismaModule = typeof import('@/lib/prisma');
let prismaCache: PrismaModule['prisma'] | null = null;
async function getPrisma() {
    if (!prismaCache) prismaCache = (await import('@/lib/prisma')).prisma;
    return prismaCache;
}

const GSC_DIR = join(process.cwd(), 'GSC ISSUES');
const DRY_RUN = process.argv.includes('--dry-run');

// Map a GSC folder/issue type to the `source` enum value we store.
function inferSource(folderName: string, metadata: string): string {
    // Drilldown folders contain Metadata.csv with Issue:<name>
    const issueMatch = metadata.match(/Issue,(.+)/i);
    const issue = issueMatch ? issueMatch[1].trim().replace(/^"|"$/g, '').toLowerCase() : '';

    if (issue.includes('not found')) return 'gsc-not-found';
    if (issue.includes('crawled') && issue.includes('not indexed')) return 'gsc-crawled-not-indexed';
    if (issue.includes('discovered')) return 'gsc-discovered-not-indexed';
    if (issue.includes('soft 404')) return 'gsc-soft-404';
    if (issue.includes('duplicate')) return 'gsc-duplicate-no-canonical';
    if (issue.includes('server error')) return 'gsc-5xx';
    if (issue.includes('redirect')) return 'gsc-redirect';
    if (issue.includes('blocked by robots.txt') && issue.includes('indexed')) return 'gsc-indexed-blocked';
    if (issue.includes('blocked by robots.txt')) return 'gsc-blocked-robots';
    if (issue.includes('alternative')) return 'gsc-alternative-canonical';
    return `gsc-other:${folderName}`;
}

// Parse a CSV that has columns starting with URL.
// Handles quoted fields with commas inside (e.g. `"https://...?location=City, ST"`).
function parseTableCsv(content: string): string[] {
    const lines = content.split(/\r?\n/);
    const urls: string[] = [];
    for (let i = 1; i < lines.length; i++) { // skip header row
        const line = lines[i];
        if (!line) continue;
        // The URL is the first column. If it starts with a quote, find the closing quote.
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

async function main() {
    if (!existsSync(GSC_DIR)) {
        console.error(`GSC ISSUES directory not found at ${GSC_DIR}`);
        process.exit(1);
    }

    const folders = readdirSync(GSC_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);

    // Dedup by URL across all folders (one URL may appear in multiple drilldowns).
    // Prefer the most-actionable source: not-found > soft-404 > crawled-not-indexed > discovered > others.
    const sourcePriority: Record<string, number> = {
        'gsc-not-found': 100,
        'gsc-soft-404': 90,
        'gsc-5xx': 85,
        'gsc-crawled-not-indexed': 70,
        'gsc-discovered-not-indexed': 60,
        'gsc-redirect': 40,
        'gsc-duplicate-no-canonical': 30,
        'gsc-alternative-canonical': 20,
        'gsc-indexed-blocked': 10,
        'gsc-blocked-robots': 5,
    };
    const candidates = new Map<string, { url: string; source: string }>();

    for (const folder of folders) {
        const tablePath = join(GSC_DIR, folder, 'Table.csv');
        const metaPath = join(GSC_DIR, folder, 'Metadata.csv');
        if (!existsSync(tablePath) || !existsSync(metaPath)) continue;

        const metaRaw = readFileSync(metaPath, 'utf8');
        const source = inferSource(folder, metaRaw);
        const tableRaw = readFileSync(tablePath, 'utf8');
        const urls = parseTableCsv(tableRaw);

        console.log(`  ${basename(folder)}: source=${source}, urls=${urls.length}`);
        for (const url of urls) {
            // Skip non-canonical surfaces we don't want de-indexed:
            //  - /_next/static/* — Next.js asset URLs that are auto-versioned and self-resolve
            //  - /api/* — API endpoints, not indexable in the first place
            if (url.includes('/_next/')) continue;
            if (url.includes('/api/')) continue;

            const existing = candidates.get(url);
            const existingPriority = existing ? sourcePriority[existing.source] ?? 0 : -1;
            const newPriority = sourcePriority[source] ?? 0;
            if (!existing || newPriority > existingPriority) {
                candidates.set(url, { url, source });
            }
        }
    }

    console.log(`\nTotal unique URLs to enqueue: ${candidates.size}`);
    if (DRY_RUN) {
        const bySource = new Map<string, number>();
        for (const c of candidates.values()) {
            bySource.set(c.source, (bySource.get(c.source) ?? 0) + 1);
        }
        console.log('By source:');
        for (const [s, n] of [...bySource.entries()].sort((a, b) => b[1] - a[1])) {
            console.log(`  ${s}: ${n}`);
        }
        return;
    }

    const prisma = await getPrisma();
    let inserted = 0;
    let skipped = 0;
    for (const c of candidates.values()) {
        try {
            await prisma.deindexQueue.upsert({
                where: { url: c.url },
                update: {}, // do not overwrite — preserve attempt/status from prior runs
                create: { url: c.url, source: c.source },
            });
            inserted++;
        } catch (err) {
            console.error(`  upsert failed for ${c.url}:`, err);
            skipped++;
        }
        if (inserted % 500 === 0) {
            console.log(`  ...inserted ${inserted}/${candidates.size}`);
        }
    }
    console.log(`\nDone. Upserted ${inserted}, skipped ${skipped}.`);
}

main()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    })
    .finally(async () => {
        if (prismaCache) await prismaCache.$disconnect();
    });
