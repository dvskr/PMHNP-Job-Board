
import 'dotenv/config';
import { prisma } from '../lib/prisma';

async function checkStats() {
    const stats = await prisma.job.groupBy({
        by: ['sourceProvider'],
        _count: {
            _all: true
        },
    });

    const total = stats.reduce((acc, curr) => acc + curr._count._all, 0);

    console.log('--- Job Counts by Source ---');
    stats.forEach(s => {
        console.log(`${s.sourceProvider}: ${s._count._all}`);
    });
    console.log('---------------------------');
    console.log(`TOTAL JOBS: ${total}`);
}

checkStats()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
