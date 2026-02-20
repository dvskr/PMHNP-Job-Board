require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL });

(async () => {
  const res = await pool.query('SELECT title, content FROM blog_posts ORDER BY created_at');

  for (const post of res.rows) {
    const headings = post.content.match(/^## .+/gm) || [];
    console.log(`\n${post.title} (${headings.length} headings):`);
    headings.forEach(h => console.log(`  ${h}`));
  }

  await pool.end();
})();
