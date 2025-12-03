import { prisma } from '@/lib/prisma';
import { fetchAdzunaJobs } from '@/lib/aggregators/adzuna';
import { fetchUSAJobs } from '@/lib/aggregators/usajobs';
import { fetchGreenhouseJobs } from '@/lib/aggregators/greenhouse';
import { fetchLeverJobs } from '@/lib/aggregators/lever';
import { normalizeJob } from '@/lib/job-normalizer';
import { isDuplicate } from '@/lib/deduplicator';

interface IngestionResult {
  added: number;
  skipped: number;
  errors: number;
  total: number;
}

export async function ingestJobs(source: string): Promise<IngestionResult> {
  const result: IngestionResult = {
    added: 0,
    skipped: 0,
    errors: 0,
    total: 0,
  };

  let rawJobs: any[] = [];

  // Fetch jobs based on source
  switch (source.toLowerCase()) {
    case 'adzuna':
      rawJobs = await fetchAdzunaJobs();
      break;
    case 'usajobs':
      rawJobs = await fetchUSAJobs();
      break;
    case 'greenhouse':
      rawJobs = await fetchGreenhouseJobs();
      break;
    case 'lever':
      rawJobs = await fetchLeverJobs();
      break;
    default:
      console.warn(`Unknown source: ${source}`);
      return result;
  }

  result.total = rawJobs.length;
  console.log(`Fetched ${rawJobs.length} jobs from ${source}`);

  // Process each job
  for (const rawJob of rawJobs) {
    try {
      // Normalize the job
      const normalizedJob = normalizeJob(rawJob, source);
      
      if (!normalizedJob) {
        result.errors++;
        continue;
      }

      // Check for duplicates
      const duplicate = await isDuplicate(normalizedJob);
      
      if (duplicate) {
        result.skipped++;
        continue;
      }

      // Insert the job
      await prisma.job.create({
        data: normalizedJob,
      });

      result.added++;
    } catch (error) {
      console.error('Error processing job:', error);
      result.errors++;
    }
  }

  console.log(`Ingestion complete for ${source}:`, result);
  return result;
}

