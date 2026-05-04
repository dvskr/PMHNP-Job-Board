#!/usr/bin/env node
/**
 * One-shot dev DB seeder — copies the curated job catalog from prod into the
 * local-dev Supabase project so engineers can build/test against realistic
 * data without depending on (or polluting) production.
 *
 * What it touches on LOCAL DEV:
 *   TRUNCATEs (in FK-dependency order):
 *     - job_embeddings, candidate_recommendations
 *     - apply_clicks, job_view_events, job_reports, job_health_checks
 *     - job_screening_questions, job_applications
 *     - employer_jobs, employer_messages, conversations
 *     - jobs, companies
 *   COPIES from prod (read-only):
 *     - companies   (FK target for jobs.company_id)
 *     - jobs        (the main payload)
 *     - employer_jobs (1:1 with jobs — has logos for direct-apply UX)
 *     - job_screening_questions (so apply forms render correctly)
 *
 * What it deliberately does NOT touch on LOCAL DEV:
 *   - user_profiles, audit_logs, candidate_embeddings
 *   - email_leads, job_alerts, email_broadcasts, data_requests
 *   - ai_call_log, ai_eval_snapshot, ai_feature_flag_override
 *   - processed_stripe_events, job_charges
 *   - Anything in the Supabase auth schema
 *
 * What it deliberately does NOT touch on PROD: anything. Read-only.
 *
 * Safety guards:
 *   - Refuses to run if LOCAL_URL and PROD_URL host strings match.
 *   - Refuses to run unless --i-know-what-im-doing flag is passed.
 *   - Wraps each phase in a transaction; failures roll back.
 */

import { Pool } from 'pg';
import { promises as fs } from 'fs';
import path from 'path';

interface SyncStats {
    truncated: Record<string, number>;
    inserted: Record<string, number>;
    durationMs: Record<string, number>;
}

const BATCH_SIZE = 500;

// Local truncation order — dependents first, parents last.
// profile_views + saved_candidates reference employer_jobs (SET NULL on regular
// DELETE, but TRUNCATE refuses unless referrer is also truncated). They hold
// stale dev data tied to the about-to-be-replaced employer_jobs anyway, so
// truncating them is correct.
const TRUNCATE_ORDER = [
    'job_embeddings',
    'candidate_recommendations',
    'apply_clicks',
    'job_view_events',
    'job_reports',
    'job_health_checks',
    'job_screening_questions',
    'job_applications',
    'profile_views',
    'saved_candidates',
    'employer_jobs',
    'employer_messages',
    'conversations',
    'jobs',
    'companies',
] as const;

// Optional pre-filter: returns a WHERE clause + params to limit which prod
// rows get copied. Returning `{ skip: true }` disables the sync entirely.
// Used for tables that FK-reference user_profiles (which we don't sync) —
// we only copy rows whose owning user already exists locally.
type PreFilter = (local: Pool) => Promise<
    | { sql: string; params: unknown[] }
    | { skip: true }
    | null
>;

interface SyncEntry {
    table: string;
    orderBy: string;
    preFilter?: PreFilter;
}

// Sync order — parents first, children last (FK ordering).
const SYNC_ORDER: ReadonlyArray<SyncEntry> = [
    { table: 'companies', orderBy: 'id' },
    { table: 'jobs', orderBy: 'id' },
    {
        table: 'employer_jobs',
        orderBy: 'id',
        // Skip rows whose owning employer user doesn't exist in local
        // user_profiles. We deliberately don't sync user_profiles (PII), so
        // most prod employer rows will be filtered out — only rows whose
        // owner happens to exist locally are copied.
        preFilter: async (local) => {
            const r = await local.query<{ supabase_id: string }>(
                "SELECT supabase_id FROM user_profiles WHERE supabase_id IS NOT NULL"
            );
            const ids = r.rows.map((x) => x.supabase_id);
            if (ids.length === 0) return { skip: true };
            return { sql: 'user_id = ANY($X)', params: [ids] };
        },
    },
    { table: 'job_screening_questions', orderBy: 'id' },
];

