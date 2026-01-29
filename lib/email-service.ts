import { Resend } from 'resend';
import { slugify } from '@/lib/utils';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';

const resend = new Resend(process.env.RESEND_API_KEY);

// Always use production URL for email links
const BASE_URL = 'https://pmhnphiring.com';
const EMAIL_FROM = process.env.EMAIL_FROM || 'PMHNP Hiring <noreply@pmhnphiring.com>';

interface EmailResult {
  success: boolean;
  error?: string;
}

export async function sendWelcomeEmail(email: string, unsubscribeToken: string): Promise<EmailResult> {
  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: 'Welcome to PMHNP Jobs!',
      html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: Arial, Helvetica, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #2563eb; padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; color: #ffffff; font-weight: bold;">Welcome to PMHNP Jobs!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 16px 0; font-size: 16px; color: #374151; line-height: 1.6;">
                Thanks for subscribing to job alerts!
              </p>
              <p style="margin: 0 0 24px 0; font-size: 16px; color: #374151; line-height: 1.6;">
                We have 8,500+ psychiatric nurse practitioner jobs updated daily. You'll receive alerts when new jobs match your preferences.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding-right: 12px;">
                    <a href="${BASE_URL}/jobs" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: bold; font-size: 16px;">
                      Browse Jobs
                    </a>
                  </td>
                  <td>
                    <a href="${BASE_URL}/job-alerts" style="display: inline-block; background-color: #ffffff; color: #2563eb; text-decoration: none; padding: 12px 26px; border-radius: 6px; font-weight: 600; font-size: 16px; border: 2px solid #2563eb;">
                      Manage Alerts
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f4f4f5; padding: 24px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px 0; font-size: 12px; color: #6b7280;">
                You're receiving this because you subscribed at PMHNPHiring.com
              </p>
              <p style="margin: 0; font-size: 12px; color: #6b7280;">
                <a href="${BASE_URL}/email-preferences?token=${unsubscribeToken}" style="color: #6b7280;">Manage preferences</a> | 
                <a href="${BASE_URL}/unsubscribe?token=${unsubscribeToken}" style="color: #6b7280;">Unsubscribe</a>
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

    logger.info('Welcome email sent', { email });
    return { success: true };
  } catch (error) {
    logger.error('Error sending welcome email', error, { email });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send welcome email',
    };
  }
}

// Hardcoded production URL for emails
const SITE_URL = 'https://pmhnphiring.com';

export async function sendSignupWelcomeEmail(
  email: string,
  firstName: string,
  role: string
): Promise<EmailResult> {
  try {
    const isEmployer = role === 'employer';
    const currentYear = new Date().getFullYear();

    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: isEmployer 
        ? `Welcome to PMHNP Jobs - Start Hiring Today!`
        : `Welcome to PMHNP Jobs, ${firstName}!`,
      html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: Arial, Helvetica, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          
          <!-- Header -->
          <tr>
            <td style="background-color: #2563eb; padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; color: #ffffff; font-weight: bold;">
                Welcome to PMHNP Jobs${firstName ? `, ${firstName}` : ''}!
              </h1>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; font-size: 16px; color: #374151; line-height: 1.6;">
                ${isEmployer 
                  ? `Thanks for creating your employer account! You're now ready to post jobs and connect with qualified PMHNPs.`
                  : `Thanks for joining PMHNP Jobs - the #1 job board dedicated to Psychiatric Mental Health Nurse Practitioners.`
                }
              </p>
              
              ${isEmployer ? `
              <!-- Employer CTAs -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px; background-color: #eff6ff; border-radius: 8px; border-left: 4px solid #2563eb;">
                    <p style="margin: 0 0 12px 0; font-size: 16px; font-weight: bold; color: #1e40af;">
                      Get Started:
                    </p>
                    <ul style="margin: 0; padding-left: 20px; color: #374151; font-size: 14px; line-height: 1.8;">
                      <li>Post your first job in minutes</li>
                      <li>Reach 10,000+ qualified PMHNPs</li>
                      <li>Get applications directly to your inbox</li>
                    </ul>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding-right: 12px;">
                    <a href="${SITE_URL}/post-job" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: bold; font-size: 16px;">
                      Post a Job
                    </a>
                  </td>
                  <td>
                    <a href="${SITE_URL}/employer/dashboard" style="display: inline-block; background-color: #ffffff; color: #2563eb; text-decoration: none; padding: 12px 26px; border-radius: 6px; font-weight: 600; font-size: 16px; border: 2px solid #2563eb;">
                      View Dashboard
                    </a>
                  </td>
                </tr>
              </table>
              ` : `
              <!-- Job Seeker CTAs -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px; background-color: #f0fdf4; border-radius: 8px; border-left: 4px solid #059669;">
                    <p style="margin: 0 0 12px 0; font-size: 16px; font-weight: bold; color: #166534;">
                      What You Can Do:
                    </p>
                    <ul style="margin: 0; padding-left: 20px; color: #374151; font-size: 14px; line-height: 1.8;">
                      <li>Browse 8,500+ PMHNP jobs</li>
                      <li>Save jobs and track applications</li>
                      <li>Set up personalized job alerts</li>
                      <li>Access our free salary guide</li>
                    </ul>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding-right: 12px;">
                    <a href="${SITE_URL}/jobs" style="display: inline-block; background-color: #059669; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: bold; font-size: 16px;">
                      Browse Jobs
                    </a>
                  </td>
                  <td>
                    <a href="${SITE_URL}/job-alerts" style="display: inline-block; background-color: #ffffff; color: #059669; text-decoration: none; padding: 12px 26px; border-radius: 6px; font-weight: 600; font-size: 16px; border: 2px solid #059669;">
                      Set Up Alerts
                    </a>
                  </td>
                </tr>
              </table>
              `}
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f4f4f5; padding: 24px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px 0; font-size: 12px; color: #6b7280;">
                © ${currentYear} PMHNP Jobs | <a href="${SITE_URL}" style="color: #6b7280;">pmhnphiring.com</a>
              </p>
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                Questions? Reply to this email or contact hello@pmhnphiring.com
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

    logger.info('Signup welcome email sent', { email, role });
    return { success: true };
  } catch (error) {
    logger.error('Error sending signup welcome email', error, { email });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send signup welcome email',
    };
  }
}

