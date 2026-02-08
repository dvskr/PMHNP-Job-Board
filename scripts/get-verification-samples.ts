import 'dotenv/config';
import { Client } from 'pg';
import { formatDistanceToNow } from 'date-fns';

async function getSamples() {
    const client = new Client({
        connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL
    });

    await client.connect();

    // Get jobs where original date is significantly older than discovery date (the "gap")
    const query = `
    SELECT title, employer, location, source_provider, created_at, original_posted_at
    FROM jobs 
    WHERE is_published = true
    AND original_posted_at IS NOT NULL 
    AND original_posted_at < (created_at - INTERVAL '2 days')
    ORDER BY created_at DESC
    LIMIT 10;
  `;

    const res = await client.query(query);

    console.log('\n=== VERIFICATION SAMPLES ===\n');

    if (res.rows.length === 0) {
        console.log('No significantly backdated jobs found yet (sync might still be catching up).');
    } else {
        res.rows.forEach(job => {
            const original = new Date(job.original_posted_at);
            const created = new Date(job.created_at);
            const timeAgo = formatDistanceToNow(original, { addSuffix: true });

            console.log(`Job:      ${job.title}`);
            console.log(`Employer: ${job.employer}`);
            console.log(`Source:   ${job.source_provider}`);
            console.log(`Found:    ${created.toISOString().split('T')[0]} (Today/Yesterday)`);
            console.log(`RealDate: ${original.toISOString().split('T')[0]}`);
            console.log(`UI Should Say: "${timeAgo}"`);
            console.log('--------------------------------------------------');
        });
    }

    await client.end();
}

getSamples().catch(console.error);
