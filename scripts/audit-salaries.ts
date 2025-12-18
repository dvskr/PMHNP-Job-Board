import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function auditSalaries() {
  console.log('💰 PMHNP Job Board - Salary Data Audit\n');
  console.log('='.repeat(70));

  const allJobs = await prisma.job.findMany({
    where: { isPublished: true },
    select: {
      id: true,
      title: true,
      employer: true,
      sourceProvider: true,
      // Raw salary fields (from API)
      minSalary: true,
      maxSalary: true,
      salaryPeriod: true,
      salaryRange: true,
      // Normalized salary fields
      normalizedMinSalary: true,
      normalizedMaxSalary: true,
      salaryIsEstimated: true,
      // Description (to check for salary mentions)
      description: true,
    },
  });

  console.log(`\n📊 Total Jobs: ${allJobs.length}\n`);

  // Categorize jobs
  const stats = {
    withNormalizedSalary: 0,
    withRawSalaryOnly: 0,
    noSalaryData: 0,
    salaryInDescription: 0,
    estimatedSalaries: 0,
    bySource: {} as Record<string, { total: number; withSalary: number }>,
    bySalaryPeriod: {} as Record<string, number>,
    salaryRanges: {
      under50k: 0,
      '50k-100k': 0,
      '100k-150k': 0,
      '150k-200k': 0,
      '200k-250k': 0,
      over250k: 0,
    },
    hourlyRates: [] as Array<{ title: string; employer: string; rate: string }>,
    suspiciouslyLow: [] as Array<{ id: string; title: string; salary: number }>,
    suspiciouslyHigh: [] as Array<{ id: string; title: string; salary: number }>,
  };

  // Salary patterns in description
  const salaryPatterns = [
    /\$[\d,]+(?:\.\d{2})?\s*(?:\/?\s*(?:hr|hour|hourly))/i,
    /\$[\d,]+(?:\.\d{2})?\s*(?:\/?\s*(?:yr|year|annual|annually))/i,
    /\$[\d,]+\s*-\s*\$[\d,]+/i,
    /(?:salary|compensation|pay)[\s:]*\$[\d,]+/i,
    /[\d,]+k?\s*(?:\/?\s*(?:yr|year|annual))/i,
  ];

  for (const job of allJobs) {
    // Track by source
    const source = job.sourceProvider || 'direct';
    if (!stats.bySource[source]) {
      stats.bySource[source] = { total: 0, withSalary: 0 };
    }
    stats.bySource[source].total++;

    // Check salary status
    const hasNormalized = job.normalizedMinSalary || job.normalizedMaxSalary;
    const hasRaw = job.minSalary || job.maxSalary || job.salaryRange;

    if (hasNormalized) {
      stats.withNormalizedSalary++;
      stats.bySource[source].withSalary++;

      if (job.salaryIsEstimated) {
        stats.estimatedSalaries++;
      }

      // Categorize by range
      const salary = job.normalizedMaxSalary || job.normalizedMinSalary || 0;
      if (salary < 50000) stats.salaryRanges.under50k++;
      else if (salary < 100000) stats.salaryRanges['50k-100k']++;
      else if (salary < 150000) stats.salaryRanges['100k-150k']++;
      else if (salary < 200000) stats.salaryRanges['150k-200k']++;
      else if (salary < 250000) stats.salaryRanges['200k-250k']++;
      else stats.salaryRanges.over250k++;

      // Flag suspicious salaries
      if (salary < 40000 && salary > 0) {
        stats.suspiciouslyLow.push({ id: job.id, title: job.title, salary });
      }
      if (salary > 400000) {
        stats.suspiciouslyHigh.push({ id: job.id, title: job.title, salary });
      }
    } else if (hasRaw) {
      stats.withRawSalaryOnly++;
    } else {
      stats.noSalaryData++;
    }

    // Check for salary in description
    if (job.description) {
      for (const pattern of salaryPatterns) {
        if (pattern.test(job.description)) {
          stats.salaryInDescription++;
          break;
        }
      }
    }

    // Track salary periods
    if (job.salaryPeriod) {
      stats.bySalaryPeriod[job.salaryPeriod] = (stats.bySalaryPeriod[job.salaryPeriod] || 0) + 1;
    }

    // Track hourly rates for manual review
    if (job.salaryRange && /\$\d+.*(?:hr|hour)/i.test(job.salaryRange)) {
      stats.hourlyRates.push({
        title: job.title,
        employer: job.employer || 'Unknown',
        rate: job.salaryRange,
      });
    }
  }

  // Print results
  console.log('📈 SALARY COVERAGE:');
  console.log(`  ✅ With normalized salary: ${stats.withNormalizedSalary} (${(stats.withNormalizedSalary/allJobs.length*100).toFixed(1)}%)`);
  console.log(`  📊 Estimated salaries: ${stats.estimatedSalaries}`);
  console.log(`  ⚠️  With raw salary only (not normalized): ${stats.withRawSalaryOnly}`);
  console.log(`  ❌ No salary data: ${stats.noSalaryData} (${(stats.noSalaryData/allJobs.length*100).toFixed(1)}%)`);
  console.log(`  📝 Salary mentioned in description: ${stats.salaryInDescription}`);

  console.log('\n📡 BY SOURCE:');
  const sortedSources = Object.entries(stats.bySource).sort((a, b) => b[1].total - a[1].total);
  for (const [source, data] of sortedSources) {
    const pct = (data.withSalary / data.total * 100).toFixed(1);
    console.log(`  ${source}: ${data.withSalary}/${data.total} (${pct}%)`);
  }

  console.log('\n💵 SALARY PERIOD BREAKDOWN:');
  for (const [period, count] of Object.entries(stats.bySalaryPeriod)) {
    console.log(`  ${period}: ${count}`);
  }

  console.log('\n📊 SALARY RANGES (Normalized Annual):');
  console.log(`  Under $50k: ${stats.salaryRanges.under50k}`);
  console.log(`  $50k - $100k: ${stats.salaryRanges['50k-100k']}`);
  console.log(`  $100k - $150k: ${stats.salaryRanges['100k-150k']}`);
  console.log(`  $150k - $200k: ${stats.salaryRanges['150k-200k']}`);
  console.log(`  $200k - $250k: ${stats.salaryRanges['200k-250k']}`);
  console.log(`  Over $250k: ${stats.salaryRanges.over250k}`);

  if (stats.suspiciouslyLow.length > 0) {
    console.log('\n⚠️  SUSPICIOUSLY LOW SALARIES (< $40k):');
    stats.suspiciouslyLow.slice(0, 10).forEach((job: { id: string; title: string; salary: number }) => {
      console.log(`  - ${job.title}: $${job.salary.toLocaleString()}`);
    });
    if (stats.suspiciouslyLow.length > 10) {
      console.log(`  ... and ${stats.suspiciouslyLow.length - 10} more`);
    }
  }

  if (stats.suspiciouslyHigh.length > 0) {
    console.log('\n⚠️  SUSPICIOUSLY HIGH SALARIES (> $400k):');
    stats.suspiciouslyHigh.slice(0, 10).forEach((job: { id: string; title: string; salary: number }) => {
      console.log(`  - ${job.title}: $${job.salary.toLocaleString()}`);
    });
    if (stats.suspiciouslyHigh.length > 10) {
      console.log(`  ... and ${stats.suspiciouslyHigh.length - 10} more`);
    }
  }

  if (stats.hourlyRates.length > 0) {
    console.log('\n⏰ SAMPLE HOURLY RATES (for review):');
    stats.hourlyRates.slice(0, 15).forEach((job: { title: string; employer: string; rate: string }) => {
      console.log(`  - ${job.title} @ ${job.employer}: ${job.rate}`);
    });
  }

  // Find jobs with raw salary but no normalized salary
  const rawButNotNormalized = await prisma.job.findMany({
    where: {
      isPublished: true,
      OR: [
        { minSalary: { not: null } },
        { maxSalary: { not: null } },
        { salaryRange: { not: null } },
      ],
      normalizedMinSalary: null,
      normalizedMaxSalary: null,
    },
    select: {
      id: true,
      title: true,
      minSalary: true,
      maxSalary: true,
      salaryRange: true,
      salaryPeriod: true,
      sourceProvider: true,
    },
    take: 20,
  });

  if (rawButNotNormalized.length > 0) {
    console.log('\n🔍 JOBS WITH RAW SALARY BUT NOT NORMALIZED (Sample):');
    rawButNotNormalized.forEach((job: typeof rawButNotNormalized[number]) => {
      console.log(`  - [${job.sourceProvider || 'direct'}] ${job.title}`);
      console.log(`    Range: ${job.salaryRange || 'N/A'}, Min: ${job.minSalary || 'N/A'}, Max: ${job.maxSalary || 'N/A'}, Period: ${job.salaryPeriod || 'N/A'}`);
    });
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ Salary Audit Complete\n');

  await prisma.$disconnect();
}

auditSalaries().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

