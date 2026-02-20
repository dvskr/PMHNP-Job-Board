/**
 * Liveness Check: HTTP HEAD all published job apply links to find dead ones.
 * 
 * Usage: node scripts/liveness-check.js [--apply]
 * 
 * Default: dry-run mode (reports dead links but doesn't unpublish)
 * --apply: unpublishes dead jobs
 */
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.PROD_DATABASE_URL });

const dryRun = !process.argv.includes('--apply');

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
        return { status: response.status, ok: response.ok };
    } catch (err) {
        // Some servers block HEAD, try GET with a short body read
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
            return { status: response2.status, ok: response2.ok };
        } catch (err2) {
            return { status: 0, ok: false, error: err2.message };
        }
    }
}

async function main() {
    console.log(`=== Liveness Check ${dryRun ? '(DRY RUN)' : '(APPLYING)'} ===\n`);

    // Get ALL published jobs with apply links
    const jobs = await pool.query(`
    SELECT id, title, employer, source_provider, apply_link, 
      EXTRACT(DAY FROM NOW() - original_posted_at)::int as days_old
    FROM jobs 
    WHERE is_published = true AND apply_link IS NOT NULL AND apply_link != ''
    ORDER BY source_provider, created_at DESC
  `);

    console.log(`Checking ${jobs.rows.length} published jobs...\n`);

    const dead = [];
    const alive = [];
    const errors = [];
    const BATCH_SIZE = 10;

    for (let i = 0; i < jobs.rows.length; i += BATCH_SIZE) {
        const batch = jobs.rows.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
            batch.map(async (job) => {
                const result = await checkUrl(job.apply_link);
                return { job, result };
            })
        );

        for (const r of results) {
            if (r.status === 'fulfilled') {
                const { job, result } = r.value;
                if (result.status === 404 || result.status === 410) {
                    dead.push(job);
                    console.log(`  💀 [${job.source_provider}] "${job.title}" @ ${job.employer} → ${result.status} (${job.days_old || '?'}d old)`);
                } else if (result.status === 0) {
                    errors.push(job);
                } else {
                    alive.push(job);
                }
            }
        }

        // Progress
        const checked = Math.min(i + BATCH_SIZE, jobs.rows.length);
        if (checked % 50 === 0 || checked === jobs.rows.length) {
            process.stdout.write(`\r  Progress: ${checked}/${jobs.rows.length} checked...`);
        }

        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log('\n\n=== Results ===');
    console.log(`  Total checked: ${jobs.rows.length}`);
    console.log(`  ✅ Alive:       ${alive.length}`);
    console.log(`  💀 Dead (404):  ${dead.length}`);
    console.log(`  ⚠️ Errors:      ${errors.length}`);

    // Breakdown by source
    console.log('\n--- Dead by Source ---');
    const bySource = {};
    dead.forEach(j => { bySource[j.source_provider] = (bySource[j.source_provider] || 0) + 1; });
    Object.entries(bySource).sort((a, b) => b[1] - a[1]).forEach(([src, cnt]) => {
        console.log(`  ${src}: ${cnt}`);
    });

    if (!dryRun && dead.length > 0) {
        const deadIds = dead.map(j => j.id);
        const result = await pool.query(
            `UPDATE jobs SET is_published = false WHERE id = ANY($1::text[])`,
            [deadIds]
        );
        console.log(`\n✅ Unpublished ${result.rowCount} dead jobs`);
    } else if (dead.length > 0) {
        console.log(`\nRun with --apply to unpublish ${dead.length} dead jobs`);
    }

    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
