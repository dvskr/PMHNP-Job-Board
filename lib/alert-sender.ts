import { prisma } from '@/lib/prisma';
import { Resend } from 'resend';
import { Job, JobAlert } from '@/lib/types';
import { slugify } from '@/lib/utils';

const resend = new Resend(process.env.RESEND_API_KEY);
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const EMAIL_FROM = process.env.EMAIL_FROM || 'PMHNP Jobs <noreply@rolerabbit.com>';

// Batch size for processing alerts
const BATCH_SIZE = 50;
// Delay between batches (ms)
const BATCH_DELAY = 1000;

interface SendAlertsSummary {
  alertsProcessed: number;
  emailsSent: number;
  errors: Array<{ alertId: string; error: string }>;
}

function buildCriteriaSummary(alert: JobAlert): string {
  const parts: string[] = [];

  if (alert.keyword) parts.push(`"${alert.keyword}"`);
  if (alert.mode) parts.push(alert.mode);
  if (alert.jobType) parts.push(alert.jobType);
  if (alert.location) parts.push(`in ${alert.location}`);
  if (alert.minSalary || alert.maxSalary) {
    if (alert.minSalary && alert.maxSalary) {
      parts.push(`$${(alert.minSalary / 1000).toFixed(0)}k-$${(alert.maxSalary / 1000).toFixed(0)}k`);
    } else if (alert.minSalary) {
      parts.push(`$${(alert.minSalary / 1000).toFixed(0)}k+`);
    } else if (alert.maxSalary) {
      parts.push(`up to $${(alert.maxSalary / 1000).toFixed(0)}k`);
    }
  }

  return parts.length > 0 ? parts.join(' · ') : 'All PMHNP jobs';
}

function buildJobsWhereClause(alert: JobAlert, sinceDate: Date | null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    isPublished: true,
  };

  // Only get jobs created since last email
  if (sinceDate) {
    where.createdAt = { gt: sinceDate };
  }

  // Keyword search (title, employer, description)
  if (alert.keyword) {
    where.OR = [
      { title: { contains: alert.keyword, mode: 'insensitive' } },
      { employer: { contains: alert.keyword, mode: 'insensitive' } },
      { description: { contains: alert.keyword, mode: 'insensitive' } },
    ];
  }

  // Location filter
  if (alert.location) {
    where.location = { contains: alert.location, mode: 'insensitive' };
  }

  // Mode filter (Remote, Hybrid, In-Person)
  if (alert.mode) {
    where.mode = { equals: alert.mode, mode: 'insensitive' };
  }

  // Job type filter (Full-Time, Part-Time, etc.)
  if (alert.jobType) {
    where.jobType = { equals: alert.jobType, mode: 'insensitive' };
  }

  // Salary filters
  if (alert.minSalary) {
    where.maxSalary = { gte: alert.minSalary };
  }
  if (alert.maxSalary) {
    where.minSalary = { lte: alert.maxSalary };
  }

  return where;
}

function generateJobListHtml(jobs: Job[]): string {
  return jobs
    .map((job: Job) => {
      const jobUrl = `${BASE_URL}/jobs/${slugify(job.title, job.id)}`;
      const salaryText = job.salaryRange || (job.minSalary ? `$${job.minSalary.toLocaleString()}+` : '');

      return `
        <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
          <a href="${jobUrl}" style="color: #1a1a1a; text-decoration: none; font-size: 16px; font-weight: 600; display: block; margin-bottom: 4px;">
            ${job.title}
          </a>
          <p style="color: #4b5563; margin: 0 0 8px 0; font-size: 14px;">
            ${job.employer} · ${job.location}
          </p>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            ${job.mode ? `<span style="background-color: #f3f4f6; color: #374151; padding: 2px 8px; border-radius: 4px; font-size: 12px;">${job.mode}</span>` : ''}
            ${job.jobType ? `<span style="background-color: #f3f4f6; color: #374151; padding: 2px 8px; border-radius: 4px; font-size: 12px;">${job.jobType}</span>` : ''}
            ${salaryText ? `<span style="background-color: #dcfce7; color: #166534; padding: 2px 8px; border-radius: 4px; font-size: 12px;">${salaryText}</span>` : ''}
          </div>
        </div>
      `;
    })
    .join('');
}

