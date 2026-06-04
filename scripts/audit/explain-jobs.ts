/**
 * P5.C — read-only EXPLAIN (ANALYZE) of the hot job-listing queries against prod,
 * to measure the real cost of the missing originalPostedAt / stateCode indexes
 * BEFORE adding them (and to re-run AFTER, to confirm the planner uses them).
 *
 * Read-only: EXPLAIN ANALYZE executes SELECTs only. No mutations.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}
import { prisma } from '@/lib/prisma';

const QUERIES: { name: string; sql: string }[] = [
  {
    name: 'A — newest-sort listing (ORDER BY original_posted_at)',
    sql: `SELECT id FROM jobs
          WHERE is_published = true AND (expires_at IS NULL OR expires_at > now())
          ORDER BY original_posted_at DESC NULLS LAST, created_at DESC
          LIMIT 50`,
  },
  {
    name: 'B — state page (state OR state_code) + newest',
    sql: `SELECT id FROM jobs
          WHERE is_published = true
            AND (state = 'California' OR state_code = 'CA')
            AND (expires_at IS NULL OR expires_at > now())
          ORDER BY original_posted_at DESC NULLS LAST, created_at DESC
          LIMIT 50`,
  },
  {
    name: 'C — freshness range (original_posted_at > now()-3d)',
    sql: `SELECT count(*) FROM jobs
          WHERE is_published = true AND original_posted_at > now() - interval '3 days'`,
  },
  {
    name: 'D — DEFAULT best sort (joins employer_jobs)',
    sql: `SELECT j.id FROM jobs j
          LEFT JOIN employer_jobs ej ON ej.job_id = j.id
          WHERE j.is_published = true AND (j.expires_at IS NULL OR j.expires_at > now())
          ORDER BY ej.id ASC NULLS LAST, j.is_featured DESC, j.quality_score DESC,
                   j.original_posted_at DESC NULLS LAST, j.created_at DESC
          LIMIT 50`,
  },
];

async function main(): Promise<void> {
  for (const q of QUERIES) {
    console.log('\n==================================================');
    console.log(q.name);
    console.log('==================================================');
    try {
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, string>>>(
        `EXPLAIN (ANALYZE, BUFFERS, SUMMARY) ${q.sql}`,
      );
      for (const r of rows) console.log(Object.values(r)[0]);
    } catch (e) {
      console.error('EXPLAIN failed:', e instanceof Error ? e.message : String(e));
    }
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('fatal', e);
  await prisma.$disconnect();
  process.exit(1);
});
