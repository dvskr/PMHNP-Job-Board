/**
 * GSC Indexing Crisis (P2.2 — Option 2): produce a verified-dead URL list
 * for safe submission to GSC's URL Removal Tool, one-by-one.
 *
 * Reads URLs from GSC ISSUES/ exports → HEAD-checks each one → only keeps
 * URLs that *currently* return 4xx/5xx. This is the safe alternative to
 * prefix removal: no risk of accidentally hiding a healthy ranking page.
 *
 * Outputs:
 *   ./gsc-removal-candidates.csv   — paste each URL into GSC Removals UI
 *   ./gsc-removal-candidates.txt   — plain text, one URL per line (easier to copy)
 *
 * Optional --enqueue flag also pushes them into deindex_queue so the
 * historical-deindex cron submits URL_DELETED to Google Indexing API in
 * parallel (belt + suspenders — manual GSC removal is instant ~24h, the
 * cron de-indexes permanently).
 *
 * Run:
 *   npx tsx scripts/verify-and-prepare-removal.ts                     # CSV only
 *   npx tsx scripts/verify-and-prepare-removal.ts --enqueue           # also enqueue
 *   npx tsx scripts/verify-and-prepare-removal.ts --concurrency 30    # tune speed
 *   npx tsx scripts/verify-and-prepare-removal.ts --max 1000          # cap output
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });
dotenvConfig({ path: '.env' });
dotenvConfig({ path: '.env.prod' });

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const GSC_DIR = join(process.cwd(), 'GSC ISSUES');
const ENQUEUE = process.argv.includes('--enqueue');
const concurrencyIdx = process.argv.indexOf('--concurrency');
// Default 3 — Vercel's edge platform rate-limits self-crawls aggressively.
// At concurrency 20 we got 100% 429s. At 3 with 400ms inter-batch sleep we
// stay under the platform DDoS threshold.
const CONCURRENCY = concurrencyIdx > 0 ? parseInt(process.argv[concurrencyIdx + 1], 10) || 3 : 3;
const maxIdx = process.argv.indexOf('--max');
const MAX_OUTPUT = maxIdx > 0 ? parseInt(process.argv[maxIdx + 1], 10) || 0 : 0;
const HEAD_TIMEOUT_MS = 10000;
const INTER_BATCH_SLEEP_MS = 400;
const MAX_BACKOFF_RETRIES = 3;

type PrismaModule = typeof import('@/lib/prisma');
let prismaCache: PrismaModule['prisma'] | null = null;
async function getPrisma() {
    if (!prismaCache) prismaCache = (await import('@/lib/prisma')).prisma;
    return prismaCache;
}

interface CandidateRow {
    url: string;
    source: string;
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

function inferSource(folderName: string, metadata: string): string {
    const m = metadata.match(/Issue,(.+)/i);
    const issue = m ? m[1].trim().replace(/^"|"$/g, '').toLowerCase() : '';
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

function loadCandidates(): CandidateRow[] {
    if (!existsSync(GSC_DIR)) {
        console.error(`GSC ISSUES directory not found at ${GSC_DIR}`);
        process.exit(1);
    }

    // Source-priority dedup: a URL appearing in multiple drilldowns gets the
    // most-actionable label.
    const sourcePriority: Record<string, number> = {
        'gsc-not-found': 100,
        'gsc-soft-404': 90,
        'gsc-5xx': 85,
        'gsc-crawled-not-indexed': 70,
        'gsc-discovered-not-indexed': 60,
        'gsc-redirect': 40,
        'gsc-duplicate-no-canonical': 30,
    };

    const folders = readdirSync(GSC_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);

    const seen = new Map<string, CandidateRow>();
    for (const folder of folders) {
        const tablePath = join(GSC_DIR, folder, 'Table.csv');
        const metaPath = join(GSC_DIR, folder, 'Metadata.csv');
        if (!existsSync(tablePath) || !existsSync(metaPath)) continue;

        const source = inferSource(folder, readFileSync(metaPath, 'utf8'));
        for (const url of parseTableCsv(readFileSync(tablePath, 'utf8'))) {
            // Skip non-canonical surfaces — these aren't useful to submit to
            // GSC's Removal Tool, and we never want to remove asset URLs.
            if (url.includes('/_next/')) continue;
            if (url.includes('/api/')) continue;

            const existing = seen.get(url);
            const existingPriority = existing ? sourcePriority[existing.source] ?? 0 : -1;
            const newPriority = sourcePriority[source] ?? 0;
            if (!existing || newPriority > existingPriority) {
                seen.set(url, { url, source });
            }
        }
    }

    return [...seen.values()];
}

async function rawHeadCheck(url: string): Promise<number> {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), HEAD_TIMEOUT_MS);
        const res = await fetch(url, {
            method: 'HEAD',
            redirect: 'manual',
            signal: controller.signal,
            headers: { 'User-Agent': 'PMHNPHiringIndexer/1.0 (+https://pmhnphiring.com/about)' },
        });
        clearTimeout(timer);
        return res.status;
    } catch {
        return 0;
    }
}

// On 429 (platform DDoS rate-limit) back off exponentially and retry.
// Without this, every URL during a hammer-burst gets falsely classified as 429.
async function headCheck(url: string): Promise<number> {
    for (let attempt = 0; attempt <= MAX_BACKOFF_RETRIES; attempt++) {
        const status = await rawHeadCheck(url);
        if (status !== 429) return status;
        if (attempt === MAX_BACKOFF_RETRIES) return 429;
        const sleepMs = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
        await new Promise((r) => setTimeout(r, sleepMs));
    }
    return 429;
}

async function checkBatch(rows: CandidateRow[]): Promise<{ row: CandidateRow; status: number }[]> {
    return Promise.all(rows.map(async (row) => ({ row, status: await headCheck(row.url) })));
}

function csvEscape(s: string | number): string {
    const str = String(s);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

async function main() {
    const candidates = loadCandidates();
    console.log(`Loaded ${candidates.length} unique candidate URLs from GSC ISSUES/`);
    console.log(`HEAD-checking with concurrency ${CONCURRENCY}, ${HEAD_TIMEOUT_MS}ms timeout per URL...`);
    console.log(`(This typically takes 5–10 minutes for ~9k URLs.)\n`);

    const verifiedDead: { url: string; status: number; source: string }[] = [];
    const stillAlive: { url: string; source: string }[] = [];
    const networkErrors: { url: string; source: string }[] = [];

    let processed = 0;
    const start = Date.now();

    let throttled = 0;
    for (let i = 0; i < candidates.length; i += CONCURRENCY) {
        const batch = candidates.slice(i, i + CONCURRENCY);
        const results = await checkBatch(batch);
        for (const r of results) {
            if (r.status === 0) {
                networkErrors.push({ url: r.row.url, source: r.row.source });
            } else if (r.status === 429) {
                // Even after retries we got 429 — can't classify; treat as inconclusive.
                throttled++;
                networkErrors.push({ url: r.row.url, source: r.row.source });
            } else if (r.status >= 200 && r.status < 400) {
                stillAlive.push({ url: r.row.url, source: r.row.source });
            } else {
                verifiedDead.push({ url: r.row.url, status: r.status, source: r.row.source });
            }
        }
        processed += batch.length;
        if (processed % 200 === 0 || processed === candidates.length) {
            const elapsed = ((Date.now() - start) / 1000).toFixed(0);
            const ratePerMin = processed > 0 ? Math.round((processed / Math.max(1, parseFloat(elapsed))) * 60) : 0;
            console.log(`  ${processed}/${candidates.length} checked  (${elapsed}s elapsed, ${ratePerMin}/min, dead=${verifiedDead.length}, alive=${stillAlive.length}, throttled=${throttled})`);
        }
        // Pace ourselves so Vercel's platform DDoS layer doesn't 429 us.
        if (i + CONCURRENCY < candidates.length) {
            await new Promise((r) => setTimeout(r, INTER_BATCH_SLEEP_MS));
        }
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\nHEAD-check complete in ${elapsed}s.`);
    console.log(`  Verified dead (4xx/5xx):  ${verifiedDead.length}`);
    console.log(`  Still alive (200/3xx):    ${stillAlive.length}`);
    console.log(`  Network error / timeout:  ${networkErrors.length}`);

    // Sort verified-dead by status (404 first — strongest removal candidates) then alphabetically.
    verifiedDead.sort((a, b) => {
        if (a.status !== b.status) return a.status - b.status;
        return a.url.localeCompare(b.url);
    });

    const output = MAX_OUTPUT > 0 ? verifiedDead.slice(0, MAX_OUTPUT) : verifiedDead;

    // Write CSV
    const csvPath = resolve(process.cwd(), 'gsc-removal-candidates.csv');
    const csvHeader = 'URL,Status,Source\n';
    const csvBody = output.map(d => `${csvEscape(d.url)},${d.status},${csvEscape(d.source)}`).join('\n');
    writeFileSync(csvPath, csvHeader + csvBody, 'utf8');

    // Write plain-text URL list (easier to copy/paste one-by-one into GSC UI)
    const txtPath = resolve(process.cwd(), 'gsc-removal-candidates.txt');
    writeFileSync(txtPath, output.map(d => d.url).join('\n'), 'utf8');

    console.log(`\nOutputs:`);
    console.log(`  ${csvPath}  (${output.length} rows, with status + source)`);
    console.log(`  ${txtPath}  (URLs only, one per line)`);

    // Status breakdown for the writeup
    const byStatus = new Map<number, number>();
    for (const d of output) byStatus.set(d.status, (byStatus.get(d.status) ?? 0) + 1);
    console.log(`\nVerified-dead breakdown by status:`);
    for (const [s, n] of [...byStatus.entries()].sort((a, b) => a[0] - b[0])) {
        console.log(`  ${s}: ${n}`);
    }

    if (ENQUEUE) {
        console.log(`\nEnqueueing ${output.length} URLs into deindex_queue for cron submission...`);
        const prisma = await getPrisma();
        let inserted = 0;
        for (const d of output) {
            try {
                await prisma.deindexQueue.upsert({
                    where: { url: d.url },
                    update: {},
                    create: { url: d.url, source: d.source },
                });
                inserted++;
            } catch (err) {
                console.error(`  upsert failed for ${d.url}:`, err);
            }
            if (inserted % 200 === 0) console.log(`  ...${inserted}/${output.length}`);
        }
        console.log(`Enqueued ${inserted} URLs.`);
    }

    // Highlight URLs that need attention (still alive — these are GSC false alarms or our healthy pages).
    if (stillAlive.length > 0) {
        const aliveSamplePath = resolve(process.cwd(), 'gsc-still-alive-sample.txt');
        writeFileSync(aliveSamplePath, stillAlive.slice(0, 100).map(s => s.url).join('\n'), 'utf8');
        console.log(`\n${stillAlive.length} URLs in GSC's broken list are actually alive now.`);
        console.log(`Sample of 100 written to ${aliveSamplePath} — these are healthy pages we DON'T want to remove.`);
    }

    console.log(`\nNext: paste URLs from gsc-removal-candidates.txt into GSC Removals one-by-one,`);
    console.log(`or upload the CSV. Submit at https://search.google.com/search-console/removals`);
}

main()
    .catch((err) => { console.error(err); process.exit(1); })
    .finally(async () => { if (prismaCache) await prismaCache.$disconnect(); });
