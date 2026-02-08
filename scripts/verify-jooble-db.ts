
import 'dotenv/config';
import { prisma } from '../lib/prisma';

async function main() {
    const count = await prisma.job.count({
        where: { sourceProvider: 'jooble' }
    });

    const sample = await prisma.job.findMany({
        where: { sourceProvider: 'jooble' },
        select: {
            title: true,
            employer: true,
            location: true,
            salaryRange: true,
            jobType: true,
            displaySalary: true
        },
        take: 5
    });

    console.log(`📊 Jooble In DB: ${count}`);
    console.log('\n📄 Sample Jobs:');
    sample.forEach(s => {
        console.log(`- ${s.title}`);
        console.log(`  Employer: ${s.employer}`);
        console.log(`  Location: ${s.location}`);
        console.log(`  Salary:   ${s.salaryRange} (${s.displaySalary})`);
        console.log(`  Type:     ${s.jobType}\n`);
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
