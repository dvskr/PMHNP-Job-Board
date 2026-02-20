require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL });

(async () => {
    // Fix Google Drive viewer URLs to direct image URLs
    const res = await pool.query(`
    UPDATE blog_posts 
    SET image_url = 'https://drive.google.com/uc?export=view&id=' || 
      substring(image_url from 'drive\.google\.com/file/d/([^/]+)')
    WHERE image_url LIKE '%drive.google.com/file/d/%'
    RETURNING title, image_url
  `);

    res.rows.forEach(r => console.log('Fixed:', r.title, '->', r.image_url));
    console.log('Updated', res.rowCount, 'rows');

    await pool.end();
})();
