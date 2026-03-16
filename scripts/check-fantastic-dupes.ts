/**
 * Validate fantastic-jobs-db duplicates in prod
 */
import { config } from 'dotenv';
config();
config({ path: '.env.prod', override: true });

import pg from 'pg';
const { Client } = pg;

async function check() {
    const connStr = process.env.PROD_DATABASE_URL;
    if (!connStr) { console.error('PROD_DATABASE_URL not set'); process.exit(1); }
    const client = new Client({ connectionString: connStr });
    await client.connect();

    const totalRes = await client.query(
        `SELECT COUNT(*)::int as total FROM public.jobs WHERE external_id LIKE 'fantasticjobs-%'`
    );
    const pubRes = await client.query(
        `SELECT COUNT(*)::int as cnt FROM public.jobs WHERE external_id LIKE 'fantasticjobs-%' AND is_published = true`
    );
    const byDateRes = await client.query(
        `SELECT DATE(created_at) as day, COUNT(*)::int as cnt
         FROM public.jobs WHERE external_id LIKE 'fantasticjobs-%'
         GROUP BY DATE(created_at) ORDER BY day DESC LIMIT 10`
    );
    const samplesRes = await client.query(
        `SELECT external_id, title, company, created_at, is_published
         FROM public.jobs WHERE external_id LIKE 'fantasticjobs-%'
         ORDER BY created_at DESC LIMIT 15`
    );

    const total = totalRes.rows[0].total;
    const pub = pubRes.rows[0].cnt;

    console.log('\n========================================');
    console.log('  FANTASTIC-JOBS-DB IN PROD DATABASE');
    console.log('========================================');
    console.log('Total jobs:', total);
    console.log('Published:', pub);
    console.log('Unpublished:', total - pub);
    console.log('\n--- JOBS BY CREATION DATE ---');
    byDateRes.rows.forEach((r: any) => {
        const day = r.day instanceof Date ? r.day.toISOString().slice(0, 10) : r.day;
        console.log(`  ${day}  =>  ${r.cnt} jobs`);
    });
    console.log('\n--- SAMPLE JOBS (15 most recent) ---');
    samplesRes.rows.forEach((j: any) => {
        const d = j.created_at instanceof Date ? j.created_at.toISOString().slice(0, 10) : j.created_at;
        const status = j.is_published ? 'PUB' : 'UNP';
        console.log(`  [${status}] ${d} | ${(j.company || '').padEnd(30)} | ${(j.title || '').slice(0, 60)}`);
    });

    await client.end();
}
check().catch(e => { console.error(e); process.exit(1); });
