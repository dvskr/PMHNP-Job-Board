require('dotenv').config({ path: '.env.prod' });
const { Client } = require('pg');

async function run() {
  const c = new Client({ connectionString: process.env.PROD_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const r = await c.query(
    "SELECT experience_level, COUNT(*) as cnt FROM jobs WHERE is_published = true AND experience_level IS NOT NULL GROUP BY experience_level ORDER BY cnt DESC"
  );
  console.log('Experience Level in DB:');
  for (const row of r.rows) {
    console.log('  ' + row.experience_level + ': ' + row.cnt);
  }

  await c.end();
}
run().catch(console.error);
