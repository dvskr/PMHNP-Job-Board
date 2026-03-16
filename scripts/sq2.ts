/**
 * Full Quality Source Ingestion — runs all quality ATS sources through the
 * real ingestion pipeline (normalize, dedup, quality score, insert).
 * 
 * Excludes: adzuna, jooble (redirect links), jsearch (removed), usajobs (removed)
 * 
 * Usage: npx tsx scripts/sq2.ts
 */

// Load env BEFORE any imports that use DATABASE_URL
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.prod' });
// Map PROD_DATABASE_URL → DATABASE_URL for Prisma
if (!process.env.DATABASE_URL && process.env.PROD_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}
import { ingestJobs, type JobSource } from '../lib/ingestion-service';
import { GREENHOUSE_TOTAL_CHUNKS } from '../lib/aggregators/greenhouse';
import { WORKDAY_TOTAL_CHUNKS } from '../lib/aggregators/workday';

async function run() {
    const startTime = Date.now();
    console.log('=== Full Quality ATS Ingestion ===');
    console.log(`Greenhouse chunks: ${GREENHOUSE_TOTAL_CHUNKS}, Workday chunks: ${WORKDAY_TOTAL_CHUNKS}`);
    console.log('Sources: lever, ashby, smartrecruiters, ats-jobs-db, fantastic-jobs-db\n');

    const allResults: Array<{ name: string; fetched: number; added: number; dupes: number; errors: number; elapsed: string }> = [];

    // 1. Run single-fetch sources all at once (they share dedup maps)
    const singleSources: JobSource[] = ['lever', 'ashby', 'smartrecruiters', 'ats-jobs-db', 'fantastic-jobs-db'];
    console.log('\n=== Phase 1: Single-fetch sources ===');
    const singleStart = Date.now();
    const singleResults = await ingestJobs(singleSources);
    for (const r of singleResults) {
        const elapsed = (r.duration / 1000).toFixed(1);
        console.log(`  ${r.source.padEnd(20)} Fetched: ${r.fetched}, Added: ${r.added}, Dupes: ${r.duplicates}, Errors: ${r.errors} (${elapsed}s)`);
        allResults.push({ name: r.source, fetched: r.fetched, added: r.added, dupes: r.duplicates, errors: r.errors, elapsed });
    }
    console.log(`Phase 1 done in ${((Date.now() - singleStart) / 1000).toFixed(0)}s\n`);

    // 2. Run Greenhouse chunks one by one
    console.log('=== Phase 2: Greenhouse (all chunks) ===');
    for (let chunk = 0; chunk < GREENHOUSE_TOTAL_CHUNKS; chunk++) {
        const chunkStart = Date.now();
        console.log(`  Running greenhouse chunk ${chunk}/${GREENHOUSE_TOTAL_CHUNKS - 1}...`);
        const results = await ingestJobs(['greenhouse'] as JobSource[], { chunk });
        const r = results[0];
        const elapsed = (r.duration / 1000).toFixed(1);
        console.log(`  greenhouse-chunk${chunk}: Fetched: ${r.fetched}, Added: ${r.added}, Dupes: ${r.duplicates}, Errors: ${r.errors} (${elapsed}s)`);
        allResults.push({ name: `greenhouse-chunk${chunk}`, fetched: r.fetched, added: r.added, dupes: r.duplicates, errors: r.errors, elapsed });
    }

    // 3. Run Workday chunks one by one
    console.log('\n=== Phase 3: Workday (all chunks) ===');
    for (let chunk = 0; chunk < WORKDAY_TOTAL_CHUNKS; chunk++) {
        const chunkStart = Date.now();
        console.log(`  Running workday chunk ${chunk}/${WORKDAY_TOTAL_CHUNKS - 1}...`);
        const results = await ingestJobs(['workday'] as JobSource[], { chunk });
        const r = results[0];
        const elapsed = (r.duration / 1000).toFixed(1);
        console.log(`  workday-chunk${chunk}: Fetched: ${r.fetched}, Added: ${r.added}, Dupes: ${r.duplicates}, Errors: ${r.errors} (${elapsed}s)`);
        allResults.push({ name: `workday-chunk${chunk}`, fetched: r.fetched, added: r.added, dupes: r.duplicates, errors: r.errors, elapsed });
    }

    // Final Summary
    console.log('\n\n' + '='.repeat(70));
    console.log('=== FINAL INGESTION REPORT ===');
    console.log('='.repeat(70));
    console.log('Source'.padEnd(24) + 'Fetched'.padStart(8) + 'Added'.padStart(7) + 'Dupes'.padStart(7) + 'Errs'.padStart(6) + '  Time');
    console.log('-'.repeat(60));

    let totalFetched = 0, totalAdded = 0, totalDupes = 0, totalErrors = 0;
    for (const r of allResults) {
        totalFetched += r.fetched;
        totalAdded += r.added;
        totalDupes += r.dupes;
        totalErrors += r.errors;
        console.log(
            r.name.padEnd(24) +
            String(r.fetched).padStart(8) +
            String(r.added).padStart(7) +
            String(r.dupes).padStart(7) +
            String(r.errors).padStart(6) +
            `  ${r.elapsed}s`
        );
    }
    console.log('-'.repeat(60));
    console.log(
        'TOTAL'.padEnd(24) +
        String(totalFetched).padStart(8) +
        String(totalAdded).padStart(7) +
        String(totalDupes).padStart(7) +
        String(totalErrors).padStart(6)
    );

    const totalElapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log(`\nTotal time: ${totalElapsed} minutes`);
    console.log('='.repeat(70));
}

run().catch(console.error);
