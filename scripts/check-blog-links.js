require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL });

(async () => {
    const res = await pool.query(`
    SELECT content FROM blog_posts 
    WHERE title ILIKE '%Telehealth vs In-Person%'
    LIMIT 1
  `);

    if (res.rows.length === 0) { console.log('Not found'); await pool.end(); return; }

    const content = res.rows[0].content;

    // Show first 500 chars to understand format
    console.log('=== First 500 chars (JSON escaped) ===');
    console.log(JSON.stringify(content.substring(0, 500)));

    // Find ALL markdown links: [text](url)
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    console.log('\n=== All markdown links in stored content ===');
    while ((match = linkRegex.exec(content)) !== null) {
        console.log(`Text: "${match[1]}"\n  URL: "${match[2]}"\n`);
    }

    // Find all <a href> links
    const hrefRegex = /href="([^"]+)"/g;
    console.log('=== All href links ===');
    while ((match = hrefRegex.exec(content)) !== null) {
        console.log(`  href="${match[1]}"`);
    }

    await pool.end();
})();
