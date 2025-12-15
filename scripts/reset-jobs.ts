import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

config();

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🗑️  Deleting all jobs and companies...\n');
  
  // Delete all jobs first (they have foreign key to companies)
  const deletedJobs = await prisma.job.deleteMany({});
  console.log(`✅ Deleted ${deletedJobs.count} jobs`);
  
  // Delete all companies
  const deletedCompanies = await prisma.company.deleteMany({});
  console.log(`✅ Deleted ${deletedCompanies.count} companies`);
  
  console.log('\n🎉 Database cleaned! Ready for fresh ingestion.\n');
  
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});

