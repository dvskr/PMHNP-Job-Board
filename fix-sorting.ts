import 'dotenv/config';
import { Client } from 'pg';

async function fixSorting() {
    const client = new Client({
        connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL
    });

    await client.connect();

    console.log('Syncing createdAt with originalPostedAt for better sorting...');

    // Update createdAt to match originalPostedAt
    // This ensures that "old" jobs that were just discovered don't appear at the top of the feed
    const query = `
    UPDATE jobs 
    SET created_at = original_posted_at 
    WHERE original_posted_at IS NOT NULL 
    AND created_at > original_posted_at
    AND created_at > (NOW() - INTERVAL '2 days'); -- Only affect the recent backfill
  `;

    const res = await client.query(query);

    console.log(`Updated ${res.rowCount} jobs. They should now appear sorted correctly by their true posting date.`);

    await client.end();
}

fixSorting().catch(console.error);
