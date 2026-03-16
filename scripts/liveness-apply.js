/**
 * Quick unpublish: Uses the dead job IDs collected from the dry-run liveness check.
 * Runs a fresh scan but applies immediately during the scan (no double-pass).
 */
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL });

async function checkUrl(url) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(url, {
            method: 'HEAD',
            redirect: 'follow',
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PMHNPHiring-LinkChecker/1.0)' },
        });
        clearTimeout(timeout);
        return response.status;
    } catch {
        try {
            const controller2 = new AbortController();
            const timeout2 = setTimeout(() => controller2.abort(), 10000);
            const response2 = await fetch(url, {
                method: 'GET',
                redirect: 'follow',
                signal: controller2.signal,
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PMHNPHiring-LinkChecker/1.0)' },
            });
            clearTimeout(timeout2);
            return response2.status;
        } catch {
            return 0; // error
        }
    }
}

async function main() {
    console.log('=== Liveness Check + Apply ===\n');

    const jobs = await pool.query(`
    SELECT id, title, employer, source_provider, apply_link
    FROM jobs 
    WHERE is_published = true AND apply_link IS NOT NULL AND apply_link != ''
    ORDER BY source_provider, created_at DESC
  `);

    console.log(`Checking ${jobs.rows.length} published jobs...\n`);

    const deadIds = [];
    const bySource = {};
    let alive = 0, errors = 0;
    const BATCH = 15;

    for (let i = 0; i < jobs.rows.length; i += BATCH) {
        const batch = jobs.rows.slice(i, i + BATCH);
        const results = await Promise.allSettled(
            batch.map(async (job) => {
                const status = await checkUrl(job.apply_link);
                return { job, status };
            })
        );

        for (const r of results) {
            if (r.status === 'fulfilled') {
                const { job, status } = r.value;
                if (status === 404 || status === 410) {
                    deadIds.push(job.id);
                    bySource[job.source_provider] = (bySource[job.source_provider] || 0) + 1;
                } else if (status === 0) {
                    errors++;
                } else {
                    alive++;
                }
            }
        }

        const checked = Math.min(i + BATCH, jobs.rows.length);
        if (checked % 100 === 0 || checked === jobs.rows.length) {
            process.stdout.write(`\r  ${checked}/${jobs.rows.length} checked, ${deadIds.length} dead so far...`);
        }

        // Batch unpublish every 100 dead links found
        if (deadIds.length >= 100 && deadIds.length % 100 < BATCH) {
            const toUnpublish = deadIds.slice(-100);
            await pool.query(
                `UPDATE jobs SET is_published = false WHERE id = ANY($1::text[])`,
                [toUnpublish]
            );
        }

        await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Final batch unpublish any remaining
    if (deadIds.length > 0) {
        await pool.query(
            `UPDATE jobs SET is_published = false WHERE id = ANY($1::text[])`,
            [deadIds]
        );
    }

    console.log('\n\n=== Results (APPLIED) ===');
    console.log(`  Total checked: ${jobs.rows.length}`);
    console.log(`  ✅ Alive:       ${alive}`);
    console.log(`  💀 Dead (404):  ${deadIds.length}`);
    console.log(`  ⚠️  Errors:      ${errors}`);
    console.log('\n--- Dead by Source ---');
    Object.entries(bySource).sort((a, b) => b[1] - a[1]).forEach(([src, cnt]) => {
        console.log(`  ${src}: ${cnt}`);
    });
    console.log(`\n✅ Unpublished ${deadIds.length} dead jobs`);

    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
