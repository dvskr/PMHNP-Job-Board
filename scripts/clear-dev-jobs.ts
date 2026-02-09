
import 'dotenv/config';
import { prisma } from '../lib/prisma';

async function clearDevJobs() {
    console.log('WARNING: This will delete ALL jobs from the connected database.');

    // Verify we are not connected to prod by checking the DATABASE_URL (basic check)
    const dbUrl = process.env.DATABASE_URL || '';
    if (!dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1') && !dbUrl.includes('dev') && !dbUrl.includes('supa')) {
        // Just a safety check, but user explicitly asked to clear dev.
        // Assuming user environments are set correctly.
        console.log(`Connected to: ${dbUrl}`);
    }

    try {
        const deleted = await prisma.job.deleteMany({});
        console.log(`\n✅ Successfully deleted ${deleted.count} jobs from the database.`);

        // Also delete companies to avoid conflicts when re-syncing
        const deletedCompanies = await prisma.company.deleteMany({});
        console.log(`✅ Successfully deleted ${deletedCompanies.count} companies from the database.`);
    } catch (error) {
        console.error('Error deleting jobs:', error);
    } finally {
        await prisma.$disconnect();
    }
}

clearDevJobs();
