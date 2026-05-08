/**
 * Verify the live database schema matches what Prisma expects.
 *
 * Originally added (as scripts/check-prod-schema.ts) to confirm the
 * `category_tags` migration landed in prod. Generalized to:
 *   - target either `dev` or `prod` via the `--env` flag
 *   - exit non-zero when expected schema artifacts are missing, so it
 *     can plug into CI / predeploy gates
 *
 * Usage:
 *   ts-node -r tsconfig-paths/register --project scripts/tsconfig.json \
 *     scripts/check-schema.ts --env=prod
 *
 *   ts-node ... scripts/check-schema.ts --env=dev
 *
 * Exit codes:
 *   0 — all expected columns + indexes + migrations present
 *   1 — at least one expected artifact missing OR query failed
 *
 * Wiring:
 *   - npm run db:check-schema           → prod
 *   - npm run db:check-schema:dev       → dev
 *   - npm run db:check-schema:prod      → prod (explicit)
 */
import { config as dotenvConfig } from 'dotenv';

// ─── env selection ──────────────────────────────────────────────────────────

type EnvKind = 'dev' | 'prod';

function parseEnvFlag(): EnvKind {
    const flag = process.argv.find((a) => a.startsWith('--env='))?.split('=')[1];
    if (flag === 'dev' || flag === 'prod') return flag;
    if (process.argv.includes('--dev')) return 'dev';
    if (process.argv.includes('--prod')) return 'prod';
    return 'prod'; // safe default — most callers want prod parity
}

const ENV: EnvKind = parseEnvFlag();

if (ENV === 'prod') {
    dotenvConfig({ path: '.env.prod' });
    if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
        process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
    }
    if (process.env.PROD_DIRECT_URL && !process.env.DIRECT_URL) {
        process.env.DIRECT_URL = process.env.PROD_DIRECT_URL;
    }
} else {
    // dev: load default `.env`. Prisma client picks up DATABASE_URL from there.
    dotenvConfig({ path: '.env' });
}

// ─── expected schema artifacts ──────────────────────────────────────────────
//
// Add new entries here when you ship a migration that introduces a
// load-bearing column or index. Keep the list small — this is for
// "it sucks when this is missing in prod" cases, not for full schema diff.

interface ExpectedColumn {
    table: string;
    column: string;
    /** schema.prisma migration filename pattern that introduced it. */
    migrationLike: string;
}

interface ExpectedIndex {
    table: string;
    indexName: string;
    /** schema.prisma migration filename pattern that introduced it. */
    migrationLike: string;
}

const EXPECTED_COLUMNS: ExpectedColumn[] = [
    { table: 'jobs', column: 'category_tags', migrationLike: '%category_tags%' },
];

const EXPECTED_INDEXES: ExpectedIndex[] = [
    { table: 'jobs', indexName: 'jobs_category_tags_idx', migrationLike: '%category_tags%' },
];

// ─── verification ───────────────────────────────────────────────────────────

async function main() {
    const { prisma } = await import('@/lib/prisma');

    console.log(`\n=== SCHEMA VERIFICATION (${ENV}) ===\n`);

    let failures = 0;

    // 1. Expected columns
    for (const expected of EXPECTED_COLUMNS) {
        const cols = await prisma.$queryRawUnsafe<Array<{
            column_name: string;
            data_type: string;
            is_nullable: string;
            column_default: string | null;
        }>>(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = $1 AND column_name = $2
        `, expected.table, expected.column);
        if (cols.length === 0) {
            console.log(`❌ ${expected.table}.${expected.column} — column NOT FOUND`);
            failures++;
        } else {
            const c = cols[0];
            console.log(`✅ ${expected.table}.${expected.column}  type=${c.data_type}  null=${c.is_nullable}  default=${c.column_default ?? 'NULL'}`);
        }
    }

    // 2. Expected indexes
    for (const expected of EXPECTED_INDEXES) {
        const idx = await prisma.$queryRawUnsafe<Array<{ indexname: string; indexdef: string }>>(`
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE tablename = $1 AND indexname = $2
        `, expected.table, expected.indexName);
        if (idx.length === 0) {
            console.log(`❌ ${expected.indexName} — index NOT FOUND on ${expected.table}`);
            failures++;
        } else {
            console.log(`✅ ${expected.indexName}  ${idx[0].indexdef}`);
        }
    }

    // 3. Migration history sanity — confirm at least one matching migration row exists for each expected artifact
    const migrationPatterns = new Set([
        ...EXPECTED_COLUMNS.map((c) => c.migrationLike),
        ...EXPECTED_INDEXES.map((i) => i.migrationLike),
    ]);
    for (const pattern of migrationPatterns) {
        const migrations = await prisma.$queryRawUnsafe<Array<{
            migration_name: string;
            finished_at: Date | null;
        }>>(`
            SELECT migration_name, finished_at
            FROM _prisma_migrations
            WHERE migration_name LIKE $1
            ORDER BY finished_at DESC
            LIMIT 1
        `, pattern);
        if (migrations.length === 0) {
            console.log(`⚠️  No migration matching ${pattern} in _prisma_migrations`);
            failures++;
        } else {
            const m = migrations[0];
            console.log(`📜 ${m.migration_name}  finished=${m.finished_at?.toISOString() || '(pending)'}`);
        }
    }

    // 4. Backfill snapshot — informational, not pass/fail
    try {
        const tagged = await prisma.job.count({
            where: { categoryTags: { isEmpty: false } },
        });
        const total = await prisma.job.count();
        const pct = total > 0 ? Math.round((tagged / total) * 100) : 0;
        console.log(`\n📊 categoryTags backfill: ${tagged}/${total} rows (${pct}%)`);
    } catch (err) {
        console.log(`\n⚠️  Could not query categoryTags backfill (column likely still missing): ${(err as Error).message}`);
    }

    // 5. Most recent applied migrations (snapshot)
    const recent = await prisma.$queryRawUnsafe<Array<{
        migration_name: string;
        finished_at: Date | null;
    }>>(`
        SELECT migration_name, finished_at
        FROM _prisma_migrations
        ORDER BY finished_at DESC
        LIMIT 5
    `);
    console.log('\n📜 5 most recent applied migrations:');
    for (const m of recent) {
        console.log(`   ${m.finished_at?.toISOString().slice(0, 19) ?? '(pending)'}  ${m.migration_name}`);
    }

    await prisma.$disconnect();

    if (failures > 0) {
        console.log(`\n❌ ${failures} schema check(s) failed.`);
        console.log('   Run `npx prisma migrate deploy` against the affected database.');
        process.exit(1);
    }

    console.log('\n✅ Schema parity check passed.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
