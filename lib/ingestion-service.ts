import { prisma } from '@/lib/prisma';
import { fetchAdzunaJobs } from '@/lib/aggregators/adzuna';
import { fetchUSAJobs } from '@/lib/aggregators/usajobs';
import { fetchGreenhouseJobs } from '@/lib/aggregators/greenhouse';
import { fetchLeverJobs } from '@/lib/aggregators/lever';
import { fetchJoobleJobs } from './aggregators/jooble';
import { fetchCareerJetJobs } from './aggregators/careerjet';
import { normalizeJob } from '@/lib/job-normalizer';
import { checkDuplicate } from '@/lib/deduplicator';
import { parseJobLocation } from './location-parser';
import { linkJobToCompany } from './company-normalizer';
import { recordIngestionStats } from './source-analytics';

export type JobSource = 'adzuna' | 'usajobs' | 'greenhouse' | 'lever' | 'jooble' | 'careerjet';

export interface IngestionResult {
  source: JobSource;
  fetched: number;
  added: number;
  duplicates: number;
  errors: number;
  duration: number;
}

/**
 * Fetch raw jobs from a specific source
 */
async function fetchFromSource(source: JobSource): Promise<any[]> {
  switch (source) {
    case 'adzuna':
      return await fetchAdzunaJobs();
    case 'usajobs':
      return await fetchUSAJobs();
    case 'greenhouse':
      return await fetchGreenhouseJobs();
    case 'lever':
      return await fetchLeverJobs();
    case 'jooble':
      return await fetchJoobleJobs();
    case 'careerjet':
      return await fetchCareerJetJobs();
    default:
      console.warn(`[Ingestion] Unknown source: ${source}`);
      return [];
  }
}

/**
 * Ingest jobs from a single source
 */
async function ingestFromSource(source: JobSource): Promise<IngestionResult> {
  const startTime = Date.now();
  let fetched = 0;
  let added = 0;
  let duplicates = 0;
  let errors = 0;

  try {
    console.log(`\n[${source.toUpperCase()}] Starting ingestion...`);
    
    // Fetch raw jobs from source
    const rawJobs = await fetchFromSource(source);
    fetched = rawJobs.length;
    
    console.log(`[${source.toUpperCase()}] Fetched ${fetched} jobs`);

    if (fetched === 0) {
      return { source, fetched, added, duplicates, errors, duration: Date.now() - startTime };
    }

    // Process each job
    for (let i = 0; i < rawJobs.length; i++) {
      const rawJob = rawJobs[i];
      
      try {
        // Normalize the job
        const normalizedJob = normalizeJob(rawJob, source);
        
        if (!normalizedJob) {
          errors++;
          continue;
        }

        // Check for duplicates using multi-strategy deduplication
        const dupCheck = await checkDuplicate({
          title: normalizedJob.title,
          employer: normalizedJob.employer,
          location: normalizedJob.location,
          externalId: normalizedJob.externalId ?? undefined,
          sourceProvider: normalizedJob.sourceProvider ?? undefined,
          applyLink: normalizedJob.applyLink,
        });
        
        if (dupCheck.isDuplicate) {
          duplicates++;
          continue;
        }

        // Insert the job
        const createdJob = await prisma.job.create({
          data: normalizedJob,
        });

        // Parse location
        try {
          await parseJobLocation(createdJob.id);
        } catch (locationError) {
          console.error(`Failed to parse location for job ${createdJob.id}:`, locationError);
        }

        // Link to company
        try {
          await linkJobToCompany(createdJob.id);
        } catch (companyError) {
          console.error(`Failed to link company for job ${createdJob.id}:`, companyError);
        }

        added++;
        
        // Log progress every 10 jobs
        if ((i + 1) % 10 === 0) {
          console.log(`[${source.toUpperCase()}] Processed ${i + 1}/${fetched} jobs (${added} added, ${duplicates} duplicates, ${errors} errors)`);
        }
        
      } catch (error) {
        console.error(`[${source.toUpperCase()}] Error processing job:`, error);
        errors++;
      }
    }

    const duration = Date.now() - startTime;
    const duplicateRate = fetched > 0 ? ((duplicates / fetched) * 100).toFixed(1) : '0.0';
    
    console.log(`[${source.toUpperCase()}] Complete:`, {
      fetched,
      added,
      duplicates,
      errors,
      duplicateRate: `${duplicateRate}%`,
      duration: `${(duration / 1000).toFixed(1)}s`
    });

    // Record stats
    try {
      await recordIngestionStats(source, fetched, added, duplicates);
    } catch (statsError) {
      console.error(`Failed to record stats for ${source}:`, statsError);
    }

    return { source, fetched, added, duplicates, errors, duration };

  } catch (error) {
    console.error(`[${source.toUpperCase()}] Fatal error during ingestion:`, error);
    const duration = Date.now() - startTime;
    return { source, fetched, added, duplicates, errors: fetched, duration };
  }
}

