/**
 * Canonicalize Job.employer strings using the curated KNOWN_COMPANIES list.
 *
 * Why not Company.name? The companies table contains many bad canonicals
 * — "Stryker" mapped to "Stryker Corporation", "FSC, Inc" → "Fsc
 * Corporation", "Mindoula Health" → "Mindoula Health Inc". Applying those
 * blindly would make employer strings WORSE.
 *
 * Instead, lean on `findCanonicalName()` which only returns a value when
 * the input matches a hand-vetted alias (LifeStance, Talkspace, BlueSky,
 * SonderMind, …). Unknown employers are left alone.
 *
 * Usage:
 *   npx tsx scripts/employer-canonicalize.ts            # dry run
 *   npx tsx scripts/employer-canonicalize.ts --execute  # apply
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

const DRY_RUN = !process.argv.includes('--execute');

async function main() {
    const { prisma } = await import('@/lib/prisma');
    const { findCanonicalName } = await import('@/lib/company-normalizer');

    console.log(`\n--- EMPLOYER CANONICALIZATION (${DRY_RUN ? 'DRY RUN' : 'EXECUTING'}) ---\n`);

    const jobs = await prisma.job.findMany({
        where: { isPublished: true },
        select: { id: true, employer: true },
    });
    console.log(`Scanning ${jobs.length} published jobs...`);

    const pairCounts = new Map<string, { from: string; to: string; n: number }>();
    const idsByPair = new Map<string, string[]>();

    for (const j of jobs) {
        const canonical = findCanonicalName(j.employer);
        if (!canonical || canonical === j.employer) continue;
        const key = `${j.employer}|${canonical}`;
        const cur = pairCounts.get(key);
        if (cur) cur.n++;
        else pairCounts.set(key, { from: j.employer, to: canonical, n: 1 });
        const ids = idsByPair.get(key) ?? [];
        ids.push(j.id);
        idsByPair.set(key, ids);
    }

    const pairs = [...pairCounts.values()].sort((a, b) => b.n - a.n);
    const totalAffected = pairs.reduce((s, p) => s + p.n, 0);

    if (pairs.length === 0) {
        console.log('No published jobs need employer canonicalization. Nothing to do.');
        await prisma.$disconnect();
        return;
    }

    console.log(`\n${totalAffected} jobs across ${pairs.length} (from → to) pairs would be rewritten.\n`);
    console.log('All pairs (from → to):');
    for (const p of pairs) {
        console.log(`  ${String(p.n).padStart(4)}× ${p.from.padEnd(40)} → ${p.to}`);
    }

    if (DRY_RUN) {
        console.log('\nDRY RUN — no changes. Re-run with `--execute` to apply.');
        await prisma.$disconnect();
        return;
    }

    console.log('\nApplying updates (one UPDATE per pair, batched on id)...');
    let totalUpdated = 0;
    for (const [key, ids] of idsByPair) {
        const pair = pairCounts.get(key)!;
        const result = await prisma.job.updateMany({
            where: { id: { in: ids } },
            data: { employer: pair.to },
        });
        totalUpdated += result.count;
        console.log(`  ${result.count.toString().padStart(4)} | ${pair.from} → ${pair.to}`);
    }
    console.log(`\n✅ Updated ${totalUpdated} Job.employer rows to curated canonical names.`);

    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
