
import 'dotenv/config';
import { prisma } from '../lib/prisma';

async function main() {
    const sources = ['adzuna', 'jsearch', 'usajobs', 'jooble', 'greenhouse', 'lever'];

    console.log('📊 Job Counts by Source:');
    console.log('-------------------------');

    for (const source of sources) {
        const count = await prisma.job.count({
            where: { sourceProvider: source }
        });
        console.log(`${source.padEnd(12)}: ${count}`);
    }
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
