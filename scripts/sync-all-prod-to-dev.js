/**
 * Full Database Sync: PROD → DEV
 * Wipes ALL dev tables and copies ALL data from prod.
 * Uses DIRECT_URL (bypasses pgbouncer) to allow session-level commands.
 *
 * Usage: node scripts/sync-all-prod-to-dev.js
 */
require('dotenv').config();                    // .env (dev vars)
require('dotenv').config({ path: '.env.prod' }); // .env.prod (prod vars)
const { Pool } = require('pg');

// Use DIRECT_URL (port 5432) for dev to avoid pgbouncer limitations
const DEV_URL = process.env.DIRECT_URL || process.env.DATABASE_URL;
const PROD_URL = process.env.PROD_DATABASE_URL;

if (!PROD_URL || !DEV_URL) {
    console.error('❌ PROD_DATABASE_URL and DIRECT_URL/DATABASE_URL must be set');
    console.error('   PROD_URL:', PROD_URL ? '✅' : '❌ missing');
    console.error('   DEV_URL:', DEV_URL ? '✅' : '❌ missing');
    process.exit(1);
}

console.log('Dev URL:', DEV_URL.replace(/:[^:@]+@/, ':***@'));
console.log('Prod URL:', PROD_URL.replace(/:[^:@]+@/, ':***@'));

const prodPool = new Pool({ connectionString: PROD_URL, ssl: { rejectUnauthorized: false } });
const devPool = new Pool({ connectionString: DEV_URL, ssl: { rejectUnauthorized: false } });

async function run() {
    console.log('\n🔄 FULL DATABASE SYNC: PROD → DEV');
    console.log('═══════════════════════════════════\n');

    const prodClient = await prodPool.connect();
    const devClient = await devPool.connect();

    try {
        // 1. Get all public tables from prod
        const tablesRes = await prodClient.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
        const allTables = tablesRes.rows.map(r => r.table_name);
        console.log(`📋 Found ${allTables.length} tables in prod:\n   ${allTables.join(', ')}\n`);

        // 2. Get dev tables
        const devTablesRes = await devClient.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
        const devTableSet = new Set(devTablesRes.rows.map(r => r.table_name));
        const tables = allTables.filter(t => devTableSet.has(t));
        const skipped = allTables.filter(t => !devTableSet.has(t));
        if (skipped.length > 0) {
            console.log(`⚠️  Skipping tables not in dev: ${skipped.join(', ')}\n`);
        }

        // Also include any dev tables not in prod (will just be truncated)
        const devOnlyTables = [...devTableSet].filter(t => !allTables.includes(t));
        const allDevTables = [...tables, ...devOnlyTables];

        // 3. Truncate ALL dev tables with CASCADE (no trigger manipulation needed)
        console.log('🗑️  Truncating all dev tables...');
        await devClient.query('BEGIN');
        if (allDevTables.length > 0) {
            // Skip Prisma migration tables
            const toTruncate = allDevTables.filter(t => t !== '_prisma_migrations');
            const tableList = toTruncate.map(t => `"${t}"`).join(', ');
            await devClient.query(`TRUNCATE TABLE ${tableList} CASCADE`);
            console.log(`   Truncated ${toTruncate.length} tables.\n`);
        }
        await devClient.query('COMMIT');

        // 4. Copy each table (use session_replication_role to skip FK checks)
        console.log('📥 Copying data from prod to dev...\n');

        // Try to set session_replication_role to skip FK checks during insert
        let canSkipFK = false;
        try {
            await devClient.query("SET session_replication_role = 'replica'");
            canSkipFK = true;
            console.log('   ✅ FK checks disabled for session\n');
        } catch (e) {
            console.log('   ⚠️  Cannot disable FK checks, will insert in order\n');
        }

        let totalRows = 0;
        for (const table of tables) {
            try {
                // Get row count from prod
                const countRes = await prodClient.query(`SELECT COUNT(*) as cnt FROM "${table}"`);
                const rowCount = parseInt(countRes.rows[0].cnt, 10);

                if (rowCount === 0) {
                    console.log(`   ⏭️  ${table}: 0 rows`);
                    continue;
                }

                // Get shared columns
                const prodColRes = await prodClient.query(`
          SELECT column_name, data_type FROM information_schema.columns
          WHERE table_name = $1 AND table_schema = 'public'
          ORDER BY ordinal_position
        `, [table]);
                const prodCols = prodColRes.rows.map(r => r.column_name);

                const devColRes = await devClient.query(`
          SELECT column_name FROM information_schema.columns
          WHERE table_name = $1 AND table_schema = 'public'
          ORDER BY ordinal_position
        `, [table]);
                const devCols = new Set(devColRes.rows.map(r => r.column_name));
                const sharedCols = prodCols.filter(c => devCols.has(c));

                if (sharedCols.length === 0) {
                    console.log(`   ⏭️  ${table}: no shared columns`);
                    continue;
                }

                const colNames = sharedCols.map(c => `"${c}"`).join(', ');

                // Fetch all rows from prod in batches
                let inserted = 0;
                const PAGE = 1000;
                let offset = 0;

                while (true) {
                    const dataRes = await prodClient.query(
                        `SELECT ${colNames} FROM "${table}" LIMIT ${PAGE} OFFSET ${offset}`
                    );
                    if (dataRes.rows.length === 0) break;

                    // Batch insert
                    for (const row of dataRes.rows) {
                        const values = sharedCols.map(c => row[c]);
                        const placeholders = sharedCols.map((_, idx) => `$${idx + 1}`);
                        try {
                            await devClient.query(
                                `INSERT INTO "${table}" (${colNames}) VALUES (${placeholders.join(', ')})`,
                                values
                            );
                            inserted++;
                        } catch (insertErr) {
                            // Skip individual row errors (duplicate keys, etc.)
                        }
                    }

                    offset += PAGE;
                    process.stdout.write(`\r   📦 ${table}: ${inserted}/${rowCount}`);
                }

                totalRows += inserted;
                console.log(`\r   ✅ ${table}: ${inserted} rows                    `);
            } catch (err) {
                console.error(`\n   ❌ ${table}: ${err.message}`);
            }
        }

        // 5. Reset session_replication_role
        if (canSkipFK) {
            await devClient.query("SET session_replication_role = 'origin'");
        }

        // 6. Reset sequences for serial/identity columns
        console.log('\n🔧 Resetting sequences...');
        const seqRes = await devClient.query(`
      SELECT c.relname as table_name, a.attname as column_name, 
             pg_get_serial_sequence(c.relname::text, a.attname::text) as seq
      FROM pg_class c
      JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
        AND pg_get_serial_sequence(c.relname::text, a.attname::text) IS NOT NULL
        AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    `);
        for (const row of seqRes.rows) {
            try {
                await devClient.query(
                    `SELECT setval('${row.seq}', COALESCE((SELECT MAX("${row.column_name}") FROM "${row.table_name}"), 1))`
                );
            } catch (e) { /* ignore */ }
        }

        // 7. Final summary
        console.log('\n✅ SYNC COMPLETE');
        console.log('═══════════════════════════════════');
        console.log(`   Total rows copied: ${totalRows}\n`);
        for (const table of tables) {
            const res = await devClient.query(`SELECT COUNT(*) as cnt FROM "${table}"`);
            const cnt = parseInt(res.rows[0].cnt, 10);
            if (cnt > 0) console.log(`   ${table}: ${cnt}`);
        }
        console.log('');

    } finally {
        prodClient.release();
        devClient.release();
        await prodPool.end();
        await devPool.end();
    }
    process.exit(0);
}

run().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
