import fs from 'fs';
import pg from 'pg';

const envFile = fs.readFileSync('c:/Users/daggu/PMHNP-Job-Board/.env', 'utf-8');
let prodUrl = '';
for (const line of envFile.split('\n')) {
  if (line.startsWith('PROD_DATABASE_URL=')) prodUrl = line.slice(18).trim();
}

const client = new pg.Client({ connectionString: prodUrl });

async function main() {
  await client.connect();
  
  // Get all blog slugs that might be state-related
  const res = await client.query(
    "SELECT slug FROM blog_posts WHERE slug LIKE '%pmhnp%' OR slug LIKE '%license%' OR slug LIKE '%nursing%' ORDER BY slug"
  );
  console.log(`Found ${res.rows.length} matching blog posts:`);
  res.rows.forEach(r => console.log(' ', r.slug));
  
  await client.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