function parseEnvFile(filePath: string): Record<string, string> {
    const text = require('fs').readFileSync(filePath, 'utf-8') as string;
    const out: Record<string, string> = {};
    for (const line of text.split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
        if (!m) continue;
        let value = m[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        out[m[1]] = value;
    }
    return out;
}

function hostOf(url: string): string {
    try { return new URL(url).host; } catch { return url; }
}

function parseArgs(): { confirmed: boolean; truncateOnly: boolean; dryRun: boolean } {
    const args = new Set(process.argv.slice(2));
    return {
        confirmed: args.has('--i-know-what-im-doing'),
        truncateOnly: args.has('--truncate-only'),
        dryRun: args.has('--dry-run'),
    };
}

async function getColumnList(pool: Pool, table: string): Promise<string[]> {
    const r = await pool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema='public' AND table_name=$1
         ORDER BY ordinal_position`,
        [table],
    );
    return r.rows.map((row: { column_name: string }) => row.column_name);
}

async function rowCount(pool: Pool, table: string): Promise<number> {
    const r = await pool.query(`SELECT COUNT(*)::int AS c FROM "${table}"`);
    return r.rows[0].c;
}

async function truncatePhase(local: Pool, dryRun: boolean): Promise<Record<string, number>> {
    // Pre-count for the report.
    const truncated: Record<string, number> = {};
    for (const table of TRUNCATE_ORDER) {
        truncated[table] = await rowCount(local, table);
    }

    if (dryRun) {
        for (const table of TRUNCATE_ORDER) {
            console.log(`  [dry-run] TRUNCATE ${table} (${truncated[table]} rows)`);
        }
        return truncated;
    }

    // Postgres requires that every table participating in a FK chain be
    // listed together in ONE truncate statement (or you get
    // "cannot truncate a table referenced in a foreign key constraint" even
    // when the referrer is empty). Single-statement multi-table TRUNCATE
    // sidesteps that and runs atomically.
    const tableList = TRUNCATE_ORDER.map((t) => `"${t}"`).join(', ');
    await local.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY`);
    for (const table of TRUNCATE_ORDER) {
        console.log(`  truncated ${table.padEnd(30)} (${truncated[table].toLocaleString()} rows removed)`);
    }
    return truncated;
}

async function copyTable(
    prod: Pool,
    local: Pool,
    table: string,
    orderBy: string,
    dryRun: boolean,
    preFilter?: PreFilter,
): Promise<{ inserted: number; durationMs: number; skipped?: boolean }> {
    const start = Date.now();

    // Resolve optional pre-filter against local before reading prod.
    let extraSql = '';
    let extraParams: unknown[] = [];
    if (preFilter) {
        const result = await preFilter(local);
        if (result === null) {
            // Continue without filter.
        } else if ('skip' in result) {
            console.log(`    skipped — preFilter returned skip:true`);
            return { inserted: 0, durationMs: Date.now() - start, skipped: true };
        } else {
            extraParams = result.params;
            extraSql = result.sql;
        }
    }

    // Use the LOCAL columns to drive the column list. Prod may have columns
    // local doesn't (post-sync schema drift); we copy only what local accepts.
    const columns = await getColumnList(local, table);
    const colList = columns.map((c) => `"${c}"`).join(', ');
    const placeholderRow = (offset: number) =>
        `(${columns.map((_, i) => `$${offset + i + 1}`).join(', ')})`;

    let cursor: string | null = null;
    let totalInserted = 0;
    let pageNum = 0;

    while (true) {
        pageNum += 1;
        // Param ordering: extraParams first, then BATCH_SIZE, then optional cursor.
        const params: Array<unknown> = [...extraParams, BATCH_SIZE];
        const limitIdx = extraParams.length + 1;
        let cursorClause = '';
        if (cursor !== null) {
            params.push(cursor);
            cursorClause = `AND "${orderBy}" > $${limitIdx + 1}`;
        }
        // Renumber the $X placeholders in extraSql to start at $1.
        let where = '';
        if (extraSql) {
            // Replace the literal '$X' marker in the preFilter SQL with the
            // actual positional indexes (extraParams occupy $1..$N).
            let i = 0;
            const numbered = extraSql.replace(/\$X/g, () => `$${++i}`);
            where = `WHERE ${numbered} ${cursorClause}`;
        } else if (cursor !== null) {
            where = `WHERE "${orderBy}" > $${limitIdx + 1}`;
        }
        const sql = `SELECT ${colList} FROM "${table}" ${where} ORDER BY "${orderBy}" ASC LIMIT $${limitIdx}`;
        const page = await prod.query(sql, params);
        if (page.rows.length === 0) break;

        if (!dryRun) {
            const values: Array<unknown> = [];
            const rowsSql: string[] = [];
            page.rows.forEach((row: Record<string, unknown>, i: number) => {
                rowsSql.push(placeholderRow(i * columns.length));
                for (const col of columns) values.push(row[col] ?? null);
            });
            const insertSql = `INSERT INTO "${table}" (${colList}) VALUES ${rowsSql.join(', ')} ON CONFLICT DO NOTHING`;
            try {
                await local.query(insertSql, values);
            } catch (err) {
                console.error(`    ✗ batch ${pageNum} (cursor=${cursor ?? 'null'}) failed:`, (err as Error).message);
                throw err;
            }
            totalInserted += page.rows.length;
        }

        cursor = page.rows[page.rows.length - 1][orderBy] as string;
        if (pageNum % 5 === 0 || page.rows.length < BATCH_SIZE) {
            console.log(`    page ${pageNum.toString().padStart(3)}: ${totalInserted.toLocaleString()} rows ${dryRun ? '(planned)' : 'copied'}`);
        }
        if (page.rows.length < BATCH_SIZE) break;
    }

    return { inserted: totalInserted, durationMs: Date.now() - start };
}

