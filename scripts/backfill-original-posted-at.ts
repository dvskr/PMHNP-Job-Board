/**
 * One-shot: set originalPostedAt = createdAt for any job where it's null.
 *
 * Some sources (Adzuna, jsearch legacy, etc.) don't reliably provide
 * `date_posted` at ingest time, so ~1.5% of catalog rows have
 * originalPostedAt = null. After this fix, every row has both timestamps
 * set and downstream filters/freshness logic become a single-field query.
 *
 * Idempotent — only updates rows where the column is null.
 *
 * Usage:
 *   Dry-run (default):  ts-node scripts/backfill-original-posted-at.ts
 *   Apply:              ts-node scripts/backfill-original-posted-at.ts --apply
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { prisma } from '@/lib/prisma';

const APPLY = process.argv.includes('--apply');

async function main(): Promise<void> {
    const total = await prisma.job.count({ where: { originalPostedAt: null } });
    const totalPub = await prisma.job.count({ where: { originalPostedAt: null, isPublished: true } });
    console.log(`${APPLY ? '🟢 APPLY' : '🔍 DRY-RUN'}  ·  rows with originalPostedAt = null: ${total} (${totalPub} published)`);
    console.log();

    if (total === 0) {
        console.log('Nothing to backfill — every row already has originalPostedAt set.');
        await prisma.$disconnect();
        return;
    }

    if (!APPLY) {
        console.log('Re-run with --apply to set originalPostedAt = createdAt for these rows.');
        await prisma.$disconnect();
        return;
    }

    const r = await prisma.$executeRaw`
        UPDATE "jobs"
        SET "original_posted_at" = "created_at"
        WHERE "original_posted_at" IS NULL
    `;
    console.log(`✓ Updated ${r} rows`);

    const remaining = await prisma.job.count({ where: { originalPostedAt: null } });
    console.log(`Remaining with null originalPostedAt: ${remaining}`);

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('Backfill failed:', err);
    await prisma.$disconnect();
    process.exit(1);
});
