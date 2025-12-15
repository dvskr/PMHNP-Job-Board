import { prisma } from '@/lib/prisma';

// Company suffixes to remove during normalization
const SUFFIXES = [
  'inc', 'inc.', 'incorporated', 'llc', 'l.l.c.', 'ltd', 'limited',
  'corp', 'corp.', 'corporation', 'co', 'co.', 'company',
  'health', 'healthcare', 'health care', 'medical', 'medical group',
  'group', 'services', 'solutions', 'partners', 'associates',
  'pllc', 'p.c.', 'pc', 'pa', 'p.a.',
];

// Known companies with their canonical names and aliases
const KNOWN_COMPANIES: Record<string, string[]> = {
  'Talkiatry': ['talkiatry', 'talkiatry inc'],
  'Talkspace': ['talkspace', 'talkspace inc', 'talkspace llc'],
  'SonderMind': ['sondermind', 'sonder mind', 'sondermind inc'],
  'LifeStance Health': ['lifestance', 'lifestance health', 'life stance'],
  'Cerebral': ['cerebral', 'cerebral inc'],
  'Headway': ['headway', 'headway health'],
  'Spring Health': ['spring health', 'springhealth'],
  'Lyra Health': ['lyra health', 'lyrahealth', 'lyra'],
  'Modern Health': ['modern health', 'modernhealth'],
  'Teladoc Health': ['teladoc', 'teladoc health', 'teladochealth'],
  'Brightside Health': ['brightside', 'brightside health'],
  'Department of Veterans Affairs': ['veterans affairs', 'va hospital', 'va health', 'va medical'],
};

/**
 * Normalizes a company name by removing suffixes and special characters
 */
export function normalizeCompanyName(name: string): string {
  if (!name) return '';

  let normalized = name.toLowerCase().trim();

  // Remove suffixes
  for (const suffix of SUFFIXES) {
    const suffixPattern = new RegExp(`\\b${suffix.replace('.', '\\.')}\\b`, 'gi');
    normalized = normalized.replace(suffixPattern, '');
  }

  // Remove special characters except spaces and hyphens
  normalized = normalized.replace(/[^a-z0-9\s-]/g, '');

  // Collapse multiple spaces into one
  normalized = normalized.replace(/\s+/g, ' ');

  // Trim again after all replacements
  normalized = normalized.trim();

  return normalized;
}

/**
 * Finds the canonical name for a given company name from KNOWN_COMPANIES
 */
export function findCanonicalName(name: string): string | null {
  const normalized = normalizeCompanyName(name);

  if (!normalized) return null;

  // Check each canonical company and its aliases
  for (const [canonicalName, aliases] of Object.entries(KNOWN_COMPANIES)) {
    const normalizedAliases = aliases.map(alias => normalizeCompanyName(alias));
    
    if (normalizedAliases.includes(normalized)) {
      return canonicalName;
    }
  }

  return null;
}

/**
 * Gets an existing company or creates a new one
 * Returns the company ID
 */
export async function getOrCreateCompany(employerName: string): Promise<string> {
  try {
    if (!employerName || !employerName.trim()) {
      throw new Error('Employer name is required');
    }

    const normalized = normalizeCompanyName(employerName);
    const canonicalName = findCanonicalName(employerName);
    const finalName = canonicalName || employerName;

    // Try to find existing company by normalized name
    let company = await prisma.company.findUnique({
      where: { normalizedName: normalized },
    });

    if (company) {
      // Increment job count
      company = await prisma.company.update({
        where: { id: company.id },
        data: { jobCount: { increment: 1 } },
      });
      return company.id;
    }

    // Create new company
    const aliases = canonicalName ? KNOWN_COMPANIES[canonicalName] || [] : [];
    
    company = await prisma.company.create({
      data: {
        name: finalName,
        normalizedName: normalized,
        aliases: aliases,
        jobCount: 1,
        isVerified: canonicalName !== null, // Mark as verified if it's a known company
      },
    });

    return company.id;
  } catch (error) {
    console.error('Error in getOrCreateCompany:', error);
    throw error;
  }
}

