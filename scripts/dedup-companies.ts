/**
 * One-shot Company-row dedup using the improved normalizeCompanyName.
 *
 * Strategy:
 *   1. Re-normalize every Company row's name with the new rules.
 *   2. Group rows that now share the same normalized key.
 *   3. For each group with 2+ rows, pick a "keeper":
 *        - Highest jobCount wins. Ties broken by longest name (more info)
 *          and then by oldest createdAt (stable identity).
 *   4. Reassign all Job.companyId from non-keeper rows to keeper.
 *   5. Refresh keeper.normalizedName + keeper.jobCount = SUM(group.jobCount).
 *   6. Delete non-keeper rows.
 *   7. Update Job.employer on non-keeper rows to the keeper's name (fixes
 *      facet display so users see one canonical name).
 *
 * All wrapped in a transaction per group so a failure aborts cleanly.
 *
 * Usage:
 *   Dry-run:  ts-node scripts/dedup-companies.ts
 *   Apply:    ts-node scripts/dedup-companies.ts --apply
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}

import { prisma } from '@/lib/prisma';
import { normalizeCompanyName } from '@/lib/company-normalizer';

const APPLY = process.argv.includes('--apply');

interface CompanyRow {
    id: string;
    name: string;
    normalizedName: string;
    jobCount: number;
    createdAt: Date;
}

interface MergeGroup {
    key: string;
    keeper: CompanyRow;
    losers: CompanyRow[];
}

async function main(): Promise<void> {
    console.log(APPLY ? '🟢 APPLY MODE — will write to prod' : '🔍 DRY-RUN — no writes');
    console.log();

    const companies = await prisma.company.findMany({
        select: { id: true, name: true, normalizedName: true, jobCount: true, createdAt: true },
    });
    console.log(`Loaded ${companies.length} Company rows.\n`);

    // Group by NEW normalized key.
    const groups = new Map<string, CompanyRow[]>();
    for (const c of companies) {
        const k = normalizeCompanyName(c.name);
        if (!k) continue;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(c);
    }

    const merges: MergeGroup[] = [];
    for (const [key, rows] of groups) {
        if (rows.length < 2) continue;
        // Sort to choose a keeper:
        //   1. Names without a " - tail" win over names with one (the parent
        //      name is more canonical than a department-suffixed variant).
        //   2. Names without dangling punctuation (#, etc.) win.
        //   3. Higher jobCount wins (catches the long-tail keeper preference).
        //   4. Shorter name wins (more general / canonical).
        //   5. Oldest createdAt as final tiebreaker.
        const score = (r: CompanyRow): number => {
            let s = 0;
            if (/\s+[-–—]\s+/.test(r.name)) s -= 1000;
            if (/[#@*]/.test(r.name)) s -= 500;
            return s;
        };
        const sorted = [...rows].sort((a, b) => {
            const sa = score(a);
            const sb = score(b);
            if (sa !== sb) return sb - sa;
            if (b.jobCount !== a.jobCount) return b.jobCount - a.jobCount;
            if (a.name.length !== b.name.length) return a.name.length - b.name.length;
            return a.createdAt.getTime() - b.createdAt.getTime();
        });
        const [keeper, ...losers] = sorted;
        if (!keeper) continue;
        merges.push({ key, keeper, losers });
    }

    console.log(`Found ${merges.length} merge groups (${merges.reduce((acc, m) => acc + m.losers.length, 0)} rows to delete).\n`);

    let totalJobsReassigned = 0;
    let totalRowsDeleted = 0;
    let totalEmployerStringsFixed = 0;
    let groupsFailed = 0;

    for (const m of merges) {
        const groupTotal = m.keeper.jobCount + m.losers.reduce((acc, l) => acc + l.jobCount, 0);
        console.log(`  KEEP: "${m.keeper.name}"  [${m.keeper.jobCount} jobs]  → final: ${groupTotal}`);
        for (const l of m.losers) {
            console.log(`     ↳ merge "${l.name}" (${l.jobCount} jobs)`);
        }

        if (!APPLY) continue;

        const loserIds = m.losers.map((l) => l.id);
        const loserNames = m.losers.map((l) => l.name);

        try {
            await prisma.$transaction(async (tx) => {
                // 1. Reassign jobs pointing at losers → keeper.
                const reassigned = await tx.job.updateMany({
                    where: { companyId: { in: loserIds } },
                    data: { companyId: m.keeper.id },
                });
                totalJobsReassigned += reassigned.count;

                // 2. Update employer string on jobs that had a loser-name as employer
                //    (so facet display unifies). Match exact strings only.
                for (const ln of loserNames) {
                    const u = await tx.job.updateMany({
                        where: { employer: ln },
                        data: { employer: m.keeper.name },
                    });
                    totalEmployerStringsFixed += u.count;
                }

                // 3. Delete losers FIRST so the keeper update doesn't collide
                //    with their normalized_name unique constraint.
                const deleted = await tx.company.deleteMany({
                    where: { id: { in: loserIds } },
                });
                totalRowsDeleted += deleted.count;

                // 4. Refresh keeper's jobCount + normalizedName. With losers
                //    gone the normalized_name field is free to take the new
                //    canonical key without colliding.
                await tx.company.update({
                    where: { id: m.keeper.id },
                    data: { jobCount: groupTotal, normalizedName: m.key },
                });
            });
        } catch (err) {
            groupsFailed++;
            const msg = err instanceof Error ? err.message : String(err);
            console.log(`     ⚠ FAILED: ${msg.split('\n')[0]}`);
        }
    }

    // Refresh stale normalizedName fields on Companies that didn't merge but
    // now have a different normalized key under the new rules. Wrapped in
    // per-row try/catch — duplicate keys in this fixup pass mean the data
    // already converged organically; safe to skip.
    let staleFixed = 0;
    let staleSkipped = 0;
    if (APPLY) {
        for (const [key, rows] of groups) {
            if (rows.length !== 1) continue; // already handled above
            const row = rows[0];
            if (!row) continue;
            if (row.normalizedName === key) continue;
            try {
                await prisma.company.update({
                    where: { id: row.id },
                    data: { normalizedName: key },
                });
                staleFixed++;
            } catch {
                staleSkipped++;
            }
        }
    }

    console.log();
    console.log('═'.repeat(70));
    if (APPLY) {
        console.log(`Jobs reassigned:           ${totalJobsReassigned}`);
        console.log(`Employer strings updated:  ${totalEmployerStringsFixed}`);
        console.log(`Company rows deleted:      ${totalRowsDeleted}`);
        console.log(`Stale normalizedName fix:  ${staleFixed} (${staleSkipped} skipped due to conflict)`);
        console.log(`Groups that failed:        ${groupsFailed}`);
    } else {
        console.log(`Would merge:               ${merges.length} groups`);
        console.log(`Would delete:              ${merges.reduce((a, m) => a + m.losers.length, 0)} Company rows`);
        console.log();
        console.log('Re-run with --apply to commit.');
    }

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('Dedup failed:', err);
    await prisma.$disconnect();
    process.exit(1);
});
