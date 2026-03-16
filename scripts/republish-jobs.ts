import { config } from 'dotenv';
config();
config({ path: '.env.prod', override: true });

import pg from 'pg';
const { Client } = pg;

async function main() {
  const connStr = process.env.PROD_DATABASE_URL;
  if (!connStr) { console.error('PROD_DATABASE_URL not set'); process.exit(1); }
  const client = new Client({ connectionString: connStr });
  await client.connect();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Count first
  const countResult = await client.query(`
    SELECT COUNT(*)::int as c FROM jobs 
    WHERE is_published = false 
      AND original_posted_at >= '${thirtyDaysAgo}' 
      AND is_manually_unpublished = false
  `);
  console.log('Jobs to republish: ' + countResult.rows[0].c);

  // Republish: set is_published = true, refresh expires_at to 60 days from now
  const sixtyDaysFromNow = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
  
  const result = await client.query(`
    UPDATE jobs 
    SET is_published = true, 
        expires_at = '${sixtyDaysFromNow}',
        updated_at = NOW()
    WHERE is_published = false 
      AND original_posted_at >= '${thirtyDaysAgo}' 
      AND is_manually_unpublished = false
  `);
  console.log('Republished: ' + result.rowCount + ' jobs');

  // Verify new published count
  const newCount = await client.query('SELECT COUNT(*)::int as c FROM jobs WHERE is_published = true');
  console.log('Total published now: ' + newCount.rows[0].c);

  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
