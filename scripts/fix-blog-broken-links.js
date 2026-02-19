require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL });

(async () => {
    // Fix broken links in ALL blog posts where URLs contain <h2 or similar HTML
    const res = await pool.query(`
    SELECT id, title, content FROM blog_posts
    WHERE content LIKE '%.<h%' OR content LIKE '%.</' 
  `);

    console.log('Found ' + res.rows.length + ' posts with broken links');

    for (const post of res.rows) {
        let content = post.content;

        // Fix pattern: (url.<hN) -> (url)
        // The issue is markdown links like [text](https://pmhnphiring.com/jobs.<h2)
        content = content.replace(/(\(https?:\/\/[^)]*?)\.<h\d[^)]*\)/g, (match, urlPart) => {
            return urlPart + ')';
        });

        // Also fix any href="url.<h2" patterns 
        content = content.replace(/(href="https?:\/\/[^"]*?)\.<h\d[^"]*"/g, (match, urlPart) => {
            return urlPart + '"';
        });

        if (content !== post.content) {
            await pool.query('UPDATE blog_posts SET content = $1, updated_at = NOW() WHERE id = $2', [content, post.id]);
            console.log('Fixed: ' + post.title);
        }
    }

    console.log('Done');
    await pool.end();
})();
