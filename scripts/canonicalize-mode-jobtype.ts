/**
 * One-shot canonicalization of mode + jobType columns.
 *
 * Audit results from 2026-04-30 (full catalog, all pub states):
 *   MODE:
 *     On-site (2295) → merge into In-Person (2047) → 4342 total
 *     Telehealth (63) → Remote (already detectMode treats it as such)
 *   JOB_TYPE:
 *     OTHER_EMPLOYMENT_TYPE (1) → null  (Workday enum leak)
 *     UNAVAILABLE (1)            → null  (Workday enum leak)
 *     OTHER (4)                  → null  (generic catch-all)
 *     Permanent (2)              → Full-Time (US PMHNP convention)
 *     Healthcare (2)             → null  (industry, not job type)
 *     Casual (1)                 → Per Diem (functional equivalent)
 *     Locum Tenens (2)           → keep (legitimate distinct category)
 *
 * Usage:
 *   Dry run (default):    ts-node scripts/canonicalize-mode-jobtype.ts
 *   Apply changes:        ts-node scripts/canonicalize-mode-jobtype.ts --apply
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { prisma } from '@/lib/prisma';

const APPLY = process.argv.includes('--apply');

const MODE_MAP: Record<string, string | null> = {
    'On-site': 'In-Person',
    'Telehealth': 'Remote',
};

const JOB_TYPE_MAP: Record<string, string | null> = {
    OTHER_EMPLOYMENT_TYPE: null,
    UNAVAILABLE: null,
    OTHER: null,
    Permanent: 'Full-Time',
    Healthcare: null,
    Casual: 'Per Diem',
};

async function main(): Promise<void> {
    console.log(APPLY ? '🟢 APPLY MODE — will write to prod' : '🔍 DRY-RUN — no writes');
    console.log();

    let totalUpdates = 0;

    for (const [from, to] of Object.entries(MODE_MAP)) {
        const count = await prisma.job.count({ where: { mode: from } });
        console.log(`MODE  ${from.padEnd(15)} → ${(to ?? 'NULL').padEnd(15)}  ${count} rows`);
        totalUpdates += count;
        if (APPLY && count > 0) {
            const r = await prisma.job.updateMany({
                where: { mode: from },
                data: { mode: to },
            });
            console.log(`  ✓ updated ${r.count}`);
        }
    }

    console.log();
    for (const [from, to] of Object.entries(JOB_TYPE_MAP)) {
        const count = await prisma.job.count({ where: { jobType: from } });
        console.log(`JOBTYPE ${from.padEnd(25)} → ${(to ?? 'NULL').padEnd(15)}  ${count} rows`);
        totalUpdates += count;
        if (APPLY && count > 0) {
            const r = await prisma.job.updateMany({
                where: { jobType: from },
                data: { jobType: to },
            });
            console.log(`  ✓ updated ${r.count}`);
        }
    }

    console.log();
    console.log(`Total ${APPLY ? 'updated' : 'would update'}: ${totalUpdates}`);

    if (!APPLY && totalUpdates > 0) {
        console.log();
        console.log('Re-run with --apply to commit.');
    }

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('Canonicalization failed:', err);
    await prisma.$disconnect();
    process.exit(1);
});