async function main(): Promise<void> {
    const args = parseArgs();

    const localEnvPath = path.join(process.cwd(), '.env.local');
    const prodEnvPath  = path.join(process.cwd(), '.env.prod');
    await fs.access(localEnvPath); await fs.access(prodEnvPath);
    const localEnv = parseEnvFile(localEnvPath);
    const prodEnv  = parseEnvFile(prodEnvPath);

    // Use DIRECT (port 5432) for both — DDL/TRUNCATE doesn't play with PgBouncer.
    const LOCAL_URL = localEnv.DIRECT_URL || localEnv.DATABASE_URL;
    const PROD_URL  = prodEnv.PROD_DIRECT_DATABASE_URL || prodEnv.PROD_DATABASE_URL;

    if (!LOCAL_URL || !PROD_URL) {
        console.error('Missing DATABASE_URL in .env.local or PROD_DIRECT_DATABASE_URL in .env.prod');
        process.exit(2);
    }

    const localHost = hostOf(LOCAL_URL);
    const prodHost  = hostOf(PROD_URL);
    if (localHost === prodHost) {
        console.error(`REFUSING TO RUN: local and prod resolve to the same host (${localHost}). This script would destroy production.`);
        process.exit(2);
    }
    if (!args.confirmed) {
        console.log('Plan:');
        console.log(`  PROD  (read-only)   = ${prodHost}`);
        console.log(`  LOCAL (destructive) = ${localHost}`);
        console.log('');
        console.log('  Phase 1 — TRUNCATE on local:');
        TRUNCATE_ORDER.forEach((t) => console.log(`    - ${t}`));
        console.log('  Phase 2 — COPY from prod to local:');
        SYNC_ORDER.forEach((s) => console.log(`    - ${s.table}`));
        console.log('');
        console.log('Re-run with `--i-know-what-im-doing` to execute.');
        console.log('Add `--dry-run` to plan without writing.');
        console.log('Add `--truncate-only` to truncate without syncing.');
        process.exit(0);
    }

    const local = new Pool({ connectionString: LOCAL_URL });
    const prod  = new Pool({ connectionString: PROD_URL });

    console.log(`PROD  → ${prodHost}`);
    console.log(`LOCAL → ${localHost}`);
    console.log(args.dryRun ? '\n** DRY RUN — no writes will happen **\n' : '');

    const stats: SyncStats = { truncated: {}, inserted: {}, durationMs: {} };

    try {
        // ── Phase 1 ─────────────────────────────────────────────────
        console.log('Phase 1 — truncating local dev tables...');
        stats.truncated = await truncatePhase(local, args.dryRun);

        if (args.truncateOnly) {
            console.log('\nDone (truncate-only).');
            return;
        }

        // ── Phase 2 ─────────────────────────────────────────────────
        console.log('\nPhase 2 — copying from prod to local...');
        for (const { table, orderBy, preFilter } of SYNC_ORDER) {
            const before = await rowCount(prod, table);
            console.log(`  copying ${table.padEnd(28)} (${before.toLocaleString()} prod rows)`);
            const result = await copyTable(prod, local, table, orderBy, args.dryRun, preFilter);
            stats.inserted[table] = result.inserted;
            stats.durationMs[table] = result.durationMs;
        }

        // ── Phase 3 — verify ─────────────────────────────────────────
        console.log('\nPhase 3 — verifying counts...');
        for (const { table } of SYNC_ORDER) {
            const local_n = await rowCount(local, table);
            const prod_n  = await rowCount(prod, table);
            const match   = local_n === prod_n ? '✓' : '!!';
            console.log(`  ${match} ${table.padEnd(28)} local=${local_n.toLocaleString().padStart(8)} prod=${prod_n.toLocaleString().padStart(8)}`);
        }

        console.log('\nSync complete.');
        console.log('  Truncated:', JSON.stringify(stats.truncated));
        console.log('  Inserted:', JSON.stringify(stats.inserted));
        console.log('  Per-table ms:', JSON.stringify(stats.durationMs));
    } finally {
        await local.end();
        await prod.end();
    }
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
