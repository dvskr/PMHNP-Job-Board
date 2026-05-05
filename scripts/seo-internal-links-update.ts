/**
 * SEO: Add internal links to prod blog_posts content in Supabase
 *
 * Reads current content for target slugs, appends related resources
 * sections to rescue orphan pages and strengthen topic clusters.
 *
 * Usage: npx tsx scripts/seo-internal-links-update.ts
 *        npx tsx scripts/seo-internal-links-update.ts --dry-run
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';

// Read prod connection string from .env.prod (separate Supabase project from dev)
const prodEnv = fs.readFileSync(path.join(process.cwd(), '.env.prod'), 'utf-8');
const connectionString = prodEnv.match(/^PROD_DIRECT_DATABASE_URL=(.+)$/m)?.[1];
if (!connectionString) {
    throw new Error('PROD_DIRECT_DATABASE_URL not found in .env.prod');
}

const pool = new Pool({ connectionString, max: 3 });

const DRY_RUN = process.argv.includes('--dry-run');

// ─── Link additions per slug ─────────────────────────────────────────────────

interface LinkUpdate {
    slug: string;
    appendBlock: string;
    description: string;
}

const UPDATES: LinkUpdate[] = [
    {
        slug: 'how-to-become-a-pmhnp',
        description: 'Rescue orphan pages: FNP dual cert, burnout prevention, resume ATS',
        appendBlock: `

---

*Related resources:*
- [FNP/PMHNP Dual Certification ROI Analysis](/blog/pmhnp-fnp-dual-certification-roi-2026) — Is adding a Family NP certification worth the investment?
- [Burnout Prevention Guide for PMHNPs](/blog/pmhnp-burnout-prevention-guide-2026) — Strategies to sustain a long career
- [PMHNP Resume & ATS Guide](/blog/pmhnp-resume-ats-guide-2026) — Optimize your resume for applicant tracking systems
- [PMHNP Job Outlook 2026](/blog/pmhnp-job-outlook) — Growth rate, demand data, and future predictions`,
    },
    {
        slug: 'pmhnp-job-outlook',
        description: 'Rescue orphan pages: PMHNP vs therapist, PRN moonlighting',
        appendBlock: `

---

*Related resources:*
- [PMHNP vs Therapist/Counselor](/blog/pmhnp-vs-therapist-counselor-2026) — Understanding role differences in mental healthcare
- [PRN & Moonlighting Guide for PMHNPs](/blog/pmhnp-prn-moonlighting-guide-2026) — Supplement your income with per-diem shifts
- [PMHNP vs Psychiatrist](/blog/pmhnp-vs-psychiatrist) — Full career and salary comparison
- [How to Become a PMHNP](/blog/how-to-become-a-pmhnp) — Step-by-step career pathway`,
    },
    {
        slug: 'telehealth-pmhnp-guide',
        description: 'Strengthen telehealth cluster: multi-state DEA, 1099 tax guide',
        appendBlock: `

- [Multi-State DEA Guide for Telehealth PMHNPs](/blog/multi-state-dea-guide-telehealth-pmhnp-2026) — Licensing strategy for multi-state practice
- [PMHNP 1099 Tax Guide](/blog/pmhnp-1099-tax-guide-2026) — Tax strategies for independent contractor PMHNPs`,
    },
    {
        slug: 'pmhnp-salary-negotiation',
        description: 'Strengthen salary cluster: private practice income, burnout guide',
        appendBlock: `
- [Private Practice Income Guide](/blog/pmhnp-private-practice-income-2026) — Earning potential as a practice owner
- [Burnout Prevention Guide](/blog/pmhnp-burnout-prevention-guide-2026) — Protect your career longevity while maximizing income`,
    },
];

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
    console.log(`\n🔗 SEO Internal Link Updater — ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const update of UPDATES) {
        const { slug, appendBlock, description } = update;

        // 1. Read current content
        const { rows } = await pool.query(
            `SELECT id, content, slug FROM blog_posts WHERE slug = $1 AND status = 'published'`,
            [slug]
        );

        if (rows.length === 0) {
            console.log(`  ⚠️  SKIP  ${slug} — not found in DB`);
            skipped++;
            continue;
        }

        const post = rows[0];
        const currentContent: string = post.content || '';

        // 2. Check if links already exist (idempotency)
        // Extract first link target from appendBlock to check
        const firstLinkMatch = appendBlock.match(/\]\(([^)]+)\)/);
        if (firstLinkMatch && currentContent.includes(firstLinkMatch[1])) {
            console.log(`  ✅  SKIP  ${slug} — links already present`);
            skipped++;
            continue;
        }

        // 3. Append the link block
        const newContent = currentContent.trimEnd() + appendBlock;

        if (DRY_RUN) {
            console.log(`  📋  WOULD UPDATE  ${slug}`);
            console.log(`      Reason: ${description}`);
            console.log(`      Content length: ${currentContent.length} → ${newContent.length} (+${newContent.length - currentContent.length} chars)`);
            console.log(`      Links to add:\n${appendBlock.trim().split('\n').map(l => `        ${l}`).join('\n')}\n`);
            updated++;
            continue;
        }

        // 4. Write back
        try {
            await pool.query(
                `UPDATE blog_posts SET content = $1, updated_at = NOW() WHERE id = $2`,
                [newContent, post.id]
            );
            console.log(`  ✅  UPDATED  ${slug} — ${description}`);
            updated++;
        } catch (err: any) {
            console.error(`  ❌  ERROR  ${slug}: ${err.message}`);
            errors++;
        }
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Done! Updated: ${updated}, Skipped: ${skipped}, Errors: ${errors}`);
    if (DRY_RUN) console.log(`⚠️  DRY RUN — no changes were made. Remove --dry-run to execute.`);
    console.log();

    await pool.end();
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
