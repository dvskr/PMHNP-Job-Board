import 'dotenv/config';
import { prisma } from '../lib/prisma';

async function checkSalaries() {
    console.log('📊 SALARY VERIFICATION REPORT');
    console.log('================================\n');

    // 1. Raw salary period distribution
    const periodDist: any[] = await prisma.$queryRawUnsafe(`
        SELECT salary_period, COUNT(*) as count,
               MIN(min_salary)::int as min_val, MAX(max_salary)::int as max_val,
               ROUND(AVG(min_salary))::int as avg_min, ROUND(AVG(max_salary))::int as avg_max
        FROM jobs WHERE is_published = true AND min_salary IS NOT NULL
        GROUP BY salary_period ORDER BY count DESC
    `);
    console.log('1. RAW SALARY BY PERIOD:');
    console.table(periodDist);

    // 2. Normalized annual salary distribution
    const annualDist: any[] = await prisma.$queryRawUnsafe(`
        SELECT salary_range, COUNT(*) as count FROM (
            SELECT 
                CASE 
                    WHEN normalized_min_salary < 80000 THEN 'a) Under 80k'
                    WHEN normalized_min_salary < 100000 THEN 'b) 80k-100k'
                    WHEN normalized_min_salary < 120000 THEN 'c) 100k-120k'
                    WHEN normalized_min_salary < 150000 THEN 'd) 120k-150k'
                    WHEN normalized_min_salary < 200000 THEN 'e) 150k-200k'
                    WHEN normalized_min_salary < 250000 THEN 'f) 200k-250k'
                    WHEN normalized_min_salary < 300000 THEN 'g) 250k-300k'
                    WHEN normalized_min_salary < 400000 THEN 'h) 300k-400k'
                    ELSE 'i) 400k+'
                END as salary_range
            FROM jobs WHERE is_published = true AND normalized_min_salary IS NOT NULL
        ) sub
        GROUP BY salary_range ORDER BY salary_range
    `);
    console.log('\n2. NORMALIZED ANNUAL SALARY DISTRIBUTION:');
    console.table(annualDist);

    // 3. Suspicious entries: very high or very low
    const suspicious: any[] = await prisma.$queryRawUnsafe(`
        SELECT title, employer, min_salary, max_salary, salary_period,
               normalized_min_salary, normalized_max_salary, source_provider
        FROM jobs WHERE is_published = true AND normalized_min_salary IS NOT NULL
        AND (normalized_min_salary > 300000 OR normalized_min_salary < 70000)
        ORDER BY normalized_min_salary DESC
        LIMIT 20
    `);
    console.log('\n3. EDGE CASES (>300k or <70k normalized):');
    for (const j of suspicious) {
        console.log('  ' + (j.normalized_min_salary > 300000 ? '💰' : '⚠️') +
            ' $' + j.normalized_min_salary + '-$' + j.normalized_max_salary + '/yr' +
            ' (raw: $' + j.min_salary + '-$' + j.max_salary + ' ' + j.salary_period + ')' +
            ' | ' + j.title + ' | ' + j.employer);
    }

    // 4. Jobs with salary but no normalized salary (still rejected)
    const missing: any[] = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count FROM jobs
        WHERE is_published = true
        AND (min_salary IS NOT NULL OR max_salary IS NOT NULL)
        AND normalized_min_salary IS NULL AND normalized_max_salary IS NULL
    `);
    console.log('\n4. JOBS WITH RAW SALARY BUT NO NORMALIZED (rejected):');
    console.log('  Count: ' + missing[0].count);

    // 5. Sample rejected ones
    const rejectedSamples: any[] = await prisma.$queryRawUnsafe(`
        SELECT title, employer, min_salary, max_salary, salary_period, source_provider
        FROM jobs WHERE is_published = true
        AND (min_salary IS NOT NULL OR max_salary IS NOT NULL)
        AND normalized_min_salary IS NULL AND normalized_max_salary IS NULL
        LIMIT 15
    `);
    if (rejectedSamples.length > 0) {
        console.log('  Samples:');
        for (const j of rejectedSamples) {
            console.log('  ❌ $' + j.min_salary + '-$' + j.max_salary + ' (' + j.salary_period + ')' +
                ' | ' + j.title + ' | ' + j.source_provider);
        }
    }
}

checkSalaries()
    .then(() => prisma.$disconnect())
    .then(() => process.exit(0))
    .catch((err) => { console.error(err); process.exit(1); });
