const { Client } = require('pg');
const fs = require('fs');
const envProd = fs.readFileSync('.env.prod', 'utf-8');
const match = envProd.match(/PROD_DATABASE_URL=(.+)/);
const c = new Client({ connectionString: match[1].trim(), ssl: { rejectUnauthorized: false } });

c.connect().then(async () => {
  const r = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
  r.rows.forEach(t => console.log(t.table_name));
  await c.end();
}).catch(e => { console.error(e.message); c.end(); });
