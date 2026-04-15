import { Pool } from 'pg';
import { config } from 'dotenv';
config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const result = await pool.query(`SELECT slug, category FROM blog_posts WHERE category = 'state_spotlight' LIMIT 10`);
console.log('state_spotlight posts in DEV DB:', result.rows.length);
result.rows.forEach(r => console.log(' ', r.slug));

if (result.rows.length === 0) {
  const all = await pool.query(`SELECT DISTINCT category, COUNT(*) as cnt FROM blog_posts GROUP BY category ORDER BY cnt DESC`);
  console.log('\nAll categories in DEV:');
  all.rows.forEach(r => console.log(' ', r.category, ':', r.cnt));
}

await pool.end();
