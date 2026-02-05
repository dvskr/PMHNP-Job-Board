// Run with: npx tsx scripts/check-salary.ts
import 'dotenv/config';
import { prisma } from '../lib/prisma';

async function check() {
    // Check all employer-sourced jobs for salary status
    const employerJobs = await prisma.job.findMany({
        where: {
            sourceType: 'employer',
            isPublished: true
        },
        select: {
            id: true,
            title: true,
            employer: true,
            minSalary: true,
            maxSalary: true,
            salaryPeriod: true,
            normalizedMinSalary: true,
            normalizedMaxSalary: true,
            displaySalary: true,
        },
        take: 20
    });

    console.log(`\nFound ${employerJobs.length} employer jobs:`);
    console.log('='.repeat(80));

    employerJobs.forEach(j => {
        const hasSalaryInput = j.minSalary !== null || j.maxSalary !== null;
        const hasDisplaySalary = j.displaySalary !== null;
        console.log(`\n[${j.employer}] ${j.title}`);
        console.log(`  Raw: $${j.minSalary ?? 'N/A'} - $${j.maxSalary ?? 'N/A'} (${j.salaryPeriod ?? 'N/A'})`);
        console.log(`  Normalized: $${j.normalizedMinSalary ?? 'N/A'} - $${j.normalizedMaxSalary ?? 'N/A'}`);
        console.log(`  Display: ${j.displaySalary ?? 'N/A'}`);
        console.log(`  Status: ${hasSalaryInput ? (hasDisplaySalary ? '✅ Has salary' : '⚠️ Has input but no display') : '❌ No salary entered'}`);
    });

    // Summary stats
    const stats = await prisma.job.groupBy({
        by: ['sourceType'],
        where: { isPublished: true },
        _count: { id: true }
    });

    console.log('\n\n=== Jobs by Source ===');
    stats.forEach(s => console.log(`${s.sourceType}: ${s._count.id}`));

    // Count employer jobs with/without salary
    const withSalary = await prisma.job.count({
        where: { sourceType: 'employer', isPublished: true, minSalary: { not: null } }
    });
    const withoutSalary = await prisma.job.count({
        where: { sourceType: 'employer', isPublished: true, minSalary: null }
    });

    console.log(`\nEmployer jobs with salary entered: ${withSalary}`);
    console.log(`Employer jobs WITHOUT salary: ${withoutSalary}`);

    await prisma.$disconnect();
}

check();
