import { prisma } from '@/lib/prisma';
import { Job } from '@prisma/client';

export async function isDuplicate(job: Partial<Job>): Promise<boolean> {
  try {
    const existingJob = await prisma.job.findFirst({
      where: {
        OR: [
          // Check by external ID and source provider
          {
            AND: [
              { externalId: job.externalId || undefined },
              { sourceProvider: job.sourceProvider || undefined },
            ],
          },
          // Check by title, employer, and location combination
          {
            AND: [
              { title: job.title || undefined },
              { employer: job.employer || undefined },
              { location: job.location || undefined },
            ],
          },
        ],
      },
    });

    return existingJob !== null;
  } catch (error) {
    console.error('Error checking for duplicate:', error);
    // Return true to be safe and avoid inserting potential duplicates
    return true;
  }
}

