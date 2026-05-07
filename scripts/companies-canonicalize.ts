/**
 * Canonicalize the Companies table by merging dup rows whose names map to
 * the SAME curated canonical (KNOWN_COMPANIES in lib/company-normalizer.ts).
 *
 * Both `name` and `normalizedName` already have UNIQUE constraints, so we
 * can't have exact-key dupes. The dups in prod are subtler: e.g. one
 * Company row with name="Lifestance" (created when fantastic-jobs-db
 * inserted first) and another with name="LifeStance Health" (created
 * later when greenhouse arrived). Their normalizedName values are
 * actually the SAME — but only because we only just patched
 * canonicalizeEmployerName 2026-05-06 to use findCanonicalName. Older
 * rows in companies were created with non-canonical display names.
 *
 * Strategy: for every Company whose `name` has a curated canonical that
 * differs:
 *   - if a Company with the canonical name already exists → mergeCompanies
 *     into that one
 *   - otherwise → rename the row to the canonical
 *
 * Usage:
 *   npx tsx scripts/companies-canonicalize.ts            # dry run
 *   npx tsx scripts/companies-canonicalize.ts --execute  # apply
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

const DRY_RUN = !process.argv.includes('--execute');

async function main() {
    const { prisma } = await import('@/lib/prisma');
    const { findCanonicalName, mergeCompanies } = await import('@/lib/company-normalizer');

    console.log(`\n--- COMPANIES CANONICALIZATION (${DRY_RUN ? 'DRY RUN' : 'EXECUTING'}) ---\n`);

    const companies = await prisma.company.findMany({
        select: { id: true, name: true, normalizedName: true, jobCount: true },
        orderBy: { jobCount: 'desc' },
    });
    console.log(`Total Companies: ${companies.length}`);

    // Group by canonical name
    const byCanonical = new Map<string, Array<typeof companies[number]>>();
    let nonCanonical = 0;
    for (const c of companies) {
        const canonical = findCanonicalName(c.name);
        if (!canonical || canonical === c.name) continue;
        nonCanonical++;
        if (!byCanonical.has(canonical)) byCanonical.set(canonical, []);
        byCanonical.get(canonical)!.push(c);
    }

    console.log(`Companies with non-canonical names: ${nonCanonical}`);
    console.log(`Distinct canonicals affected: ${byCanonical.size}\n`);

    if (byCanonical.size === 0) {
        console.log('Nothing to canonicalize.');
        await prisma.$disconnect();
        return;
    }

    // Show plan
    console.log('Plan (canonical ← non-canonical name × jobCount):');
    let merges = 0;
    let renames = 0;
    for (const [canonical, dups] of byCanonical) {
        const targetExisting = companies.find((c) => c.name === canonical);
        if (targetExisting) {
            for (const d of dups) {
                console.log(`  MERGE   ${d.name.padEnd(35)} (${d.jobCount} jobs) → ${canonical}`);
                merges++;
            }
        } else {
            // No existing canonical row — pick the dup with the highest jobCount and rename it
            const winner = dups.reduce((a, b) => (a.jobCount >= b.jobCount ? a : b));
            console.log(`  RENAME  ${winner.name.padEnd(35)} (${winner.jobCount} jobs) → ${canonical}`);
            renames++;
            for (const d of dups) {
                if (d.id !== winner.id) {
                    console.log(`  MERGE   ${d.name.padEnd(35)} (${d.jobCount} jobs) → ${canonical} (via winner ${winner.id.slice(0, 8)})`);
                    merges++;
                }
            }
        }
    }
    console.log(`\nTotal: ${merges} merges, ${renames} renames`);

    if (DRY_RUN) {
        console.log('\nDRY RUN — no changes. Re-run with `--execute`.');
        await prisma.$disconnect();
        return;
    }

    console.log('\nApplying changes...');
    let merged = 0;
    let renamed = 0;
    let errors = 0;

    for (const [canonical, dups] of byCanonical) {
        try {
            const targetExisting = companies.find((c) => c.name === canonical);

            let keepId: string;
            if (targetExisting) {
                keepId = targetExisting.id;
            } else {
                // Rename the highest-job-count dup to the canonical name + canonical normalizedName
                const winner = dups.reduce((a, b) => (a.jobCount >= b.jobCount ? a : b));
                const canonicalNormalized = (await import('@/lib/company-normalizer')).normalizeCompanyName(canonical);
                await prisma.company.update({
                    where: { id: winner.id },
                    data: { name: canonical, normalizedName: canonicalNormalized },
                });
                renamed++;
                keepId = winner.id;
            }

            // Merge the rest into keepId
            for (const d of dups) {
                if (d.id === keepId) continue;
                try {
                    await mergeCompanies(keepId, d.id);
                    merged++;
                } catch (e) {
                    console.error(`  Failed merge ${d.id} → ${keepId}:`, (e as Error).message);
                    errors++;
                }
            }
        } catch (e) {
            console.error(`  Failed canonical ${canonical}:`, (e as Error).message);
            errors++;
        }
    }

    console.log(`\n✅ Done. Merged: ${merged}, Renamed: ${renamed}, Errors: ${errors}`);

    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
