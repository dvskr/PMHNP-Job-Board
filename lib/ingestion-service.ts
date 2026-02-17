import { prisma } from './prisma';
import { fetchAdzunaJobs } from './aggregators/adzuna';
import { fetchUSAJobs } from './aggregators/usajobs';
import { fetchGreenhouseJobs, GREENHOUSE_TOTAL_CHUNKS } from './aggregators/greenhouse';
import { fetchLeverJobs } from './aggregators/lever';
import { fetchJoobleJobs } from './aggregators/jooble';
import { fetchJSearchJobs } from './aggregators/jsearch';
import { fetchAshbyJobs } from './aggregators/ashby';
import { fetchWorkdayJobs } from './aggregators/workday';
import { fetchAtsJobsDbJobs } from './aggregators/ats-jobs-db';
import { fetchBambooHRJobs } from './aggregators/bamboohr';
import { normalizeJob } from './job-normalizer';
import { checkDuplicate } from './deduplicator';
import { parseJobLocation } from './location-parser';
import { linkJobToCompany } from './company-normalizer';
import { recordIngestionStats } from './source-analytics';
import { isRelevantJob } from './utils/job-filter';
import { collectEmployerEmails } from './employer-email-collector';
import { pingAllSearchEnginesBatch } from './search-indexing';
import { computeQualityScore } from './utils/quality-score';

export type JobSource = 'adzuna' | 'usajobs' | 'greenhouse' | 'lever' | 'jooble' | 'jsearch' | 'ashby' | 'workday' | 'ats-jobs-db' | 'bamboohr';

/** Single source of truth — add new sources here and they'll auto-register everywhere */
export const ALL_SOURCES: JobSource[] = ['adzuna', 'usajobs', 'greenhouse', 'lever', 'jooble', 'jsearch', 'ashby', 'workday', 'ats-jobs-db', 'bamboohr'];

export interface IngestionResult {
  source: JobSource;
  fetched: number;
  added: number;
  duplicates: number;
  errors: number;
  duration: number;
  newJobUrls: string[];
  newJobIds: string[];
}

