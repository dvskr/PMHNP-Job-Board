import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL or DIRECT_URL must be set');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function checkCompanyCounts() {
  console.log('🔍 Checking Company Count Discrepancy\n');
  console.log('='.repeat(80));

  // 1. Count from companies table
  const companiesTableCount = await prisma.company.count();
  console.log(`\n1️⃣  Companies Table Count: ${companiesTableCount}`);
  console.log('   └─ Normalized, deduplicated company records\n');

  // 2. Count distinct employers from jobs (what the homepage uses)
  const companyGroups = await prisma.job.groupBy({
    by: ['employer'],
    where: { isPublished: true },
  });
  const distinctEmployerCount = companyGroups.length;
  console.log(`2️⃣  Distinct Employer Names (from jobs): ${distinctEmployerCount}`);
  console.log('   └─ Raw employer strings from published jobs (with duplicates)\n');

  // 3. Total published jobs
  const totalJobs = await prisma.job.count({ where: { isPublished: true } });
  console.log(`3️⃣  Total Published Jobs: ${totalJobs}\n`);

  // 4. Show some employer name variations
  console.log('📋 Sample Employer Name Variations:');
  console.log('-'.repeat(80));
  const sampleEmployers = companyGroups
    .slice(0, 30)
    .map(g => g.employer);
  
  // Look for similar names
  const kaisers = sampleEmployers.filter(e => e.toLowerCase().includes('kaiser'));
  const healths = sampleEmployers.filter(e => e.toLowerCase().includes('health'));
  
  if (kaisers.length > 0) {
    console.log('\n🏥 Kaiser variations:');
    kaisers.forEach(k => console.log(`   - ${k}`));
  }
  
  if (healths.length > 3) {
    console.log('\n🏥 Health-related companies (first 10):');
    healths.slice(0, 10).forEach(h => console.log(`   - ${h}`));
  }

  // 5. Show jobs linked vs not linked to companies table
  const jobsLinkedToCompanies = await prisma.job.count({
    where: { 
      isPublished: true,
      companyId: { not: null }
    }
  });

  console.log('\n\n📊 Jobs Linked to Companies Table:');
  console.log('-'.repeat(80));
  console.log(`   Linked: ${jobsLinkedToCompanies} jobs`);
  console.log(`   Not Linked: ${totalJobs - jobsLinkedToCompanies} jobs`);
  console.log(`   Percentage: ${((jobsLinkedToCompanies / totalJobs) * 100).toFixed(1)}%\n`);

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📈 SUMMARY');
  console.log('='.repeat(80));
  console.log(`
  Homepage shows: ${distinctEmployerCount} "Companies Hiring"
  ├─ This counts DISTINCT employer field values from jobs table
  └─ Includes variations like "Kaiser", "Kaiser Permanente", etc.

  Companies table has: ${companiesTableCount} companies
  ├─ These are normalized/deduplicated records
  └─ Created by company-normalizer.ts

  The difference: ${distinctEmployerCount - companiesTableCount}
  └─ These are duplicate employer names with different spellings
  `);

  console.log('='.repeat(80) + '\n');

  await prisma.$disconnect();
  await pool.end();
}

checkCompanyCounts().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});

