const { Client } = require('pg');
const fs = require('fs');
const match = fs.readFileSync('.env.prod', 'utf-8').match(/PROD_DATABASE_URL=(.+)/);
const c = new Client({ connectionString: match[1].trim(), ssl: { rejectUnauthorized: false } });

c.connect().then(async () => {
  const r = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='jobs' ORDER BY ordinal_position");
  r.rows.forEach(col => console.log(`  ${col.column_name} (${col.data_type})`));
  await c.end();
}).catch(e => { console.error(e.message); c.end(); });