// Max time budget per cron invocation — stop gracefully before Vercel's 300s hard limit
const MAX_INGESTION_MS = 240_000; // 240s (leave 60s buffer for post-processing)

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
      return await fetchGreenhouseJobs({ chunk: options?.chunk }) as unknown as Array<Record<string, unknown>>;
    case 'lever':
      return await fetchLeverJobs() as unknown as Array<Record<string, unknown>>;
    case 'jooble':
      return await fetchJoobleJobs();
    case 'jsearch':
      return await fetchJSearchJobs({ chunk: options?.chunk });
    case 'ashby':
      return await fetchAshbyJobs() as unknown as Array<Record<string, unknown>>;
    case 'workday':
      return await fetchWorkdayJobs({ chunk: options?.chunk }) as unknown as Array<Record<string, unknown>>;
    case 'ats-jobs-db':
      return await fetchAtsJobsDbJobs() as unknown as Array<Record<string, unknown>>;
    case 'bamboohr':
      return await fetchBambooHRJobs() as unknown as Array<Record<string, unknown>>;
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
  const newJobIds: string[] = [];

  try {
    console.log(`\n[${source.toUpperCase()}] Starting ingestion...`);

    // Fetch raw jobs from source
    const rawJobs = await fetchFromSource(source, options);
    fetched = rawJobs.length;

    console.log(`[${source.toUpperCase()}] Fetched ${fetched} jobs`);

    if (fetched === 0) {
      return { source, fetched, added, duplicates, errors, duration: Date.now() - startTime, newJobUrls, newJobIds };
    }

    // Optimized: Load all existing externalIds for this source once
    // Map ExternalID -> { id, originalPostedAt } for fast lookup, renewal, and age-cap
    const existingJobsMap = new Map<string, { id: string; originalPostedAt: Date | null }>();
    const existingJobs = await prisma.job.findMany({
      where: { sourceProvider: source },
      select: { id: true, externalId: true, originalPostedAt: true },
    });

    existingJobs.forEach(job => {
      if (job.externalId) {
        existingJobsMap.set(job.externalId, { id: job.id, originalPostedAt: job.originalPostedAt });
      }
    });

    const MAX_JOB_AGE_MS = 120 * 24 * 60 * 60 * 1000; // 120-day lifetime cap
    const RENEWAL_EXTENSION_MS = 30 * 24 * 60 * 60 * 1000; // 30-day renewal window
    let expiredByAge = 0;

    // Helper to renew a job (Auto-Renewal) — with max-age cap
    const renewJob = async (id: string, title: string, existingPostedAt?: Date | null) => {
      try {
        // Enforce max-age cap: if originalPostedAt > 120 days ago, unpublish instead
        if (existingPostedAt) {
          const ageMs = Date.now() - new Date(existingPostedAt).getTime();
          if (ageMs > MAX_JOB_AGE_MS) {
            await prisma.job.update({
              where: { id },
              data: { isPublished: false },
            });
            expiredByAge++;
            return;
          }
        }

        await prisma.job.update({
          where: { id },
          data: {
            expiresAt: new Date(Date.now() + RENEWAL_EXTENSION_MS),
            isPublished: true,
            updatedAt: new Date(),
            // NOTE: Never overwrite originalPostedAt — first ingestion date is truth
          }
        });
      } catch (e) {
        console.error(`[${source.toUpperCase()}] Failed to renew job ${id}:`, e);
      }
    };

    // Process each job — with time budget
    let stoppedEarly = false;
    for (let i = 0; i < rawJobs.length; i++) {
      // Check time budget — stop before hitting Vercel's 300s limit
      if (Date.now() - startTime > MAX_INGESTION_MS) {
        console.warn(`[${source.toUpperCase()}] ⏰ Time budget exceeded at job ${i + 1}/${rawJobs.length} — stopping gracefully after ${((Date.now() - startTime) / 1000).toFixed(0)}s`);
        stoppedEarly = true;
        break;
      }

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
          const existing = existingJobsMap.get(normalizedJob.externalId)!;
          await renewJob(existing.id, normalizedJob.title, existing.originalPostedAt);

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
            // Look up the existing job's originalPostedAt for age-cap enforcement
            const matchedJob = await prisma.job.findUnique({
              where: { id: dupCheck.matchedJobId },
              select: { originalPostedAt: true },
            });
            await renewJob(dupCheck.matchedJobId, normalizedJob.title, matchedJob?.originalPostedAt);
          }

          duplicates++;
          continue;
        }

        // Insert the job
        const savedJob = await prisma.job.create({
          data: normalizedJob as any,
        });
        added++;
        newJobIds.push(savedJob.id);

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

        // NOTE: Link validation (validateApplyLink) is skipped during ingestion
        // to avoid HTTP timeout overhead. It runs separately via check-dead-links cron.

        // Compute quality score based on final resolved link and job data
        try {
          const currentJob = await prisma.job.findUnique({
            where: { id: savedJob.id },
            select: { applyLink: true, displaySalary: true, normalizedMinSalary: true, normalizedMaxSalary: true, descriptionSummary: true, description: true, city: true, state: true },
          });
          if (currentJob) {
            const qScore = computeQualityScore({
              applyLink: currentJob.applyLink,
              displaySalary: currentJob.displaySalary,
              normalizedMinSalary: currentJob.normalizedMinSalary,
              normalizedMaxSalary: currentJob.normalizedMaxSalary,
              descriptionSummary: currentJob.descriptionSummary,
              description: currentJob.description,
              city: currentJob.city,
              state: currentJob.state,
              isEmployerPosted: false,  // aggregated jobs are never employer-posted
            });
            await prisma.job.update({ where: { id: savedJob.id }, data: { qualityScore: qScore } });
          }
        } catch (qError) {
          // Non-fatal — job remains with default score of 0
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
      expiredByAge,
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

    return { source, fetched, added, duplicates, errors, duration, newJobUrls, newJobIds };

  } catch (error) {
    console.error(`[${source.toUpperCase()}] Fatal error during ingestion:`, error);
    const duration = Date.now() - startTime;
    return { source, fetched, added, duplicates, errors: fetched, duration, newJobUrls: [], newJobIds: [] };
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
    const useChunk = source === 'jsearch' || source === 'workday' || source === 'greenhouse';
    const result = await ingestFromSource(source, useChunk ? options : undefined);
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

    // Recompute quality scores for newly added jobs after description cleaning
    // This ensures scores reflect cleaned descriptions (description quality points)
    const allNewJobIds = results.flatMap(r => r.newJobIds);
    if (allNewJobIds.length > 0) {
      console.log(`[Quality] Recomputing scores for ${allNewJobIds.length} newly added jobs...`);
      let recomputed = 0;
      for (const jobId of allNewJobIds) {
        try {
          const job = await prisma.job.findUnique({
            where: { id: jobId },
            select: { applyLink: true, displaySalary: true, normalizedMinSalary: true, normalizedMaxSalary: true, descriptionSummary: true, description: true, city: true, state: true },
          });
          if (job) {
            const qScore = computeQualityScore({
              applyLink: job.applyLink,
              displaySalary: job.displaySalary,
              normalizedMinSalary: job.normalizedMinSalary,
              normalizedMaxSalary: job.normalizedMaxSalary,
              descriptionSummary: job.descriptionSummary,
              description: job.description,
              city: job.city,
              state: job.state,
              isEmployerPosted: false,
            });
            await prisma.job.update({ where: { id: jobId }, data: { qualityScore: qScore } });
            recomputed++;
          }
        } catch (e) {
          // Non-fatal — keep existing score
        }
      }
      console.log(`[Quality] Recomputed ${recomputed}/${allNewJobIds.length} quality scores`);
    }
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
      console.log(`[Indexing] Results: Google ${googleOk}/${indexResults.google.length}, Bing ${bingOk}/${allNewUrls.length}, IndexNow ${indexNowOk}/${allNewUrls.length}`);
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

    // Sweep 1: Unpublish jobs past their expiresAt date
    const expiredResult = await prisma.job.updateMany({
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

    // Sweep 2: Unpublish jobs older than 120 days (max lifetime cap)
    const maxAgeDate = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
    const agedOutResult = await prisma.job.updateMany({
      where: {
        originalPostedAt: {
          lt: maxAgeDate,
        },
        isPublished: true,
        // Only apply to aggregated jobs, not employer-posted
        sourceProvider: { not: null },
      },
      data: {
        isPublished: false,
      },
    });

    const total = expiredResult.count + agedOutResult.count;
    console.log(`[Cleanup] Cleaned up ${expiredResult.count} expired + ${agedOutResult.count} aged-out (>120d) = ${total} total`);

    return total;
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
