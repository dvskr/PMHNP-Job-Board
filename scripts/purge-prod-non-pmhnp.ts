/**
 * Purge non-PMHNP jobs from prod DB
 */
import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL });

async function purge() {
    const client = await pool.connect();
    try {
        const result = await client.query(`
            UPDATE jobs SET is_published = false
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
        console.log('Unpublished ' + result.rowCount + ' non-PMHNP jobs from prod');

        const after = await client.query(`SELECT COUNT(*) as count FROM jobs WHERE is_published = true`);
        console.log('Prod published now: ' + after.rows[0].count);
    } finally {
        client.release();
        await pool.end();
    }
}

purge().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
