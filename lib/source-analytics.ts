import { prisma } from '@/lib/prisma';

export interface SourcePerformance {
  source: string;
  totalJobs: number;
  jobsLast7Days: number;
  jobsLast30Days: number;
  avgQualityScore: number;
  totalViews: number;
  totalApplyClicks: number;
  clickThroughRate: number;
  duplicateRate: number;
  costPerJob: number | null;
}

/**
 * Record ingestion statistics for a source
 */
export async function recordIngestionStats(
  source: string,
  fetched: number,
  added: number,
  duplicates: number
): Promise<void> {
  try {
    // Get today's date at midnight UTC
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Calculate quality score for jobs from this source
    const sourceJobs = await prisma.job.findMany({
      where: {
        sourceProvider: source,
        createdAt: {
          gte: today,
        },
      },
      select: {
        minSalary: true,
        descriptionSummary: true,
        city: true,
        state: true,
      },
    });

    // Calculate quality score (0-1 scale)
    let qualityScore = 0;
    if (sourceJobs.length > 0) {
      const scores = sourceJobs.map((job: { minSalary: number | null; descriptionSummary: string | null; city: string | null; state: string | null }) => {
        let score = 0.5; // Base score
        if (job.minSalary) score += 0.2; // Has salary
        if (job.descriptionSummary && job.descriptionSummary.length > 100) score += 0.1; // Good description
        if (job.city && job.state) score += 0.2; // Complete location
        return score;
      });
      qualityScore = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
    }

    // Upsert SourceStats for today
    await prisma.sourceStats.upsert({
      where: {
        source_date: {
          source,
          date: today,
        },
      },
      create: {
        source,
        date: today,
        jobsFetched: fetched,
        jobsAdded: added,
        jobsDuplicate: duplicates,
        avgQualityScore: qualityScore,
      },
      update: {
        jobsFetched: { increment: fetched },
        jobsAdded: { increment: added },
        jobsDuplicate: { increment: duplicates },
        avgQualityScore: qualityScore,
      },
    });

    console.log(`[Analytics] Recorded stats for ${source}: +${added} jobs, ${duplicates} duplicates, quality: ${qualityScore.toFixed(2)}`);
  } catch (error) {
    console.error(`[Analytics] Error recording stats for ${source}:`, error);
    throw error;
  }
}

/**
 * Get performance metrics for a specific source
 */
export async function getSourcePerformance(
  source: string,
  days: number = 30
): Promise<SourcePerformance> {
  try {
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - days);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Get total jobs from this source
    const totalJobs = await prisma.job.count({
      where: {
        sourceProvider: source,
        isPublished: true,
      },
    });

    // Get jobs from last 7 days
    const jobsLast7Days = await prisma.job.count({
      where: {
        sourceProvider: source,
        isPublished: true,
        createdAt: { gte: sevenDaysAgo },
      },
    });

    // Get jobs from last 30 days
    const jobsLast30Days = await prisma.job.count({
      where: {
        sourceProvider: source,
        isPublished: true,
        createdAt: { gte: daysAgo },
      },
    });

    // Get stats from SourceStats table
    const stats = await prisma.sourceStats.findMany({
      where: {
        source,
        date: { gte: daysAgo },
      },
    });

    // Aggregate stats
    const totalFetched = stats.reduce((sum, s) => sum + s.jobsFetched, 0);
    const totalDuplicates = stats.reduce((sum, s) => sum + s.jobsDuplicate, 0);
    const totalViews = stats.reduce((sum, s) => sum + s.totalViews, 0);
    const totalApplyClicks = stats.reduce((sum, s) => sum + s.totalApplyClicks, 0);

    // Calculate average quality score
    const qualityScores = stats.filter((s) => s.avgQualityScore !== null).map((s) => s.avgQualityScore!);
    const avgQualityScore = qualityScores.length > 0
      ? qualityScores.reduce((a: number, b: number) => a + b, 0) / qualityScores.length
      : 0;

    // Calculate click-through rate
    const clickThroughRate = totalViews > 0 ? totalApplyClicks / totalViews : 0;

    // Calculate duplicate rate
    const duplicateRate = totalFetched > 0 ? totalDuplicates / totalFetched : 0;

    // Cost per job (can be configured per source)
    const costPerJob = null; // TODO: Add cost tracking

    return {
      source,
      totalJobs,
      jobsLast7Days,
      jobsLast30Days,
      avgQualityScore,
      totalViews,
      totalApplyClicks,
      clickThroughRate,
      duplicateRate,
      costPerJob,
    };
  } catch (error) {
    console.error(`[Analytics] Error getting performance for ${source}:`, error);
    throw error;
  }
}

/**
 * Get performance metrics for all sources
 */
