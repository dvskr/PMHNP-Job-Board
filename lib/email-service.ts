import { Resend } from 'resend';
import { slugify } from '@/lib/utils';
import { Job } from '@prisma/client';

const resend = new Resend(process.env.RESEND_API_KEY);

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const EMAIL_FROM = process.env.EMAIL_FROM || 'PMHNP Jobs <noreply@rolerabbit.com>';

interface EmailResult {
  success: boolean;
  error?: string;
}

// Helper function to generate unsubscribe footer
function getUnsubscribeFooter(unsubscribeToken: string): string {
  return `
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
      <p>You're receiving this because you signed up at PMHNPJobs.com</p>
      <p><a href="${BASE_URL}/email-preferences?token=${unsubscribeToken}" style="color: #3b82f6;">Manage preferences</a> | <a href="${BASE_URL}/api/email/unsubscribe?token=${unsubscribeToken}" style="color: #3b82f6;">Unsubscribe</a></p>
    </div>
  `;
}

export async function sendWelcomeEmail(email: string, unsubscribeToken: string): Promise<EmailResult> {
  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: 'Welcome to PMHNP Jobs!',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 20px;">Welcome to PMHNP Jobs!</h1>
            
            <p style="font-size: 16px; margin-bottom: 16px;">Thanks for subscribing to job alerts.</p>
            
            <p style="font-size: 16px; margin-bottom: 24px;">We have 200+ psychiatric nurse practitioner jobs updated daily.</p>
            
            <a href="${BASE_URL}/jobs" style="display: inline-block; background-color: #3b82f6; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 16px;">Browse Jobs</a>
            
            ${getUnsubscribeFooter(unsubscribeToken)}
          </body>
        </html>
      `,
    });

    console.log('Welcome email sent successfully to:', email);
    return { success: true };
  } catch (error) {
    console.error('Error sending welcome email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send welcome email',
    };
  }
}

export async function sendConfirmationEmail(
  employerEmail: string,
  jobTitle: string,
  jobId: string,
  editToken: string,
  unsubscribeToken?: string
): Promise<EmailResult> {
  try {
    const jobSlug = slugify(jobTitle, jobId);

    await resend.emails.send({
      from: EMAIL_FROM,
      to: employerEmail,
      subject: 'Your PMHNP job post is live!',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 20px;">Your job post is now live!</h1>
            
            <p style="font-size: 18px; margin-bottom: 16px;"><strong>${jobTitle}</strong></p>
            
            <p style="font-size: 16px; margin-bottom: 24px;">Your listing will remain active for 30 days.</p>
            
            <div style="margin-bottom: 24px;">
              <a href="${BASE_URL}/jobs/${jobSlug}" style="display: inline-block; background-color: #3b82f6; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 16px; margin-right: 12px;">View Your Job</a>
            </div>
            
            <p style="font-size: 16px; margin-bottom: 16px;">
              <a href="${BASE_URL}/jobs/edit/${editToken}" style="color: #3b82f6; text-decoration: underline;">Edit your job post</a>
            </p>
            
            <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 32px 0;">
            
            <p style="font-size: 14px; color: #666;">
              Need help? Reply to this email and we'll get back to you as soon as possible.
            </p>
            
            <p style="font-size: 14px; color: #666; margin-top: 16px;">
              Thank you for choosing PMHNP Jobs!
            </p>
            
            ${unsubscribeToken ? getUnsubscribeFooter(unsubscribeToken) : ''}
          </body>
        </html>
      `,
    });

    console.log('Confirmation email sent successfully to:', employerEmail);
    return { success: true };
  } catch (error) {
    console.error('Error sending confirmation email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send confirmation email',
    };
  }
}

