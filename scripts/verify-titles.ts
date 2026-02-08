
import 'dotenv/config';
import { prisma } from '../lib/prisma';

async function verifyTitles() {
    const jobs = await prisma.job.findMany({
        select: { title: true, id: true }
    });

    console.log(`Checking ${jobs.length} jobs for relevance...`);

    const suspicious: any[] = [];
    const relevantKeywords = ['PMHNP', 'Nurse Practitioner', 'NP', 'Psych', 'Mental Health', 'APRN', 'ARNP'];

    jobs.forEach(job => {
        const title = job.title.toLowerCase();
        const isRelevant = relevantKeywords.some(kw => title.includes(kw.toLowerCase()));

        if (!isRelevant) {
            suspicious.push(job);
        }
    });

    if (suspicious.length > 0) {
        console.log(`⚠️  Found ${suspicious.length} potentially irrelevant jobs:`);
        suspicious.slice(0, 20).forEach(j => console.log(`- [${j.id}] ${j.title}`));
    } else {
        console.log('✅ All jobs appear relevant (contain core PMHNP keywords).');
    }
}

verifyTitles()
    .catch(console.error)
    .finally(async () => await prisma.$disconnect());
