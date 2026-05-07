/**
 * Mark the two 2026-05-06 migrations as applied in prod's _prisma_migrations
 * tracking table. The schema columns themselves were already applied by hand
 * in the Supabase SQL editor — this just keeps the Prisma migration tracker
 * in sync so the next `prisma migrate deploy` doesn't try to re-apply them.
 *
 * Reads .env.prod the same way the audit scripts do.
 */
import { config as dotenvConfig } from 'dotenv';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

const MIGRATIONS = [
    '20260506_add_source_stats_rejection_breakdown',
    '20260506_add_employer_lead_phone',
];

async function main() {
    const { prisma } = await import('@/lib/prisma');

    for (const name of MIGRATIONS) {
        // Skip if already tracked
        const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT id FROM _prisma_migrations WHERE migration_name = $1`,
            name,
        );
        if (existing.length > 0) {
            console.log(`✓ ${name} already in _prisma_migrations`);
            continue;
        }

        // Compute the checksum the way Prisma expects (sha256 of migration.sql)
        const sqlPath = join('prisma', 'migrations', name, 'migration.sql');
        const sql = readFileSync(sqlPath, 'utf8');
        const checksum = createHash('sha256').update(sql).digest('hex');
        const id = crypto.randomUUID();
        const now = new Date();

        await prisma.$executeRawUnsafe(
            `INSERT INTO _prisma_migrations
       (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
       VALUES ($1, $2, $3, $4, NULL, NULL, $5, 1)`,
            id,
            checksum,
            now,
            name,
            now,
        );
        console.log(`✓ Marked ${name} as applied (id ${id.slice(0, 8)})`);
    }

    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
