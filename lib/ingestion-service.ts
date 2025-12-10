import { prisma } from '@/lib/prisma';
import { fetchAdzunaJobs } from '@/lib/aggregators/adzuna';
import { fetchUSAJobs } from '@/lib/aggregators/usajobs';
import { fetchGreenhouseJobs } from '@/lib/aggregators/greenhouse';
import { fetchLeverJobs } from '@/lib/aggregators/lever';
import { fetchJoobleJobs } from './aggregators/jooble';
import { fetchCareerJetJobs } from './aggregators/careerjet';
import { normalizeJob } from '@/lib/job-normalizer';
import { checkDuplicate } from '@/lib/deduplicator';

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
    case 'jooble':
      rawJobs = await fetchJoobleJobs();
      break;
    case 'careerjet':
      rawJobs = await fetchCareerJetJobs();
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

      // Check for duplicates using multi-strategy deduplication
      const dupCheck = await checkDuplicate({
        title: normalizedJob.title,
        employer: normalizedJob.employer,
        location: normalizedJob.location,
        externalId: normalizedJob.externalId,
        sourceProvider: normalizedJob.sourceProvider,
        applyLink: normalizedJob.applyLink,
      });
      
      if (dupCheck.isDuplicate) {
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

  // Calculate and log duplicate rate
  const duplicateRate = result.total > 0 
    ? ((result.skipped / result.total) * 100).toFixed(1) 
    : '0.0';
  
  console.log(`Ingestion complete for ${source}:`, result);
  console.log(`Duplicate Rate: ${duplicateRate}%`);
  
  return result;
}

