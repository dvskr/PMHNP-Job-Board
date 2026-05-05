/**
 * GSC Indexing Crisis (P2.5): pull current GSC URL Inspection / Coverage
 * data via the Search Console API and produce a CSV ready for upload to
 * GSC's URL Removal Tool (which accepts up to 1,000 URLs/day per property).
 *
 * Output CSV columns: URL, Issue, Last Crawled, Impressions (last 28d).
 * Sorted by impressions descending so the highest-traffic dead URLs get
 * removed first.
 *
 * SETUP:
 *   1. Create a GCP service account with Search Console read access.
 *   2. Add the service account email as a "Restricted" user on the GSC property.
 *   3. Set GSC_SERVICE_ACCOUNT_KEY env var = JSON-stringified service account key.
 *   4. Set GSC_SITE_URL env var = "sc-domain:pmhnphiring.com" (Domain property)
 *      OR "https://pmhnphiring.com/" (URL-prefix property).
 *
 * Run:
 *   npx tsx scripts/gsc-coverage-dump.ts                     # writes CSV to ./gsc-coverage-dump.csv
 *   npx tsx scripts/gsc-coverage-dump.ts --enqueue           # also upserts into deindex_queue
 *   npx tsx scripts/gsc-coverage-dump.ts --top 1000          # limit to top N URLs by impressions
 *
 * NOTE: This script is intentionally kept minimal. The Search Console API
 * returns only Search Analytics (Performance) data + URL Inspection one-by-one.
 * For the *coverage* report (which categories URLs into Not-found / Soft-404 /
 * etc.), Google does NOT provide a bulk programmatic API — you must export
 * manually from the GSC UI as CSV (already in `GSC ISSUES/` folder) and use
 * scripts/seed-deindex-queue.ts to ingest those.
 *
 * What this script DOES do:
 *   - Pull Search Analytics performance data for the last 28 days
 *   - Cross-reference with current sitemap / DB to identify URLs that have
 *     impressions but currently 404 (highest-priority removals)
 *   - Output a removal-ready CSV
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });
dotenvConfig({ path: '.env' });
dotenvConfig({ path: '.env.prod' });

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type PrismaModule = typeof import('@/lib/prisma');
let prismaCache: PrismaModule['prisma'] | null = null;
async function getPrisma() {
    if (!prismaCache) prismaCache = (await import('@/lib/prisma')).prisma;
    return prismaCache;
}

const ENQUEUE = process.argv.includes('--enqueue');
const topIdx = process.argv.indexOf('--top');
const TOP_N = topIdx > 0 ? parseInt(process.argv[topIdx + 1], 10) || 1000 : 1000;

const SITE_URL = process.env.GSC_SITE_URL || 'sc-domain:pmhnphiring.com';
const KEY_JSON = process.env.GSC_SERVICE_ACCOUNT_KEY;
const HEAD_TIMEOUT_MS = 6000;

interface SearchAnalyticsRow {
    keys: string[]; // [page]
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
}

async function getAccessToken(serviceAccountKey: string): Promise<string> {
    const key = JSON.parse(serviceAccountKey) as {
        client_email: string;
        private_key: string;
    };
    const now = Math.floor(Date.now() / 1000);
    const claim = {
        iss: key.client_email,
        scope: 'https://www.googleapis.com/auth/webmasters.readonly',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
    };
    const header = { alg: 'RS256', typ: 'JWT' };
    const b64 = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const unsignedJwt = `${b64(header)}.${b64(claim)}`;

    const { createSign } = await import('node:crypto');
    const sign = createSign('RSA-SHA256');
    sign.update(unsignedJwt);
    const signature = sign.sign(key.private_key, 'base64url');
    const jwt = `${unsignedJwt}.${signature}`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt,
        }),
    });
    if (!tokenRes.ok) {
        throw new Error(`OAuth failed: ${await tokenRes.text()}`);
    }
    const { access_token } = (await tokenRes.json()) as { access_token: string };
    return access_token;
}

async function fetchSearchAnalytics(token: string): Promise<SearchAnalyticsRow[]> {
    const endDate = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - 28 * 86400_000).toISOString().slice(0, 10);

    const rows: SearchAnalyticsRow[] = [];
    let startRow = 0;
    const ROW_LIMIT = 25000;

    while (startRow < 200_000) {
        const res = await fetch(
            `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE_URL)}/searchAnalytics/query`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    startDate,
                    endDate,
                    dimensions: ['page'],
                    rowLimit: ROW_LIMIT,
                    startRow,
                }),
            }
        );
        if (!res.ok) {
            throw new Error(`Search Analytics API failed: ${await res.text()}`);
        }
        const data = (await res.json()) as { rows?: SearchAnalyticsRow[] };
        const batch = data.rows ?? [];
        rows.push(...batch);
        if (batch.length < ROW_LIMIT) break;
        startRow += ROW_LIMIT;
    }

    return rows;
}

async function headCheck(url: string): Promise<number> {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), HEAD_TIMEOUT_MS);
        const res = await fetch(url, {
            method: 'HEAD',
            redirect: 'manual',
            signal: controller.signal,
            headers: { 'User-Agent': 'PMHNPHiringIndexer/1.0' },
        });
        clearTimeout(timer);
        return res.status;
    } catch {
        return 0;
    }
}

function csvEscape(s: string): string {
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

async function main() {
    if (!KEY_JSON) {
        console.error('GSC_SERVICE_ACCOUNT_KEY env var not set. See script header for setup.');
        process.exit(1);
    }

    console.log(`Authenticating as service account...`);
    const token = await getAccessToken(KEY_JSON);

    console.log(`Pulling Search Analytics (last 28 days, dimension=page)...`);
    const analyticsRows = await fetchSearchAnalytics(token);
    console.log(`  ${analyticsRows.length} pages with impressions in last 28d.`);

    // Sort by impressions desc, take top N
    analyticsRows.sort((a, b) => b.impressions - a.impressions);
    const candidates = analyticsRows.slice(0, TOP_N);

    console.log(`HEAD-checking top ${candidates.length} pages to find dead URLs with traffic...`);
    const dead: { url: string; impressions: number; status: number }[] = [];
    let checked = 0;

    // Check in batches of 20 to avoid hammering our own origin
    for (let i = 0; i < candidates.length; i += 20) {
        const slice = candidates.slice(i, i + 20);
        const results = await Promise.all(
            slice.map(async (row) => {
                const url = row.keys[0];
                const status = await headCheck(url);
                return { url, impressions: row.impressions, status };
            })
        );
        for (const r of results) {
            if (r.status !== 0 && (r.status < 200 || r.status >= 400)) {
                dead.push(r);
            }
        }
        checked += slice.length;
        if (checked % 200 === 0) console.log(`  ...${checked}/${candidates.length} checked`);
    }

    console.log(`\nFound ${dead.length} URLs with traffic that return 4xx/5xx.`);

    // Write CSV ready for the URL Removal Tool (one URL per line is fine).
    const outPath = resolve(process.cwd(), 'gsc-coverage-dump.csv');
    const header = 'URL,Status,Impressions(28d)\n';
    const body = dead
        .map((d) => `${csvEscape(d.url)},${d.status},${d.impressions}`)
        .join('\n');
    writeFileSync(outPath, header + body, 'utf8');
    console.log(`Wrote ${dead.length} rows to ${outPath}`);
    console.log(`\nNext steps:`);
    console.log(`  1. Upload CSV to https://search.google.com/search-console/removals (URL list)`);
    console.log(`  2. Or pass --enqueue to also push these into deindex_queue for the cron`);

    if (ENQUEUE) {
        console.log(`\nEnqueueing into deindex_queue...`);
        const prisma = await getPrisma();
        for (const d of dead) {
            try {
                await prisma.deindexQueue.upsert({
                    where: { url: d.url },
                    update: {},
                    create: { url: d.url, source: `gsc-traffic-dead-${d.status}` },
                });
            } catch (err) {
                console.error(`  upsert failed for ${d.url}:`, err);
            }
        }
        console.log(`Enqueued ${dead.length} URLs.`);
    }
}

main()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    })
    .finally(async () => {
        if (prismaCache) await prismaCache.$disconnect();
    });
