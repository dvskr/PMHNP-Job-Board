/**
 * Phase 1 catalog data fixes — surgical, transaction-safe.
 *
 * Fixes:
 *   F1: Backfill NULL originalPostedAt from createdAt (6 rows)
 *   F2: Swap inverted salary (min > max) — 1 row
 *   F3: Clamp salary outliers (>$500k or <$20k) — 2 rows; sets to NULL
 *       and flags salaryConfidence=0 so the enrichment cron can re-derive
 *   F4: Unpublish jobs with <200-char descriptions (4 rows)
 *   F5: Unpublish lingering ats-jobs-db rows (3 rows — source decommissioned)
 *   F6: Dedup NaphCare employer casing variants (4 rows split across 2 variants)
 *
 * Dry-run by default. Pass `--apply` to commit changes.
 *
 *   DATABASE_URL=$(grep ^PROD_DATABASE_URL= .env.prod | cut -d= -f2-) \
 *     npx tsx scripts/fix-catalog-phase1.ts             # dry-run
 *   ...
 *     npx tsx scripts/fix-catalog-phase1.ts --apply    # commit
 *
 * Every mutation is wrapped in a transaction so a single failure rolls
 * back the whole batch.
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

const APPLY = process.argv.includes('--apply');
const MODE = APPLY ? 'APPLY' : 'DRY-RUN';

interface PlannedUpdate {
    fix: string;
    jobId: string;
    title: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
}

const planned: PlannedUpdate[] = [];

async function planF1NullOriginalPostedAt(): Promise<void> {
    const rows = await prisma.job.findMany({
        where: { isPublished: true, originalPostedAt: null },
        select: { id: true, title: true, createdAt: true, originalPostedAt: true },
    });
    for (const r of rows) {
        planned.push({
            fix: 'F1: backfill originalPostedAt',
            jobId: r.id,
            title: r.title,
            before: { originalPostedAt: null },
            after: { originalPostedAt: r.createdAt },
        });
    }
}

async function planF2SalaryInverted(): Promise<void> {
    const rows = await prisma.$queryRaw<Array<{ id: string; title: string; min_salary: number; max_salary: number }>>`
        SELECT id, title, min_salary, max_salary
        FROM jobs
        WHERE is_published = true
          AND min_salary IS NOT NULL
          AND max_salary IS NOT NULL
          AND min_salary > max_salary
    `;
    for (const r of rows) {
        // Inversion is usually a mixed-period mistake (hourly vs annual),
        // not a simple swap candidate. NULL it and let the enrichment cron
        // re-derive on next pass.
        planned.push({
            fix: 'F2: clear inverted salary',
            jobId: r.id,
            title: r.title,
            before: { minSalary: r.min_salary, maxSalary: r.max_salary },
            after: {
                minSalary: null,
                maxSalary: null,
                normalizedMinSalary: null,
                normalizedMaxSalary: null,
                displaySalary: null,
                salaryConfidence: 0,
                salaryIsEstimated: false,
            },
        });
    }
}

async function planF3SalaryOutliers(): Promise<void> {
    const rows = await prisma.$queryRaw<Array<{ id: string; title: string; normalized_min_salary: number | null; normalized_max_salary: number | null }>>`
        SELECT id, title, normalized_min_salary, normalized_max_salary
        FROM jobs
        WHERE is_published = true
          AND normalized_max_salary IS NOT NULL
          AND (normalized_max_salary > 500000 OR normalized_min_salary < 20000)
    `;
    for (const r of rows) {
        planned.push({
            fix: 'F3: clear salary outlier',
            jobId: r.id,
            title: r.title,
            before: {
                normalizedMinSalary: r.normalized_min_salary,
                normalizedMaxSalary: r.normalized_max_salary,
            },
            after: {
                normalizedMinSalary: null,
                normalizedMaxSalary: null,
                minSalary: null,
                maxSalary: null,
                displaySalary: null,
                salaryConfidence: 0,
                salaryIsEstimated: false,
            },
        });
    }
}

async function planF4ThinDescriptions(): Promise<void> {
    const rows = await prisma.$queryRaw<Array<{ id: string; title: string; len: number }>>`
        SELECT id, title, LENGTH(description) AS len
        FROM jobs
        WHERE is_published = true
          AND (description IS NULL OR LENGTH(description) < 200)
    `;
    for (const r of rows) {
        planned.push({
            fix: 'F4: unpublish thin description',
            jobId: r.id,
            title: r.title,
            before: { isPublished: true, descLen: r.len ?? 0 },
            after: { isPublished: false },
        });
    }
}

async function planF5AtsJobsDbLingering(): Promise<void> {
    const rows = await prisma.job.findMany({
        where: { isPublished: true, sourceProvider: 'ats-jobs-db' },
        select: { id: true, title: true },
    });
    for (const r of rows) {
        planned.push({
            fix: 'F5: unpublish decommissioned source row',
            jobId: r.id,
            title: r.title,
            before: { isPublished: true, sourceProvider: 'ats-jobs-db' },
            after: { isPublished: false },
        });
    }
}

interface NaphcareVariant {
    employer: string;
    job_count: bigint;
}

async function planF6NaphcareDedup(): Promise<void> {
    const variants = await prisma.$queryRaw<NaphcareVariant[]>`
        SELECT employer, count(*)::bigint AS job_count
        FROM jobs
        WHERE is_published = true
          AND LOWER(REGEXP_REPLACE(TRIM(employer), '\\s+', ' ', 'g')) = 'naphcare'
        GROUP BY employer
        ORDER BY count(*) DESC
    `;
    if (variants.length <= 1) return;
    // Canonical = the most-jobs variant (typically the cleanest casing).
    const canonical = variants[0].employer;
    for (const v of variants.slice(1)) {
        const rows = await prisma.job.findMany({
            where: { isPublished: true, employer: v.employer },
            select: { id: true, title: true, employer: true },
        });
        for (const r of rows) {
            planned.push({
                fix: 'F6: normalize NaphCare employer casing',
                jobId: r.id,
                title: r.title,
                before: { employer: r.employer },
                after: { employer: canonical },
            });
        }
    }
}

async function applyUpdates(tx: Prisma.TransactionClient): Promise<void> {
    for (const p of planned) {
        await tx.job.update({
            where: { id: p.jobId },
            data: p.after as Prisma.JobUpdateInput,
        });
    }
}

async function main(): Promise<void> {
    console.log(`Phase 1 catalog fixer — MODE: ${MODE}`);
    console.log();

    await planF1NullOriginalPostedAt();
    await planF2SalaryInverted();
    await planF3SalaryOutliers();
    await planF4ThinDescriptions();
    await planF5AtsJobsDbLingering();
    await planF6NaphcareDedup();

    if (planned.length === 0) {
        console.log('Nothing to fix. Catalog is clean for Phase 1 criteria.');
        await prisma.$disconnect();
        return;
    }

    // Group by fix for the report.
    const byFix = new Map<string, PlannedUpdate[]>();
    for (const p of planned) {
        const arr = byFix.get(p.fix) ?? [];
        arr.push(p);
        byFix.set(p.fix, arr);
    }

    console.log(`Planned ${planned.length} updates across ${byFix.size} fix categories:\n`);
    for (const [fix, items] of byFix) {
        console.log(`── ${fix} — ${items.length} rows ──`);
        for (const it of items.slice(0, 10)) {
            console.log(`   [${it.jobId.slice(0, 8)}]  ${it.title.slice(0, 60)}`);
            console.log(`      before: ${JSON.stringify(it.before)}`);
            console.log(`      after:  ${JSON.stringify(it.after)}`);
        }
        if (items.length > 10) console.log(`   …and ${items.length - 10} more`);
        console.log();
    }

    if (!APPLY) {
        console.log('DRY-RUN — no changes committed. Re-run with --apply to commit.');
        await prisma.$disconnect();
        return;
    }

    console.log('APPLYING in single transaction...');
    await prisma.$transaction(applyUpdates, { timeout: 30_000 });
    console.log(`✓ Applied ${planned.length} updates.`);
    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('Crashed:', err);
    await prisma.$disconnect();
    process.exit(1);
});
