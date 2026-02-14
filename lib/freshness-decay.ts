import { prisma } from '@/lib/prisma';

/**
 * Calculate freshness score based on the original posted date
 * Returns 0-20 points based on how recent the job is
 * Uses originalPostedAt (real source date) with createdAt as fallback
 */
export function calculateFreshnessScore(originalPostedAt: Date | null, createdAt: Date): number {
  try {
    const referenceDate = originalPostedAt || createdAt;
    const now = new Date();
    const ageInMs = now.getTime() - referenceDate.getTime();
    const ageInDays = ageInMs / (1000 * 60 * 60 * 24);

    if (ageInDays < 3) {
      return 20; // Fresh (< 3 days)
    } else if (ageInDays < 7) {
      return 15; // Recent (< 7 days)
    } else if (ageInDays < 14) {
      return 10; // Normal (< 14 days)
    } else if (ageInDays < 45) {
      return 5;  // Aging (< 45 days)
    } else {
      return 0;  // Stale (> 45 days)
    }
  } catch (error) {
    console.error('Error calculating freshness score:', error);
    return 0;
  }
}

/**
 * Determine if a job should be unpublished based on renewal activity
 * Uses updatedAt (last renewal date) — if a job is still appearing in source
 * APIs (and thus being renewed), it should stay published.
 * 
 * External jobs: unpublish if not renewed/seen for 90 days
 * Employer jobs: keep until expiresAt (they paid for the listing)
 */
export function shouldUnpublish(updatedAt: Date, sourceType: string): boolean {
  try {
    // Employer-posted jobs should not be auto-unpublished
    // They have their own expiry logic based on expiresAt
    if (sourceType === 'employer' || sourceType === 'direct') {
      return false;
    }

    // External jobs: unpublish if not seen/renewed for 90 days
    const now = new Date();
    const daysSinceLastSeen = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);

    return daysSinceLastSeen >= 90;
  } catch (error) {
    console.error('Error determining unpublish status:', error);
    return false;
  }
}

/**
 * Apply freshness decay to all published jobs
 * Unpublishes jobs that haven't been renewed/seen in 90 days
 */
export async function applyFreshnessDecay(): Promise<{
  updated: number;
  unpublished: number;
}> {
  const BATCH_SIZE = 100;
  let updated = 0;
  let unpublished = 0;

  try {
    console.log('[Freshness Decay] Starting decay process...');

    // Get all published jobs
    const totalJobs = await prisma.job.count({
      where: { isPublished: true },
    });

    console.log(`[Freshness Decay] Processing ${totalJobs} published jobs`);

    let skip = 0;
    while (skip < totalJobs) {
      const jobs = await prisma.job.findMany({
        where: { isPublished: true },
        select: {
          id: true,
          createdAt: true,
          updatedAt: true,
          originalPostedAt: true,
          sourceType: true,
        },
        take: BATCH_SIZE,
        skip,
      });

      if (jobs.length === 0) break;

      for (const job of jobs) {
        try {
          // Use updatedAt for unpublish decision — renewed jobs stay alive
          const shouldUnpub = shouldUnpublish(
            job.updatedAt,
            job.sourceType || 'external'
          );

          if (shouldUnpub) {
            await prisma.job.update({
              where: { id: job.id },
              data: { isPublished: false },
            });
            unpublished++;
          } else {
            // Track jobs that have been processed (for stats)
            updated++;
          }
        } catch (error) {
          console.error(`[Freshness Decay] Error processing job ${job.id}:`, error);
        }
      }

      skip += BATCH_SIZE;

      if ((skip % 500) === 0) {
        console.log(`[Freshness Decay] Progress: ${skip}/${totalJobs} jobs processed`);
      }
    }

    console.log('[Freshness Decay] Complete:', {
      processed: updated,
      unpublished,
    });

    return { updated, unpublished };
  } catch (error) {
    console.error('[Freshness Decay] Fatal error during decay process:', error);
    throw error;
  }
}

/**
 * Refresh a job by resetting its decay
 * Used when a job is updated or renewed
 */
export async function refreshJob(jobId: string): Promise<void> {
  try {
    if (!jobId) {
      throw new Error('Job ID is required');
    }

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, isPublished: true },
    });

    if (!job) {
      throw new Error(`Job with ID ${jobId} not found`);
    }

    // Update updatedAt to refresh the job's renewal clock
    await prisma.job.update({
      where: { id: jobId },
      data: {
        updatedAt: new Date(),
        isPublished: true,
      },
    });

    console.log(`[Freshness Decay] Job ${jobId} refreshed successfully`);
  } catch (error) {
    console.error(`[Freshness Decay] Error refreshing job ${jobId}:`, error);
    throw error;
  }
}

/**
 * Get freshness statistics for monitoring
 * Uses originalPostedAt (with createdAt fallback) for categorization
 */
export async function getFreshnessStats(): Promise<{
  fresh: number;
  recent: number;
  normal: number;
  aging: number;
  stale: number;
}> {
  try {
    const now = new Date();

    const fresh = await prisma.job.count({
      where: {
        isPublished: true,
        OR: [
          { originalPostedAt: { gte: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000) } },
          { AND: [{ originalPostedAt: null }, { createdAt: { gte: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000) } }] },
        ],
      },
    });

    const recent = await prisma.job.count({
      where: {
        isPublished: true,
        OR: [
          {
            originalPostedAt: {
              gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
              lt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
            },
          },
          {
            AND: [
              { originalPostedAt: null },
              {
                createdAt: {
                  gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
                  lt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
                },
              },
            ],
          },
        ],
      },
    });

    const normal = await prisma.job.count({
      where: {
        isPublished: true,
        OR: [
          {
            originalPostedAt: {
              gte: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
              lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
            },
          },
          {
            AND: [
              { originalPostedAt: null },
              {
                createdAt: {
                  gte: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
                  lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
                },
              },
            ],
          },
        ],
      },
    });

    const aging = await prisma.job.count({
      where: {
        isPublished: true,
        OR: [
          {
            originalPostedAt: {
              gte: new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000),
              lt: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
            },
          },
          {
            AND: [
              { originalPostedAt: null },
              {
                createdAt: {
                  gte: new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000),
                  lt: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
                },
              },
            ],
          },
        ],
      },
    });

    const stale = await prisma.job.count({
      where: {
        isPublished: true,
        OR: [
          { originalPostedAt: { lt: new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000) } },
          {
            AND: [
              { originalPostedAt: null },
              { createdAt: { lt: new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000) } },
            ],
          },
        ],
      },
    });

    return { fresh, recent, normal, aging, stale };
  } catch (error) {
    console.error('[Freshness Decay] Error getting freshness stats:', error);
    return { fresh: 0, recent: 0, normal: 0, aging: 0, stale: 0 };
  }
}
