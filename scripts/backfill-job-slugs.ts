/**
 * One-shot backfill: populate Job.slug for legacy rows where it's null.
 *
 * Both insert paths now write Job.slug at create time (lib/ingestion-service.ts
 * and app/api/jobs/post-free/route.ts). This script handles rows ingested
 * before the slug column was being written. Once run, the detail-page
 * canonical at app/jobs/[slug]/page.tsx will read the stored slug directly
 * instead of falling back to slugify(title, id) on every render.
 *
 * Idempotent: only updates rows where slug IS NULL. Safe to re-run.
 *
 * Default target: prod (.env.prod). Pass --env=local for the local DB.
 *
 * Usage:
 *   npx tsx scripts/backfill-job-slugs.ts                 # prod, dry-run
 *   npx tsx scripts/backfill-job-slugs.ts --apply         # prod, write
 *   npx tsx scripts/backfill-job-slugs.ts --env=local --apply
 */
import { config as dotenvConfig } from 'dotenv';

const args = new Set(process.argv.slice(2));
const isApply = args.has('--apply');
const env = args.has('--env=local') ? 'local' : 'prod';

if (env === 'prod') {
    dotenvConfig({ path: '.env.prod' });
    if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
        process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
    }
    if (process.env.PROD_DIRECT_URL && !process.env.DIRECT_URL) {
        process.env.DIRECT_URL = process.env.PROD_DIRECT_URL;
    }
} else {
    dotenvConfig();
}

async function main() {
    const { prisma } = await import('@/lib/prisma');
    const { slugify } = await import('@/lib/utils');

    console.log(`\n=== JOB SLUG BACKFILL (${env}) ===`);
    console.log(`Mode: ${isApply ? 'APPLY (writes)' : 'DRY RUN (no writes)'}\n`);

    const totalNull = await prisma.job.count({ where: { slug: null } });
    console.log(`Rows with NULL slug: ${totalNull.toLocaleString()}`);
    if (totalNull === 0) {
        console.log('Nothing to do — all rows already have a slug.');
        return;
    }

    // Stream in batches so we don't OOM on a large prod dataset.
    const BATCH = 500;
    let cursor: string | undefined;
    let processed = 0;
    let updated = 0;
    let collisions = 0;

    while (processed < totalNull) {
        const rows: Array<{ id: string; title: string; slug: string | null }> = await prisma.job.findMany({
            where: { slug: null },
            select: { id: true, title: true, slug: true },
            orderBy: { id: 'asc' },
            take: BATCH,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        if (rows.length === 0) break;

        for (const row of rows) {
            processed++;
            const computed = slugify(row.title || 'untitled', row.id);

            if (!isApply) {
                if (processed <= 5) console.log(`  [DRY] ${row.id} → ${computed}`);
                continue;
            }

            try {
                await prisma.job.update({
                    where: { id: row.id },
                    data: { slug: computed },
                });
                updated++;
            } catch (err) {
                // Slug column is @unique. A collision should be impossible since
                // every slug ends with the row's UUID, but defensive logging in
                // case a manual edit slipped through.
                collisions++;
                console.error(`  [ERR] ${row.id}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        cursor = rows[rows.length - 1]!.id;
        if (processed % (BATCH * 4) === 0 || processed === totalNull) {
            console.log(`  ...processed ${processed.toLocaleString()} / ${totalNull.toLocaleString()}`);
        }
    }

    console.log(`\nProcessed: ${processed.toLocaleString()}`);
    if (isApply) {
        console.log(`Updated:   ${updated.toLocaleString()}`);
        if (collisions > 0) console.log(`Collisions: ${collisions} (see ERR lines above)`);
    } else {
        console.log(`(dry run — re-run with --apply to write)`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
