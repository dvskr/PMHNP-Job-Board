/**
 * SEO Final Sweep: 
 *   1. Add source citations to all remaining career articles (skip state guides + already done)
 *   2. Touch updated_at on all career guides → triggers "Last Reviewed: May 2026" badge
 *
 * Runs against PROD Supabase (PROD_DIRECT_DATABASE_URL from .env.prod).
 *
 * Usage:
 *   npx tsx scripts/seo-final-sweep.ts --dry-run
 *   npx tsx scripts/seo-final-sweep.ts
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';

const prodEnv = fs.readFileSync(path.join(process.cwd(), '.env.prod'), 'utf-8');
const connectionString = prodEnv.match(/^PROD_DIRECT_DATABASE_URL=(.+)$/m)?.[1];
if (!connectionString) throw new Error('PROD_DIRECT_DATABASE_URL not found in .env.prod');

const pool = new Pool({ connectionString, max: 3 });
const DRY_RUN = process.argv.includes('--dry-run');

const SOURCES_BLOCK = `

---

**Sources**

*Data in this article is sourced from:*

- Bureau of Labor Statistics (BLS), *Occupational Outlook Handbook*, May 2024 — [bls.gov/ooh](https://www.bls.gov/ooh/healthcare/nurse-anesthetists-nurse-midwives-and-nurse-practitioners.htm)
- American Association of Nurse Practitioners (AANP), *NP Fact Sheet*, 2025 — [aanp.org](https://www.aanp.org/about/all-about-nps/np-fact-sheet)
- PMHNP Hiring aggregated job board data (May 2026)

*Salary ranges and market data reflect current listings and may vary by location, experience, and employer.*`;

async function main() {
    console.log(`\n🧹 SEO Final Sweep — ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

    // ─── Part 1: Add source citations to remaining articles ──────────

    console.log('━━━ PART 1: Source Citations for Remaining Articles ━━━\n');

    // Get all published non-state articles that don't have citations yet
    const { rows: articles } = await pool.query(`
        SELECT id, slug, content, LENGTH(content) as len
        FROM blog_posts 
        WHERE status = 'published'
          AND slug NOT LIKE 'pmhnp-license-%'
          AND content NOT LIKE '%Sources & Methodology%'
          AND content NOT LIKE '%**Sources**%'
        ORDER BY slug
    `);

    console.log(`  Found ${articles.length} articles without source citations\n`);

    let citationsAdded = 0;
    let citationsSkipped = 0;

    for (const article of articles) {
        const { id, slug, content } = article;

        // Skip very short articles (likely stubs or non-content)
        if (content.length < 500) {
            console.log(`  ⏭️  SKIP  ${slug} — too short (${content.length} chars)`);
            citationsSkipped++;
            continue;
        }

        // Append sources block
        const newContent = content.trimEnd() + SOURCES_BLOCK;

        if (DRY_RUN) {
            console.log(`  📋  WOULD ADD CITATIONS  ${slug} (${content.length} chars)`);
            citationsAdded++;
            continue;
        }

        await pool.query(
            `UPDATE blog_posts SET content = $1, updated_at = NOW() WHERE id = $2`,
            [newContent, id]
        );
        console.log(`  ✅  CITATIONS  ${slug} (+${SOURCES_BLOCK.length} chars)`);
        citationsAdded++;
    }

    console.log(`\n  Citations: added ${citationsAdded}, skipped ${citationsSkipped}\n`);

    // ─── Part 2: Touch updated_at on ALL career guides ───────────────

    console.log('━━━ PART 2: Refresh "Last Reviewed" Badge (updated_at → NOW) ━━━\n');

    if (DRY_RUN) {
        const { rows: countRows } = await pool.query(`
            SELECT COUNT(*) as cnt FROM blog_posts 
            WHERE status = 'published'
              AND updated_at < '2026-05-01'
        `);
        console.log(`  📋  WOULD TOUCH ${countRows[0].cnt} articles with updated_at before May 2026\n`);
    } else {
        const { rowCount } = await pool.query(`
            UPDATE blog_posts 
            SET updated_at = NOW() 
            WHERE status = 'published'
              AND updated_at < '2026-05-01'
        `);
        console.log(`  ✅  TOUCHED ${rowCount} articles → updated_at = NOW()\n`);
    }

    // ─── Summary ─────────────────────────────────────────────────────

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Done!`);
    if (DRY_RUN) console.log('⚠️  DRY RUN — no changes made. Remove --dry-run to execute.');
    console.log();

    await pool.end();
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
