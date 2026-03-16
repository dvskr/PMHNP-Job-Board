const { Client } = require('pg');
require('dotenv').config({ path: '.env' });

async function main() {
    const client = new Client({
        connectionString: process.env.PROD_DATABASE_URL,
        ssl: { rejectUnauthorized: false },
    });
    await client.connect();

    // Show all links currently in the blog post
    const result = await client.query("SELECT content FROM blog_posts WHERE slug = 'remote-pmhnp-jobs-in-2026-what-remote-really-means'");
    const text = result.rows[0].content;

    const linkRegex = /\[([^\]]*)\]\(([^)]*)\)/g;
    let match;
    console.log('All links in blog post:');
    while ((match = linkRegex.exec(text)) !== null) {
        console.log('  ' + match[2]);
    }

    // Fix /salaries -> /salary-guide if still present
    if (text.includes('/salaries')) {
        console.log('\n/salaries still found, fixing...');
        await client.query(
            "UPDATE blog_posts SET content = REPLACE(content, '/salaries', '/salary-guide'), updated_at = NOW() WHERE content LIKE '%/salaries%'"
        );
        console.log('Fixed!');
    } else {
        console.log('\nNo /salaries found - already fixed.');
    }

    await client.end();
}
main().catch(e => { console.error(e); process.exit(1); });
