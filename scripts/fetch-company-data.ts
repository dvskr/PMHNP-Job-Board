import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL or DIRECT_URL must be set');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

interface CompanyData {
  company_name: string;
  website: string | null;
  location: string | null;
  source_table: string;
}

async function fetchCompanyData() {
  console.log('🔍 Fetching Company Data from All Tables\n');
  console.log('='.repeat(80));

  const allCompanyData: CompanyData[] = [];

  // 1. FROM companies table
  console.log('\n📊 Table 1: companies');
  console.log('-'.repeat(80));
  const companies = await prisma.company.findMany({
    select: {
      name: true,
      website: true,
    },
  });

  console.log(`Found ${companies.length} companies`);
  companies.forEach((c) => {
    allCompanyData.push({
      company_name: c.name,
      website: c.website,
      location: null, // No location in companies table
      source_table: 'companies',
    });
  });

  if (companies.length > 0) {
    console.log('\nSample (first 5):');
    companies.slice(0, 5).forEach((c, i) => {
      console.log(`  ${i + 1}. ${c.name} | ${c.website || 'No website'}`);
    });
  }

  // 2. FROM jobs table (distinct employer names with locations)
  console.log('\n\n📊 Table 2: jobs');
  console.log('-'.repeat(80));
  const jobs = await prisma.job.findMany({
    select: {
      employer: true,
      location: true,
      city: true,
      state: true,
      stateCode: true,
      country: true,
    },
    distinct: ['employer'],
  });

  console.log(`Found ${jobs.length} distinct employers`);
  jobs.forEach((j) => {
    const locationParts = [j.city, j.state || j.stateCode, j.country]
      .filter(Boolean)
      .join(', ');
    const location = locationParts || j.location;

    allCompanyData.push({
      company_name: j.employer,
      website: null, // No website in jobs table
      location: location,
      source_table: 'jobs',
    });
  });

  if (jobs.length > 0) {
    console.log('\nSample (first 5):');
    jobs.slice(0, 5).forEach((j, i) => {
      const locationParts = [j.city, j.state || j.stateCode, j.country]
        .filter(Boolean)
        .join(', ');
      const location = locationParts || j.location;
      console.log(`  ${i + 1}. ${j.employer} | ${location || 'No location'}`);
    });
  }

  // 3. FROM employer_jobs table
  console.log('\n\n📊 Table 3: employer_jobs');
  console.log('-'.repeat(80));
  const employerJobs = await prisma.employerJob.findMany({
    select: {
      employerName: true,
      companyWebsite: true,
    },
    distinct: ['employerName'],
  });

  console.log(`Found ${employerJobs.length} distinct employer job postings`);
  employerJobs.forEach((ej) => {
    allCompanyData.push({
      company_name: ej.employerName,
      website: ej.companyWebsite,
      location: null, // No location in employer_jobs table
      source_table: 'employer_jobs',
    });
  });

  if (employerJobs.length > 0) {
    console.log('\nSample (first 5):');
    employerJobs.slice(0, 5).forEach((ej, i) => {
      console.log(`  ${i + 1}. ${ej.employerName} | ${ej.companyWebsite || 'No website'}`);
    });
  }

  // 4. FROM employer_leads table
  console.log('\n\n📊 Table 4: employer_leads');
  console.log('-'.repeat(80));
  const employerLeads = await prisma.employerLead.findMany({
    select: {
      companyName: true,
      website: true,
    },
    distinct: ['companyName'],
  });

  console.log(`Found ${employerLeads.length} distinct employer leads`);
  employerLeads.forEach((el) => {
    allCompanyData.push({
      company_name: el.companyName,
      website: el.website,
      location: null, // No location in employer_leads table
      source_table: 'employer_leads',
    });
  });

  if (employerLeads.length > 0) {
    console.log('\nSample (first 5):');
    employerLeads.slice(0, 5).forEach((el, i) => {
      console.log(`  ${i + 1}. ${el.companyName} | ${el.website || 'No website'}`);
    });
  }

  // 5. FROM user_profiles table
  console.log('\n\n📊 Table 5: user_profiles');
  console.log('-'.repeat(80));
  const userProfiles = await prisma.userProfile.findMany({
    where: {
      company: { not: null },
    },
    select: {
      company: true,
    },
    distinct: ['company'],
  });

  console.log(`Found ${userProfiles.length} distinct companies from user profiles`);
  userProfiles.forEach((up) => {
    if (up.company) {
      allCompanyData.push({
        company_name: up.company,
        website: null, // No website in user_profiles table
        location: null, // No location in user_profiles table
        source_table: 'user_profiles',
      });
    }
  });

  if (userProfiles.length > 0) {
    console.log('\nSample (first 5):');
    userProfiles.slice(0, 5).forEach((up, i) => {
      console.log(`  ${i + 1}. ${up.company}`);
    });
  }

  // Summary
  console.log('\n\n' + '='.repeat(80));
  console.log('📈 SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total records collected: ${allCompanyData.length}`);
  console.log(`  - From companies: ${companies.length}`);
  console.log(`  - From jobs: ${jobs.length}`);
  console.log(`  - From employer_jobs: ${employerJobs.length}`);
  console.log(`  - From employer_leads: ${employerLeads.length}`);
  console.log(`  - From user_profiles: ${userProfiles.length}`);

  // Get unique company names
  const uniqueCompanyNames = new Set(allCompanyData.map((c) => c.company_name.toLowerCase()));
  console.log(`\nUnique company names (case-insensitive): ${uniqueCompanyNames.size}`);

  // Count records with website
  const withWebsite = allCompanyData.filter((c) => c.website).length;
  console.log(`Records with website: ${withWebsite} (${((withWebsite / allCompanyData.length) * 100).toFixed(1)}%)`);

  // Count records with location
  const withLocation = allCompanyData.filter((c) => c.location).length;
  console.log(`Records with location: ${withLocation} (${((withLocation / allCompanyData.length) * 100).toFixed(1)}%)`);

  // Export to JSON
  console.log('\n\n💾 Exporting data to company-data.json...');
  const fs = require('fs');
  fs.writeFileSync('company-data.json', JSON.stringify(allCompanyData, null, 2));
  console.log('✅ Exported successfully!');

  // Create a CSV version
  console.log('\n💾 Exporting data to company-data.csv...');
  const csvHeader = 'company_name,website,location,source_table\n';
  const csvRows = allCompanyData.map((c) => {
    const name = `"${c.company_name.replace(/"/g, '""')}"`;
    const website = c.website ? `"${c.website.replace(/"/g, '""')}"` : '';
    const location = c.location ? `"${c.location.replace(/"/g, '""')}"` : '';
    return `${name},${website},${location},${c.source_table}`;
  });
  const csv = csvHeader + csvRows.join('\n');
  fs.writeFileSync('company-data.csv', csv);
  console.log('✅ Exported successfully!');

  // Create a deduplicated version (by company name)
  console.log('\n💾 Creating deduplicated version...');
  const deduped = new Map<string, CompanyData>();
  
  // Priority order: companies > employer_jobs > employer_leads > jobs > user_profiles
  const priorityOrder = ['companies', 'employer_jobs', 'employer_leads', 'jobs', 'user_profiles'];
  
  allCompanyData
    .sort((a, b) => {
      return priorityOrder.indexOf(a.source_table) - priorityOrder.indexOf(b.source_table);
    })
    .forEach((c) => {
      const key = c.company_name.toLowerCase();
      if (!deduped.has(key)) {
        deduped.set(key, c);
      } else {
        // Merge data: if existing record lacks website/location, update from new record
        const existing = deduped.get(key)!;
        if (!existing.website && c.website) {
          existing.website = c.website;
        }
        if (!existing.location && c.location) {
          existing.location = c.location;
        }
      }
    });

  const dedupedArray = Array.from(deduped.values());
  fs.writeFileSync('company-data-unique.json', JSON.stringify(dedupedArray, null, 2));
  
  const dedupedCsv = csvHeader + dedupedArray.map((c) => {
    const name = `"${c.company_name.replace(/"/g, '""')}"`;
    const website = c.website ? `"${c.website.replace(/"/g, '""')}"` : '';
    const location = c.location ? `"${c.location.replace(/"/g, '""')}"` : '';
    return `${name},${website},${location},${c.source_table}`;
  }).join('\n');
  fs.writeFileSync('company-data-unique.csv', dedupedCsv);
  
  console.log(`✅ Deduplicated data: ${dedupedArray.length} unique companies`);
  console.log(`   - With website: ${dedupedArray.filter(c => c.website).length}`);
  console.log(`   - With location: ${dedupedArray.filter(c => c.location).length}`);

  console.log('\n' + '='.repeat(80));
  console.log('✅ Done! Files created:');
  console.log('   - company-data.json (all records)');
  console.log('   - company-data.csv (all records)');
  console.log('   - company-data-unique.json (deduplicated)');
  console.log('   - company-data-unique.csv (deduplicated)');
  console.log('='.repeat(80) + '\n');

  await prisma.$disconnect();
  await pool.end();
}

fetchCompanyData().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});