export async function sendConfirmationEmail(
  employerEmail: string,
  jobTitle: string,
  jobId: string,
  editToken: string,
  dashboardToken?: string,
  unsubscribeToken?: string
): Promise<EmailResult> {
  try {
    const jobSlug = slugify(jobTitle, jobId);
    const dashboardUrl = dashboardToken ? `${BASE_URL}/employer/dashboard/${dashboardToken}` : null;

    await resend.emails.send({
      from: EMAIL_FROM,
      to: employerEmail,
      subject: 'Your PMHNP job post is live!',
      html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: Arial, Helvetica, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #059669; padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; color: #ffffff; font-weight: bold;">Your Job Post is Live!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 24px; background-color: #f0fdf4; border-radius: 8px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 4px 0; font-size: 14px; color: #166534;">Job Title</p>
                    <p style="margin: 0; font-size: 18px; font-weight: bold; color: #111827;">${jobTitle}</p>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 24px 0; font-size: 16px; color: #374151; line-height: 1.6;">
                Great news! Your job posting is now live and visible to thousands of qualified PMHNPs. Your listing will remain active for 30 days.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding-right: 12px;">
                    <a href="${BASE_URL}/jobs/${jobSlug}" style="display: inline-block; background-color: #059669; color: #ffffff; text-decoration: none; padding: 14px 24px; border-radius: 6px; font-weight: bold; font-size: 16px;">
                      View Job
                    </a>
                  </td>
                  <td>
                    <a href="${BASE_URL}/jobs/edit/${editToken}" style="display: inline-block; background-color: #ffffff; color: #059669; text-decoration: none; padding: 12px 22px; border-radius: 6px; font-weight: 600; font-size: 16px; border: 2px solid #059669;">
                      Edit Job
                    </a>
                  </td>
                </tr>
              </table>
              ${dashboardUrl ? `
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #eff6ff; border-radius: 8px; border-left: 4px solid #2563eb;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 8px 0; font-size: 16px; font-weight: bold; color: #1e40af;">
                      Employer Dashboard
                    </p>
                    <p style="margin: 0 0 16px 0; font-size: 14px; color: #4b5563;">
                      Manage all your job postings, view analytics, and track applicants.
                    </p>
                    <a href="${dashboardUrl}" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: 600; font-size: 14px;">
                      Go to Dashboard
                    </a>
                  </td>
                </tr>
              </table>
              ` : ''}
            </td>
          </tr>
          <tr>
            <td style="background-color: #f4f4f5; padding: 24px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px 0; font-size: 12px; color: #6b7280;">
                Thank you for choosing PMHNP Jobs!
              </p>
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                Questions? Reply to this email or contact hello@pmhnphiring.com
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

    logger.info('Confirmation email sent', { email: employerEmail, jobId });
    return { success: true };
  } catch (error) {
    logger.error('Error sending confirmation email', error, { email: employerEmail });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send confirmation email',
    };
  }
}

export async function sendJobAlertEmail(
  email: string,
  jobs: Array<{ id: string; title: string; employer: string; location: string; minSalary?: number | null; maxSalary?: number | null; salaryPeriod?: string | null; jobType?: string | null; mode?: string | null; slug?: string | null }>,
  alertToken: string
): Promise<void> {
  const jobCount = jobs.length;
  const displayJobs = jobs.slice(0, 10);

  const jobListHtml = displayJobs.map((job) => `
    <tr>
      <td style="padding: 16px; border-bottom: 1px solid #e5e7eb;">
        <a href="${BASE_URL}/jobs/${slugify(job.title, job.id)}" style="color: #2563eb; text-decoration: none; font-size: 16px; font-weight: 600;">
          ${job.title}
        </a>
        <p style="margin: 4px 0 0 0; font-size: 14px; color: #6b7280;">${job.employer}</p>
        <p style="margin: 4px 0 0 0; font-size: 14px; color: #6b7280;">${job.location}${job.mode ? ` • ${job.mode}` : ''}</p>
        ${job.minSalary ? `<p style="margin: 8px 0 0 0; font-size: 14px; color: #059669; font-weight: 600;">$${(job.minSalary / 1000).toFixed(0)}k${job.maxSalary ? ` - $${(job.maxSalary / 1000).toFixed(0)}k` : '+'}</p>` : ''}
      </td>
    </tr>
  `).join('');

  await resend.emails.send({
    from: EMAIL_FROM,
    to: email,
    subject: `${jobCount} New PMHNP Job${jobCount > 1 ? 's' : ''} Match Your Alert`,
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: Arial, Helvetica, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #2563eb; padding: 24px 40px; text-align: center;">
              <h1 style="margin: 0; font-size: 22px; color: #ffffff; font-weight: bold;">
                ${jobCount} New Job${jobCount > 1 ? 's' : ''} Match Your Alert
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 40px 16px 40px;">
              <p style="margin: 0; font-size: 16px; color: #374151; line-height: 1.6;">
                We found new PMHNP positions matching your criteria:
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                ${jobListHtml}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 40px;">
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <a href="${BASE_URL}/jobs" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px;">
                      View All Jobs
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f4f4f5; padding: 20px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #6b7280;">
                <a href="${BASE_URL}/job-alerts/manage?token=${alertToken}" style="color: #6b7280;">Manage alert</a> | 
                <a href="${BASE_URL}/api/job-alerts/unsubscribe?token=${alertToken}" style="color: #6b7280;">Unsubscribe</a>
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

export async function sendRenewalConfirmationEmail(
  email: string,
  jobTitle: string,
  newExpiresAt: Date,
  dashboardToken: string,
  unsubscribeToken: string
): Promise<EmailResult> {
  try {
    const expiryDate = newExpiresAt.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: 'Your job has been renewed!',
      html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: Arial, Helvetica, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #059669; padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; color: #ffffff; font-weight: bold;">Job Renewed Successfully!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 16px 0; font-size: 16px; color: #374151; line-height: 1.6;">
                Great news! Your job posting has been extended and is live.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 24px; background-color: #f0fdf4; border-radius: 8px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 4px 0; font-size: 14px; color: #166534;">Job Title</p>
                    <p style="margin: 0 0 16px 0; font-size: 18px; font-weight: bold; color: #111827;">${jobTitle}</p>
                    <p style="margin: 0; font-size: 14px; color: #166534;">
                      <strong>New expiration:</strong> ${expiryDate}
                    </p>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f9fafb; border-radius: 8px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 8px 0; font-size: 16px; font-weight: bold; color: #111827;">Employer Dashboard</p>
                    <p style="margin: 0 0 16px 0; font-size: 14px; color: #6b7280;">View analytics and manage all your job postings</p>
                    <a href="${BASE_URL}/employer/dashboard/${dashboardToken}" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px;">
                      Go to Dashboard
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f4f4f5; padding: 24px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px 0; font-size: 12px; color: #6b7280;">
                Questions? Reply to this email or contact hello@pmhnphiring.com
              </p>
              <p style="margin: 0; font-size: 12px; color: #6b7280;">
                <a href="${BASE_URL}/email-preferences?token=${unsubscribeToken}" style="color: #6b7280;">Manage preferences</a> | 
                <a href="${BASE_URL}/unsubscribe?token=${unsubscribeToken}" style="color: #6b7280;">Unsubscribe</a>
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

    logger.info('Renewal confirmation email sent', { email });
    return { success: true };
  } catch (error) {
    logger.error('Error sending renewal confirmation email', error, { email });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send renewal confirmation email',
    };
  }
}

export async function sendExpiryWarningEmail(
  email: string,
  jobTitle: string,
  expiresAt: Date,
  viewCount: number,
  applyClickCount: number,
  dashboardToken: string,
  editToken: string,
  unsubscribeToken: string | null
): Promise<EmailResult> {
  try {
    const now = new Date();
    const timeDiff = expiresAt.getTime() - now.getTime();
    const daysUntilExpiry = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
    const expiryDateStr = expiresAt.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: `Your job posting expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}`,
      html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: Arial, Helvetica, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #f59e0b; padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; color: #ffffff; font-weight: bold;">Job Expiring Soon</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 24px; background-color: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 4px 0; font-size: 14px; color: #92400e;">Expires ${expiryDateStr}</p>
                    <p style="margin: 0; font-size: 18px; font-weight: bold; color: #111827;">${jobTitle}</p>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 24px 0; font-size: 16px; color: #374151; line-height: 1.6;">
                ${config.isPaidPostingEnabled
                  ? 'Renew for just $99 to keep it active for another 30 days.'
                  : 'Renew now to keep it active - FREE during our launch period!'}
              </p>
              
              <!-- Stats -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                <tr>
                  <td width="50%" style="padding: 20px; background-color: #f9fafb; border-radius: 8px 0 0 8px; text-align: center;">
                    <div style="font-size: 32px; font-weight: bold; color: #2563eb;">${viewCount}</div>
                    <div style="font-size: 14px; color: #6b7280;">Views</div>
                  </td>
                  <td width="50%" style="padding: 20px; background-color: #f9fafb; border-radius: 0 8px 8px 0; text-align: center;">
                    <div style="font-size: 32px; font-weight: bold; color: #2563eb;">${applyClickCount}</div>
                    <div style="font-size: 14px; color: #6b7280;">Apply Clicks</div>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding-right: 12px;">
                    <a href="${BASE_URL}/employer/dashboard/${dashboardToken}" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 24px; border-radius: 6px; font-weight: bold; font-size: 16px;">
                      Renew Now
                    </a>
                  </td>
                  <td>
                    <a href="${BASE_URL}/jobs/edit/${editToken}" style="display: inline-block; background-color: #ffffff; color: #2563eb; text-decoration: none; padding: 12px 22px; border-radius: 6px; font-weight: 600; font-size: 16px; border: 2px solid #2563eb;">
                      Edit Job
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f4f4f5; padding: 24px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px 0; font-size: 12px; color: #6b7280;">
                Questions? Reply to this email or contact hello@pmhnphiring.com
              </p>
              ${unsubscribeToken ? `
              <p style="margin: 0; font-size: 12px; color: #6b7280;">
                <a href="${BASE_URL}/email-preferences?token=${unsubscribeToken}" style="color: #6b7280;">Manage preferences</a> | 
                <a href="${BASE_URL}/unsubscribe?token=${unsubscribeToken}" style="color: #6b7280;">Unsubscribe</a>
              </p>
              ` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    });

    logger.info('Expiry warning email sent', { email });
    return { success: true };
  } catch (error) {
    logger.error('Error sending expiry warning email', error, { email });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send expiry warning email',
    };
  }
}

export async function sendDraftSavedEmail(
  email: string,
  resumeToken: string
): Promise<EmailResult> {
  try {
    const resumeUrl = `${BASE_URL}/post-job?resume=${resumeToken}`;
    
    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: 'Continue your PMHNP job posting',
      html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: Arial, Helvetica, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <tr>
            <td style="background-color: #2563eb; padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; color: #ffffff; font-weight: bold;">Continue Your Job Posting</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 16px 0; font-size: 16px; color: #374151; line-height: 1.6;">
                Your job posting draft has been saved. Click below to continue where you left off.
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 24px 0;">
                <tr>
                  <td>
                    <a href="${resumeUrl}" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: bold; font-size: 16px;">
                      Continue Posting
                    </a>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f9fafb; border-radius: 8px;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="margin: 0 0 8px 0; font-size: 12px; color: #6b7280;">Or copy this link:</p>
                    <p style="margin: 0; font-size: 12px; color: #2563eb; word-break: break-all;">
                      <a href="${resumeUrl}" style="color: #2563eb;">${resumeUrl}</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f4f4f5; padding: 24px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px 0; font-size: 12px; color: #6b7280;">
                This link expires in 30 days.
              </p>
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                Questions? Reply to this email or contact hello@pmhnphiring.com
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

    logger.info('Draft saved email sent', { email });
    return { success: true };
  } catch (error) {
    logger.error('Error sending draft saved email', error, { email });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send draft saved email',
    };
  }
}

