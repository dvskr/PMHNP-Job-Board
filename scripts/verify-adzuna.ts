
import 'dotenv/config';
import { prisma } from '../lib/prisma';

async function verifyAdzuna() {
    console.log('🔍 Verifying Adzuna Jobs...\n');

    const jobs = await prisma.job.findMany({
        where: { sourceProvider: 'adzuna' },
        select: {
            id: true,
            title: true,
            originalPostedAt: true,
            isPublished: true,
            location: true,
            minSalary: true,
            maxSalary: true,
            sourceProvider: true,
            createdAt: true
        },
        orderBy: { originalPostedAt: 'asc' } // Oldest first to check age
    });

    if (jobs.length === 0) {
        console.log('❌ No Adzuna jobs found!');
        return;
    }

    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);

    let tooOld = 0;
    let missingSalary = 0;
    let relevant = 0;

    console.log(`📊 Total Adzuna Jobs: ${jobs.length}`);
    console.log(`📅 Date Check:`);

    // Check dates and print oldest
    const oldest = jobs[0];
    const newest = jobs[jobs.length - 1];

    console.log(`   - Oldest Job: ${oldest.originalPostedAt?.toISOString().split('T')[0] ?? 'N/A'}`);
    console.log(`   - Newest Job: ${newest.originalPostedAt?.toISOString().split('T')[0] ?? 'N/A'}`);

    jobs.forEach(job => {
        if (job.originalPostedAt && new Date(job.originalPostedAt) < thirtyDaysAgo) {
            tooOld++;
        }
        if (!job.minSalary && !job.maxSalary) {
            missingSalary++;
        }
        if (job.title.toLowerCase().includes('pmhnp') || job.title.toLowerCase().includes('psychiatric') || job.title.toLowerCase().includes('nurse practitioner')) {
            relevant++;
        }
    });

    console.log(`\n✅ RULES CHECK:`);
    console.log(`   - Jobs Older than 30 Days: ${tooOld} ${tooOld === 0 ? '✅ (PASS)' : '❌ (FAIL)'}`);
    console.log(`   - Jobs with Salary: ${jobs.length - missingSalary} (${Math.round((jobs.length - missingSalary) / jobs.length * 100)}%)`);
    console.log(`   - Relevant Titles (PMHNP/Psych/NP): ${relevant} (${Math.round(relevant / jobs.length * 100)}%)`);

    console.log(`\n🧬 SAMPLE JOBS (Oldest 3):`);
    jobs.slice(0, 3).forEach(job => {
        console.log(`   - [${job.originalPostedAt?.toISOString().split('T')[0]}] ${job.title} @ ${job.location}`);
    });

    console.log(`\n🧬 SAMPLE JOBS (Newest 3):`);
    jobs.slice(-3).forEach(job => {
        console.log(`   - [${job.originalPostedAt?.toISOString().split('T')[0]}] ${job.title} @ ${job.location}`);
    });

    await prisma.$disconnect();
}

verifyAdzuna();
