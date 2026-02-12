import { prisma } from '@/lib/prisma';
import { Resend } from 'resend';
import { Job, JobAlert } from '@/lib/types';
import { slugify } from '@/lib/utils';

const resend = new Resend(process.env.RESEND_API_KEY);
// Always use production URL for email links
const BASE_URL = 'https://pmhnphiring.com';
const EMAIL_FROM = process.env.EMAIL_FROM || 'PMHNP Hiring <noreply@pmhnphiring.com>';

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
        <tr>
          <td style="padding: 16px 20px; border-bottom: 1px solid #334155;">
            <a href="${jobUrl}" style="color: #2dd4bf; text-decoration: none; font-size: 16px; font-weight: 600; letter-spacing: -0.2px;">${job.title}</a>
            <p style="margin: 6px 0 0 0; font-size: 14px; color: #94a3b8;">${job.employer} · ${job.location}</p>
            <p style="margin: 8px 0 0 0; font-size: 12px;">
              ${job.mode ? `<span style="background-color: #1e293b; color: #94a3b8; padding: 3px 10px; border-radius: 6px; margin-right: 4px; border: 1px solid #334155;">${job.mode}</span>` : ''}
              ${job.jobType ? `<span style="background-color: #1e293b; color: #94a3b8; padding: 3px 10px; border-radius: 6px; margin-right: 4px; border: 1px solid #334155;">${job.jobType}</span>` : ''}
              ${salaryText ? `<span style="background-color: #064e3b; color: #34d399; padding: 3px 10px; border-radius: 6px; font-weight: 600;">${salaryText}</span>` : ''}
            </p>
          </td>
        </tr>
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
  const subject = `🔔 ${jobCount} new PMHNP job${jobCount !== 1 ? 's' : ''} matching your alert`;
  const currentYear = new Date().getFullYear();

  await resend.emails.send({
    from: EMAIL_FROM,
    to: alert.email,
    subject,
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0f172a;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
          ${jobCount} new PMHNP positions matching your criteria — PMHNP Hiring
        </div>

        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%; background-color: #1e293b; border-radius: 16px; overflow: hidden; border: 1px solid #334155;">
          <!-- Gradient Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #0f766e 0%, #0d9488 50%, #14b8a6 100%); padding: 32px 40px; text-align: center;">
              <img src="${BASE_URL}/pmhnp_logo.png" height="36" alt="PMHNP Hiring" style="display: block; margin: 0 auto 20px auto; filter: brightness(10);" />
              <h1 style="margin: 0; font-size: 26px; color: #ffffff; font-weight: 700; letter-spacing: -0.3px; line-height: 1.3;">
                ${jobCount} New Job${jobCount !== 1 ? 's' : ''} Found 🔔
              </h1>
              <p style="margin: 10px 0 0 0; font-size: 15px; color: #a7f3d0; font-weight: 400;">
                ${criteriaSummary} · ${alert.frequency === 'daily' ? 'Daily' : 'Weekly'} Alert
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 40px 8px 40px;">
              <p style="margin: 0; font-size: 16px; color: #e2e8f0; line-height: 1.6;">
                New positions matching your criteria:
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 40px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0f172a; border: 1px solid #334155; border-radius: 12px; overflow: hidden;">
                ${generateJobListHtml(jobs)}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 40px;">
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <a href="${BASE_URL}/jobs" style="display: inline-block; background: linear-gradient(135deg, #0d9488, #059669); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 700; font-size: 15px; letter-spacing: 0.3px;">
                      View All Jobs
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%;">
          <tr>
            <td style="padding: 24px 16px 8px 16px; text-align: center;">
              <p style="margin: 0 0 8px 0; font-size: 13px; color: #64748b;">
                10,000+ Jobs · 3,000+ Companies · 50 States
              </p>
              <p style="margin: 8px 0 0 0; font-size: 11px; color: #475569;">
                <a href="${BASE_URL}/job-alerts/manage?token=${alert.token}" style="color: #64748b; text-decoration: none;">Manage alert</a>
                &nbsp;·&nbsp;
                <a href="${BASE_URL}/job-alerts/unsubscribe?token=${alert.token}" style="color: #64748b; text-decoration: none;">Delete alert</a>
              </p>
              <p style="margin: 8px 0 0 0; font-size: 11px; color: #475569;">
                © ${currentYear} PMHNP Hiring · <a href="${BASE_URL}" style="color: #475569; text-decoration: none;">pmhnphiring.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
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