async function sendAlertEmail(
  alert: JobAlert,
  jobs: Job[],
  criteriaSummary: string
): Promise<void> {
  const jobCount = jobs.length;
  const subject = `${jobCount} new PMHNP job${jobCount !== 1 ? 's' : ''} matching your alert`;

  await resend.emails.send({
    from: EMAIL_FROM,
    to: alert.email,
    subject,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 8px;">
            ${jobCount} New Job${jobCount !== 1 ? 's' : ''} Found
          </h1>
          
          <p style="color: #6b7280; font-size: 14px; margin-bottom: 24px;">
            Alert: ${criteriaSummary} · ${alert.frequency === 'daily' ? 'Daily' : 'Weekly'} digest
          </p>
          
          ${generateJobListHtml(jobs)}
          
          ${jobCount >= 20 ? `
            <p style="text-align: center; margin: 24px 0;">
              <a href="${BASE_URL}/jobs" style="color: #3b82f6; font-weight: 500;">View all matching jobs →</a>
            </p>
          ` : ''}
          
          <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
            <p>You're receiving this because you created a job alert at PMHNPJobs.com</p>
            <p>
              <a href="${BASE_URL}/job-alerts/manage?token=${alert.token}" style="color: #3b82f6;">Manage this alert</a> | 
              <a href="${BASE_URL}/api/job-alerts?token=${alert.token}" style="color: #3b82f6;">Delete alert</a>
            </p>
          </div>
        </body>
      </html>
    `,
  });
}

async function processAlert(alert: JobAlert): Promise<boolean> {
  // Build query for matching jobs
  const sinceDate = alert.lastSentAt;
  const whereClause = buildJobsWhereClause(alert, sinceDate);

  // Query matching jobs (limit 20)
  const jobs = await prisma.job.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  // Skip if no jobs found
  if (jobs.length === 0) {
    console.log(`[Alert ${alert.id}] No new jobs found, skipping email`);
    return false;
  }

  // Send email
  const criteriaSummary = buildCriteriaSummary(alert);
  await sendAlertEmail(alert, jobs, criteriaSummary);

  // Update lastSentAt
  await prisma.jobAlert.update({
    where: { id: alert.id },
    data: { lastSentAt: new Date() },
  });

  console.log(`[Alert ${alert.id}] Sent email with ${jobs.length} jobs to ${alert.email}`);
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendJobAlerts(): Promise<SendAlertsSummary> {
  const summary: SendAlertsSummary = {
    alertsProcessed: 0,
    emailsSent: 0,
    errors: [],
  };

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  console.log('[Job Alerts] Starting alert sender...');

  // Query all alerts that need to be sent
  const alerts = await prisma.jobAlert.findMany({
    where: {
      isActive: true,
      OR: [
        // Daily alerts: never sent OR sent more than 24 hours ago
        {
          frequency: 'daily',
          OR: [
            { lastSentAt: null },
            { lastSentAt: { lt: oneDayAgo } },
          ],
        },
        // Weekly alerts: never sent OR sent more than 7 days ago
        {
          frequency: 'weekly',
          OR: [
            { lastSentAt: null },
            { lastSentAt: { lt: sevenDaysAgo } },
          ],
        },
      ],
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`[Job Alerts] Found ${alerts.length} alerts to process`);

  // Process alerts in batches
  for (let i = 0; i < alerts.length; i += BATCH_SIZE) {
    const batch = alerts.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(alerts.length / BATCH_SIZE);

    console.log(`[Job Alerts] Processing batch ${batchNumber}/${totalBatches} (${batch.length} alerts)`);

    // Process each alert in the batch
    for (const alert of batch) {
      summary.alertsProcessed++;

      try {
        const emailSent = await processAlert(alert);
        if (emailSent) {
          summary.emailsSent++;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Alert ${alert.id}] Error:`, errorMessage);
        summary.errors.push({
          alertId: alert.id,
          error: errorMessage,
        });
      }
    }

    // Delay between batches (except for the last batch)
    if (i + BATCH_SIZE < alerts.length) {
      console.log(`[Job Alerts] Waiting ${BATCH_DELAY}ms before next batch...`);
      await sleep(BATCH_DELAY);
    }
  }

  console.log(`[Job Alerts] Complete. Processed: ${summary.alertsProcessed}, Sent: ${summary.emailsSent}, Errors: ${summary.errors.length}`);

  return summary;
}

