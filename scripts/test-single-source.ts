
import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { ingestJobs, type JobSource } from '../lib/ingestion-service';

const sourceArg = process.argv[2] as JobSource;

if (!sourceArg) {
    console.error('❌ Please provide a source argument (e.g. adzuna, jsearch)');
    process.exit(1);
}

const validSources: JobSource[] = ['adzuna', 'jooble', 'greenhouse', 'lever', 'usajobs', 'jsearch', 'ashby'];
if (!validSources.includes(sourceArg)) {
    console.error(`❌ Invalid source: ${sourceArg}. Valid: ${validSources.join(', ')}`);
    process.exit(1);
}

async function testSource() {
    console.log(`\n🧪 Testing individual source: ${sourceArg.toUpperCase()}`);

    try {
        const results = await ingestJobs([sourceArg]);

        // Quick verification query after ingestion
        const count = await prisma.job.count({ where: { sourceProvider: sourceArg } });
        const oldest = await prisma.job.findFirst({
            where: { sourceProvider: sourceArg },
            orderBy: { originalPostedAt: 'asc' },
            select: { originalPostedAt: true, title: true }
        });

        console.log(`\n✅ Verified in DB: ${count} jobs from ${sourceArg}`);
        if (oldest && oldest.originalPostedAt) {
            console.log(`   Oldest Job Date: ${oldest.originalPostedAt.toISOString().split('T')[0]} (${oldest.title})`);
        } else {
            console.log('   (No originalPostedAt found or no jobs)');
        }

    } catch (error) {
        console.error('❌ Error during test:', error);
    } finally {
        await prisma.$disconnect();
    }
}

testSource();
