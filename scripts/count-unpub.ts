import { config } from 'dotenv';
config();
config({ path: '.env.prod', override: true });

import pg from 'pg';
import fs from 'fs';
const { Client } = pg;

async function main() {
  const connStr = process.env.PROD_DATABASE_URL;
  if (!connStr) { console.error('PROD_DATABASE_URL not set'); process.exit(1); }
  const client = new Client({ connectionString: connStr });
  await client.connect();

  const published = await client.query('SELECT COUNT(*)::int as c FROM jobs WHERE is_published = true');
  const unpublished = await client.query('SELECT COUNT(*)::int as c FROM jobs WHERE is_published = false');
  const total = await client.query('SELECT COUNT(*)::int as c FROM jobs');

  // Published count by day (last 14 days)
  const dailyPublished = await client.query(`
    SELECT created_at::date as d, 
           COUNT(*) FILTER (WHERE is_published = true)::int as pub,
           COUNT(*) FILTER (WHERE is_published = false)::int as unpub,
           COUNT(*)::int as total
    FROM jobs 
    WHERE created_at >= NOW() - INTERVAL '14 days'
    GROUP BY d ORDER BY d DESC
  `);

  // Expired jobs
  const expired = await client.query('SELECT COUNT(*)::int as c FROM jobs WHERE is_published = true AND expires_at < NOW()');
  const expiredUnpub = await client.query('SELECT COUNT(*)::int as c FROM jobs WHERE is_published = false AND expires_at < NOW()');

  // Jobs updated in last 24h that are now unpublished
  const recentlyUpdated = await client.query(`
    SELECT COUNT(*)::int as c FROM jobs 
    WHERE updated_at >= NOW() - INTERVAL '24 hours' AND is_published = false
  `);

  // Jobs where updated_at is significantly after created_at (flipped status)
  const flipped = await client.query(`
    SELECT COUNT(*)::int as c FROM jobs 
    WHERE is_published = false AND updated_at > created_at + INTERVAL '1 minute'
  `);

  // Published by source
  const pubBySource = await client.query(`
    SELECT source_provider, COUNT(*)::int as c FROM jobs 
    WHERE is_published = true 
    GROUP BY source_provider ORDER BY c DESC
  `);

  // Unpublished by source
  const unpubBySource = await client.query(`
    SELECT source_provider, COUNT(*)::int as c FROM jobs 
    WHERE is_published = false 
    GROUP BY source_provider ORDER BY c DESC
  `);

  // fantastic-jobs-db in prod
  const fantastic = await client.query(`
    SELECT is_published, COUNT(*)::int as c FROM jobs 
    WHERE source_provider = 'fantastic-jobs-db'
    GROUP BY is_published
  `);

  // Bulk update dates — when were jobs mass flipped to unpublished?
  const bulkUpdates = await client.query(`
    SELECT updated_at::date as d, COUNT(*)::int as c
    FROM jobs 
    WHERE is_published = false AND updated_at > created_at + INTERVAL '1 minute'
    GROUP BY d ORDER BY d DESC LIMIT 10
  `);

  // What happened to the jobs that were published? Check when they were created
  const publishedByAge = await client.query(`
    SELECT 
      CASE 
        WHEN created_at >= NOW() - INTERVAL '7 days' THEN '0-7 days'
        WHEN created_at >= NOW() - INTERVAL '14 days' THEN '8-14 days'
        WHEN created_at >= NOW() - INTERVAL '30 days' THEN '15-30 days'
        WHEN created_at >= NOW() - INTERVAL '60 days' THEN '31-60 days'
        ELSE '60+ days'
      END as age,
      COUNT(*)::int as c
    FROM jobs WHERE is_published = true
    GROUP BY age ORDER BY MIN(created_at) DESC
  `);

  const result = {
    currentState: {
      published: published.rows[0].c,
      unpublished: unpublished.rows[0].c,
      total: total.rows[0].c,
    },
    expiration: {
      publishedButExpired: expired.rows[0].c,
      unpublishedAndExpired: expiredUnpub.rows[0].c,
    },
    recentActivity: {
      unpublishedUpdatedLast24h: recentlyUpdated.rows[0].c,
      jobsFlippedAfterCreation: flipped.rows[0].c,
    },
    publishedByAge: publishedByAge.rows.map((r: any) => ({ age: r.age, count: r.c })),
    dailyIngestion: dailyPublished.rows.map((r: any) => ({
      date: r.d instanceof Date ? r.d.toISOString().slice(0, 10) : String(r.d).slice(0, 10),
      published: r.pub,
      unpublished: r.unpub,
      total: r.total,
    })),
    publishedBySource: pubBySource.rows.map((r: any) => ({ source: r.source_provider || 'employer', count: r.c })),
    unpublishedBySource: unpubBySource.rows.map((r: any) => ({ source: r.source_provider || 'employer', count: r.c })),
    fantasticJobsDb: fantastic.rows.map((r: any) => ({ published: r.is_published, count: r.c })),
    bulkUpdateDates: bulkUpdates.rows.map((r: any) => ({
      date: r.d instanceof Date ? r.d.toISOString().slice(0, 10) : String(r.d).slice(0, 10),
      count: r.c,
    })),
  };

  fs.writeFileSync('tmp/prod-investigation.json', JSON.stringify(result, null, 2));
  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
