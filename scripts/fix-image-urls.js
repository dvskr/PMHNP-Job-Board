require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL });

(async () => {
  // Telehealth vs In-Person blog
  const r1 = await pool.query(
    `UPDATE blog_posts SET image_url = $1 WHERE title ILIKE '%telehealth vs in-person%' RETURNING title`,
    ['https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/resource-companion/telehealth%20vs%20in%20person.jpg']
  );
  console.log('Updated:', r1.rows[0]?.title || 'NOT FOUND');

  // Remote PMHNP blog
  const r2 = await pool.query(
    `UPDATE blog_posts SET image_url = $1 WHERE title ILIKE '%remote pmhnp%' RETURNING title`,
    ['https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/resource-companion/remote%20pmhnp.jpg']
  );
  console.log('Updated:', r2.rows[0]?.title || 'NOT FOUND');

  // Verify all
  const all = await pool.query('SELECT title, image_url FROM blog_posts ORDER BY created_at');
  all.rows.forEach(r => console.log(`  ${r.title} → ${r.image_url || '(none)'}`));

  await pool.end();
})();
