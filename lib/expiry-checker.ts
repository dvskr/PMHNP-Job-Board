import { prisma } from '@/lib/prisma';
import { sendExpiryWarningEmail } from '@/lib/email-service';

interface ExpiryCheckResult {
  checked: number;
  warningsSent: number;
  errors: string[];
}

export async function sendExpiryWarnings(): Promise<ExpiryCheckResult> {
  const result: ExpiryCheckResult = {
    checked: 0,
    warningsSent: 0,
    errors: [],
  };

  try {
    // Calculate date range: now to 5 days from now
    const now = new Date();
    const fiveDaysFromNow = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

    console.log('Checking for jobs expiring between now and:', fiveDaysFromNow);

    // Query for jobs expiring in the next 5 days that are published and haven't been warned
    const employerJobs = await prisma.employerJob.findMany({
      where: {
        expiryWarningSentAt: null, // Haven't sent warning yet
        job: {
          isPublished: true,
          expiresAt: {
            gte: now,
            lte: fiveDaysFromNow,
          },
        },
      },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            expiresAt: true,
            viewCount: true,
            applyClickCount: true,
          },
        },
      },
    });

    result.checked = employerJobs.length;
    console.log(`Found ${result.checked} jobs expiring soon`);

    // Process each employer job
    for (const employerJob of employerJobs) {
      try {
        const { job, contactEmail, dashboardToken, editToken } = employerJob;

        // Validate required data
        if (!job.expiresAt) {
          result.errors.push(`Job ${job.id} has no expiry date`);
          continue;
        }

        // Try to get unsubscribe token from EmailLead
        let unsubscribeToken: string | null = null;
        
        const emailLead = await prisma.emailLead.findUnique({
          where: { email: contactEmail },
          select: { unsubscribeToken: true },
        });

        if (emailLead) {
          unsubscribeToken = emailLead.unsubscribeToken;
        } else {
          // If no EmailLead exists, create one so they can unsubscribe
          const newEmailLead = await prisma.emailLead.create({
            data: {
              email: contactEmail,
              source: 'employer',
              isSubscribed: true,
            },
            select: { unsubscribeToken: true },
          });
          unsubscribeToken = newEmailLead.unsubscribeToken;
        }

        // Send the expiry warning email
        const emailResult = await sendExpiryWarningEmail(
          contactEmail,
          job.title,
          job.expiresAt,
          job.viewCount,
          job.applyClickCount,
          dashboardToken,
          editToken,
          unsubscribeToken
        );

        if (emailResult.success) {
          // Mark that warning has been sent
          await prisma.employerJob.update({
            where: { id: employerJob.id },
            data: { expiryWarningSentAt: new Date() },
          });
          
          result.warningsSent++;
          console.log(`Expiry warning sent for job: ${job.title} (${job.id})`);
        } else {
          result.errors.push(
            `Failed to send email for job ${job.id}: ${emailResult.error || 'Unknown error'}`
          );
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Error processing job ${employerJob.jobId}: ${errorMsg}`);
        console.error(`Error processing job ${employerJob.jobId}:`, error);
        // Continue with next job - one failure shouldn't stop others
      }
    }

    console.log('Expiry check complete:', result);
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(`Fatal error in sendExpiryWarnings: ${errorMsg}`);
    console.error('Fatal error in sendExpiryWarnings:', error);
    return result;
  }
}

