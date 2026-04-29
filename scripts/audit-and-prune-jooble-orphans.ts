/**
 * One-shot Jooble orphan detector.
 *
 * Jooble blocks server-to-server probes with HTTP 403, so the dead-link
 * cron can never tell which Jooble jobs are alive. The only reliable
 * signal is source-presence: if a job's external_id no longer comes back
 * from Jooble's own search API across the keyword set we use for
 * ingestion, the job is orphaned at source and safe to unpublish.
 *
 * This script does that comparison once, right now, without depending on
 * the source-presence schema migration that's still waiting on the
 * dev → main merge. The persistent / continuous version of this same
 * check ships in Sprints 2 + 5.1 — once that lands, this script is
 * obsolete.
 *
 * Decision policy:
 *   - Job published in DB AND external_id present in today's fetch → keep.
 *   - Job published in DB AND external_id NOT in today's fetch → orphan,
 *     unpublish (with --apply).
 *   - Partial-fetch guard: refuse to act if today's fetch returned less
 *     than 50% of the 7-day rolling average from source_stats. Source
 *     outages must never strike valid jobs.
 *
 * SEO handling: same pipeline as natural-aging-out jobs — slug pages
 * already render the noindex "position no longer available" content,
 * and the existing /api/cron/deindex-expired cron pings Google +
 * IndexNow with URL_DELETED at 100/day Google quota.
 *
 * Usage:
 *   ts-node -r tsconfig-paths/register --project scripts/tsconfig.json \
 *     scripts/audit-and-prune-jooble-orphans.ts
 *
 *   ts-node -r tsconfig-paths/register --project scripts/tsconfig.json \
 *     scripts/audit-and-prune-jooble-orphans.ts --apply
 */

import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { prisma } from '@/lib/prisma';
import { fetchJoobleJobs } from '@/lib/aggregators/jooble';
import { loadHistoricalAvgFetched } from '@/lib/health/source-presence';
import * as fs from 'fs';

const REPORT_PATH = '.tmp_audit_jooble_orphans.json';
const SOURCE = 'jooble';
const MIN_FETCH_RATIO = 0.5;
const DB_WRITE_BATCH_SIZE = 250;

interface OrphanRow {
    id: string;
    externalId: string;
    title: string;
    employer: string;
    qualityScore: number;
    createdAt: Date;
    expiresAt: Date | null;
}

interface OrphanReport {
    generatedAt: string;
    fetchedCount: number;
    fetchedUniqueIds: number;
    historicalAvgFetched: number;
    publishedCount: number;
    matchedCount: number;
    orphanCount: number;
    sampleOrphans: Array<{
        id: string;
        externalId: string;
        title: string;
        employer: string;
        qualityScore: number;
        createdAt: string;
    }>;
}

function parseArgs(): { apply: boolean; maxUnpublish: number } {
    const args = process.argv.slice(2);
    const maxIdx = args.indexOf('--max-unpublish');
    return {
        apply: args.includes('--apply'),
        maxUnpublish:
            maxIdx >= 0 && args[maxIdx + 1]
                ? Math.max(0, parseInt(args[maxIdx + 1], 10) || 0)
                : Number.POSITIVE_INFINITY,
    };
}

