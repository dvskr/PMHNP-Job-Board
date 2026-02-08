import 'dotenv/config';
import { Client } from 'pg';

async function checkJob() {
    const client = new Client({
        connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL
    });

    await client.connect();

    const query = `
    SELECT title, employer, source_provider, created_at, original_posted_at, 
           (original_posted_at IS NULL) as is_date_missing
    FROM jobs 
    WHERE employer ILIKE '%Talkiatry%' 
    AND title ILIKE '%New Mexico%'
    LIMIT 5;
  `;

    const res = await client.query(query);

    console.log('--- JOB DETAILS ---');
    if (res.rows.length === 0) {
        console.log('No matching job found.');
    } else {
        res.rows.forEach(job => {
            console.log(`Title: ${job.title}`);
            console.log(`Employer: ${job.employer}`);
            console.log(`Source: ${job.source_provider}`);
            console.log(`Created At: ${job.created_at}`);
            console.log(`Original Posted At: ${job.original_posted_at}`);
            console.log(`Date Missing?: ${job.is_date_missing}`);
            console.log('-------------------');
        });
    }

    await client.end();
}

checkJob().catch(console.error);
