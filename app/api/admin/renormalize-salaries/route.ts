/**
 * API Route: Re-Normalize Salary Data
 * 
 * This endpoint re-processes all existing jobs to apply the updated
 * salary normalization logic.
 * 
 * Usage: GET /api/admin/renormalize-salaries?secret=YOUR_CRON_SECRET
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizeSalary } from '@/lib/salary-normalizer';
import { logger } from '@/lib/logger';

export const maxDuration = 300; // 5 minutes timeout

interface Stats {
  total: number;
  hadRawSalary: number;
  previouslyNormalized: number;
  newlyNormalized: number;
  updated: number;
  errors: number;
}

interface SourceBreakdown {
  [source: string]: {
    total: number;
    before: number;
    after: number;
  };
}

export async function GET(request: NextRequest) {
  try {
    // Verify secret
    const secret = request.nextUrl.searchParams.get('secret');
    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const stats: Stats = {
      total: 0,
      hadRawSalary: 0,
      previouslyNormalized: 0,
      newlyNormalized: 0,
      updated: 0,
      errors: 0,
    };

    const sourceBreakdown: SourceBreakdown = {};
    const newlyNormalizedJobs: Array<{
      id: string;
      title: string;
      source: string;
      rawMin: number | null;
      rawMax: number | null;
      rawPeriod: string | null;
      normalizedMin: number | null;
      normalizedMax: number | null;
    }> = [];

    logger.info('[Renormalize] Starting salary re-normalization...');

    // Fetch all published jobs
    const jobs = await prisma.job.findMany({
      where: { isPublished: true },
      select: {
        id: true,
        title: true,
        employer: true,
        sourceProvider: true,
        minSalary: true,
        maxSalary: true,
        salaryPeriod: true,
        salaryRange: true,
        normalizedMinSalary: true,
        normalizedMaxSalary: true,
      },
    });

    stats.total = jobs.length;
    logger.info(`[Renormalize] Found ${jobs.length} published jobs`);

    // Initialize source breakdown
    for (const job of jobs) {
      const source = job.sourceProvider || 'unknown';
      if (!sourceBreakdown[source]) {
        sourceBreakdown[source] = { total: 0, before: 0, after: 0 };
      }
      sourceBreakdown[source].total++;

      if (job.normalizedMinSalary || job.normalizedMaxSalary) {
        sourceBreakdown[source].before++;
        stats.previouslyNormalized++;
      }
    }

    // Process jobs in batches
    const BATCH_SIZE = 50;
    for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
      const batch = jobs.slice(i, i + BATCH_SIZE);
      logger.debug(`[Renormalize] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(jobs.length / BATCH_SIZE)}`);

      for (const job of batch) {
        try {
          const hadBefore = job.normalizedMinSalary !== null || job.normalizedMaxSalary !== null;

          // Track if job has raw salary data
          if (job.minSalary || job.maxSalary) {
            stats.hadRawSalary++;
          }

          // Skip if no raw salary data
          if (!job.minSalary && !job.maxSalary) {
            continue;
          }

          // Re-normalize using updated logic
          const normalized = normalizeSalary({
            salaryRange: job.salaryRange,
            minSalary: job.minSalary,
            maxSalary: job.maxSalary,
            salaryPeriod: job.salaryPeriod,
            title: job.title,
          });

          // Check if normalization produced results
          const hasNow = normalized.normalizedMinSalary !== null || normalized.normalizedMaxSalary !== null;

          if (hasNow) {
            // Update the job in database
            await prisma.job.update({
              where: { id: job.id },
              data: {
                normalizedMinSalary: normalized.normalizedMinSalary,
                normalizedMaxSalary: normalized.normalizedMaxSalary,
                salaryConfidence: normalized.salaryConfidence,
                salaryIsEstimated: normalized.salaryIsEstimated,
              },
            });

            stats.updated++;

            // Track source-level stats
            const source = job.sourceProvider || 'unknown';
            if (sourceBreakdown[source]) {
              sourceBreakdown[source].after++;
            }

            // Check if this is a NEW normalization (previously failed, now succeeds)
            if (!hadBefore && hasNow) {
              stats.newlyNormalized++;
              newlyNormalizedJobs.push({
                id: job.id,
                title: job.title,
                source: job.sourceProvider || 'unknown',
                rawMin: job.minSalary,
                rawMax: job.maxSalary,
                rawPeriod: job.salaryPeriod,
                normalizedMin: normalized.normalizedMinSalary,
                normalizedMax: normalized.normalizedMaxSalary,
              });

              logger.info(`[Renormalize] NEW: ${job.title} | ${job.sourceProvider} | $${job.minSalary}-${job.maxSalary} ${job.salaryPeriod} → $${normalized.normalizedMinSalary}-${normalized.normalizedMaxSalary}`);
            }
          }
        } catch (error) {
          stats.errors++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.error(`[Renormalize] Error processing job ${job.id}`, errorMessage);
        }
      }
    }

    // Calculate final stats
    const finalNormalized = Object.values(sourceBreakdown).reduce((sum: number, s: { total: number; before: number; after: number }) => sum + s.after, 0);

    console.log('[Renormalize] Complete!');
    console.log(`[Renormalize] Updated: ${stats.updated}, New: ${stats.newlyNormalized}, Errors: ${stats.errors}`);

    return NextResponse.json({
      success: true,
      message: 'Salary re-normalization complete',
      stats: {
        ...stats,
        beforeNormalized: stats.previouslyNormalized,
        afterNormalized: finalNormalized,
        improvement: finalNormalized - stats.previouslyNormalized,
      },
      sourceBreakdown,
      newlyNormalizedJobs: newlyNormalizedJobs.slice(0, 20), // First 20 for brevity
      newlyNormalizedCount: newlyNormalizedJobs.length,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Renormalize] Fatal error', error);
    return NextResponse.json(
      { error: 'Internal server error', message: errorMessage },
      { status: 500 }
    );
  }
}

