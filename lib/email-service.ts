import { Resend } from 'resend';
import { slugify } from '@/lib/utils';
import { config } from '@/lib/config';

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
  dashboardToken?: string,  // Make optional for backward compatibility
  unsubscribeToken?: string
): Promise<EmailResult> {
  try {
    const jobSlug = slugify(jobTitle, jobId);
    const dashboardUrl = dashboardToken 
      ? `${BASE_URL}/employer/dashboard/${dashboardToken}`
      : null;

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
            
            ${dashboardUrl ? `
              <div style="margin-top: 20px; padding: 16px; background-color: #f0f9ff; border-radius: 8px;">
                <p style="margin: 0 0 8px 0; font-weight: 600; color: #1e40af;">
                  📊 Employer Dashboard
                </p>
                <p style="margin: 0 0 12px 0; color: #4b5563;">
                  Manage all your job postings in one place:
                </p>
                <a href="${dashboardUrl}" 
                   style="display: inline-block; background-color: #2563eb; color: white; 
                          padding: 10px 20px; border-radius: 6px; text-decoration: none;">
                  View Dashboard
                </a>
              </div>
            ` : ''}
            
            <p style="font-size: 14px; color: #666; margin-top: 24px;">
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
  jobs: Array<{ id: string; title: string; employer: string; location: string; minSalary?: number | null; maxSalary?: number | null; salaryPeriod?: string | null; jobType?: string | null; mode?: string | null; slug?: string | null }>,
  alertToken: string
): Promise<void> {
  const jobCount = jobs.length;
  const displayJobs = jobs.slice(0, 10);

  // Build job list HTML
  const jobListHtml = displayJobs.map((job) => `
    <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
      <h3 style="margin: 0 0 8px 0; color: #111827;">
        <a href="${BASE_URL}/jobs/${slugify(job.title, job.id)}" style="color: #2563eb; text-decoration: none;">
          ${job.title}
        </a>
      </h3>
      <p style="margin: 0 0 4px 0; color: #6b7280;">${job.employer}</p>
      <p style="margin: 0; color: #6b7280;">${job.location} • ${job.mode}</p>
      ${job.minSalary ? `<p style="margin: 4px 0 0 0; color: #059669; font-weight: 600;">
        $${(job.minSalary / 1000).toFixed(0)}k${job.maxSalary ? ` - $${(job.maxSalary / 1000).toFixed(0)}k` : '+'}
      </p>` : ''}
    </div>
  `).join('');

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #111827;">New PMHNP Jobs Match Your Alert</h1>
      <p style="color: #4b5563;">
        We found ${jobCount} new job${jobCount > 1 ? 's' : ''} matching your criteria:
      </p>
      
      ${jobListHtml}
      
      <p style="margin-top: 24px;">
        <a href="${BASE_URL}/jobs" 
           style="display: inline-block; background-color: #2563eb; color: white; 
                  padding: 12px 24px; border-radius: 6px; text-decoration: none;">
          View All Jobs
        </a>
      </p>
      
      <hr style="margin: 32px 0; border: none; border-top: 1px solid #e5e7eb;" />
      
      <p style="font-size: 12px; color: #9ca3af;">
        <a href="${BASE_URL}/job-alerts/manage?token=${alertToken}" style="color: #6b7280;">
          Manage your alert preferences
        </a>
        •
        <a href="${BASE_URL}/api/job-alerts/unsubscribe?token=${alertToken}" style="color: #6b7280;">
          Unsubscribe from this alert
        </a>
      </p>
    </div>
  `;

  await resend.emails.send({
    from: EMAIL_FROM,
    to: email,
    subject: `${jobCount} New PMHNP Job${jobCount > 1 ? 's' : ''} Match Your Alert`,
    html,
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
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 20px;">Your job has been renewed!</h1>
            
            <p style="font-size: 16px; margin-bottom: 16px;">Great news! Your job posting has been extended.</p>
            
            <p style="font-size: 18px; margin-bottom: 16px;"><strong>${jobTitle}</strong></p>
            
            <div style="background-color: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
              <p style="color: #166534; font-size: 15px; margin: 0;">
                <strong>New expiration date:</strong> ${expiryDate}
              </p>
            </div>
            
            <p style="font-size: 16px; margin-bottom: 24px;">Your job is now live and visible to candidates.</p>
            
            <!-- Dashboard Section -->
            <div style="background-color: #f9fafb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
              <h3 style="color: #1a1a1a; font-size: 18px; font-weight: 600; margin: 0 0 8px 0;">Your Dashboard</h3>
              <p style="color: #6b7280; font-size: 14px; margin: 0 0 16px 0;">
                View analytics and manage all your job postings
              </p>
              <a href="${BASE_URL}/employer/dashboard/${dashboardToken}" style="display: inline-block; background-color: #3b82f6; color: white; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; font-size: 14px;">
                Go to Dashboard
              </a>
            </div>
            
            <p style="font-size: 14px; color: #666;">
              Need help? Reply to this email and we'll get back to you as soon as possible.
            </p>
            
            ${getUnsubscribeFooter(unsubscribeToken)}
          </body>
        </html>
      `,
    });

    console.log('Renewal confirmation email sent successfully to:', email);
    return { success: true };
  } catch (error) {
    console.error('Error sending renewal confirmation email:', error);
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
    // Calculate days until expiry
    const now = new Date();
    const timeDiff = expiresAt.getTime() - now.getTime();
    const daysUntilExpiry = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
    
    // Format expiry date
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
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 20px;">Your Job Posting is Expiring Soon</h1>
            
            <p style="font-size: 16px; margin-bottom: 16px;">
              Your job posting <strong>"${jobTitle}"</strong> will expire on <strong>${expiryDateStr}</strong>.
            </p>
            
            <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; margin: 24px 0;">
              <h2 style="color: #1a1a1a; font-size: 18px; margin: 0 0 16px 0;">Performance So Far</h2>
              <div style="display: flex; gap: 24px;">
                <div>
                  <div style="font-size: 32px; font-weight: bold; color: #3b82f6;">${viewCount}</div>
                  <div style="font-size: 14px; color: #666;">Views</div>
                </div>
                <div>
                  <div style="font-size: 32px; font-weight: bold; color: #3b82f6;">${applyClickCount}</div>
                  <div style="font-size: 14px; color: #666;">Apply Clicks</div>
                </div>
              </div>
            </div>
            
            <p style="font-size: 16px; margin-bottom: 24px;">
              ${config.isPaidPostingEnabled 
                ? 'Renew for just $99 to keep it active for another 30 days.' 
                : 'Renew now to keep it active - FREE during our launch period!'}
            </p>
            
            <div style="margin-bottom: 24px;">
              <a href="${BASE_URL}/employer/dashboard/${dashboardToken}" style="display: inline-block; background-color: #3b82f6; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 16px; margin-right: 12px;">
                Renew Now
              </a>
              <a href="${BASE_URL}/jobs/edit/${editToken}" style="display: inline-block; background-color: transparent; color: #3b82f6; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 16px; border: 2px solid #3b82f6;">
                Edit Job
              </a>
            </div>
            
            <p style="font-size: 14px; color: #666;">
              Need help? Reply to this email and we'll get back to you as soon as possible.
            </p>
            
            ${unsubscribeToken ? getUnsubscribeFooter(unsubscribeToken) : ''}
          </body>
        </html>
      `,
    });

    console.log('Expiry warning email sent successfully to:', email);
    return { success: true };
  } catch (error) {
    console.error('Error sending expiry warning email:', error);
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
    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: 'Continue your PMHNP job posting',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 20px;">Continue Your Job Posting</h1>
            
            <p style="font-size: 16px; margin-bottom: 16px;">
              Your job posting draft has been saved.
            </p>
            
            <p style="font-size: 16px; margin-bottom: 24px;">
              Click below to continue where you left off:
            </p>
            
            <div style="margin-bottom: 24px;">
              <a href="${BASE_URL}/post-job?resume=${resumeToken}" style="display: inline-block; background-color: #3b82f6; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                Continue Posting
              </a>
            </div>
            
            <p style="font-size: 14px; color: #666; margin-top: 24px;">
              Or copy this link:<br>
              <a href="${BASE_URL}/post-job?resume=${resumeToken}" style="color: #3b82f6; word-break: break-all;">
                ${BASE_URL}/post-job?resume=${resumeToken}
              </a>
            </p>
            
            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
              <p>This link expires in 30 days.</p>
              <p>Need help? Reply to this email and we'll get back to you.</p>
            </div>
          </body>
        </html>
      `,
    });

    console.log('Draft saved email sent successfully to:', email);
    return { success: true };
  } catch (error) {
    console.error('Error sending draft saved email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send draft saved email',
    };
  }
}

