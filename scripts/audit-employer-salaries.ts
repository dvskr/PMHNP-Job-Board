/**
 * Audit employer-posted jobs for salary-period sanity.
 *
 * Flags rows where the stored period + amount combo is implausible
 * (e.g. salaryPeriod='year' + minSalary=135 is almost certainly an
 * hourly rate stored as 135 instead of an annual stored as 135000).
 *
 *   npx tsx scripts/audit-employer-salaries.ts                      # report
 *   npx tsx scripts/audit-employer-salaries.ts --apply              # fix obvious cases
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
if (process.env.PROD_DIRECT_DATABASE_URL && !process.env.DIRECT_URL) process.env.DIRECT_URL = process.env.PROD_DIRECT_DATABASE_URL;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma } = require('@/lib/prisma') as typeof import('@/lib/prisma');

interface Suspect {
    id: string;
    employer: string;
    title: string;
    minSalary: number | null;
    maxSalary: number | null;
    salaryPeriod: string | null;
    suggestion: string;
}

async function main(): Promise<void> {
    const apply = process.argv.includes('--apply');
    const jobs = await prisma.job.findMany({
        where: { isPublished: true, sourceType: 'employer' },
        select: { id: true, employer: true, title: true, minSalary: true, maxSalary: true, salaryPeriod: true },
        orderBy: { createdAt: 'desc' },
    });

    const suspects: Suspect[] = [];
    for (const j of jobs) {
        const min = j.minSalary;
        const max = j.maxSalary;
        const p = (j.salaryPeriod ?? '').toLowerCase();
        const anchor = max ?? min;
        if (anchor === null) continue;

        // Annual stored as small value (likely hourly)
        if ((p === 'year' || p === 'annual' || p === 'yearly' || p === '') && anchor < 1000) {
            suspects.push({
                id: j.id, employer: j.employer, title: j.title,
                minSalary: min, maxSalary: max, salaryPeriod: j.salaryPeriod,
                suggestion: `period→hour (values look hourly)`,
            });
            continue;
        }
        // Annual stored as huge value (>= 1M is fine for stock comp but rare here)
        if ((p === 'year' || p === 'annual' || p === 'yearly') && anchor >= 5_000_000) {
            suspects.push({
                id: j.id, employer: j.employer, title: j.title,
                minSalary: min, maxSalary: max, salaryPeriod: j.salaryPeriod,
                suggestion: `amount likely wrong (>5M annual)`,
            });
            continue;
        }
        // Hourly with insanely large value
        if ((p === 'hour' || p === 'hourly') && anchor > 1000) {
            suspects.push({
                id: j.id, employer: j.employer, title: j.title,
                minSalary: min, maxSalary: max, salaryPeriod: j.salaryPeriod,
                suggestion: `period likely wrong (hourly >$1000)`,
            });
            continue;
        }
    }

    console.log(`scanned ${jobs.length} employer-posted jobs, found ${suspects.length} suspect rows:\n`);
    for (const s of suspects) {
        console.log(`  ${s.id}  ${s.employer.padEnd(30).slice(0, 30)}  ${s.title.slice(0, 50).padEnd(50)}  min=${s.minSalary} max=${s.maxSalary} period=${s.salaryPeriod ?? '(null)'}  → ${s.suggestion}`);
    }

    if (!apply) {
        console.log(`\ndry-run — pass --apply to auto-fix the "period→hour" cases (the most confident bucket)`);
        return;
    }

    const fixable = suspects.filter((s) => s.suggestion.startsWith('period→hour'));
    if (fixable.length === 0) {
        console.log(`nothing to auto-fix`);
        return;
    }
    console.log(`\nupdating ${fixable.length} rows to salaryPeriod='hour'...`);
    let written = 0;
    let failed = 0;
    for (const s of fixable) {
        try {
            await prisma.job.update({
                where: { id: s.id },
                data: { salaryPeriod: 'hour' },
            });
            written += 1;
        } catch (err) {
            failed += 1;
            console.error(`  failed ${s.id}: ${(err as Error).message}`);
        }
    }
    console.log(`done. written=${written} failed=${failed}`);
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