async function main(): Promise<void> {
    const args = parseArgs();
    const startedAt = Date.now();

    console.log('\n=== JOOBLE ORPHAN AUDIT ===');
    console.log(`Mode: ${args.apply ? 'APPLY (will unpublish orphans)' : 'DRY-RUN'}`);
    if (args.maxUnpublish !== Number.POSITIVE_INFINITY) {
        console.log(`Max unpublish per run: ${args.maxUnpublish}`);
    }

    // 1. Fetch Jooble's current keyword-driven catalog.
    console.log('\nFetching from Jooble API (using configured keyword set)...');
    const fetched = await fetchJoobleJobs();
    console.log(`  Returned: ${fetched.length} raw items`);

    // 2. Build the unique external_id set (Jooble's keyword fetches
    //    overlap heavily — same job appears under multiple queries).
    const fetchedIds = new Set<string>();
    for (const raw of fetched) {
        const id = (raw as { externalId?: unknown }).externalId;
        if (typeof id === 'string' && id.length > 0) {
            fetchedIds.add(id);
        }
    }
    console.log(`  Unique external_ids: ${fetchedIds.size}`);

    // 3. Partial-fetch guard. If today's fetch is far below baseline,
    //    refuse to run — likely a Jooble API outage or rate limit.
    const baseline = await loadHistoricalAvgFetched(prisma, SOURCE);
    console.log(`  7-day rolling avg fetched: ${baseline.toFixed(0)}`);
    if (baseline > 0) {
        const required = Math.floor(baseline * MIN_FETCH_RATIO);
        if (fetched.length < required) {
            console.error(
                `\nABORT: today's fetch (${fetched.length}) is below ${(MIN_FETCH_RATIO * 100).toFixed(0)}% of baseline (${baseline.toFixed(0)}).`,
            );
            console.error(
                'This usually means a Jooble outage or rate limit. Refusing to mark jobs orphaned on a partial fetch.',
            );
            console.error('Re-run later when the fetch volume looks normal.');
            process.exit(2);
        }
    } else {
        console.warn('  No historical baseline yet — skipping the partial-fetch guard.');
    }

    // 4. Pull all currently-published Jooble jobs from the DB.
    const published = await prisma.job.findMany({
        where: {
            sourceProvider: SOURCE,
            isPublished: true,
            isManuallyUnpublished: false,
            externalId: { not: null },
        },
        select: {
            id: true,
            externalId: true,
            title: true,
            employer: true,
            qualityScore: true,
            createdAt: true,
            expiresAt: true,
        },
    });
    console.log(`\nPublished Jooble jobs in DB: ${published.length}`);

    // 5. Diff.
    const orphans: OrphanRow[] = [];
    let matched = 0;
    for (const job of published) {
        if (!job.externalId) continue;
        if (fetchedIds.has(job.externalId)) {
            matched++;
        } else {
            orphans.push(job as OrphanRow);
        }
    }

    console.log(`Matched (still in Jooble's catalog): ${matched}`);
    console.log(`Orphans (no longer in fetch):        ${orphans.length}`);
    console.log(`Orphan rate:                         ${published.length > 0 ? ((orphans.length / published.length) * 100).toFixed(1) : '0.0'}%`);

    // 6. Persist a report for offline review.
    const report: OrphanReport = {
        generatedAt: new Date(startedAt).toISOString(),
        fetchedCount: fetched.length,
        fetchedUniqueIds: fetchedIds.size,
        historicalAvgFetched: baseline,
        publishedCount: published.length,
        matchedCount: matched,
        orphanCount: orphans.length,
        sampleOrphans: orphans.slice(0, 25).map((o) => ({
            id: o.id,
            externalId: o.externalId,
            title: o.title,
            employer: o.employer,
            qualityScore: o.qualityScore,
            createdAt: o.createdAt.toISOString(),
        })),
    };
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(`\nReport saved: ${REPORT_PATH}`);

    if (orphans.length > 0) {
        // Sample orphans by quality + age for sanity check.
        const sortedByQuality = [...orphans].sort((a, b) => b.qualityScore - a.qualityScore);
        console.log('\nTop-quality orphans (sample):');
        for (const o of sortedByQuality.slice(0, 5)) {
            console.log(`  q=${o.qualityScore.toString().padStart(3)}  ${o.title.slice(0, 60).padEnd(60)}  ${o.employer.slice(0, 25)}`);
        }
        console.log('\nLowest-quality orphans (sample):');
        for (const o of sortedByQuality.slice(-5)) {
            console.log(`  q=${o.qualityScore.toString().padStart(3)}  ${o.title.slice(0, 60).padEnd(60)}  ${o.employer.slice(0, 25)}`);
        }
    }

    // 7. Apply.
    if (!args.apply) {
        console.log('\nDry-run complete. Pass --apply to actually unpublish.\n');
        return;
    }

    if (orphans.length === 0) {
        console.log('\nNo orphans to unpublish. Done.\n');
        return;
    }

    const targets = orphans.slice(0, args.maxUnpublish);
    console.log(`\nUnpublishing ${targets.length}${targets.length < orphans.length ? ` (capped from ${orphans.length})` : ''}...`);
    let total = 0;
    for (let i = 0; i < targets.length; i += DB_WRITE_BATCH_SIZE) {
        const slice = targets.slice(i, i + DB_WRITE_BATCH_SIZE).map((o) => o.id);
        const r = await prisma.job.updateMany({
            where: { id: { in: slice }, isManuallyUnpublished: false },
            data: { isPublished: false },
        });
        total += r.count;
        console.log(`  unpublished ${total}/${targets.length}`);
    }
    console.log(`\nDone. Marked ${total} Jooble orphans is_published=false.`);
    console.log('The deindex-expired cron at 12:45 / 18:45 UTC will start pinging\n');
    console.log('Google + IndexNow with URL_DELETED at ~100/day Google quota.\n');
}

main()
    .then(async () => {
        await prisma.$disconnect();
        process.exit(0);
    })
    .catch(async (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('FATAL:', msg);
        await prisma.$disconnect();
        process.exit(1);
    });
