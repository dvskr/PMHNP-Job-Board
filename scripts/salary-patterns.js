require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL });

async function main() {
    // Get samples of descriptions with $ but no extracted salary
    const samples = await pool.query(`
    SELECT id, title, employer, source_provider, description
    FROM jobs 
    WHERE is_published = true AND min_salary IS NULL AND display_salary IS NULL
    AND description LIKE '%$%'
    ORDER BY created_at DESC
    LIMIT 30
  `);

    console.log(`=== ${samples.rows.length} SAMPLES WITH $ BUT NO SALARY ===\n`);

    for (const r of samples.rows) {
        // Find all $ patterns in the description
        const dollarMatches = r.description.match(/\$[\d,]+(?:\.\d+)?(?:\s*[-–to]+\s*\$?[\d,]+(?:\.\d+)?)?(?:\s*(?:per|\/|a|an|each)?\s*(?:hour|hr|year|yr|annual|annually|week|wk|month|mo|day|visit|session|biweekly)?)?/gi) || [];

        console.log(`[${r.source_provider || 'employer'}] "${r.title}" @ ${r.employer}`);
        if (dollarMatches.length > 0) {
            console.log(`  Found patterns: ${dollarMatches.join(' | ')}`);
        }

        // Show surrounding context for the $ sign
        const idx = r.description.indexOf('$');
        if (idx >= 0) {
            const start = Math.max(0, idx - 30);
            const end = Math.min(r.description.length, idx + 60);
            console.log(`  Context: ...${r.description.substring(start, end).replace(/\n/g, ' ')}...`);
        }
        console.log('');
    }

    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
