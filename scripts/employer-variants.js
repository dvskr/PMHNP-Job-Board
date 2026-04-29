const { Client } = require('pg');
const fs = require('fs');
const match = fs.readFileSync('.env.prod', 'utf-8').match(/PROD_DATABASE_URL=(.+)/);
const c = new Client({ connectionString: match[1].trim(), ssl: { rejectUnauthorized: false } });

c.connect().then(async () => {
  const r = await c.query(`
    SELECT LOWER(TRIM(employer)) as norm, 
           array_agg(DISTINCT employer) as variants, 
           COUNT(*)::int as total 
    FROM jobs 
    WHERE is_published = true AND employer IS NOT NULL 
    GROUP BY LOWER(TRIM(employer)) 
    HAVING COUNT(DISTINCT employer) > 1 
    ORDER BY total DESC LIMIT 20
  `);
  console.log('=== EMPLOYER NORMALIZATION MAP ===');
  r.rows.forEach(d => {
    console.log(`\n"${d.norm}" (${d.total} jobs):`);
    d.variants.forEach(v => console.log(`  - "${v}"`));
  });
  await c.end();
}).catch(e => { console.error(e.message); c.end(); });
