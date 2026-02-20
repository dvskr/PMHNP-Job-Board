require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL });

async function main() {
    // True duplicates: same title + employer + city + state
    const trueDupes = await pool.query(`
    SELECT title, employer, city, state, COUNT(*)::int as count,
      array_agg(id ORDER BY created_at) as ids
    FROM jobs WHERE is_published = true
    GROUP BY title, employer, city, state
    HAVING COUNT(*) > 1
    ORDER BY count DESC
    LIMIT 20
  `);

    let totalTrueDupes = 0;
    console.log('=== TRUE DUPLICATES (same title + employer + city + state) ===\n');
    for (const d of trueDupes.rows) {
        totalTrueDupes += d.count - 1;
        console.log(`  "${d.title}" @ ${d.employer} in ${d.city || 'null'}, ${d.state || 'null'} → ${d.count}x`);
    }

    const totalExtras = await pool.query(`
    SELECT SUM(count - 1)::int as extra FROM (
      SELECT title, employer, city, state, COUNT(*)::int as count
      FROM jobs WHERE is_published = true
      GROUP BY title, employer, city, state
      HAVING COUNT(*) > 1
    ) sub
  `);

    console.log(`\nTotal true duplicate extra entries: ${totalExtras.rows[0].extra}`);
    console.log(`(These are safe to remove — keeping 1 per title+employer+city+state)`);

    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