/**
 * Links a job to its company based on the employer name
 */
export async function linkJobToCompany(jobId: string): Promise<void> {
  try {
    // Fetch the job
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, employer: true, companyId: true },
    });

    if (!job) {
      throw new Error(`Job with ID ${jobId} not found`);
    }

    if (job.companyId) {
      // Job already linked to a company
      return;
    }

    // Get or create company
    const companyId = await getOrCreateCompany(job.employer);

    // Update job with company ID
    await prisma.job.update({
      where: { id: jobId },
      data: { companyId },
    });
  } catch (error) {
    console.error(`Error linking job ${jobId} to company:`, error);
    throw error;
  }
}

/**
 * Links all jobs without a company to their respective companies
 * Processes in batches for better performance
 */
export async function linkAllJobsToCompanies(): Promise<{
  processed: number;
  linked: number;
  companiesCreated: number;
}> {
  const BATCH_SIZE = 100;
  let processed = 0;
  let linked = 0;
  const companiesMap = new Map<string, string>(); // normalized name -> company ID

  try {
    // Get count of jobs without companies
    const totalJobs = await prisma.job.count({
      where: { companyId: null },
    });

    console.log(`Found ${totalJobs} jobs without company links`);

    // Process in batches
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
          
          // Check if we've already processed this company in this batch
          let companyId = companiesMap.get(normalized);
          
          if (!companyId) {
            // Get or create company
            companyId = await getOrCreateCompany(job.employer);
            companiesMap.set(normalized, companyId);
          } else {
            // Just increment the count for existing company
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
      console.log(`Processed ${processed}/${totalJobs} jobs...`);
    }

    const companiesCreated = companiesMap.size;

    console.log(`Completed: ${processed} processed, ${linked} linked, ${companiesCreated} companies created/used`);

    return {
      processed,
      linked,
      companiesCreated,
    };
  } catch (error) {
    console.error('Error in linkAllJobsToCompanies:', error);
    throw error;
  }
}

/**
 * Merges two companies, keeping one and transferring all jobs from the other
 */
export async function mergeCompanies(
  keepId: string,
  mergeId: string
): Promise<void> {
  try {
    if (!keepId || !mergeId) {
      throw new Error('Both keepId and mergeId are required');
    }

    if (keepId === mergeId) {
      throw new Error('Cannot merge a company with itself');
    }

    // Fetch both companies
    const [keepCompany, mergeCompany] = await Promise.all([
      prisma.company.findUnique({ where: { id: keepId } }),
      prisma.company.findUnique({ where: { id: mergeId } }),
    ]);

    if (!keepCompany) {
      throw new Error(`Company with ID ${keepId} not found`);
    }

    if (!mergeCompany) {
      throw new Error(`Company with ID ${mergeId} not found`);
    }

    // Get count of jobs to transfer
    const jobsToTransfer = await prisma.job.count({
      where: { companyId: mergeId },
    });

    // Update all jobs from mergeCompany to keepCompany
    await prisma.job.updateMany({
      where: { companyId: mergeId },
      data: { companyId: keepId },
    });

    // Add merged company name to keepCompany's aliases if not already present
    const updatedAliases = [...new Set([
      ...keepCompany.aliases,
      mergeCompany.name,
      mergeCompany.normalizedName,
      ...mergeCompany.aliases,
    ])];

    // Update keepCompany with new aliases and job count
    await prisma.company.update({
      where: { id: keepId },
      data: {
        aliases: updatedAliases,
        jobCount: keepCompany.jobCount + jobsToTransfer,
      },
    });

    // Delete the merged company
    await prisma.company.delete({
      where: { id: mergeId },
    });

    console.log(
      `Successfully merged company ${mergeCompany.name} (${jobsToTransfer} jobs) into ${keepCompany.name}`
    );
  } catch (error) {
    console.error('Error merging companies:', error);
    throw error;
  }
}

