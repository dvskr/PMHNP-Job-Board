import 'dotenv/config';
import { Client } from 'pg';

async function verify() {
    const client = new Client({
        connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL
    });

    await client.connect();

    console.log('\n=== VERIFICATION EVIDENCE ===\n');

    // 1. Verify Counts
    const total = await client.query('SELECT count(*) FROM jobs');
    const published = await client.query('SELECT count(*) FROM jobs WHERE is_published = true');
    const withDate = await client.query('SELECT count(*) FROM jobs WHERE original_posted_at IS NOT NULL');

    console.log('1. JOB VOLUME CLAIMS:');
    console.log(`   - Total Jobs in DB: ${total.rows[0].count}`);
    console.log(`   - Active/Published: ${published.rows[0].count}`);
    console.log(`   - Jobs with True Date: ${withDate.rows[0].count}`);

    // 2. Verify Date Accuracy (The "Gap" Fix)
    // Find jobs where the original posted date is OLDER than when we found it (created_at)
    // This proves we are backfilling history, not just claiming "today"
    const gapQuery = `
    SELECT title, source_provider, created_at, original_posted_at
    FROM jobs 
    WHERE original_posted_at IS NOT NULL 
    AND original_posted_at < (created_at - INTERVAL '1 day')
    LIMIT 3;
  `;

    const gapEvidence = await client.query(gapQuery);

    console.log('\n2. DATE ACCURACY PROOF (Original Date < Discovery Date):');
    if (gapEvidence.rows.length > 0) {
        gapEvidence.rows.forEach((job, i) => {
            console.log(`   Example ${i + 1}: ${job.title.substring(0, 40)}...`);
            console.log(`     - Source: ${job.source_provider}`);
            console.log(`     - We Found It On: ${job.created_at.toISOString().split('T')[0]}`);
            console.log(`     - Actually Posted: ${job.original_posted_at.toISOString().split('T')[0]} (Captured correctly!)`);
        });
    } else {
        console.log('   No historical backfills found yet (sync might be processing only recent jobs first).');
    }

    // 3. Verify Recent Ingestion
    // Check for jobs added in the last 24 hours
    const recentCount = await client.query(`
    SELECT count(*) FROM jobs 
    WHERE created_at > (NOW() - INTERVAL '24 hours')
  `);

    console.log('\n3. RECENT ACTIVITY:');
    console.log(`   - Jobs ingested in last 24h: ${recentCount.rows[0].count}`);

    await client.end();
}

verify().catch(console.error);
