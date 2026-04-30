/**
 * Regex-based mode backfill for already-enriched null-mode jobs.
 *
 * The original normalizer's `detectMode` only matches "remote", "hybrid",
 * "on-site", "in-person", "telehealth", "work from home". Many descriptions
 * use synonyms the original pass missed:
 *   - "outpatient clinic", "in-office", "office-based" → In-Person
 *   - "WFH", "remote-friendly", "fully remote", "100% remote" → Remote
 *   - "X days in office", "X days remote", "split between" → Hybrid
 *
 * This one-shot picks up that gap. Cheap (no LLM), deterministic, idempotent.
 *
 * Usage:
 *   Dry run:  npx ts-node ... scripts/backfill-null-mode-regex.ts
 *   Apply:    npx ts-node ... scripts/backfill-null-mode-regex.ts --apply
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { prisma } from '@/lib/prisma';

const APPLY = process.argv.includes('--apply');

const REMOTE_RE = /\b(?:fully remote|100% remote|100 ?% remote|wfh|work[\s-]from[\s-]home|remote[\s-]?friendly|remote[\s-]?eligible|telecommute|telework|virtual position|virtual role|home[\s-]based|telehealth|tele[\s-]psychiatry|tele[\s-]health)\b/i;
const HYBRID_RE = /\b(?:hybrid|split between|days (?:in[\s-]office|remote)|(?:\d+\s*)?days? (?:on[\s-]site|in[\s-]person)|flex(?:ible)? schedule|partial(?:ly)? remote)\b/i;
const ON_SITE_RE = /\b(?:on[\s-]?site|onsite|in[\s-]?person|in person|office[\s-]?based|in[\s-]?office|office\s+location|clinic[\s-]?based|hospital[\s-]?based|outpatient (?:clinic|setting)|brick[\s-]and[\s-]mortar|on[\s-]premises?)\b/i;

function detect(text: string): 'Remote' | 'Hybrid' | 'In-Person' | null {
    // Hybrid is the most specific — check first.
    if (HYBRID_RE.test(text)) return 'Hybrid';
    if (REMOTE_RE.test(text)) return 'Remote';
    if (ON_SITE_RE.test(text)) return 'In-Person';
    return null;
}

async function main(): Promise<void> {
    const candidates = await prisma.job.findMany({
        where: {
            isPublished: true,
            mode: null,
            description: { not: '' },
        },
        select: { id: true, title: true, description: true, sourceProvider: true },
    });

    console.log(`${APPLY ? '🟢 APPLY' : '🔍 DRY-RUN'}  ·  candidates: ${candidates.length}\n`);

    const stats = {
        matched: { Remote: 0, Hybrid: 0, 'In-Person': 0 } as Record<string, number>,
        bySource: {} as Record<string, number>,
        unmatched: 0,
    };

    let updates = 0;
    for (const job of candidates) {
        const text = `${job.title}\n${job.description}`;
        const mode = detect(text);
        if (!mode) {
            stats.unmatched++;
            continue;
        }
        stats.matched[mode]++;
        const src = job.sourceProvider ?? 'unknown';
        stats.bySource[src] = (stats.bySource[src] ?? 0) + 1;

        if (APPLY) {
            await prisma.job.update({
                where: { id: job.id },
                data: {
                    mode,
                    ...(mode === 'Remote' ? { isRemote: true } : {}),
                    ...(mode === 'Hybrid' ? { isHybrid: true } : {}),
                },
            });
            updates++;
            if (updates % 100 === 0) console.log(`  ${updates} updated...`);
        }
    }

    console.log();
    console.log('Mode extraction:');
    console.log(`  Remote        ${stats.matched.Remote || 0}`);
    console.log(`  Hybrid        ${stats.matched.Hybrid || 0}`);
    console.log(`  In-Person     ${stats.matched['In-Person'] || 0}`);
    console.log(`  TOTAL matched ${(stats.matched.Remote || 0) + (stats.matched.Hybrid || 0) + (stats.matched['In-Person'] || 0)}`);
    console.log(`  unmatched     ${stats.unmatched}  (descriptions truly without mode signal)`);
    console.log();
    console.log('By source:');
    for (const [src, n] of Object.entries(stats.bySource).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${src.padEnd(20)} ${n}`);
    }

    if (!APPLY && (stats.matched.Remote + stats.matched.Hybrid + stats.matched['In-Person']) > 0) {
        console.log('\n  Re-run with --apply to commit.');
    }

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('Backfill failed:', err);
    await prisma.$disconnect();
    process.exit(1);
});
