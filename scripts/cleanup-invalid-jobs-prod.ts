
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { isRelevantJob } from '../lib/utils/job-filter';
import * as readline from 'readline';

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isForce = args.includes('--force');

const prodUrl = process.env.PROD_DATABASE_URL;
if (!prodUrl) {
    console.error('❌ PROD_DATABASE_URL not set in .env');
    process.exit(1);
}

function askConfirmation(question: string): Promise<boolean> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
        rl.question(question, answer => {
            rl.close();
            resolve(answer.toLowerCase() === 'y');
        });
    });
}

console.log('🔗 Connecting to PRODUCTION database...');
const pool = new Pool({ connectionString: prodUrl, max: 3, allowExitOnIdle: true });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function cleanupInvalidJobs() {
    console.log('🧹 Starting Cleanup of Invalid Jobs in PROD...');
    if (isDryRun) console.log('🔎 DRY RUN mode — no data will be deleted.\n');
    console.log('Using strict PMHNP filter logic...\n');

    const totalJobs = await prisma.job.count();
    console.log(`Total jobs in database: ${totalJobs}`);

    const allJobs = await prisma.job.findMany({
        select: {
            id: true,
            title: true,
            description: true,
            sourceProvider: true,
        }
    });

    const toDelete: { id: string; title: string }[] = [];

    for (const job of allJobs) {
        // EXEMPT: Never delete employer postings (sourceProvider: null)
        if (job.sourceProvider !== null && !isRelevantJob(job.title, job.description)) {
            toDelete.push({ id: job.id, title: job.title });
        }
    }

    console.log(`Found ${toDelete.length} invalid jobs to delete.`);

    if (toDelete.length === 0) {
        console.log('✨ Database is already clean! No action needed.');
        return;
    }

    if (isDryRun) {
        console.log('\n📋 Sample of jobs that would be deleted:');
        for (const job of toDelete.slice(0, 20)) {
            console.log(`  - [${job.id.slice(0, 8)}...] ${job.title}`);
        }
        if (toDelete.length > 20) {
            console.log(`  ... and ${toDelete.length - 20} more.`);
        }
        console.log(`\n🔎 DRY RUN complete. ${toDelete.length} jobs would be deleted. Run without --dry-run to proceed.`);
        return;
    }

    if (!isForce) {
        const confirmed = await askConfirmation(`\n⚠️  About to DELETE ${toDelete.length} jobs from PRODUCTION. Continue? (y/N) `);
        if (!confirmed) {
            console.log('❌ Aborted by user.');
            return;
        }
    }

    console.log(`Deleting ${toDelete.length} jobs...`);

    // Delete in chunks of 500
    const chunkSize = 500;
    const ids = toDelete.map(j => j.id);
    for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        await prisma.job.deleteMany({
            where: { id: { in: chunk } }
        });
        console.log(`  Deleted chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(ids.length / chunkSize)} (${Math.min(i + chunkSize, ids.length)}/${ids.length})`);
    }

    const remainingJobs = await prisma.job.count();
    console.log(`\n✅ Cleanup Complete! Deleted ${toDelete.length} invalid jobs.`);
    console.log(`Remaining jobs in database: ${remainingJobs}`);

    await prisma.$disconnect();
    await pool.end();
}

cleanupInvalidJobs().catch(e => {
    console.error('Error during cleanup:', e);
    process.exit(1);
});