/**
 * Main ingestion function - processes multiple sources
 */
export async function ingestJobs(
  sources: JobSource[] = ['adzuna', 'usajobs', 'greenhouse', 'lever', 'jooble']
): Promise<IngestionResult[]> {
  const overallStartTime = Date.now();
  const timestamp = new Date().toISOString();
  
  console.log('\n' + '='.repeat(80));
  console.log(`JOB INGESTION STARTED: ${timestamp}`);
  console.log(`Sources: ${sources.join(', ')}`);
  console.log('='.repeat(80) + '\n');

  const results: IngestionResult[] = [];

  // Process each source sequentially
  for (const source of sources) {
    const result = await ingestFromSource(source);
    results.push(result);
  }

  // Calculate totals
  const totals = results.reduce(
    (acc, r) => ({
      fetched: acc.fetched + r.fetched,
      added: acc.added + r.added,
      duplicates: acc.duplicates + r.duplicates,
      errors: acc.errors + r.errors,
    }),
    { fetched: 0, added: 0, duplicates: 0, errors: 0 }
  );

  const overallDuration = Date.now() - overallStartTime;
  const overallDuplicateRate = totals.fetched > 0 
    ? ((totals.duplicates / totals.fetched) * 100).toFixed(1) 
    : '0.0';

  // Final summary
  console.log('\n' + '='.repeat(80));
  console.log('JOB INGESTION COMPLETE');
  console.log('='.repeat(80));
  console.log('\nTOTALS:');
  console.log(`  Fetched:    ${totals.fetched} jobs`);
  console.log(`  Added:      ${totals.added} jobs (${((totals.added / totals.fetched) * 100).toFixed(1)}%)`);
  console.log(`  Duplicates: ${totals.duplicates} jobs (${overallDuplicateRate}%)`);
  console.log(`  Errors:     ${totals.errors} jobs (${((totals.errors / totals.fetched) * 100).toFixed(1)}%)`);
  console.log(`  Duration:   ${(overallDuration / 1000).toFixed(1)}s`);
  console.log('\nBY SOURCE:');
  results.forEach((r: IngestionResult) => {
    const rate = r.fetched > 0 ? ((r.duplicates / r.fetched) * 100).toFixed(0) : '0';
    console.log(`  ${r.source.padEnd(12)} - ${r.added.toString().padStart(3)} added, ${r.duplicates.toString().padStart(3)} dup (${rate}%), ${r.errors.toString().padStart(2)} err`);
  });
  console.log('='.repeat(80) + '\n');

  // Run post-ingestion cleanup if any jobs were added
  if (totals.added > 0) {
    const { cleanAllJobDescriptions } = await import('./description-cleaner');
    await cleanAllJobDescriptions();
  }

  return results;
}

/**
 * Clean up expired jobs by marking them as unpublished
 */
export async function cleanupExpiredJobs(): Promise<number> {
  try {
    const now = new Date();
    
    const result = await prisma.job.updateMany({
      where: {
        expiresAt: {
          lt: now,
        },
        isPublished: true,
      },
      data: {
        isPublished: false,
      },
    });

    console.log(`[Cleanup] Cleaned up ${result.count} expired jobs`);
    
    return result.count;
  } catch (error) {
    console.error('[Cleanup] Error cleaning up expired jobs:', error);
    return 0;
  }
}

/**
 * Get ingestion statistics
 */
export async function getIngestionStats(): Promise<{
  totalActive: number;
  bySource: Record<string, number>;
  addedLast24h: number;
}> {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    // Get total active jobs
    const totalActive = await prisma.job.count({
      where: {
        isPublished: true,
      },
    });

    // Get jobs by source
    const jobsBySource = await prisma.job.groupBy({
      by: ['sourceProvider'],
      where: {
        isPublished: true,
      },
      _count: true,
    });

    const bySource: Record<string, number> = {};
    jobsBySource.forEach((item: { sourceProvider: string | null; _count: number }) => {
      if (item.sourceProvider) {
        bySource[item.sourceProvider] = item._count;
      }
    });

    // Get jobs added in last 24 hours
    const addedLast24h = await prisma.job.count({
      where: {
        createdAt: {
          gte: yesterday,
        },
        isPublished: true,
      },
    });

    return {
      totalActive,
      bySource,
      addedLast24h,
    };
  } catch (error) {
    console.error('[Stats] Error getting ingestion stats:', error);
    return {
      totalActive: 0,
      bySource: {},
      addedLast24h: 0,
    };
  }
}
