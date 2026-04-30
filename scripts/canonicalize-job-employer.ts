/**
 * One-shot: rewrite Job.employer to the canonical name when the row's
 * current employer string resolves to a known KNOWN_COMPANIES alias.
 *
 * Why this exists:
 *   The Company TABLE is already correctly deduplicated — a single
 *   canonical "LifeStance Health" Company row holds the FK for 15k+ jobs.
 *   But the Job.employer STRING varies per row ("LifeStance Health" vs
 *   "Lifestance" vs "Lifestance Health Inc."). Listing pages, search
 *   facets, and "Top Employers" widgets render from Job.employer, so the
 *   visible "split" persists even after Company-row dedup ran.
 *
 * This script picks the canonical display name for every Job whose
 * current employer string maps to a KNOWN_COMPANIES entry and rewrites
 * it. Idempotent.
 *
 * Usage:
 *   Dry-run (default):  ts-node scripts/canonicalize-job-employer.ts
 *   Apply:              ts-node scripts/canonicalize-job-employer.ts --apply
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { prisma } from '@/lib/prisma';
import { findCanonicalName } from '@/lib/company-normalizer';

const APPLY = process.argv.includes('--apply');

async function main(): Promise<void> {
    console.log(APPLY ? '🟢 APPLY MODE' : '🔍 DRY-RUN');
    console.log();

    // Pull every distinct employer string + its current row count.
    const employers = await prisma.job.groupBy({
        by: ['employer'],
        _count: { _all: true },
    });
    console.log(`${employers.length} distinct employer strings in catalog.\n`);

    // Group by canonical mapping.
    interface Renames {
        from: string;
        rows: number;
    }
    const byCanonical = new Map<string, Renames[]>();
    for (const e of employers) {
        if (!e.employer) continue;
        const canon = findCanonicalName(e.employer);
        if (!canon || canon === e.employer) continue; // already canonical or unknown
        if (!byCanonical.has(canon)) byCanonical.set(canon, []);
        byCanonical.get(canon)!.push({ from: e.employer, rows: e._count._all });
    }

    if (byCanonical.size === 0) {
        console.log('Nothing to canonicalize — every employer string is already its own canonical form.');
        await prisma.$disconnect();
        return;
    }

    let totalRowsToUpdate = 0;
    for (const [canon, sources] of [...byCanonical.entries()].sort(
        (a, b) => b[1].reduce((s, r) => s + r.rows, 0) - a[1].reduce((s, r) => s + r.rows, 0),
    )) {
        const total = sources.reduce((s, r) => s + r.rows, 0);
        totalRowsToUpdate += total;
        console.log(`→ "${canon}"  (${total} rows total)`);
        for (const s of sources) {
            console.log(`     "${s.from}"  ×  ${s.rows}`);
        }
    }

    console.log(`\nTotal rows ${APPLY ? 'updated' : 'to update'}: ${totalRowsToUpdate}`);

    if (!APPLY) {
        console.log('Re-run with --apply to commit.');
        await prisma.$disconnect();
        return;
    }

    let updated = 0;
    for (const [canon, sources] of byCanonical) {
        const fromNames = sources.map((s) => s.from);
        const r = await prisma.job.updateMany({
            where: { employer: { in: fromNames } },
            data: { employer: canon },
        });
        console.log(`  ✓ "${canon}": updated ${r.count} rows`);
        updated += r.count;
    }
    console.log(`\nTotal updated: ${updated}`);

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('Canonicalize failed:', err);
    await prisma.$disconnect();
    process.exit(1);
});
