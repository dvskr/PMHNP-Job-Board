
import 'dotenv/config';
import { prisma } from '../lib/prisma';

async function resetJobs() {
  console.log('🗑️  Deleting ALL jobs from database...');
  try {
    const deleted = await prisma.job.deleteMany({});
    console.log(`✅ Deleted ${deleted.count} jobs.`);
  } catch (error) {
    console.error('❌ Error deleting jobs:', error);
  } finally {
    await prisma.$disconnect();
  }
}

resetJobs();
