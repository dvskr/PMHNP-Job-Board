/**
 * Post-ingestion job quality audit
 * Checks: PMHNP relevance, salary accuracy, duplicates, missing fields, source distribution
 */
import 'dotenv/config';
import { prisma } from '../lib/prisma';

async function audit() {
    console.log('🔍 POST-INGESTION JOB QUALITY AUDIT');
    console.log('=====================================\n');

    // 1. Total counts
    const total = await prisma.job.count();
    const published = await prisma.job.count({ where: { isPublished: true } });
    const unpublished = await prisma.job.count({ where: { isPublished: false } });
    console.log('1. TOTAL COUNTS:');
    console.log('  Total jobs:     ' + total);
    console.log('  Published:      ' + published);
    console.log('  Unpublished:    ' + unpublished);

    // 2. Source distribution
    const sources: any[] = await prisma.$queryRawUnsafe(`
        SELECT source_provider, COUNT(*) as count
        FROM jobs WHERE is_published = true
        GROUP BY source_provider ORDER BY count DESC
    `);
    console.log('\n2. PUBLISHED JOBS BY SOURCE:');
    for (const s of sources) {
        console.log('  ' + (s.source_provider || 'unknown') + ': ' + s.count);
    }

    // 3. Non-PMHNP titles check (jobs that may not be relevant)
    const suspiciousTitles: any[] = await prisma.$queryRawUnsafe(`
        SELECT id, title, employer, source_provider FROM jobs
        WHERE is_published = true
        AND LOWER(title) NOT LIKE '%pmhnp%'
        AND LOWER(title) NOT LIKE '%psychiatric%'
        AND LOWER(title) NOT LIKE '%psych %'
        AND LOWER(title) NOT LIKE '%mental health%'
        AND LOWER(title) NOT LIKE '%behavioral health%'
        AND LOWER(title) NOT LIKE '%psychiatry%'
        AND LOWER(title) NOT LIKE '%telepsychiatry%'
        AND LOWER(title) NOT LIKE '%nurse practitioner%'
        ORDER BY source_provider, title
        LIMIT 30
    `);
    console.log('\n3. POTENTIALLY NON-RELEVANT TITLES (' + suspiciousTitles.length + ' found):');
    for (const j of suspiciousTitles) {
        console.log('  ⚠️ [' + j.source_provider + '] ' + j.title + ' | ' + j.employer);
    }

    // 4. Missing critical fields
    const noTitle = await prisma.job.count({ where: { isPublished: true, title: '' } });
    const noEmployer: any[] = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count FROM jobs WHERE is_published = true AND (employer IS NULL OR employer = '')
    `);
    const noApplyLink: any[] = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count FROM jobs WHERE is_published = true AND (apply_link IS NULL OR apply_link = '')
    `);
    const noLocation: any[] = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count FROM jobs WHERE is_published = true AND (location IS NULL OR location = '')
    `);
    console.log('\n4. MISSING CRITICAL FIELDS:');
    console.log('  No title:      ' + noTitle);
    console.log('  No employer:   ' + noEmployer[0].count);
    console.log('  No apply link: ' + noApplyLink[0].count);
    console.log('  No location:   ' + noLocation[0].count);

    // 5. Salary coverage
    const withSalary = await prisma.job.count({
        where: { isPublished: true, NOT: { normalizedMinSalary: null } }
    });
    const withoutSalary = published - withSalary;
    console.log('\n5. SALARY COVERAGE:');
    console.log('  With salary:    ' + withSalary + ' (' + Math.round(withSalary / published * 100) + '%)');
    console.log('  Without salary: ' + withoutSalary + ' (' + Math.round(withoutSalary / published * 100) + '%)');

    // 6. Job type distribution
    const jobTypes: any[] = await prisma.$queryRawUnsafe(`
        SELECT job_type, COUNT(*) as count
        FROM jobs WHERE is_published = true
        GROUP BY job_type ORDER BY count DESC
    `);
    console.log('\n6. JOB TYPE DISTRIBUTION:');
    for (const jt of jobTypes) {
        console.log('  ' + (jt.job_type || 'NULL') + ': ' + jt.count);
    }

    // 7. Stale jobs (>60 days old)
    const stale: any[] = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count FROM jobs
        WHERE is_published = true AND created_at < NOW() - INTERVAL '60 days'
    `);
    const veryStale: any[] = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count FROM jobs
        WHERE is_published = true AND created_at < NOW() - INTERVAL '90 days'
    `);
    console.log('\n7. JOB FRESHNESS:');
    console.log('  >60 days old:  ' + stale[0].count);
    console.log('  >90 days old:  ' + veryStale[0].count);

    // 8. Potential duplicates (same title + employer)
    const dupes: any[] = await prisma.$queryRawUnsafe(`
        SELECT title, employer, COUNT(*) as count
        FROM jobs WHERE is_published = true
        GROUP BY title, employer
        HAVING COUNT(*) > 2
        ORDER BY count DESC
        LIMIT 15
    `);
    console.log('\n8. POTENTIAL DUPLICATES (same title+employer, >2 copies):');
    if (dupes.length === 0) {
        console.log('  None found ✅');
    } else {
        for (const d of dupes) {
            console.log('  ' + d.count + 'x | ' + d.title + ' | ' + d.employer);
        }
    }

    // 9. Random sample of 10 published jobs for manual review
    const sample: any[] = await prisma.$queryRawUnsafe(`
        SELECT title, employer, location, salary_range, source_provider, job_type,
               normalized_min_salary, normalized_max_salary
        FROM jobs WHERE is_published = true
        ORDER BY RANDOM() LIMIT 10
    `);
    console.log('\n9. RANDOM SAMPLE (10 jobs for manual review):');
    for (let i = 0; i < sample.length; i++) {
        const j = sample[i];
        const sal = j.normalized_min_salary
            ? '$' + Math.round(j.normalized_min_salary / 1000) + 'k-$' + Math.round((j.normalized_max_salary || j.normalized_min_salary) / 1000) + 'k/yr'
            : 'No salary';
        console.log('  ' + (i + 1) + '. [' + j.source_provider + '] ' + j.title);
        console.log('     ' + j.employer + ' | ' + j.location + ' | ' + sal + ' | ' + (j.job_type || 'no type'));
    }

    console.log('\n=====================================');
    console.log('AUDIT COMPLETE');
    console.log('=====================================');
}

audit()
    .then(() => prisma.$disconnect())
    .then(() => process.exit(0))
    .catch((err) => { console.error(err); process.exit(1); });
