import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.PROD_DATABASE_URL;
if (!connectionString) {
    throw new Error('PROD_DATABASE_URL must be set in .env');
}

const pool = new Pool({ connectionString, max: 3 });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

// IDs of truly non-PMHNP jobs to unpublish (NOT the misspelled PMNHP ones)
const idsToUnpublish = [
    '7f6eb9fa',  // Step into a one-of-a-kind role... (Senior Living Memory)
    'e7a9389d',  // Matron (Christus Health) - adzuna
    '4e1562ab',  // Outpatient RN (Bright Futures)
    '902342e3',  // Advanced Practice Provider - Crisis PT (Detroit Wayne)
    '037b7373',  // Prescriber | Longview (Community Healthcore)
    '02e92c3f',  // Hybrid Supervising / Treating Contract Position for MD
    'ee885c26',  // PA - 20339927 (Woodridge Hospital)
    'e5efd0f8',  // Medical Matron (Christus Health) - jsearch
    '3da70326',  // LifeStance Health's Team in Delaware
    '40a0fc5e',  // Advanced Practice Provider – Stay in the Know (Two Chairs)
];

async function unpublishInvalidJobs() {
    console.log('Connecting to PROD database...\n');

    // First, find the full IDs that start with these prefixes
    const allJobs = await prisma.job.findMany({
        where: { isPublished: true },
        select: { id: true, title: true, employer: true },
    });

    const jobsToUnpublish = allJobs.filter((job) =>
        idsToUnpublish.some((prefix) => job.id.startsWith(prefix))
    );

    console.log(`Found ${jobsToUnpublish.length} jobs to unpublish:\n`);
    for (const job of jobsToUnpublish) {
        console.log(`  ❌ [${job.id.slice(0, 8)}] ${job.title} (${job.employer})`);
    }

    if (jobsToUnpublish.length === 0) {
        console.log('No matching jobs found. Exiting.');
        await prisma.$disconnect();
        await pool.end();
        return;
    }

    // Unpublish them
    const fullIds = jobsToUnpublish.map((j) => j.id);
    const result = await prisma.job.updateMany({
        where: { id: { in: fullIds } },
        data: { isPublished: false },
    });

    console.log(`\n✅ Successfully unpublished ${result.count} non-PMHNP jobs.`);

    await prisma.$disconnect();
    await pool.end();
}

unpublishInvalidJobs().catch((e) => {
    console.error(e);
    process.exit(1);
});
