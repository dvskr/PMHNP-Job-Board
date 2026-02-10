import { prisma } from '@/lib/prisma';
import StatsCounter from '@/components/StatsCounter';

/**
 * StatsSection Component (Server Component)
 *
 * Queries the database directly server-side and passes
 * results to the animated StatsCounter client component.
 */
export default async function StatsSection() {
  let totalJobs = 0;
  let totalCompanies = 0;
  let newJobsCount = 0;
  let newJobsLabel = 'NEW TODAY';
  let statesCovered = 50;

  try {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [jobCount, companyGroups, newToday, newWeek, stateGroups] = await Promise.all([
      prisma.job.count({ where: { isPublished: true } }),
      prisma.job.groupBy({
        by: ['employer'],
        where: { isPublished: true },
      }),
      prisma.job.count({
        where: { isPublished: true, createdAt: { gte: oneDayAgo } },
      }),
      prisma.job.count({
        where: { isPublished: true, createdAt: { gte: oneWeekAgo } },
      }),
      prisma.job.groupBy({
        by: ['state'],
        where: { isPublished: true, state: { not: null } },
      }),
    ]);

    totalJobs = jobCount;
    totalCompanies = companyGroups.length;
    statesCovered = stateGroups.length || 50;

    if (newToday > 0) {
      newJobsCount = newToday;
      newJobsLabel = 'NEW TODAY';
    } else {
      newJobsCount = newWeek;
      newJobsLabel = 'NEW THIS WEEK';
    }
  } catch (error) {
    console.error('Error fetching stats:', error);
  }

  return (
    <StatsCounter
      totalJobs={totalJobs}
      totalCompanies={totalCompanies}
      newJobsCount={newJobsCount}
      newJobsLabel={newJobsLabel}
      statesCovered={statesCovered}
    />
  );
}
