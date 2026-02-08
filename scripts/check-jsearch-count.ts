
import 'dotenv/config';
import { prisma } from '../lib/prisma';

async function main() {
    const count = await prisma.job.count({
        where: {
            sourceProvider: 'jsearch'
        }
    });
    console.log(`\n📊 Total JSearch Jobs in DB: ${count}`);
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
