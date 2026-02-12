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

// ─── Shared Premium Design System ─────────────────────────────────────────────
// All templates use a consistent premium dark-header design with teal/emerald accents

function emailShell(content: string, footerContent: string = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0f172a;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <!-- Preheader (hidden text for email previews) -->
        <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
          PMHNP Hiring — The #1 job board for Psychiatric Mental Health Nurse Practitioners
        </div>

        <!-- Main Container -->
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%; background-color: #1e293b; border-radius: 16px; overflow: hidden; border: 1px solid #334155;">
          ${content}
        </table>

        <!-- Footer -->
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%;">
          <tr>
            <td style="padding: 24px 16px 8px 16px; text-align: center;">
              <p style="margin: 0 0 8px 0; font-size: 13px; color: #64748b;">
                10,000+ Jobs · 3,000+ Companies · 50 States
              </p>
              ${footerContent}
              <p style="margin: 8px 0 0 0; font-size: 11px; color: #475569;">
                © ${new Date().getFullYear()} PMHNP Hiring · <a href="${BASE_URL}" style="color: #475569; text-decoration: none;">pmhnphiring.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function headerBlock(title: string, subtitle: string = ''): string {
  return `
          <!-- Gradient Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #0f766e 0%, #0d9488 50%, #14b8a6 100%); padding: 32px 40px; text-align: center;">
              <img src="${BASE_URL}/pmhnp_logo.png" height="36" alt="PMHNP Hiring" style="display: block; margin: 0 auto 20px auto; filter: brightness(10);" />
              <h1 style="margin: 0; font-size: 26px; color: #ffffff; font-weight: 700; letter-spacing: -0.3px; line-height: 1.3;">
                ${title}
              </h1>
              ${subtitle ? `<p style="margin: 10px 0 0 0; font-size: 15px; color: #a7f3d0; font-weight: 400;">${subtitle}</p>` : ''}
            </td>
          </tr>`;
}

function primaryButton(text: string, url: string): string {
  return `<a href="${url}" style="display: inline-block; background: linear-gradient(135deg, #0d9488, #059669); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 700; font-size: 15px; letter-spacing: 0.3px; mso-padding-alt: 14px 32px;">${text}</a>`;
}

function secondaryButton(text: string, url: string): string {
  return `<a href="${url}" style="display: inline-block; background: transparent; color: #2dd4bf; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; border: 2px solid #2dd4bf;">${text}</a>`;
}

function infoCard(content: string, borderColor: string = '#0d9488'): string {
  return `
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px 24px; background-color: #0f172a; border-radius: 12px; border-left: 4px solid ${borderColor};">
                    ${content}
                  </td>
                </tr>
              </table>`;
}

function unsubscribeFooter(unsubscribeToken: string): string {
  return `
              <p style="margin: 8px 0 0 0; font-size: 11px; color: #475569;">
                <a href="${BASE_URL}/email-preferences?token=${unsubscribeToken}" style="color: #64748b; text-decoration: none;">Manage preferences</a>
                &nbsp;·&nbsp;
                <a href="${BASE_URL}/unsubscribe?token=${unsubscribeToken}" style="color: #64748b; text-decoration: none;">Unsubscribe</a>
              </p>`;
}

// ─── 1. Welcome Email (Job Alert Subscription) ───────────────────────────────

export async function sendWelcomeEmail(email: string, unsubscribeToken: string): Promise<EmailResult> {
  try {
    const html = emailShell(`
          ${headerBlock('Welcome to PMHNP Hiring! 🎉', 'Your job alerts are now active')}
          <tr>
            <td style="padding: 32px 40px;">
              <p style="margin: 0 0 16px 0; font-size: 16px; color: #e2e8f0; line-height: 1.7;">
                Thanks for subscribing to job alerts! We'll notify you when new positions match your preferences.
              </p>
              ${infoCard(`
                    <p style="margin: 0 0 4px 0; font-size: 13px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">What You Get</p>
                    <p style="margin: 0; font-size: 15px; color: #e2e8f0; line-height: 1.6;">
                      ✦ 10,000+ PMHNP jobs updated daily<br/>
                      ✦ Personalized matches based on your criteria<br/>
                      ✦ Salary data and employer insights
                    </p>
              `)}
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding-right: 12px;">
                    ${primaryButton('Browse Jobs', `${BASE_URL}/jobs`)}
                  </td>
                  <td>
                    ${secondaryButton('Manage Alerts', `${BASE_URL}/job-alerts`)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`,
      unsubscribeFooter(unsubscribeToken)
    );

    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: '✦ Welcome to PMHNP Hiring — Your Alerts Are Active',
      html,
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

// ─── 2. Signup Welcome Email (Account Creation) ──────────────────────────────

export async function sendSignupWelcomeEmail(
  email: string,
  firstName: string,
  role: string
): Promise<EmailResult> {
  try {
    const isEmployer = role === 'employer';

    const employerContent = `
              <p style="margin: 0 0 20px 0; font-size: 16px; color: #e2e8f0; line-height: 1.7;">
                Your employer account is ready. Start posting jobs and connect with qualified PMHNPs nationwide.
              </p>
              ${infoCard(`
                    <p style="margin: 0 0 4px 0; font-size: 13px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Get Started</p>
                    <p style="margin: 0; font-size: 15px; color: #e2e8f0; line-height: 1.8;">
                      ✦ Post your first job in minutes<br/>
                      ✦ Reach 10,000+ qualified PMHNPs<br/>
                      ✦ Get applications directly to your inbox<br/>
                      ✦ Track views and engagement analytics
                    </p>
              `)}
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding-right: 12px;">
                    ${primaryButton('Post a Job', `${SITE_URL}/post-job`)}
                  </td>
                  <td>
                    ${secondaryButton('Dashboard', `${SITE_URL}/employer/dashboard`)}
                  </td>
                </tr>
              </table>`;

    const seekerContent = `
              <p style="margin: 0 0 20px 0; font-size: 16px; color: #e2e8f0; line-height: 1.7;">
                Welcome to the #1 job board built exclusively for Psychiatric Mental Health Nurse Practitioners.
              </p>
              ${infoCard(`
                    <p style="margin: 0 0 4px 0; font-size: 13px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">What You Can Do</p>
                    <p style="margin: 0; font-size: 15px; color: #e2e8f0; line-height: 1.8;">
                      ✦ Browse 10,000+ PMHNP jobs<br/>
                      ✦ Save jobs and track applications<br/>
                      ✦ Set up personalized job alerts<br/>
                      ✦ Access our free salary guide
                    </p>
              `)}
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding-right: 12px;">
                    ${primaryButton('Browse Jobs', `${SITE_URL}/jobs`)}
                  </td>
                  <td>
                    ${secondaryButton('Set Up Alerts', `${SITE_URL}/job-alerts`)}
                  </td>
                </tr>
              </table>`;

    const html = emailShell(`
          ${headerBlock(
      `Welcome${firstName ? `, ${firstName}` : ''}! 🎉`,
      isEmployer ? 'Your employer account is ready' : 'Your PMHNP career starts here'
    )}
          <tr>
            <td style="padding: 32px 40px;">
              ${isEmployer ? employerContent : seekerContent}
            </td>
          </tr>`,
      `<p style="margin: 8px 0 0 0; font-size: 11px; color: #475569;">
        Questions? Reply to this email or contact <a href="mailto:hello@pmhnphiring.com" style="color: #64748b; text-decoration: none;">hello@pmhnphiring.com</a>
      </p>`
    );

    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: isEmployer
        ? `✦ Welcome to PMHNP Hiring — Start Hiring Today`
        : `✦ Welcome to PMHNP Hiring, ${firstName}!`,
      html,
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

// ─── 3. Job Confirmation Email (Employer) ─────────────────────────────────────

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

    const html = emailShell(`
          ${headerBlock('Your Job Post is Live! ✅', 'Now visible to thousands of PMHNPs')}
          <tr>
            <td style="padding: 32px 40px;">
              ${infoCard(`
                    <p style="margin: 0 0 4px 0; font-size: 13px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Job Title</p>
                    <p style="margin: 0; font-size: 20px; font-weight: 700; color: #f1f5f9; letter-spacing: -0.2px;">${jobTitle}</p>
              `, '#10b981')}
              <p style="margin: 0 0 24px 0; font-size: 16px; color: #e2e8f0; line-height: 1.7;">
                Your job posting is now live and visible to thousands of qualified PMHNPs. Your listing will remain active for 30 days.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding-right: 12px;">
                    ${primaryButton('View Job', `${BASE_URL}/jobs/${jobSlug}`)}
                  </td>
                  <td>
                    ${secondaryButton('Edit Job', `${BASE_URL}/jobs/edit/${editToken}`)}
                  </td>
                </tr>
              </table>
              ${dashboardUrl ? infoCard(`
                    <p style="margin: 0 0 8px 0; font-size: 15px; font-weight: 700; color: #f1f5f9;">📊 Employer Dashboard</p>
                    <p style="margin: 0 0 16px 0; font-size: 14px; color: #94a3b8; line-height: 1.5;">Manage all your job postings, view analytics, and track applicants.</p>
                    ${primaryButton('Go to Dashboard', dashboardUrl)}
              `, '#6366f1') : ''}
            </td>
          </tr>`,
      `<p style="margin: 8px 0 0 0; font-size: 11px; color: #475569;">
        Questions? Reply to this email or contact <a href="mailto:hello@pmhnphiring.com" style="color: #64748b; text-decoration: none;">hello@pmhnphiring.com</a>
      </p>`
    );

    await resend.emails.send({
      from: EMAIL_FROM,
      to: employerEmail,
      subject: '✅ Your PMHNP job post is live!',
      html,
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

// ─── 4. Job Alert Email (Matching Jobs) ───────────────────────────────────────

export async function sendJobAlertEmail(
  email: string,
  jobs: Array<{ id: string; title: string; employer: string; location: string; minSalary?: number | null; maxSalary?: number | null; salaryPeriod?: string | null; jobType?: string | null; mode?: string | null; slug?: string | null }>,
  alertToken: string
): Promise<void> {
  const jobCount = jobs.length;
  const displayJobs = jobs.slice(0, 10);

  const jobListHtml = displayJobs.map((job) => `
    <tr>
      <td style="padding: 16px 20px; border-bottom: 1px solid #334155;">
        <a href="${BASE_URL}/jobs/${slugify(job.title, job.id)}" style="color: #2dd4bf; text-decoration: none; font-size: 16px; font-weight: 600; letter-spacing: -0.2px;">
          ${job.title}
        </a>
        <p style="margin: 6px 0 0 0; font-size: 14px; color: #94a3b8;">${job.employer} · ${job.location}${job.mode ? ` · ${job.mode}` : ''}</p>
        ${job.minSalary ? `<p style="margin: 8px 0 0 0; font-size: 14px; color: #34d399; font-weight: 600;">$${(job.minSalary / 1000).toFixed(0)}k${job.maxSalary ? ` – $${(job.maxSalary / 1000).toFixed(0)}k` : '+'}</p>` : ''}
      </td>
    </tr>
  `).join('');

  const html = emailShell(`
          ${headerBlock(`${jobCount} New Job${jobCount > 1 ? 's' : ''} Found 🔔`)}
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
                ${jobListHtml}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 40px;">
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    ${primaryButton('View All Jobs', `${BASE_URL}/jobs`)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`,
    `<p style="margin: 8px 0 0 0; font-size: 11px; color: #475569;">
      <a href="${BASE_URL}/job-alerts/manage?token=${alertToken}" style="color: #64748b; text-decoration: none;">Manage alert</a>
      &nbsp;·&nbsp;
      <a href="${BASE_URL}/job-alerts/unsubscribe?token=${alertToken}" style="color: #64748b; text-decoration: none;">Unsubscribe</a>
    </p>`
  );

  await resend.emails.send({
    from: EMAIL_FROM,
    to: email,
    subject: `🔔 ${jobCount} New PMHNP Job${jobCount > 1 ? 's' : ''} Match Your Alert`,
    html,
  });
}

// ─── 5. Renewal Confirmation Email ────────────────────────────────────────────

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

    const html = emailShell(`
          ${headerBlock('Job Renewed Successfully! 🔄', 'Your listing is back at the top')}
          <tr>
            <td style="padding: 32px 40px;">
              <p style="margin: 0 0 20px 0; font-size: 16px; color: #e2e8f0; line-height: 1.7;">
                Your job posting has been renewed and is live again.
              </p>
              ${infoCard(`
                    <p style="margin: 0 0 4px 0; font-size: 13px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Job Title</p>
                    <p style="margin: 0 0 16px 0; font-size: 20px; font-weight: 700; color: #f1f5f9;">${jobTitle}</p>
                    <p style="margin: 0; font-size: 14px; color: #34d399;">
                      <strong>Active until:</strong> ${expiryDate}
                    </p>
              `, '#10b981')}
              ${infoCard(`
                    <p style="margin: 0 0 8px 0; font-size: 15px; font-weight: 700; color: #f1f5f9;">📊 Employer Dashboard</p>
                    <p style="margin: 0 0 16px 0; font-size: 14px; color: #94a3b8; line-height: 1.5;">View analytics and manage all your job postings.</p>
                    ${primaryButton('Go to Dashboard', `${BASE_URL}/employer/dashboard/${dashboardToken}`)}
              `, '#6366f1')}
            </td>
          </tr>`,
      `${unsubscribeFooter(unsubscribeToken)}
      <p style="margin: 8px 0 0 0; font-size: 11px; color: #475569;">
        Questions? Reply to this email or contact <a href="mailto:hello@pmhnphiring.com" style="color: #64748b; text-decoration: none;">hello@pmhnphiring.com</a>
      </p>`
    );

    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: '🔄 Your PMHNP job has been renewed!',
      html,
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

// ─── 6. Expiry Warning Email ──────────────────────────────────────────────────

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

    const html = emailShell(`
          <!-- Amber Warning Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #92400e 0%, #b45309 50%, #d97706 100%); padding: 32px 40px; text-align: center;">
              <img src="${BASE_URL}/pmhnp_logo.png" height="36" alt="PMHNP Hiring" style="display: block; margin: 0 auto 20px auto; filter: brightness(10);" />
              <h1 style="margin: 0; font-size: 26px; color: #ffffff; font-weight: 700; letter-spacing: -0.3px;">
                Job Expiring in ${daysUntilExpiry} Day${daysUntilExpiry !== 1 ? 's' : ''} ⏰
              </h1>
              <p style="margin: 10px 0 0 0; font-size: 15px; color: #fde68a; font-weight: 400;">
                Renew now to keep receiving applicants
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 40px;">
              ${infoCard(`
                    <p style="margin: 0 0 4px 0; font-size: 13px; color: #fbbf24; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Expires ${expiryDateStr}</p>
                    <p style="margin: 0; font-size: 20px; font-weight: 700; color: #f1f5f9;">${jobTitle}</p>
              `, '#f59e0b')}

              <p style="margin: 0 0 24px 0; font-size: 16px; color: #e2e8f0; line-height: 1.7;">
                ${config.isPaidPostingEnabled
        ? 'Renew for just $99 to keep it active for another 30 days.'
        : 'Renew now to keep it active — FREE during our launch period!'}
              </p>

              <!-- Performance Stats -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                <tr>
                  <td width="50%" style="padding: 20px; background-color: #0f172a; border-radius: 12px 0 0 12px; text-align: center; border: 1px solid #334155; border-right: none;">
                    <div style="font-size: 36px; font-weight: 800; color: #2dd4bf; letter-spacing: -1px;">${viewCount}</div>
                    <div style="font-size: 13px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px;">Views</div>
                  </td>
                  <td width="50%" style="padding: 20px; background-color: #0f172a; border-radius: 0 12px 12px 0; text-align: center; border: 1px solid #334155; border-left: none;">
                    <div style="font-size: 36px; font-weight: 800; color: #2dd4bf; letter-spacing: -1px;">${applyClickCount}</div>
                    <div style="font-size: 13px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px;">Apply Clicks</div>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding-right: 12px;">
                    ${primaryButton('Renew Now', `${BASE_URL}/employer/dashboard/${dashboardToken}`)}
                  </td>
                  <td>
                    ${secondaryButton('Edit Job', `${BASE_URL}/jobs/edit/${editToken}`)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`,
      `${unsubscribeToken ? unsubscribeFooter(unsubscribeToken) : ''}
      <p style="margin: 8px 0 0 0; font-size: 11px; color: #475569;">
        Questions? Reply to this email or contact <a href="mailto:hello@pmhnphiring.com" style="color: #64748b; text-decoration: none;">hello@pmhnphiring.com</a>
      </p>`
    );

    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: `⏰ Your job posting expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''} — Renew Now`,
      html,
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

// ─── 7. Draft Saved Email ─────────────────────────────────────────────────────

export async function sendDraftSavedEmail(
  email: string,
  resumeToken: string
): Promise<EmailResult> {
  try {
    const resumeUrl = `${BASE_URL}/post-job?resume=${resumeToken}`;

    const html = emailShell(`
          ${headerBlock('Your Draft is Saved 📝', 'Continue where you left off')}
          <tr>
            <td style="padding: 32px 40px;">
              <p style="margin: 0 0 24px 0; font-size: 16px; color: #e2e8f0; line-height: 1.7;">
                Your job posting draft has been saved. Click below to continue editing and publish when ready.
              </p>

              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 0 24px 0;">
                <tr>
                  <td>
                    ${primaryButton('Continue Posting →', resumeUrl)}
                  </td>
                </tr>
              </table>

              ${infoCard(`
                    <p style="margin: 0 0 8px 0; font-size: 13px; color: #94a3b8;">Or copy this link:</p>
                    <p style="margin: 0; font-size: 13px; word-break: break-all;">
                      <a href="${resumeUrl}" style="color: #2dd4bf; text-decoration: none;">${resumeUrl}</a>
                    </p>
              `, '#64748b')}

              <p style="margin: 0; font-size: 13px; color: #94a3b8; font-style: italic;">
                ⏱ This link expires in 30 days.
              </p>
            </td>
          </tr>`,
      `<p style="margin: 8px 0 0 0; font-size: 11px; color: #475569;">
        Questions? Reply to this email or contact <a href="mailto:hello@pmhnphiring.com" style="color: #64748b; text-decoration: none;">hello@pmhnphiring.com</a>
      </p>`
    );

    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: '📝 Continue your PMHNP job posting',
      html,
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
