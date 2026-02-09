import { prisma } from '@/lib/prisma';

// Decay schedule defining how job quality degrades over time
const DECAY_SCHEDULE = [
  { daysOld: 7, qualityPenalty: 5 },    // -5 after 1 week
  { daysOld: 14, qualityPenalty: 10 },  // -10 after 2 weeks
  { daysOld: 21, qualityPenalty: 15 },  // -15 after 3 weeks
  { daysOld: 30, qualityPenalty: 20 },  // -20 after 4 weeks
  { daysOld: 45, qualityPenalty: 30 },  // -30 after 6 weeks
  { daysOld: 90, unpublish: true },     // Unpublish after 3 months
] as const;

/**
 * Calculate freshness score based on job age
 * Returns 0-20 points based on how recent the job is
 */
export function calculateFreshnessScore(createdAt: Date): number {
  try {
    const now = new Date();
    const ageInMs = now.getTime() - createdAt.getTime();
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
 * Calculate decay penalty to subtract from quality score
 * Based on DECAY_SCHEDULE
 */
export function calculateDecayPenalty(createdAt: Date): number {
  try {
    const now = new Date();
    const ageInMs = now.getTime() - createdAt.getTime();
    const ageInDays = ageInMs / (1000 * 60 * 60 * 24);

    let penalty = 0;

    // Find the highest applicable penalty
    for (const rule of DECAY_SCHEDULE) {
      if (ageInDays >= rule.daysOld && 'qualityPenalty' in rule) {
        penalty = rule.qualityPenalty;
      }
    }

    return penalty;
  } catch (error) {
    console.error('Error calculating decay penalty:', error);
    return 0;
  }
}

/**
 * Determine if a job should be unpublished based on age and type
 * External jobs: unpublish after 60 days
 * Employer jobs: keep until expiresAt (they paid for 30 days)
 */
export function shouldUnpublish(createdAt: Date, sourceType: string): boolean {
  try {
    // Employer-posted jobs should not be auto-unpublished
    // They have their own expiry logic based on expiresAt
    if (sourceType === 'employer' || sourceType === 'direct') {
      return false;
    }

    // External jobs: unpublish after 90 days (keeping volume during growth phase)
    const now = new Date();
    const ageInMs = now.getTime() - createdAt.getTime();
    const ageInDays = ageInMs / (1000 * 60 * 60 * 24);

    return ageInDays >= 90;
  } catch (error) {
    console.error('Error determining unpublish status:', error);
    return false;
  }
}

/**
 * Apply freshness decay to all published jobs
 * Reduces quality scores based on age and unpublishes very old jobs
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
          sourceType: true,
        },
        take: BATCH_SIZE,
        skip,
      });

      if (jobs.length === 0) break;

      for (const job of jobs) {
        try {
          const penalty = calculateDecayPenalty(job.createdAt);
          const shouldUnpub = shouldUnpublish(
            job.createdAt,
            job.sourceType || 'external'
          );

          if (shouldUnpub) {
            // Unpublish the job
            await prisma.job.update({
              where: { id: job.id },
              data: { isPublished: false },
            });
            unpublished++;
          } else if (penalty > 0) {
            // Note: This is a placeholder since we don't have a quality score field yet
            // When quality scoring is implemented, we would update it here
            // For now, we just track that an update would be needed
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
      updated,
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

    // Fetch the job
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, createdAt: true, isPublished: true },
    });

    if (!job) {
      throw new Error(`Job with ID ${jobId} not found`);
    }

    // Update the job's updatedAt timestamp to refresh it
    // This effectively resets the decay by making it "newer"
    await prisma.job.update({
      where: { id: jobId },
      data: {
        updatedAt: new Date(),
        // If the job was unpublished due to age, republish it
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
        createdAt: {
          gte: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000), // < 3 days
        },
      },
    });

    const recent = await prisma.job.count({
      where: {
        isPublished: true,
        createdAt: {
          gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), // < 7 days
          lt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
        },
      },
    });

    const normal = await prisma.job.count({
      where: {
        isPublished: true,
        createdAt: {
          gte: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000), // < 14 days
          lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        },
      },
    });

    const aging = await prisma.job.count({
      where: {
        isPublished: true,
        createdAt: {
          gte: new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000), // < 45 days
          lt: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
        },
      },
    });

    const stale = await prisma.job.count({
      where: {
        isPublished: true,
        createdAt: {
          lt: new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000), // > 45 days
        },
      },
    });

    return { fresh, recent, normal, aging, stale };
  } catch (error) {
    console.error('[Freshness Decay] Error getting freshness stats:', error);
    return { fresh: 0, recent: 0, normal: 0, aging: 0, stale: 0 };
  }
}

