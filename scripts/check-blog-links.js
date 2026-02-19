require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL });

(async () => {
    const res = await pool.query(`
    SELECT title, created_at,
           (content LIKE E'%\n%')::text as nl,
           (content LIKE '%<h2%')::text as h2
    FROM blog_posts
    ORDER BY created_at DESC
  `);

    for (const p of res.rows) {
        const d = new Date(p.created_at).toISOString().split('T')[0];
        console.log(d + ' nl:' + p.nl + ' h2:' + p.h2 + ' ' + p.title.substring(0, 60));
    }

    await pool.end();
})();
