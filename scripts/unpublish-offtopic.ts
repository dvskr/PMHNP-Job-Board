import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.prod' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL });

async function main() {
    // Re-publish the 3 legitimate Pediatric PMHNP jobs that were false positives
    const r = await pool.query(`
    UPDATE jobs SET is_published = true, updated_at = NOW()
    WHERE is_published = false
    AND (
      title LIKE '%Pediatric PMHNP%'
      OR title LIKE '%PMHNP Pediatric%'
    )
    AND updated_at > NOW() - INTERVAL '1 hour'
    RETURNING id, title
  `);
    console.log('Re-published ' + r.rowCount + ' legitimate Pediatric PMHNP jobs:');
    r.rows.forEach((j: any) => console.log('  ✅ ' + j.title));
    await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
