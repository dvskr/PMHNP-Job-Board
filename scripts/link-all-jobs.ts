import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Load environment variables
config();

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ 
  connectionString,
  max: 5,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 30000,
  allowExitOnIdle: true,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Company suffixes to remove during normalization
const SUFFIXES = [
  'inc', 'inc.', 'incorporated', 'llc', 'l.l.c.', 'ltd', 'limited',
  'corp', 'corp.', 'corporation', 'co', 'co.', 'company',
  'health', 'healthcare', 'health care', 'medical', 'medical group',
  'group', 'services', 'solutions', 'partners', 'associates',
  'pllc', 'p.c.', 'pc', 'pa', 'p.a.',
];

function normalizeCompanyName(name: string): string {
  if (!name) return '';
  let normalized = name.toLowerCase().trim();
  for (const suffix of SUFFIXES) {
    const suffixPattern = new RegExp(`\\b${suffix.replace('.', '\\.')}\\b`, 'gi');
    normalized = normalized.replace(suffixPattern, '');
  }
  normalized = normalized.replace(/[^a-z0-9\s-]/g, '');
  normalized = normalized.replace(/\s+/g, ' ');
  normalized = normalized.trim();
  return normalized;
}

async function main() {
  console.log('Starting job-to-company linking...\n');
  
  const BATCH_SIZE = 100;
  let processed = 0;
  let linked = 0;
  const companiesMap = new Map<string, string>();

  const totalJobs = await prisma.job.count({
    where: { companyId: null },
  });

  console.log(`Found ${totalJobs} jobs without companies\n`);

  let skip = 0;
  while (skip < totalJobs) {
    const jobs = await prisma.job.findMany({
      where: { companyId: null },
      select: { id: true, employer: true },
      take: BATCH_SIZE,
      skip,
    });

    if (jobs.length === 0) break;

    for (const job of jobs) {
      try {
        const normalized = normalizeCompanyName(job.employer);
        let companyId = companiesMap.get(normalized);
        
        if (!companyId) {
          // Check if company exists
          let company = await prisma.company.findUnique({
            where: { normalizedName: normalized },
          });

          if (!company) {
            // Create new company
            company = await prisma.company.create({
              data: {
                name: job.employer,
                normalizedName: normalized,
                jobCount: 1,
              },
            });
            console.log(`Created company: ${company.name}`);
          } else {
            // Increment job count
            company = await prisma.company.update({
              where: { id: company.id },
              data: { jobCount: { increment: 1 } },
            });
          }
          
          companyId = company.id;
          companiesMap.set(normalized, companyId);
        } else {
          // Just increment the count
          await prisma.company.update({
            where: { id: companyId },
            data: { jobCount: { increment: 1 } },
          });
        }

        // Update job with company ID
        await prisma.job.update({
          where: { id: job.id },
          data: { companyId },
        });

        linked++;
      } catch (error) {
        console.error(`Error processing job ${job.id}:`, error);
      }

      processed++;
    }

    skip += BATCH_SIZE;
    console.log(`Progress: ${processed}/${totalJobs} jobs processed...`);
  }

  console.log('\n' + '='.repeat(50));
  console.log('COMPLETE!');
  console.log('='.repeat(50));
  console.log(`Total processed: ${processed}`);
  console.log(`Total linked: ${linked}`);
  console.log(`Companies created/used: ${companiesMap.size}`);
  console.log('='.repeat(50));

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

