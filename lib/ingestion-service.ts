import { prisma } from './prisma';
import { fetchAdzunaJobs } from './aggregators/adzuna';
import { fetchUSAJobs } from './aggregators/usajobs';
import { fetchGreenhouseJobs } from './aggregators/greenhouse';
import { fetchLeverJobs } from './aggregators/lever';
import { fetchJoobleJobs } from './aggregators/jooble';
import { fetchJSearchJobs } from './aggregators/jsearch';
import { fetchAshbyJobs } from './aggregators/ashby';
import { fetchWorkdayJobs } from './aggregators/workday';
import { fetchAtsJobsDbJobs } from './aggregators/ats-jobs-db';
import { normalizeJob } from './job-normalizer';
import { checkDuplicate } from './deduplicator';
import { parseJobLocation } from './location-parser';
import { linkJobToCompany } from './company-normalizer';
import { recordIngestionStats } from './source-analytics';
import { isRelevantJob } from './utils/job-filter';
import { collectEmployerEmails } from './employer-email-collector';
import { pingAllSearchEnginesBatch } from './search-indexing';

export type JobSource = 'adzuna' | 'usajobs' | 'greenhouse' | 'lever' | 'jooble' | 'jsearch' | 'ashby' | 'workday' | 'ats-jobs-db';

/** Single source of truth — add new sources here and they'll auto-register everywhere */
export const ALL_SOURCES: JobSource[] = ['adzuna', 'usajobs', 'greenhouse', 'lever', 'jooble', 'jsearch', 'ashby', 'workday', 'ats-jobs-db'];

export interface IngestionResult {
  source: JobSource;
  fetched: number;
  added: number;
  duplicates: number;
  errors: number;
  duration: number;
  newJobUrls: string[];
}

/**
 * Fetch raw jobs from a specific source
 */
async function fetchFromSource(source: JobSource, options?: { chunk?: number }): Promise<Array<Record<string, unknown>>> {
  switch (source) {
    case 'adzuna':
      return await fetchAdzunaJobs();
    case 'usajobs':
      return await fetchUSAJobs() as unknown as Array<Record<string, unknown>>;
    case 'greenhouse':
      return await fetchGreenhouseJobs() as unknown as Array<Record<string, unknown>>;
    case 'lever':
      return await fetchLeverJobs() as unknown as Array<Record<string, unknown>>;
    case 'jooble':
      return await fetchJoobleJobs();
    case 'jsearch':
      return await fetchJSearchJobs({ chunk: options?.chunk });
    case 'ashby':
      return await fetchAshbyJobs() as unknown as Array<Record<string, unknown>>;
    case 'workday':
      return await fetchWorkdayJobs() as unknown as Array<Record<string, unknown>>;
    case 'ats-jobs-db':
      return await fetchAtsJobsDbJobs() as unknown as Array<Record<string, unknown>>;
    default:
      console.warn(`[Ingestion] Unknown source: ${source}`);
      return [];
  }
}

/**
 * Ingest jobs from a single source
 */
