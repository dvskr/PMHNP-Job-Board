/**
 * Check employer jobs status in prod
 */
import 'dotenv/config';
import { Pool } from 'pg';

if (!process.env.PROD_DATABASE_URL) {
    console.error('❌ PROD_DATABASE_URL must be set in .env');
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.PROD_DATABASE_URL,
});

async function check() {
    const client = await pool.connect();
    try {
        // Check employer_jobs table
        const empRes = await client.query(`
      SELECT ej.id, ej.employer_name, ej.job_id, ej.payment_status,
             j.title, j.is_published, j.source_type
      FROM employer_jobs ej
      LEFT JOIN jobs j ON ej.job_id = j.id
    `);

        console.log('🏢 EMPLOYER JOBS IN PROD:');
        console.log('─────────────────────────────');
        for (const row of empRes.rows) {
            const status = row.is_published ? '✅ PUBLISHED' : '❌ UNPUBLISHED';
            console.log(`  [${status}] "${row.title}"`);
            console.log(`    Employer: ${row.employer_name}`);
            console.log(`    Payment: ${row.payment_status}`);
            console.log(`    Source: ${row.source_type}`);
            console.log('');
        }

        // Also check if any jobs with source_type = 'employer' were affected
        const employerSourceRes = await client.query(`
      SELECT title, employer, is_published, source_type
      FROM jobs WHERE source_type = 'employer' OR source_type = 'employer_direct'
    `);
        if (employerSourceRes.rows.length > 0) {
            console.log('\n📋 ALL EMPLOYER-SOURCE JOBS:');
            for (const row of employerSourceRes.rows) {
                const status = row.is_published ? '✅' : '❌';
                console.log(`  [${status}] "${row.title}" — ${row.employer}`);
            }
        }
    } finally {
        client.release();
        await pool.end();
    }
    process.exit(0);
}

check().catch(console.error);