export async function getAllSourcesPerformance(): Promise<SourcePerformance[]> {
  try {
    // Get all unique sources from jobs
    const sources = await prisma.job.findMany({
      where: { isPublished: true },
      select: { sourceProvider: true },
      distinct: ['sourceProvider'],
    });

    const uniqueSources = sources
      .map((s: { sourceProvider: string | null }) => s.sourceProvider)
      .filter((s): s is string => s !== null);

    // Get performance for each source
    const performances = await Promise.all(
      uniqueSources.map((source: string) => getSourcePerformance(source))
    );

    // Sort by total jobs descending
    return performances.sort((a, b) => b.totalJobs - a.totalJobs);
  } catch (error) {
    console.error('[Analytics] Error getting all sources performance:', error);
    throw error;
  }
}

/**
 * Update daily stats for all sources (called by cron)
 */
export async function updateDailyStats(): Promise<void> {
  try {
    console.log('[Analytics] Updating daily stats...');

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Get all unique sources
    const sources = await prisma.job.findMany({
      where: { isPublished: true },
      select: { sourceProvider: true },
      distinct: ['sourceProvider'],
    });

    const uniqueSources = sources
      .map((s: { sourceProvider: string | null }) => s.sourceProvider)
      .filter((s): s is string => s !== null);

    for (const source of uniqueSources) {
      try {
        // Count active jobs from this source
        const activeJobs = await prisma.job.count({
          where: {
            sourceProvider: source,
            isPublished: true,
          },
        });

        // Get jobs from this source
        const jobsData = await prisma.job.findMany({
          where: {
            sourceProvider: source,
            isPublished: true,
          },
          select: {
            minSalary: true,
            descriptionSummary: true,
            city: true,
            state: true,
            viewCount: true,
            applyClickCount: true,
          },
        });

        // Calculate quality score
        const qualityScores = jobsData.map((job: { minSalary: number | null; descriptionSummary: string | null; city: string | null; state: string | null; viewCount: number; applyClickCount: number }) => {
          let score = 0.5; // Base score
          if (job.minSalary) score += 0.2; // Has salary
          if (job.descriptionSummary && job.descriptionSummary.length > 100) score += 0.1;
          if (job.city && job.state) score += 0.2;
          return score;
        });

        const avgQualityScore = qualityScores.length > 0
          ? qualityScores.reduce((a: number, b: number) => a + b, 0) / qualityScores.length
          : 0;

        // Sum views and clicks
        const totalViews = jobsData.reduce((sum: number, j: { viewCount: number; applyClickCount: number }) => sum + j.viewCount, 0);
        const totalApplyClicks = jobsData.reduce((sum: number, j: { viewCount: number; applyClickCount: number }) => sum + j.applyClickCount, 0);

        // Update or create today's stats
        await prisma.sourceStats.upsert({
          where: {
            source_date: {
              source,
              date: today,
            },
          },
          create: {
            source,
            date: today,
            avgQualityScore,
            totalViews,
            totalApplyClicks,
          },
          update: {
            avgQualityScore,
            totalViews,
            totalApplyClicks,
          },
        });

        console.log(`[Analytics] Updated stats for ${source}: ${activeJobs} jobs, quality ${avgQualityScore.toFixed(2)}`);
      } catch (error) {
        console.error(`[Analytics] Error updating stats for ${source}:`, error);
      }
    }

    console.log('[Analytics] Daily stats update complete');
  } catch (error) {
    console.error('[Analytics] Error in updateDailyStats:', error);
    throw error;
  }
}

/**
 * Get source trends over time for charts
 */
export async function getSourceTrends(
  source: string,
  days: number = 30
): Promise<{ date: string; added: number; duplicates: number }[]> {
  try {
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - days);

    const stats = await prisma.sourceStats.findMany({
      where: {
        source,
        date: { gte: daysAgo },
      },
      orderBy: { date: 'asc' },
      select: {
        date: true,
        jobsAdded: true,
        jobsDuplicate: true,
      },
    });

    return stats.map((s: { date: Date; jobsAdded: number; jobsDuplicate: number }) => ({
      date: s.date.toISOString().split('T')[0], // Format as YYYY-MM-DD
      added: s.jobsAdded,
      duplicates: s.jobsDuplicate,
    }));
  } catch (error) {
    console.error(`[Analytics] Error getting trends for ${source}:`, error);
    throw error;
  }
}

/**
 * Calculate quality score for a job
 */
export function calculateJobQualityScore(job: {
  minSalary?: number | null;
  descriptionSummary?: string | null;
  city?: string | null;
  state?: string | null;
}): number {
  let score = 0.5; // Base score

  // Has salary information
  if (job.minSalary) {
    score += 0.2;
  }

  // Has good description
  if (job.descriptionSummary && job.descriptionSummary.length > 100) {
    score += 0.1;
  }

  // Has complete location data
  if (job.city && job.state) {
    score += 0.2;
  }

  return score;
}

