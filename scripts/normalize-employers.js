/**
 * Company Name Normalization Script
 * 
 * Fixes Bug #16: Employer name variants that differ only by casing.
 * 
 * This script:
 * 1. Finds all employer name variants that are identical when lowercased
 * 2. Picks the canonical (most common) variant
 * 3. Updates all jobs to use the canonical employer name
 * 4. Merges company table entries where applicable
 * 
 * Usage:
 *   DRY RUN:  node scripts/normalize-employers.js
 *   EXECUTE:  node scripts/normalize-employers.js --execute
 */
const { Client } = require('pg');
const fs = require('fs');

const match = fs.readFileSync('.env.prod', 'utf-8').match(/PROD_DATABASE_URL=(.+)/);
if (!match) { console.error('No PROD_DATABASE_URL found in .env.prod'); process.exit(1); }

const execute = process.argv.includes('--execute');
const client = new Client({ connectionString: match[1].trim(), ssl: { rejectUnauthorized: false } });

async function normalize() {
  await client.connect();
  console.log(`=== EMPLOYER NAME NORMALIZATION ${execute ? '(EXECUTING)' : '(DRY RUN)'} ===\n`);

  // Step 1: Find all employer name variants
  const variants = await client.query(`
    SELECT LOWER(TRIM(employer)) as norm, 
           array_agg(DISTINCT employer ORDER BY employer) as variants,
           COUNT(*)::int as total_jobs
    FROM jobs 
    WHERE is_published = true AND employer IS NOT NULL
    GROUP BY LOWER(TRIM(employer))
    HAVING COUNT(DISTINCT employer) > 1
    ORDER BY total_jobs DESC
  `);

  if (variants.rows.length === 0) {
    console.log('No employer name variants found. Database is clean!');
    await client.end();
    return;
  }

  console.log(`Found ${variants.rows.length} employer name groups with variants:\n`);

  let totalUpdated = 0;

  for (const row of variants.rows) {
    const { norm, variants: variantList, total_jobs } = row;

    // Pick canonical name: the one with the most jobs
    const countResult = await client.query(`
      SELECT employer, COUNT(*)::int as c 
      FROM jobs 
      WHERE LOWER(TRIM(employer)) = $1 AND is_published = true
      GROUP BY employer 
      ORDER BY c DESC
    `, [norm]);

    const canonical = countResult.rows[0].employer;
    const nonCanonical = variantList.filter(v => v !== canonical);

    console.log(`  "${canonical}" (canonical, ${countResult.rows[0].c} jobs)`);
    nonCanonical.forEach(v => {
      const vc = countResult.rows.find(r => r.employer === v);
      console.log(`    ← "${v}" (${vc ? vc.c : '?'} jobs)`);
    });

    if (execute) {
      // Update jobs table
      for (const variant of nonCanonical) {
        const result = await client.query(
          `UPDATE jobs SET employer = $1 WHERE employer = $2`,
          [canonical, variant]
        );
        totalUpdated += result.rowCount;
        console.log(`    ✅ Updated ${result.rowCount} jobs: "${variant}" → "${canonical}"`);
      }

      // Update companies table if applicable
      const canonicalCompany = await client.query(
        `SELECT id FROM companies WHERE name = $1 LIMIT 1`, [canonical]
      );
      
      for (const variant of nonCanonical) {
        const variantCompany = await client.query(
          `SELECT id FROM companies WHERE name = $1 LIMIT 1`, [variant]
        );
        
        if (variantCompany.rows.length > 0 && canonicalCompany.rows.length > 0) {
          // Re-point jobs to canonical company
          await client.query(
            `UPDATE jobs SET company_id = $1 WHERE company_id = $2`,
            [canonicalCompany.rows[0].id, variantCompany.rows[0].id]
          );
          // Delete variant company
          await client.query(
            `DELETE FROM companies WHERE id = $1`, [variantCompany.rows[0].id]
          );
          console.log(`    ✅ Merged company "${variant}" → "${canonical}"`);
        }
      }
    }
    console.log();
  }

  if (execute) {
    console.log(`\n=== DONE: Updated ${totalUpdated} job records ===`);
  } else {
    console.log(`\n=== DRY RUN COMPLETE ===`);
    console.log(`Run with --execute to apply changes.`);
  }

  await client.end();
}

normalize().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
