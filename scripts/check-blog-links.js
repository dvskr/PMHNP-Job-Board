require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL });

(async () => {
  const res = await pool.query(`
    SELECT title, image_url, LEFT(content, 500) as preview
    FROM blog_posts
    WHERE title ILIKE '%become a pmhnp%'
    ORDER BY created_at DESC
    LIMIT 1
  `);

  if (res.rows.length === 0) { console.log('Not found'); await pool.end(); return; }

  const post = res.rows[0];
  console.log('Title:', post.title);
  console.log('image_url field:', post.image_url || '(empty)');

  // Find image markdown in content
  const imgMatch = post.preview.match(/!\[([^\]]*)\]\(([^)]*)\)/);
  if (imgMatch) {
    console.log('Image in content alt:', imgMatch[1]);
    console.log('Image in content url:', imgMatch[2]);
  }

  console.log('\nFirst 300 chars:', post.preview.substring(0, 300));

  await pool.end();
})();