export async function sendJobAlertEmail(
  email: string,
  alertName: string,
  jobs: Job[],
  manageToken: string,
  unsubscribeToken: string
): Promise<EmailResult> {
  try {
    const jobCount = jobs.length;
    const displayJobs = jobs.slice(0, 10);
    const hasMoreJobs = jobCount > 10;

    // Generate job cards HTML
    const jobCardsHtml = displayJobs
      .map((job) => {
        const jobUrl = `${BASE_URL}/jobs/${slugify(job.title, job.id)}`;
        const salaryText = job.salaryRange || (job.minSalary ? `$${job.minSalary.toLocaleString()}${job.maxSalary ? ` - $${job.maxSalary.toLocaleString()}` : '+'}` : '');

        return `
          <tr>
            <td style="padding: 0 0 16px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
                <tr>
                  <td style="padding: 20px;">
                    <!-- Job Title -->
                    <a href="${jobUrl}" style="color: #111827; text-decoration: none; font-size: 17px; font-weight: 600; display: block; margin-bottom: 6px; line-height: 1.3;">
                      ${job.title}
                    </a>
                    
                    <!-- Company & Location -->
                    <p style="color: #6b7280; margin: 0 0 12px 0; font-size: 14px; line-height: 1.4;">
                      ${job.employer}${job.location ? ` · ${job.location}` : ''}
                    </p>
                    
                    <!-- Tags Row -->
                    <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 16px;">
                      <tr>
                        ${job.mode ? `
                          <td style="padding-right: 8px;">
                            <span style="display: inline-block; background-color: #f3f4f6; color: #374151; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 500;">
                              ${job.mode}
                            </span>
                          </td>
                        ` : ''}
                        ${job.jobType ? `
                          <td style="padding-right: 8px;">
                            <span style="display: inline-block; background-color: #f3f4f6; color: #374151; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 500;">
                              ${job.jobType}
                            </span>
                          </td>
                        ` : ''}
                        ${salaryText ? `
                          <td>
                            <span style="display: inline-block; background-color: #dcfce7; color: #166534; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 500;">
                              ${salaryText}
                            </span>
                          </td>
                        ` : ''}
                      </tr>
                    </table>
                    
                    <!-- View Job Button -->
                    <a href="${jobUrl}" style="display: inline-block; background-color: #3b82f6; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                      View Job
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        `;
      })
      .join('');

    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: `${jobCount} new job${jobCount !== 1 ? 's' : ''} match "${alertName}"`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="X-UA-Compatible" content="IE=edge">
            <title>Job Alert: ${alertName}</title>
            <!--[if mso]>
            <style type="text/css">
              body, table, td {font-family: Arial, Helvetica, sans-serif !important;}
            </style>
            <![endif]-->
          </head>
          <body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased;">
            <!-- Wrapper Table -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f9fafb;">
              <tr>
                <td align="center" style="padding: 40px 20px;">
                  <!-- Main Container -->
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px;">
                    
                    <!-- Header -->
                    <tr>
                      <td style="padding-bottom: 32px;">
                        <h1 style="margin: 0 0 8px 0; color: #111827; font-size: 26px; font-weight: 700; line-height: 1.2;">
                          Your Job Alert: ${alertName}
                        </h1>
                        <p style="margin: 0; color: #6b7280; font-size: 16px;">
                          <strong style="color: #3b82f6;">${jobCount}</strong> new job${jobCount !== 1 ? 's' : ''} match${jobCount === 1 ? 'es' : ''} your criteria
                        </p>
                      </td>
                    </tr>
                    
                    <!-- Job Cards -->
                    ${jobCardsHtml}
                    
                    ${hasMoreJobs ? `
                      <!-- View More Link -->
                      <tr>
                        <td align="center" style="padding: 16px 0 32px 0;">
                          <a href="${BASE_URL}/jobs" style="color: #3b82f6; font-size: 15px; font-weight: 600; text-decoration: none;">
                            View ${jobCount - 10} more matching jobs →
                          </a>
                        </td>
                      </tr>
                    ` : ''}
                    
                    <!-- Footer -->
                    <tr>
                      <td style="padding-top: 24px; border-top: 1px solid #e5e7eb;">
                        <p style="margin: 0 0 12px 0; color: #9ca3af; font-size: 13px; line-height: 1.5;">
                          You're receiving this because you created a job alert at PMHNPJobs.com
                        </p>
                        <p style="margin: 0; font-size: 13px;">
                          <a href="${BASE_URL}/job-alerts/manage?token=${manageToken}" style="color: #3b82f6; text-decoration: none; margin-right: 16px;">
                            Manage this alert
                          </a>
                          <a href="${BASE_URL}/api/email/unsubscribe?token=${unsubscribeToken}" style="color: #6b7280; text-decoration: none;">
                            Unsubscribe
                          </a>
                        </p>
                      </td>
                    </tr>
                    
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
    });

    console.log('Job alert email sent successfully to:', email);
    return { success: true };
  } catch (error) {
    console.error('Error sending job alert email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send job alert email',
    };
  }
}

