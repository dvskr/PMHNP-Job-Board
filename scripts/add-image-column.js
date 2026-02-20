require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL });

(async () => {
    // Check existing columns
    const res = await pool.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name='blog_posts' ORDER BY ordinal_position"
    );
    console.log('Current columns:', res.rows.map(r => r.column_name).join(', '));

    // Add image_url column
    await pool.query('ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS image_url TEXT');
    console.log('Added image_url column');

    // Verify
    const res2 = await pool.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name='blog_posts' ORDER BY ordinal_position"
    );
    console.log('Updated columns:', res2.rows.map(r => r.column_name).join(', '));

    // Notify PostgREST to reload schema (Supabase uses this)
    await pool.query('NOTIFY pgrst, \'reload schema\'');
    console.log('Sent schema reload notification to PostgREST');

    await pool.end();
})();
