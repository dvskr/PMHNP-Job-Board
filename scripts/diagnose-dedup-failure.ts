/**
 * Diagnose where dedup-companies.ts --apply failed.
 * Read-only.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { prisma } from '@/lib/prisma';
import { normalizeCompanyName } from '@/lib/company-normalizer';

async function main(): Promise<void> {
    // Check Headway specifically — the highest-impact merge.
    console.log('Headway state:');
    const headway = await prisma.company.findMany({
        where: {
            OR: [
                { name: { contains: 'Headway', mode: 'insensitive' } },
            ],
        },
        select: { id: true, name: true, normalizedName: true, jobCount: true },
    });
    for (const r of headway) {
        console.log(`  [${r.jobCount.toString().padStart(4)}] ${r.name}  (norm="${r.normalizedName}")`);
    }
    console.log();

    // BlueSky
    console.log('BlueSky state:');
    const bluesky = await prisma.company.findMany({
        where: {
            OR: [
                { name: { contains: 'Blue', mode: 'insensitive' } },
            ],
        },
        select: { id: true, name: true, normalizedName: true, jobCount: true },
    });
    for (const r of bluesky.filter((r) => r.name.toLowerCase().includes('sky'))) {
        console.log(`  [${r.jobCount.toString().padStart(4)}] ${r.name}  (norm="${r.normalizedName}")`);
    }
    console.log();

    // Check for unique-constraint candidates: any two Company rows where
    // the NEW normalized key would conflict
    console.log('Looking for new-key conflicts...');
    const all = await prisma.company.findMany({
        select: { id: true, name: true, normalizedName: true },
    });
    const newKeys = new Map<string, { id: string; name: string }[]>();
    for (const r of all) {
        const k = normalizeCompanyName(r.name);
        if (!k) continue;
        if (!newKeys.has(k)) newKeys.set(k, []);
        newKeys.get(k)!.push({ id: r.id, name: r.name });
    }

    // For each merge group, show whether the keeper's INTENDED new normalizedName
    // already exists on another row that's NOT in the group.
    let conflictCount = 0;
    for (const [key, members] of newKeys) {
        if (members.length < 2) continue;
        // Are there other rows in the DB with normalizedName === key but NOT in this group?
        const memberIds = new Set(members.map((m) => m.id));
        const collision = all.find((c) => c.normalizedName === key && !memberIds.has(c.id));
        if (collision) {
            conflictCount++;
            console.log(`  CONFLICT for new key "${key}":`);
            console.log(`    Members of merge group:`);
            for (const m of members) console.log(`      - "${m.name}"`);
            console.log(`    Pre-existing row with that normalizedName (NOT in group):`);
            console.log(`      - "${collision.name}" (norm="${collision.normalizedName}")`);
        }
    }
    if (conflictCount === 0) {
        console.log('  No new-key conflicts found.');
    } else {
        console.log(`\n  ${conflictCount} conflict(s) — these are why --apply failed.`);
    }

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('Diagnose failed:', err);
    await prisma.$disconnect();
    process.exit(1);
});
