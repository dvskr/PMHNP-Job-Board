/**
 * Run just Fantastic-Jobs-DB ingestion to test the bug fix.
 */
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.prod' });
if (!process.env.DATABASE_URL && process.env.PROD_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { ingestJobs } from '../lib/ingestion-service';

async function run() {
    console.log('=== Running Fantastic-Jobs-DB Ingestion ===\n');
    const result = await ingestJobs(['fantastic-jobs-db']);
    console.log('\n=== Result ===');
    console.log(JSON.stringify(result, null, 2));
}

run().catch(console.error);
