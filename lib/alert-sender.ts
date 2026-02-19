import { prisma } from '@/lib/prisma';
import { Resend } from 'resend';
import { Job, JobAlert } from '@/lib/types';
import { slugify } from '@/lib/utils';
import { emailShell, headerBlock, primaryButton } from '@/lib/email-service';

const resend = new Resend(process.env.RESEND_API_KEY);
// Always use production URL for email links
const BASE_URL = 'https://pmhnphiring.com';
const EMAIL_FROM = process.env.EMAIL_FROM || 'PMHNP Hiring <noreply@pmhnphiring.com>';

// Batch size for processing alerts
const BATCH_SIZE = 10;
// Delay between batches (ms)
const BATCH_DELAY = 2000;
// Delay between individual emails (ms) — Resend rate limit is 2/sec on free, 10/sec on pro
const EMAIL_DELAY = 2000;
// Max retries for rate-limited emails
const MAX_RETRIES = 3;

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

const FONT_STACK = "Arial, Helvetica, sans-serif";

function generateJobListHtml(jobs: Job[]): string {
  return jobs
    .map((job: Job, index: number) => {
      const jobUrl = `${BASE_URL}/jobs/${slugify(job.title, job.id)}`;
      const salaryText = job.salaryRange || (job.minSalary ? `$${job.minSalary.toLocaleString()}+` : '');
      const isLast = index === jobs.length - 1;

      return `
        <tr>
          <td style="padding: 16px 20px;${!isLast ? ' border-bottom: 1px solid #1E293B;' : ''}">
            <a href="${jobUrl}" style="color: #2DD4BF; text-decoration: none; font-family: ${FONT_STACK}; font-size: 15px; font-weight: 600; letter-spacing: -0.2px; line-height: 1.4;">${job.title}</a>
            <p style="margin: 5px 0 0; font-family: ${FONT_STACK}; font-size: 13px; color: #94A3B8;">${job.employer} · ${job.location}</p>
            <p style="margin: 8px 0 0; font-size: 11px;">
              ${job.mode ? `<span style="display: inline-block; background-color: #1E293B; color: #94A3B8; padding: 3px 10px; border-radius: 6px; margin-right: 4px; font-family: ${FONT_STACK}; font-size: 11px; font-weight: 500; border: 1px solid #1E293B;">${job.mode}</span>` : ''}
              ${job.jobType ? `<span style="display: inline-block; background-color: #1E293B; color: #94A3B8; padding: 3px 10px; border-radius: 6px; margin-right: 4px; font-family: ${FONT_STACK}; font-size: 11px; font-weight: 500; border: 1px solid #1E293B;">${job.jobType}</span>` : ''}
              ${salaryText ? `<span style="display: inline-block; background-color: #064E3B; color: #34D399; padding: 3px 10px; border-radius: 6px; font-family: ${FONT_STACK}; font-size: 11px; font-weight: 600; border: 1px solid #065F46;">${salaryText}</span>` : ''}
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

  const html = emailShell(`
          ${headerBlock(
    `${jobCount} New Job${jobCount !== 1 ? 's' : ''} Found 🔔`,
    `${criteriaSummary} · ${alert.frequency === 'daily' ? 'Daily' : 'Weekly'} Alert`
  )}
          <tr>
            <td class="content-pad" style="padding: 24px 40px 8px;">
              <p style="margin: 0; font-family: ${FONT_STACK}; font-size: 15px; color: #E2E8F0; line-height: 1.6;">
                New positions matching your criteria:
              </p>
            </td>
          </tr>
          <tr>
            <td class="content-pad" style="padding: 12px 40px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #162231; border: 1px solid #1E293B; border-radius: 12px; overflow: hidden;">
                ${generateJobListHtml(jobs)}
              </table>
            </td>
          </tr>
          <tr>
            <td class="content-pad" style="padding: 24px 40px;">
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 auto;">
                <tr>
                  <td>
                    ${primaryButton('View All Matching Jobs →', `${BASE_URL}/jobs`)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`,
    `<p style="margin: 8px 0 0; font-family: ${FONT_STACK}; font-size: 11px; color: #475569;">
      <a href="${BASE_URL}/job-alerts/manage?token=${alert.token}" style="color: #64748B; text-decoration: none;">Manage alert</a>
      &nbsp;·&nbsp;
      <a href="${BASE_URL}/job-alerts/unsubscribe?token=${alert.token}" style="color: #64748B; text-decoration: none;">Delete alert</a>
    </p>`
  );

  // Retry with exponential backoff for rate limits (429)
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await resend.emails.send({
        from: EMAIL_FROM,
        to: alert.email,
        subject,
        html,
      });
      return; // Success
    } catch (error: unknown) {
      const isRateLimit = error instanceof Error &&
        (error.message.includes('429') || error.message.includes('rate') || error.message.includes('Too Many'));
      if (isRateLimit && attempt < MAX_RETRIES) {
        const backoff = EMAIL_DELAY * Math.pow(2, attempt - 1); // 2s, 4s, 8s
        console.warn(`[Alert] Rate limited sending to ${alert.email}, retrying in ${backoff}ms (attempt ${attempt}/${MAX_RETRIES})`);
        await sleep(backoff);
      } else {
        throw error; // Non-rate-limit error or max retries exceeded
      }
    }
  }
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

    // Process each alert in the batch with per-email delay
    for (let j = 0; j < batch.length; j++) {
      const alert = batch[j];
      summary.alertsProcessed++;

      try {
        const emailSent = await processAlert(alert);
        if (emailSent) {
          summary.emailsSent++;
          // Delay between emails to avoid Resend rate limits
          if (j < batch.length - 1) {
            await sleep(EMAIL_DELAY);
          }
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