async function ingestFromSource(source: JobSource, options?: { chunk?: number }): Promise<IngestionResult> {
  const startTime = Date.now();
  let fetched = 0;
  let added = 0;
  let duplicates = 0; // "Renewed" jobs are counted as duplicates for now to maintain stats semantics
  let errors = 0;
  const newJobUrls: string[] = [];

  try {
    console.log(`\n[${source.toUpperCase()}] Starting ingestion...`);

    // Fetch raw jobs from source
    const rawJobs = await fetchFromSource(source, options);
    fetched = rawJobs.length;

    console.log(`[${source.toUpperCase()}] Fetched ${fetched} jobs`);

    if (fetched === 0) {
      return { source, fetched, added, duplicates, errors, duration: Date.now() - startTime, newJobUrls };
    }

    // Optimized: Load all existing externalIds for this source once
    // Map ExternalID -> InternalID for fast lookup and renewal
    const existingJobsMap = new Map<string, string>();
    const existingJobs = await prisma.job.findMany({
      where: { sourceProvider: source },
      select: { id: true, externalId: true },
    });

    existingJobs.forEach(job => {
      if (job.externalId) {
        existingJobsMap.set(job.externalId, job.id);
      }
    });

    // Helper to renew a job (Auto-Renewal)
    const renewJob = async (id: string, title: string, originalDate?: Date | null) => {
      try {
        await prisma.job.update({
          where: { id },
          data: {
            expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // Extend 60 days
            isPublished: true, // Revive if expired
            updatedAt: new Date(), // Mark as active/fresh
            ...(originalDate ? { originalPostedAt: originalDate } : {}),
          }
        });
        // console.log(`[${source.toUpperCase()}] Auto-Renewed job: ${title}`);
      } catch (e) {
        console.error(`[${source.toUpperCase()}] Failed to renew job ${id}:`, e);
      }
    };

    // Process each job
    for (let i = 0; i < rawJobs.length; i++) {
      const rawJob = rawJobs[i];

      try {
        // Normalize the job
        const normalizedJob = normalizeJob(rawJob, source);

        if (!normalizedJob) {
          // If normalizer returns null, it was either an error OR a filtered/stale job
          // Normalizer already logs skips (stale/missing fields)
          continue;
        }

        // Apply Strict Relevance Filter to Aggregator Sources
        // We skip this for employer postings (sourceProvider: null) to avoid false negatives on paid roles
        if (source !== null && !isRelevantJob(normalizedJob.title, normalizedJob.description)) {
          // console.log(`[${source.toUpperCase()}] Skipping irrelevant job: ${normalizedJob.title}`);
          continue;
        }

        // Strategy 1: Fast in-memory lookup for exact externalId match
        if (normalizedJob.externalId && existingJobsMap.has(normalizedJob.externalId)) {
          // AUTO-RENEWAL: Job exists, so we extend its life instead of ignoring it
          const existingId = existingJobsMap.get(normalizedJob.externalId)!;
          await renewJob(existingId, normalizedJob.title, normalizedJob.originalPostedAt);

          duplicates++; // Count as duplicate (it IS a duplicate, just renewed)
          continue;
        }

        // Strategy 2: Fuzzy matching (only if not found by ID)
        const dupCheck = await checkDuplicate({
          title: normalizedJob.title,
          employer: normalizedJob.employer,
          location: normalizedJob.location,
          externalId: normalizedJob.externalId ?? undefined,
          sourceProvider: normalizedJob.sourceProvider ?? undefined,
          applyLink: normalizedJob.applyLink,
        });

        if (dupCheck.isDuplicate) {
          // AUTO-RENEWAL: Fuzzy match found, renew the matched job
          if (dupCheck.matchedJobId) {
            await renewJob(dupCheck.matchedJobId, normalizedJob.title, normalizedJob.originalPostedAt);
          }

          duplicates++;
          continue;
        }

        // Insert the job
        const savedJob = await prisma.job.create({
          data: normalizedJob as any,
        });
        added++;

        // Generate and update slug
        const slug = `${normalizedJob.title
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .trim()}-${savedJob.id}`;

        await prisma.job.update({
          where: { id: savedJob.id },
          data: { slug },
        });

        // Collect URL for batch indexing
        newJobUrls.push(`https://pmhnphiring.com/jobs/${slug}`);

        // Parse location
        try {
          await parseJobLocation(savedJob.id);
        } catch (locationError) {
          console.error(`Failed to parse location for job ${savedJob.id}:`, locationError);
        }

        // Link to company
        try {
          await linkJobToCompany(savedJob.id);
        } catch (companyError) {
          console.error(`Failed to link company for job ${savedJob.id}:`, companyError);
        }

        // Log progress every 10 jobs
        if ((i + 1) % 10 === 0) {
          console.log(`[${source.toUpperCase()}] Processed ${i + 1}/${fetched} jobs (${added} added, ${duplicates} renewed/dup, ${errors} errors)`);
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

    return { source, fetched, added, duplicates, errors, duration, newJobUrls };

  } catch (error) {
    console.error(`[${source.toUpperCase()}] Fatal error during ingestion:`, error);
    const duration = Date.now() - startTime;
    return { source, fetched, added, duplicates, errors: fetched, duration, newJobUrls: [] };
  }
}

/**
 * Main ingestion function - processes multiple sources
 */
export async function ingestJobs(
  sources: JobSource[] = ALL_SOURCES,
  options?: { chunk?: number }
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
    const result = await ingestFromSource(source, source === 'jsearch' ? options : undefined);
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

  // Auto-collect employer emails into leads
  try {
    const emailResult = await collectEmployerEmails();
    console.log(`[Employer Emails] Auto-collected: ${emailResult.created} new, ${emailResult.updated} updated`);
  } catch (emailError) {
    console.error('[Employer Emails] Failed to collect:', emailError);
  }

  // Ping search engines for all newly added jobs
  const allNewUrls = results.flatMap(r => r.newJobUrls);
  if (allNewUrls.length > 0) {
    console.log(`\n[Indexing] Submitting ${allNewUrls.length} new job URLs to search engines...`);
    try {
      const indexResults = await pingAllSearchEnginesBatch(allNewUrls);
      const googleOk = indexResults.google.filter(r => r.success).length;
      const bingOk = indexResults.bing.filter(r => r.success).length;
      const indexNowOk = indexResults.indexNow.filter(r => r.success).length;
      console.log(`[Indexing] Results: Google ${googleOk}/${Math.min(allNewUrls.length, 200)}, Bing ${bingOk}/${allNewUrls.length}, IndexNow ${indexNowOk}/${allNewUrls.length}`);
    } catch (indexError) {
      console.error('[Indexing] Failed to ping search engines:', indexError);
    }
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
