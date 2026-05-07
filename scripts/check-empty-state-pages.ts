/**
 * Verify the audit claim: how many state pages and salary-guide pages
 * currently render with 0 active published jobs?
 */
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.prod' });
if (process.env.PROD_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
}
if (process.env.PROD_DIRECT_URL && !process.env.DIRECT_URL) {
    process.env.DIRECT_URL = process.env.PROD_DIRECT_URL;
}

const ALL_50_PLUS_DC = [
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
    'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
    'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
    'VA','WA','WV','WI','WY','DC',
];

async function main() {
    const { prisma } = await import('@/lib/prisma');

    const ACTIVE = {
        isPublished: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    };

    // Count active jobs per state code (or full state name fallback)
    const byState = await prisma.job.groupBy({
        by: ['stateCode'],
        where: ACTIVE,
        _count: { stateCode: true },
    });

    const counts = new Map<string, number>();
    for (const row of byState) {
        if (row.stateCode) counts.set(row.stateCode.toUpperCase(), row._count.stateCode);
    }

    // Count active jobs per state with non-null normalized salary (drives /salary-guide/[state])
    const byStateWithSalary = await prisma.job.groupBy({
        by: ['stateCode'],
        where: { ...ACTIVE, normalizedMinSalary: { not: null } },
        _count: { stateCode: true },
    });
    const salaryCounts = new Map<string, number>();
    for (const row of byStateWithSalary) {
        if (row.stateCode) salaryCounts.set(row.stateCode.toUpperCase(), row._count.stateCode);
    }

    const emptyJobsStates: string[] = [];
    const emptySalaryStates: string[] = [];
    const thinJobsStates: string[] = []; // 1-2 jobs — borderline soft-404
    const thinSalaryStates: string[] = []; // 1-2 salary records

    for (const code of ALL_50_PLUS_DC) {
        const j = counts.get(code) || 0;
        const s = salaryCounts.get(code) || 0;
        if (j === 0) emptyJobsStates.push(code);
        else if (j <= 2) thinJobsStates.push(`${code}(${j})`);
        if (s === 0) emptySalaryStates.push(code);
        else if (s <= 2) thinSalaryStates.push(`${code}(${s})`);
    }

    console.log('\n=== STATE PAGE EMPTINESS AUDIT (prod, today) ===\n');
    console.log(`Total active published jobs: ${[...counts.values()].reduce((a, b) => a + b, 0)}`);
    console.log(`States with active jobs:   ${counts.size} of 51`);
    console.log(`States with salary data:   ${salaryCounts.size} of 51`);

    console.log(`\n--- /jobs/state/[state] (uses any active job) ---`);
    console.log(`Empty (0 jobs):  ${emptyJobsStates.length} states → ${emptyJobsStates.join(', ') || '(none)'}`);
    console.log(`Thin (1-2 jobs): ${thinJobsStates.length} states → ${thinJobsStates.join(', ') || '(none)'}`);

    console.log(`\n--- /salary-guide/[state] (needs normalizedMinSalary) ---`);
    console.log(`Empty (0 salary jobs):  ${emptySalaryStates.length} states → ${emptySalaryStates.join(', ') || '(none)'}`);
    console.log(`Thin  (1-2 salary jobs): ${thinSalaryStates.length} states → ${thinSalaryStates.join(', ') || '(none)'}`);

    // Per-state full distribution
    console.log(`\n--- Full distribution (state: jobs / salary-jobs) ---`);
    const rows = ALL_50_PLUS_DC.map(code => ({
        code,
        jobs: counts.get(code) || 0,
        salary: salaryCounts.get(code) || 0,
    })).sort((a, b) => a.jobs - b.jobs);
    for (const r of rows) {
        const flagJ = r.jobs === 0 ? '🚨' : r.jobs <= 2 ? '⚠️' : '  ';
        const flagS = r.salary === 0 ? '🚨' : r.salary <= 2 ? '⚠️' : '  ';
        console.log(`  ${r.code}  jobs=${String(r.jobs).padStart(4)} ${flagJ}   salary=${String(r.salary).padStart(4)} ${flagS}`);
    }

    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
