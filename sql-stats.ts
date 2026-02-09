import 'dotenv/config';
import { Client } from 'pg';

async function check() {
    const client = new Client({
        connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL
    });

    await client.connect();

    const totalRes = await client.query('SELECT count(*) FROM jobs');
    const publishedRes = await client.query('SELECT count(*) FROM jobs WHERE is_published = true');
    const dateRes = await client.query('SELECT count(*) FROM jobs WHERE original_posted_at IS NOT NULL');

    console.log('--- STATS ---');
    console.log('Total:', totalRes.rows[0].count);
    console.log('Published:', publishedRes.rows[0].count);
    console.log('With Date:', dateRes.rows[0].count);

    await client.end();
}

check().catch(console.error);
