// Load environment BEFORE any imports
import 'dotenv/config';

import { prisma } from '../lib/prisma';
import { type JobSource } from '../lib/ingestion-service';

async function runIngestion() {
  try {
    console.log('\n' + '='.repeat(80));
    console.log('🔄 STARTING JOB INGESTION');
    console.log('='.repeat(80) + '\n');

    const startTime = Date.now();

    // Import ingestion service
    const { ingestJobs, getIngestionStats } = await import('../lib/ingestion-service');

    // Run ingestion for all working sources
    const sources: JobSource[] = ['adzuna', 'jooble', 'greenhouse', 'lever', 'usajobs', 'careerjet', 'jsearch'];
    console.log(`📡 Sources: ${sources.join(', ')}\n`);

    const results = await ingestJobs(sources);

    // Calculate totals
    const totals = results.reduce(
      (acc, r) => ({
        fetched: acc.fetched + r.fetched,
        added: acc.added + r.added,
        duplicates: acc.duplicates + r.duplicates,
        errors: acc.errors + r.errors,
      }),
      { fetched: 0, added: 0, duplicates: 0, errors: 0 }
    );

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n' + '='.repeat(80));
    console.log('✅ INGESTION COMPLETE');
    console.log('='.repeat(80));
    console.log(`\n📊 SUMMARY:`);
    console.log(`  - Fetched: ${totals.fetched}`);
    console.log(`  - Added: ${totals.added}`);
    console.log(`  - Duplicates: ${totals.duplicates}`);
    console.log(`  - Errors: ${totals.errors}`);
    console.log(`  - Duration: ${duration}s\n`);

    // Get current stats
    try {
      const stats = await getIngestionStats();
      console.log(`📈 CURRENT DATABASE STATS:`);
      console.log(`  - Total Active: ${stats.totalActive}`);
      console.log(`  - Added Last 24h: ${stats.addedLast24h}`);
      console.log(`  - By Source:`, stats.bySource);
      console.log();
    } catch {
      console.log('⚠️  Could not fetch stats\n');
    }

    console.log('🎉 Done!\n');

    // Explicitly disconnect
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ ERROR:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

runIngestion();

