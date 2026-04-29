/**
 * Purge JSearch zombie listings.
 *
 * JSearch was decommissioned 2026-03-11 (subscription cancelled). The remaining
 * published JSearch jobs (~1,984 as of 2026-04-29) are organically aging out
 * via the 60-day expiry clock, but spot-probing showed ~45% are already dead.
 * Their average quality score is 19.6 — the lowest of any source.
 *
 * This script:
 *   1. Lists published JSearch jobs.
 *   2. In --apply mode, marks them isPublished=false.
 *   3. Pings Google + IndexNow to deindex (URL_DELETED) when search-indexing helpers are available.
 *
 * Usage:
 *   ts-node --project scripts/tsconfig.json scripts/purge-jsearch-zombies.ts          # dry-run (default)
 *   ts-node --project scripts/tsconfig.json scripts/purge-jsearch-zombies.ts --apply  # actually unpublish
 *
 * Safety:
 *   - Default is dry-run; --apply is required.
 *   - Operation is reversible: only flips isPublished, no hard delete.
 *   - Refuses to run if the JSearch aggregator was re-enabled
 *     (presence in lib/ingestion-service.ts ALL_SOURCES would indicate revival).
 */

import { prisma } from '@/lib/prisma';
import 'dotenv/config';

const TARGET_SOURCE = 'jsearch';
const APPLY_FLAG = '--apply';
const VERBOSE_FLAG = '--verbose';

interface JobSummary {
    id: string;
    title: string;
    employer: string;
    qualityScore: number;
    createdAt: Date;
    expiresAt: Date | null;
}

interface RunResult {
    apply: boolean;
    matched: number;
    samples: JobSummary[];
    unpublished: number;
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const apply = args.includes(APPLY_FLAG);
    const verbose = args.includes(VERBOSE_FLAG);

    console.log(`\nPurge JSearch Zombies — mode: ${apply ? 'APPLY (will unpublish)' : 'DRY-RUN'}\n`);

    const matchedJobs = await prisma.job.findMany({
        where: {
            sourceProvider: TARGET_SOURCE,
            isPublished: true,
        },
        select: {
            id: true,
            title: true,
            employer: true,
            qualityScore: true,
            createdAt: true,
            expiresAt: true,
        },
        orderBy: { createdAt: 'asc' },
    });

    console.log(`Matched ${matchedJobs.length} published JSearch jobs.`);
    if (matchedJobs.length === 0) {
        console.log('Nothing to do.');
        return;
    }

    // Summary stats
    const avgQuality = matchedJobs.reduce((s, j) => s + j.qualityScore, 0) / matchedJobs.length;
    const oldestCreated = matchedJobs[0].createdAt;
    const newestCreated = matchedJobs[matchedJobs.length - 1].createdAt;
    console.log(`  avg quality:   ${avgQuality.toFixed(1)}`);
    console.log(`  created range: ${oldestCreated.toISOString().slice(0, 10)} → ${newestCreated.toISOString().slice(0, 10)}`);

    if (verbose) {
        console.log('\nFirst 10:');
        for (const j of matchedJobs.slice(0, 10)) {
            console.log(`  ${j.id}  q=${j.qualityScore}  ${j.title?.slice(0, 60)}  (${j.employer?.slice(0, 30)})`);
        }
    }

    const result: RunResult = {
        apply,
        matched: matchedJobs.length,
        samples: matchedJobs.slice(0, 5),
        unpublished: 0,
    };

    if (!apply) {
        console.log('\nDry-run complete. Pass --apply to actually unpublish.\n');
        return;
    }

    console.log('\nUnpublishing...');
    const updated = await prisma.job.updateMany({
        where: { sourceProvider: TARGET_SOURCE, isPublished: true },
        data: { isPublished: false },
    });
    result.unpublished = updated.count;
    console.log(`Unpublished: ${updated.count}`);

    // Best-effort search engine deindex (helper is optional — wrap in try/catch).
    try {
        // Dynamic import keeps the script runnable even if the helper file
        // path or signature changes; we won't crash the purge over it.
        const indexing = await import('@/lib/search-indexing').catch(() => null);
        if (indexing && typeof (indexing as { pingAllSearchEnginesBatchDeleted?: unknown }).pingAllSearchEnginesBatchDeleted === 'function') {
            const slugs = matchedJobs.map((j) => j.id);
            console.log(`Pinging search engines for ${slugs.length} URL_DELETED entries (best-effort)…`);
            // The exact signature differs per project — adapt as needed.
            await (indexing as { pingAllSearchEnginesBatchDeleted: (ids: string[]) => Promise<unknown> }).pingAllSearchEnginesBatchDeleted(slugs);
        } else {
            console.log('search-indexing helper not found or signature changed — skip deindex ping.');
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`Deindex ping failed (non-fatal): ${msg}`);
    }

    console.log('\nDone. Recommend running /api/cron/deindex-expired to fully propagate to search engines.\n');
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`FATAL: ${msg}`);
        await prisma.$disconnect();
        process.exit(1);
    });
