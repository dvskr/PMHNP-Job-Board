/**
 * Quick audit of prod DB for non-PMHNP jobs
 */
import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL });

async function audit() {
    const client = await pool.connect();
    try {
        // Total published
        const total = await client.query(`SELECT COUNT(*) as count FROM jobs WHERE is_published = true`);
        console.log('Prod published: ' + total.rows[0].count);

        // Non-PMHNP titles
        const bad = await client.query(`
            SELECT id, title, employer, source_provider FROM jobs
            WHERE is_published = true
            AND LOWER(title) NOT LIKE '%pmhnp%'
            AND LOWER(title) NOT LIKE '%psychiatric%'
            AND LOWER(title) NOT LIKE '%psych %'
            AND LOWER(title) NOT LIKE '%mental health%'
            AND LOWER(title) NOT LIKE '%behavioral health%'
            AND LOWER(title) NOT LIKE '%psychiatry%'
            AND LOWER(title) NOT LIKE '%telepsychiatry%'
            AND LOWER(title) NOT LIKE '%nurse practitioner%'
            ORDER BY source_provider, title
            LIMIT 40
        `);
        console.log('\nNon-PMHNP titles in prod: ' + bad.rows.length + ' (showing up to 40)');
        for (const j of bad.rows) {
            console.log('  [' + j.source_provider + '] ' + j.title + ' | ' + j.employer);
        }

        // Count total non-relevant
        const badCount = await client.query(`
            SELECT COUNT(*) as count FROM jobs
            WHERE is_published = true
            AND LOWER(title) NOT LIKE '%pmhnp%'
            AND LOWER(title) NOT LIKE '%psychiatric%'
            AND LOWER(title) NOT LIKE '%psych %'
            AND LOWER(title) NOT LIKE '%mental health%'
            AND LOWER(title) NOT LIKE '%behavioral health%'
            AND LOWER(title) NOT LIKE '%psychiatry%'
            AND LOWER(title) NOT LIKE '%telepsychiatry%'
            AND LOWER(title) NOT LIKE '%nurse practitioner%'
        `);
        console.log('\nTotal non-PMHNP in prod: ' + badCount.rows[0].count);
    } finally {
        client.release();
        await pool.end();
    }
}

audit().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
