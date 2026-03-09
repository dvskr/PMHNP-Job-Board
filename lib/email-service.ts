import { Resend } from 'resend';
import { slugify } from '@/lib/utils';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';

const resend = new Resend(process.env.RESEND_API_KEY);

// Use env var for email links (falls back to production)
const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com').replace(/\/$/, '');
const SITE_URL = BASE_URL; // alias for backward compatibility
const EMAIL_FROM = process.env.EMAIL_FROM || 'PMHNP Hiring <noreply@pmhnphiring.com>';

interface EmailResult {
  success: boolean;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DESIGN SYSTEM — Email-safe typography & colors matching pmhnphiring.com
// ═══════════════════════════════════════════════════════════════════════════════
//
// Font: Arial/Helvetica (guaranteed safe in all email clients)
// Dark palette: #060E18 → #0F1923 → #162231 → #1E293B
// Primary brand: teal #2DD4BF → #14B8A6 → #0D9488 → #0F766E
// Text: #F1F5F9 → #E2E8F0 → #CBD5E1 → #94A3B8 → #64748B → #475569

const F = "Arial, Helvetica, sans-serif";

const C = {
  bgBody: '#060E18',
  bgCard: '#0F1923',
  bgCardAlt: '#162231',
  bgElevated: '#1E293B',
  textPrimary: '#F1F5F9',
  textSecondary: '#E2E8F0',
  textTertiary: '#CBD5E1',
  textMuted: '#94A3B8',
  textFaded: '#64748B',
  textDimmed: '#475569',
  teal: '#2DD4BF',
  tealDark: '#14B8A6',
  tealDarker: '#0D9488',
  tealDeep: '#0F766E',
  emerald: '#34D399',
  emeraldDark: '#059669',
  green: '#10B981',
  amber: '#F59E0B',
  amberDark: '#D97706',
  amberDeep: '#92400E',
  red: '#EF4444',
  blue: '#3B82F6',
  borderLight: '#1E293B',
  borderMed: '#334155',
};

// ═══════════════════════════════════════════════════════════════════════════════
// SHELL & SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

export function emailShell(content: string, footerContent: string = '', preheaderText: string = ''): string {
  const preheader = preheaderText || 'PMHNP Hiring — The #1 job board for Psychiatric Mental Health Nurse Practitioners';
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; word-spacing: normal; }
    table { border-collapse: collapse; border-spacing: 0; }
    td { padding: 0; }
    img { border: 0; display: block; max-width: 100%; }
    
    @media only screen and (max-width: 620px) {
      .container { width: 100% !important; padding: 0 12px !important; }
      .content-pad { padding-left: 20px !important; padding-right: 20px !important; }
      .header-pad { padding: 28px 20px !important; }
      .btn-full { display: block !important; width: 100% !important; text-align: center !important; }
      .stack { display: block !important; width: 100% !important; }
      .stack td { display: block !important; width: 100% !important; padding-right: 0 !important; padding-bottom: 10px !important; }
      .hide-mobile { display: none !important; }
      .stat-cell { display: block !important; width: 100% !important; border-radius: 12px !important; margin-bottom: 8px !important; border: 1px solid ${C.borderLight} !important; }
      .feature-cell { display: block !important; width: 100% !important; padding-bottom: 16px !important; }
    }
    
    :root { color-scheme: dark; }
    [data-ogsc] .dark-bg { background-color: ${C.bgBody} !important; }
    a:hover { opacity: 0.9; }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${C.bgBody}; font-family: ${F}; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: ${C.bgBody};" class="dark-bg">
    <tr>
      <td align="center" style="padding: 40px 16px 32px;">
        <!-- Preheader -->
        <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all; font-size: 1px; line-height: 1px; color: ${C.bgBody};">
          ${preheader} &nbsp; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj; &nbsp; &zwnj;
        </div>

        <!-- Main Container -->
        <table role="presentation" class="container" width="580" cellspacing="0" cellpadding="0" style="max-width: 580px; width: 100%; background-color: ${C.bgCard}; border-radius: 16px; overflow: hidden; border: 1px solid ${C.borderLight};">
          ${content}
        </table>

        <!-- Footer -->
        <table role="presentation" class="container" width="580" cellspacing="0" cellpadding="0" style="max-width: 580px; width: 100%;">
          <tr>
            <td style="padding: 28px 20px 8px; text-align: center;">
              <!-- Social links -->
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 auto 16px;">
                <tr>
                  <td style="padding: 0 8px;"><a href="https://x.com/pmhnphiring" style="color: ${C.textDimmed}; font-family: ${F}; font-size: 12px; text-decoration: none;">𝕏</a></td>
                  <td style="padding: 0 8px;"><a href="https://www.facebook.com/pmhnphiring" style="color: ${C.textDimmed}; font-family: ${F}; font-size: 12px; text-decoration: none;">Facebook</a></td>
                  <td style="padding: 0 8px;"><a href="https://www.linkedin.com/company/pmhnpjobs" style="color: ${C.textDimmed}; font-family: ${F}; font-size: 12px; text-decoration: none;">LinkedIn</a></td>
                  <td style="padding: 0 8px;"><a href="https://www.instagram.com/pmhnphiring" style="color: ${C.textDimmed}; font-family: ${F}; font-size: 12px; text-decoration: none;">Instagram</a></td>
                </tr>
              </table>
              <p style="margin: 0 0 6px; font-family: ${F}; font-size: 12px; color: ${C.textFaded};">
                10,000+ Jobs · 3,000+ Companies · 50 States
              </p>
              ${footerContent}
              <p style="margin: 12px 0 0; font-family: ${F}; font-size: 11px; color: ${C.textDimmed};">
                &copy; ${new Date().getFullYear()} PMHNP Hiring · <a href="${BASE_URL}" style="color: ${C.textDimmed}; text-decoration: none;">pmhnphiring.com</a>
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

// ─── Header: logo + title in one block ──────────────────────────────────────

export function headerBlock(title: string, subtitle: string = ''): string {
  return `
          <tr>
            <td style="padding: 28px 40px 24px; text-align: center; border-bottom: 1px solid ${C.borderLight};">
              <div style="width: 64px; height: 64px; margin: 0 auto 14px; background-color: #FFFFFF; border-radius: 50%; padding: 2px;">
                <img src="${BASE_URL}/logo.png" width="60" height="60" alt="PMHNP Hiring" style="display: block; width: 60px; height: 60px; border-radius: 50%;" />
              </div>
              <h1 style="margin: 0; font-family: ${F}; font-size: 22px; font-weight: bold; color: ${C.textPrimary}; line-height: 1.3;">
                ${title}
              </h1>
              ${subtitle ? `<p style="margin: 8px 0 0; font-family: ${F}; font-size: 14px; color: ${C.teal};">${subtitle}</p>` : ''}
            </td>
          </tr>`;
}

function amberHeader(title: string, subtitle: string = ''): string {
  return `
          <tr>
            <td style="padding: 28px 40px 24px; text-align: center; border-bottom: 1px solid ${C.borderLight};">
              <div style="width: 64px; height: 64px; margin: 0 auto 14px; background-color: #FFFFFF; border-radius: 50%; padding: 2px;">
                <img src="${BASE_URL}/logo.png" width="60" height="60" alt="PMHNP Hiring" style="display: block; width: 60px; height: 60px; border-radius: 50%;" />
              </div>
              <h1 style="margin: 0; font-family: ${F}; font-size: 22px; font-weight: bold; color: ${C.textPrimary}; line-height: 1.3;">
                ${title}
              </h1>
              ${subtitle ? `<p style="margin: 8px 0 0; font-family: ${F}; font-size: 14px; color: ${C.amber};">${subtitle}</p>` : ''}
            </td>
          </tr>`;
}

// ─── Buttons ──────────────────────────────────────────────────────────────────

export function primaryButton(text: string, url: string): string {
  return `<a href="${url}" class="btn-full" style="display: inline-block; background: linear-gradient(135deg, ${C.tealDarker} 0%, ${C.emeraldDark} 100%); color: #ffffff; text-decoration: none; padding: 13px 28px; border-radius: 10px; font-family: ${F}; font-weight: bold; font-size: 14px; text-align: center;">${text}</a>`;
}

export function secondaryButton(text: string, url: string): string {
  return `<a href="${url}" class="btn-full" style="display: inline-block; background: transparent; color: ${C.teal}; text-decoration: none; padding: 11px 24px; border-radius: 10px; font-family: ${F}; font-weight: bold; font-size: 14px; border: 2px solid ${C.borderMed}; text-align: center;">${text}</a>`;
}

// ─── Cards & Helpers ──────────────────────────────────────────────────────────

export function infoCard(content: string, accentColor: string = C.tealDarker): string {
  return `
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 20px;">
                <tr>
                  <td style="padding: 20px 24px; background-color: ${C.bgCardAlt}; border: 1px solid ${C.borderLight};">
                    ${content}
                  </td>
                </tr>
              </table>`;
}

function divider(): string {
  return `
          <tr>
            <td style="padding: 0 40px;">
              <div style="border-top: 1px solid ${C.borderLight}; margin: 0;"></div>
            </td>
          </tr>`;
}

function unsubscribeFooter(unsubscribeToken: string): string {
  return `
              <p style="margin: 8px 0 0; font-family: ${F}; font-size: 11px; color: ${C.textDimmed};">
                <a href="${BASE_URL}/email-preferences?token=${unsubscribeToken}" style="color: ${C.textFaded}; text-decoration: none;">Manage preferences</a>
                &nbsp;·&nbsp;
                <a href="${BASE_URL}/unsubscribe?token=${unsubscribeToken}" style="color: ${C.textFaded}; text-decoration: none;">Unsubscribe</a>
              </p>`;
}

function badge(text: string, bgColor: string = C.bgElevated, textColor: string = C.textMuted, borderColor: string = C.borderLight): string {
  return `<span style="display: inline-block; background-color: ${bgColor}; color: ${textColor}; padding: 3px 10px; border-radius: 6px; font-family: ${F}; font-size: 11px; font-weight: bold; border: 1px solid ${borderColor}; line-height: 1.4;">${text}</span>`;
}

function salaryBadge(text: string): string {
  return badge(text, '#064E3B', C.emerald, '#065F46');
}

function sectionLabel(text: string, color: string = C.textMuted): string {
  return `<p style="margin: 0 0 6px; font-family: ${F}; font-size: 11px; font-weight: bold; color: ${color}; text-transform: uppercase; letter-spacing: 1px;">${text}</p>`;
}

// ─── Feature icon grid (replaces bullet lists) ───────────────────────────────

function featureRow(icon: string, title: string, desc: string): string {
  return `<tr>
    <td style="padding: 10px 0;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td width="40" valign="top" style="padding-right: 12px;">
            <div style="width: 36px; height: 36px; background-color: ${C.bgCardAlt}; border-radius: 10px; text-align: center; line-height: 36px; font-size: 18px; border: 1px solid ${C.borderLight};">${icon}</div>
          </td>
          <td valign="top">
            <p style="margin: 0; font-family: ${F}; font-size: 14px; font-weight: bold; color: ${C.textPrimary};">${title}</p>
            <p style="margin: 2px 0 0; font-family: ${F}; font-size: 13px; color: ${C.textMuted}; line-height: 1.5;">${desc}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function statCard(value: string, label: string): string {
  return `<td class="stat-cell" width="50%" style="padding: 20px; background-color: ${C.bgCardAlt}; text-align: center; border: 1px solid ${C.borderLight}; border-radius: 12px;">
    <div style="font-family: ${F}; font-size: 28px; font-weight: bold; color: ${C.teal};">${value}</div>
    <div style="font-family: ${F}; font-size: 11px; font-weight: bold; color: ${C.textMuted}; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px;">${label}</div>
  </td>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. WELCOME EMAIL (Job Alert Subscription)
// ═══════════════════════════════════════════════════════════════════════════════

export async function sendWelcomeEmail(email: string, unsubscribeToken: string): Promise<EmailResult> {
  try {
    const html = emailShell(`
          ${headerBlock('Welcome to PMHNP Hiring!', 'Your job alerts are now active')}
          <tr>
            <td class="content-pad" style="padding: 32px 40px;">
              <p style="margin: 0 0 24px; font-family: ${F}; font-size: 15px; color: ${C.textSecondary}; line-height: 1.7;">
                You're all set! We'll send you personalized job matches so you never miss a great opportunity.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                ${featureRow('🔍', 'Smart Matching', 'Jobs curated to your location, specialty, and salary preferences')}
                ${featureRow('💰', 'Salary Intel', 'Real compensation data from 10,000+ listings nationwide')}
                ${featureRow('⚡', 'First to Know', 'Alerts delivered daily — before positions get filled')}
              </table>
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr class="stack">
                  <td style="padding-right: 12px;">
                    ${primaryButton('Browse Jobs →', `${BASE_URL}/jobs`)}
                  </td>
                  <td>
                    ${secondaryButton('Manage Alerts', `${BASE_URL}/job-alerts`)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`,
      unsubscribeFooter(unsubscribeToken),
      'Your PMHNP job alerts are active — personalized matches coming your way!'
    );

    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: 'Welcome — Your Job Alerts Are Active!',
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

// ═══════════════════════════════════════════════════════════════════════════════
// 2. SIGNUP WELCOME (Account Creation)
// ═══════════════════════════════════════════════════════════════════════════════

export async function sendSignupWelcomeEmail(
  email: string,
  firstName: string,
  role: string
): Promise<EmailResult> {
  try {
    const isEmployer = role === 'employer';
    const greeting = firstName ? `Welcome, ${firstName}!` : 'Welcome!';

    const employerContent = `
              <p style="margin: 0 0 24px; font-family: ${F}; font-size: 15px; color: ${C.textSecondary}; line-height: 1.7;">
                Your employer account is ready. Start posting jobs and connect with qualified PMHNPs nationwide.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                ${featureRow('📋', 'Post in Minutes', 'Create and publish job listings with our guided form')}
                ${featureRow('👥', 'Reach PMHNPs', 'Your listing is seen by 10,000+ qualified candidates')}
                ${featureRow('📊', 'Track Everything', 'View counts, apply clicks, and applicant analytics')}
              </table>
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr class="stack">
                  <td style="padding-right: 12px;">
                    ${primaryButton('Post a Job →', `${SITE_URL}/post-job`)}
                  </td>
                  <td>
                    ${secondaryButton('Dashboard', `${SITE_URL}/employer/dashboard`)}
                  </td>
                </tr>
              </table>`;

    const seekerContent = `
              <p style="margin: 0 0 24px; font-family: ${F}; font-size: 15px; color: ${C.textSecondary}; line-height: 1.7;">
                Welcome to the #1 job board built exclusively for Psychiatric Mental Health Nurse Practitioners.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                ${featureRow('🔍', 'Browse 10,000+ Jobs', 'Remote, travel, full-time, per diem — all PMHNP specialties')}
                ${featureRow('🔔', 'Smart Alerts', 'Get notified instantly when matching jobs are posted')}
                ${featureRow('📄', 'One-Click Apply', 'Save jobs, track applications, and apply fast')}
              </table>
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr class="stack">
                  <td style="padding-right: 12px;">
                    ${primaryButton('Browse Jobs →', `${SITE_URL}/jobs`)}
                  </td>
                  <td>
                    ${secondaryButton('Set Up Alerts', `${SITE_URL}/job-alerts`)}
                  </td>
                </tr>
              </table>`;

    const html = emailShell(`
          ${headerBlock(greeting, isEmployer ? 'Your employer account is ready' : 'Your PMHNP career starts here')}
          <tr>
            <td class="content-pad" style="padding: 32px 40px;">
              ${isEmployer ? employerContent : seekerContent}
            </td>
          </tr>`,
      `<p style="margin: 8px 0 0; font-family: ${F}; font-size: 11px; color: ${C.textDimmed};">
        Questions? Reply to this email or contact <a href="mailto:hello@pmhnphiring.com" style="color: ${C.textFaded}; text-decoration: none;">hello@pmhnphiring.com</a>
      </p>`,
      isEmployer ? 'Your employer account is ready — start posting jobs today!' : `Welcome ${firstName || ''} — browse 10,000+ PMHNP jobs now!`
    );

    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: isEmployer
        ? 'Welcome to PMHNP Hiring — Start Hiring Today'
        : `Welcome to PMHNP Hiring, ${firstName || 'there'}!`,
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

// ═══════════════════════════════════════════════════════════════════════════════
// 3. JOB CONFIRMATION EMAIL (Employer)
// ═══════════════════════════════════════════════════════════════════════════════

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
          ${headerBlock('Your Job Post is Live!', 'Now visible to thousands of PMHNPs')}
          <tr>
            <td class="content-pad" style="padding: 32px 40px;">
              <!-- Job title card with green accent -->
              ${infoCard(`
                    ${sectionLabel('Published')}
                    <p style="margin: 0; font-family: ${F}; font-size: 18px; font-weight: bold; color: ${C.textPrimary};">${jobTitle}</p>
              `, C.green)}

              <!-- Status timeline -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                <tr>
                  <td width="33%" style="text-align: center; padding: 12px 4px;">
                    <div style="width: 32px; height: 32px; background: ${C.tealDarker}; border-radius: 50%; margin: 0 auto 8px; line-height: 32px; font-size: 14px; color: #fff;">✓</div>
                    <div style="font-family: ${F}; font-size: 11px; font-weight: bold; color: ${C.teal};">Posted</div>
                  </td>
                  <td width="33%" style="text-align: center; padding: 12px 4px;">
                    <div style="width: 32px; height: 32px; background: ${C.tealDarker}; border-radius: 50%; margin: 0 auto 8px; line-height: 32px; font-size: 14px; color: #fff;">✓</div>
                    <div style="font-family: ${F}; font-size: 11px; font-weight: bold; color: ${C.teal};">Live</div>
                  </td>
                  <td width="33%" style="text-align: center; padding: 12px 4px;">
                    <div style="width: 32px; height: 32px; background: ${C.bgElevated}; border-radius: 50%; margin: 0 auto 8px; line-height: 32px; font-size: 14px; color: ${C.textMuted}; border: 2px dashed ${C.borderMed};">⏳</div>
                    <div style="font-family: ${F}; font-size: 11px; color: ${C.textMuted};">Receiving Views</div>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 24px; font-family: ${F}; font-size: 14px; color: ${C.textMuted}; line-height: 1.6;">
                Your listing is active for <strong style="color: ${C.textPrimary};">30 days</strong>. We'll notify you when it's time to renew.
              </p>

              <table role="presentation" cellspacing="0" cellpadding="0" style="margin-bottom: 20px;">
                <tr class="stack">
                  <td style="padding-right: 12px;">
                    ${primaryButton('View Job →', `${BASE_URL}/jobs/${jobSlug}`)}
                  </td>
                  <td>
                    ${secondaryButton('Edit Job', `${BASE_URL}/jobs/edit/${editToken}`)}
                  </td>
                </tr>
              </table>

              ${dashboardUrl ? infoCard(`
                    <p style="margin: 0 0 8px; font-family: ${F}; font-size: 14px; font-weight: bold; color: ${C.textPrimary};">📊 Your Employer Dashboard</p>
                    <p style="margin: 0 0 16px; font-family: ${F}; font-size: 13px; color: ${C.textMuted}; line-height: 1.5;">Track views, clicks, and manage all your job postings in one place.</p>
                    ${primaryButton('Open Dashboard', dashboardUrl)}
              `, C.blue) : ''}
            </td>
          </tr>`,
      `<p style="margin: 8px 0 0; font-family: ${F}; font-size: 11px; color: ${C.textDimmed};">
        Questions? Reply to this email or contact <a href="mailto:hello@pmhnphiring.com" style="color: ${C.textFaded}; text-decoration: none;">hello@pmhnphiring.com</a>
      </p>`,
      `Your job "${jobTitle}" is now live on PMHNP Hiring!`
    );

    await resend.emails.send({
      from: EMAIL_FROM,
      to: employerEmail,
      subject: `✅ Your PMHNP job post is live — "${jobTitle}"`,
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

// ═══════════════════════════════════════════════════════════════════════════════
// 4. JOB ALERT EMAIL (Matching Jobs)
// ═══════════════════════════════════════════════════════════════════════════════

export async function sendJobAlertEmail(
  email: string,
  jobs: Array<{ id: string; title: string; employer: string; location: string; minSalary?: number | null; maxSalary?: number | null; salaryPeriod?: string | null; jobType?: string | null; mode?: string | null; slug?: string | null }>,
  alertToken: string
): Promise<void> {
  const jobCount = jobs.length;
  const displayJobs = jobs.slice(0, 10);

  const jobListHtml = displayJobs.map((job, index) => {
    const jobUrl = `${BASE_URL}/jobs/${slugify(job.title, job.id)}`;
    const isLast = index === displayJobs.length - 1;
    const salaryText = job.minSalary ? `$${(job.minSalary / 1000).toFixed(0)}k${job.maxSalary ? ` – $${(job.maxSalary / 1000).toFixed(0)}k` : '+'}` : '';

    return `
      <tr>
        <td style="padding: 16px 20px;${!isLast ? ` border-bottom: 1px solid ${C.borderLight};` : ''}">
          <a href="${jobUrl}" style="color: ${C.teal}; text-decoration: none; font-family: ${F}; font-size: 15px; font-weight: bold; line-height: 1.4;">
            ${job.title}
          </a>
          <p style="margin: 4px 0 0; font-family: ${F}; font-size: 13px; color: ${C.textMuted};">
            ${job.employer} · ${job.location}${job.mode ? ` · ${job.mode}` : ''}
          </p>
          ${salaryText ? `<p style="margin: 8px 0 0;">${salaryBadge(salaryText)}</p>` : ''}
        </td>
      </tr>`;
  }).join('');

  const html = emailShell(`
          ${headerBlock(`${jobCount} New PMHNP Job${jobCount > 1 ? 's' : ''} Match Your Alert`)}
          <tr>
            <td class="content-pad" style="padding: 24px 40px 8px;">
              <p style="margin: 0; font-family: ${F}; font-size: 15px; color: ${C.textSecondary}; line-height: 1.6;">
                New positions matching your criteria:
              </p>
            </td>
          </tr>
          <tr>
            <td class="content-pad" style="padding: 12px 40px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: ${C.bgCardAlt}; border: 1px solid ${C.borderLight}; border-radius: 12px; overflow: hidden;">
                ${jobListHtml}
              </table>
            </td>
          </tr>
          ${jobCount > 10 ? `
          <tr>
            <td class="content-pad" style="padding: 8px 40px 0;">
              <p style="margin: 0; font-family: ${F}; font-size: 13px; color: ${C.textMuted}; text-align: center;">
                + ${jobCount - 10} more matching jobs
              </p>
            </td>
          </tr>` : ''}
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
    `<p style="margin: 8px 0 0; font-family: ${F}; font-size: 11px; color: ${C.textDimmed};">
      <a href="${BASE_URL}/job-alerts/manage?token=${alertToken}" style="color: ${C.textFaded}; text-decoration: none;">Manage alert</a>
      &nbsp;·&nbsp;
      <a href="${BASE_URL}/job-alerts/unsubscribe?token=${alertToken}" style="color: ${C.textFaded}; text-decoration: none;">Delete alert</a>
    </p>`,
    `${jobCount} new PMHNP jobs matching your alert — view them before they're filled!`
  );

  await resend.emails.send({
    from: EMAIL_FROM,
    to: email,
    subject: `🔔 ${jobCount} New PMHNP Job${jobCount > 1 ? 's' : ''} Match Your Alert`,
    html,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. RENEWAL CONFIRMATION EMAIL
// ═══════════════════════════════════════════════════════════════════════════════

export async function sendRenewalConfirmationEmail(
  email: string,
  jobTitle: string,
  newExpiresAt: Date,
  dashboardToken: string,
  unsubscribeToken: string
): Promise<EmailResult> {
  try {
    const expiryStr = newExpiresAt.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const html = emailShell(`
          ${headerBlock('Job Renewed Successfully!', 'Your listing is back at the top')}
          <tr>
            <td class="content-pad" style="padding: 32px 40px;">
              ${infoCard(`
                    ${sectionLabel('Renewed')}
                    <p style="margin: 0 0 10px; font-family: ${F}; font-size: 18px; font-weight: bold; color: ${C.textPrimary};">${jobTitle}</p>
                    <p style="margin: 0; font-family: ${F}; font-size: 13px; color: ${C.emerald};">
                      <strong>Active until:</strong> ${expiryStr}
                    </p>
              `, C.green)}
              <p style="margin: 0 0 24px; font-family: ${F}; font-size: 14px; color: ${C.textMuted}; line-height: 1.6;">
                Your listing has been boosted back to the top of search results and will continue receiving views and applicants.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    ${primaryButton('View Dashboard →', `${BASE_URL}/employer/dashboard/${dashboardToken}`)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`,
      unsubscribeFooter(unsubscribeToken),
      `Your job "${jobTitle}" has been renewed and is live again!`
    );

    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: `✅ Job Renewed — "${jobTitle}" is live again`,
      html,
    });

    logger.info('Renewal confirmation email sent', { email, jobTitle });
    return { success: true };
  } catch (error) {
    logger.error('Error sending renewal confirmation email', error, { email });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send renewal email',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. EXPIRY WARNING EMAIL
// ═══════════════════════════════════════════════════════════════════════════════

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
          ${amberHeader(
      `Job Expiring in ${daysUntilExpiry} Day${daysUntilExpiry !== 1 ? 's' : ''}`,
      'Renew now to keep receiving applicants'
    )}
          <tr>
            <td class="content-pad" style="padding: 32px 40px;">
              ${infoCard(`
                    ${sectionLabel('Expires ' + expiryDateStr, '#FBBF24')}
                    <p style="margin: 0; font-family: ${F}; font-size: 18px; font-weight: bold; color: ${C.textPrimary};">${jobTitle}</p>
              `, C.amber)}

              <p style="margin: 0 0 24px; font-family: ${F}; font-size: 15px; color: ${C.textSecondary}; line-height: 1.7;">
                ${config.isPaidPostingEnabled
        ? 'Renew for just $199 to keep it active for another 30 days.'
        : 'Renew now to keep it active — <strong style="color: ' + C.emerald + ';">FREE during our launch period!</strong>'}
              </p>

              <!-- Performance Stats -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                <tr>
                  ${statCard(viewCount.toLocaleString(), 'Views')}
                  <td width="8"></td>
                  ${statCard(applyClickCount.toLocaleString(), 'Apply Clicks')}
                </tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr class="stack">
                  <td style="padding-right: 12px;">
                    ${primaryButton('Renew Now →', `${BASE_URL}/employer/dashboard/${dashboardToken}`)}
                  </td>
                  <td>
                    ${secondaryButton('Edit Job', `${BASE_URL}/jobs/edit/${editToken}`)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`,
      `${unsubscribeToken ? unsubscribeFooter(unsubscribeToken) : ''}
      <p style="margin: 8px 0 0; font-family: ${F}; font-size: 11px; color: ${C.textDimmed};">
        Questions? Reply to this email or contact <a href="mailto:hello@pmhnphiring.com" style="color: ${C.textFaded}; text-decoration: none;">hello@pmhnphiring.com</a>
      </p>`,
      `Your job "${jobTitle}" expires in ${daysUntilExpiry} days — renew now to keep receiving applicants!`
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

// ═══════════════════════════════════════════════════════════════════════════════
// 7. DRAFT SAVED EMAIL
// ═══════════════════════════════════════════════════════════════════════════════

export async function sendDraftSavedEmail(
  email: string,
  resumeToken: string
): Promise<EmailResult> {
  try {
    const resumeUrl = `${BASE_URL}/post-job?resume=${resumeToken}`;

    const html = emailShell(`
          ${headerBlock('Your Draft is Saved', 'Continue where you left off')}
          <tr>
            <td class="content-pad" style="padding: 32px 40px;">
              <p style="margin: 0 0 24px; font-family: ${F}; font-size: 15px; color: ${C.textSecondary}; line-height: 1.7;">
                Your job posting draft has been saved. Pick up right where you left off — your progress won't be lost.
              </p>

              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 0 24px;">
                <tr>
                  <td>
                    ${primaryButton('Continue Posting →', resumeUrl)}
                  </td>
                </tr>
              </table>

              ${infoCard(`
                    <p style="margin: 0 0 6px; font-family: ${F}; font-size: 12px; color: ${C.textMuted};">Or copy this link:</p>
                    <p style="margin: 0; font-family: ${F}; font-size: 12px; word-break: break-all;">
                      <a href="${resumeUrl}" style="color: ${C.teal}; text-decoration: none;">${resumeUrl}</a>
                    </p>
              `, C.textFaded)}

              <p style="margin: 0; font-family: ${F}; font-size: 12px; color: ${C.textMuted}; font-style: italic;">
                This link expires in 30 days.
              </p>
            </td>
          </tr>`,
      `<p style="margin: 8px 0 0; font-family: ${F}; font-size: 11px; color: ${C.textDimmed};">
        Questions? Reply to this email or contact <a href="mailto:hello@pmhnphiring.com" style="color: ${C.textFaded}; text-decoration: none;">hello@pmhnphiring.com</a>
      </p>`,
      'Your job posting draft has been saved — continue anytime!'
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

// ═══════════════════════════════════════════════════════════════════════════════
// 8. CONTACT FORM CONFIRMATION (User-facing)
// ═══════════════════════════════════════════════════════════════════════════════

export function buildContactConfirmationHtml(name: string, subject: string): string {
  return emailShell(`
          ${headerBlock('Message Received!', "We'll get back to you soon")}
          <tr>
            <td class="content-pad" style="padding: 32px 40px;">
              <p style="margin: 0 0 20px; font-family: ${F}; font-size: 15px; color: ${C.textSecondary}; line-height: 1.7;">
                Hi ${name}, thanks for reaching out! We've received your message and will respond within <strong style="color: ${C.textPrimary};">24–48 hours</strong>.
              </p>

              ${infoCard(`
                    ${sectionLabel('Your message')}
                    <p style="margin: 0; font-family: ${F}; font-size: 15px; font-weight: bold; color: ${C.textPrimary};">"${subject}"</p>
              `, C.tealDarker)}

              <p style="margin: 0 0 24px; font-family: ${F}; font-size: 14px; color: ${C.textMuted}; line-height: 1.6;">
                In the meantime, you might find these helpful:
              </p>

              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr class="stack">
                  <td style="padding-right: 12px;">
                    ${primaryButton('Browse Jobs', `${BASE_URL}/jobs`)}
                  </td>
                  <td>
                    ${secondaryButton('FAQ', `${BASE_URL}/faq`)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`,
    `<p style="margin: 8px 0 0; font-family: ${F}; font-size: 11px; color: ${C.textDimmed};">
      <a href="mailto:support@pmhnphiring.com" style="color: ${C.textFaded}; text-decoration: none;">support@pmhnphiring.com</a>
      &nbsp;·&nbsp;
      <a href="${BASE_URL}" style="color: ${C.textFaded}; text-decoration: none;">pmhnphiring.com</a>
    </p>`,
    `Thanks for contacting PMHNP Hiring — we'll respond within 24–48 hours!`
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 9. CONTACT FORM NOTIFICATION (Internal / Support Team)
// ═══════════════════════════════════════════════════════════════════════════════

export function buildContactNotificationHtml(name: string, email: string, subject: string, message: string): string {
  return emailShell(`
          ${headerBlock('New Contact Form Submission', 'pmhnphiring.com')}
          <tr>
            <td class="content-pad" style="padding: 32px 40px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding: 12px 16px; background-color: ${C.bgCardAlt}; border-radius: 12px 12px 0 0; border-bottom: 1px solid ${C.borderLight};">
                    ${sectionLabel('From')}
                    <p style="margin: 0; font-family: ${F}; font-size: 15px; color: ${C.textPrimary};">${name}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; background-color: ${C.bgCardAlt}; border-bottom: 1px solid ${C.borderLight};">
                    ${sectionLabel('Email')}
                    <p style="margin: 0;"><a href="mailto:${email}" style="font-family: ${F}; font-size: 15px; color: ${C.teal}; text-decoration: none;">${email}</a></p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; background-color: ${C.bgCardAlt}; border-bottom: 1px solid ${C.borderLight};">
                    ${sectionLabel('Subject')}
                    <p style="margin: 0; font-family: ${F}; font-size: 15px; color: ${C.textPrimary};">${subject}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; background-color: ${C.bgCardAlt}; border-radius: 0 0 12px 12px;">
                    ${sectionLabel('Message')}
                    <p style="margin: 0; font-family: ${F}; font-size: 14px; color: ${C.textSecondary}; line-height: 1.7; white-space: pre-wrap;">${message}</p>
                  </td>
                </tr>
              </table>
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    ${primaryButton('Reply to ' + name, `mailto:${email}`)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`,
    '',
    `New contact form submission from ${name} — "${subject}"`
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 10. SALARY GUIDE DELIVERY EMAIL
// ═══════════════════════════════════════════════════════════════════════════════

export function buildSalaryGuideHtml(pdfUrl: string, unsubscribeToken: string): string {
  const currentYear = new Date().getFullYear();
  return emailShell(`
          ${headerBlock(`${currentYear} PMHNP Salary Guide`, 'Know Your Worth. Negotiate With Confidence.')}
          <tr>
            <td class="content-pad" style="padding: 32px 40px;">
              <p style="margin: 0 0 24px; font-family: ${F}; font-size: 15px; color: ${C.textSecondary}; line-height: 1.7;">
                Your comprehensive salary guide is ready! Click below to download.
              </p>

              <!-- Download CTA -->
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 auto 28px;">
                <tr>
                  <td>
                    ${primaryButton('Download PDF Guide →', pdfUrl)}
                  </td>
                </tr>
              </table>

              <!-- Stats Bar -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                <tr>
                  <td width="33%" style="padding: 16px 4px; text-align: center; background-color: ${C.bgCardAlt}; border-radius: 12px 0 0 12px; border: 1px solid ${C.borderLight}; border-right: none;">
                    <div style="font-family: ${F}; font-size: 22px; font-weight: bold; color: ${C.teal};">$155k+</div>
                    <div style="font-family: ${F}; font-size: 10px; color: ${C.textMuted}; margin-top: 2px;">National Avg</div>
                  </td>
                  <td width="34%" style="padding: 16px 4px; text-align: center; background-color: ${C.bgCardAlt}; border: 1px solid ${C.borderLight}; border-left: none; border-right: none;">
                    <div style="font-family: ${F}; font-size: 22px; font-weight: bold; color: ${C.teal};">$210k+</div>
                    <div style="font-family: ${F}; font-size: 10px; color: ${C.textMuted}; margin-top: 2px;">Top 10%</div>
                  </td>
                  <td width="33%" style="padding: 16px 4px; text-align: center; background-color: ${C.bgCardAlt}; border-radius: 0 12px 12px 0; border: 1px solid ${C.borderLight}; border-left: none;">
                    <div style="font-family: ${F}; font-size: 22px; font-weight: bold; color: ${C.teal};">+45%</div>
                    <div style="font-family: ${F}; font-size: 10px; color: ${C.textMuted}; margin-top: 2px;">Job Growth</div>
                  </td>
                </tr>
              </table>

              <!-- What's Inside -->
              ${infoCard(`
                    ${sectionLabel("What's inside")}
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr><td style="padding: 3px 0; font-family: ${F}; font-size: 13px; color: ${C.textSecondary}; line-height: 1.6;"><span style="color: ${C.teal}; margin-right: 6px;">✦</span> Salary by state with COL adjustments</td></tr>
                      <tr><td style="padding: 3px 0; font-family: ${F}; font-size: 13px; color: ${C.textSecondary}; line-height: 1.6;"><span style="color: ${C.teal}; margin-right: 6px;">✦</span> Telehealth vs in-person pay comparison</td></tr>
                      <tr><td style="padding: 3px 0; font-family: ${F}; font-size: 13px; color: ${C.textSecondary}; line-height: 1.6;"><span style="color: ${C.teal}; margin-right: 6px;">✦</span> Specialty premiums (+15-25%)</td></tr>
                      <tr><td style="padding: 3px 0; font-family: ${F}; font-size: 13px; color: ${C.textSecondary}; line-height: 1.6;"><span style="color: ${C.teal}; margin-right: 6px;">✦</span> Negotiation scripts that work</td></tr>
                    </table>
              `, C.tealDarker)}

              <p style="margin: 0 0 20px; font-family: ${F}; font-size: 14px; color: ${C.textMuted};">
                Ready to find your next high-paying position?
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr class="stack">
                  <td style="padding-right: 12px;">
                    ${primaryButton('Browse Jobs', `${BASE_URL}/jobs`)}
                  </td>
                  <td>
                    ${secondaryButton('Set Up Alerts', `${BASE_URL}/job-alerts`)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`,
    unsubscribeFooter(unsubscribeToken),
    `Your ${currentYear} PMHNP Salary Guide is ready — download now!`
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 11. EMPLOYER MESSAGE NOTIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

export async function sendEmployerMessageNotification(
  recipientEmail: string,
  recipientFirstName: string | null,
  senderName: string,
  senderCompany: string | null,
  subject: string,
  messageBody: string,
  jobTitle: string | null
): Promise<EmailResult> {
  try {
    const greeting = recipientFirstName ? `Hi ${recipientFirstName},` : 'Hi there,';
    const fromLine = senderCompany ? `${senderName} from ${senderCompany}` : senderName;
    const preview = messageBody.length > 200 ? messageBody.substring(0, 200) + '…' : messageBody;

    const html = emailShell(`
          ${headerBlock('New Message from an Employer', fromLine)}
          <tr>
            <td class="content-pad" style="padding: 32px 40px;">
              <p style="margin: 0 0 20px; font-family: ${F}; font-size: 15px; color: ${C.textSecondary}; line-height: 1.7;">
                ${greeting} you have a new message about a potential opportunity.
              </p>

              ${jobTitle ? infoCard(`
                    ${sectionLabel('Regarding')}
                    <p style="margin: 0; font-family: ${F}; font-size: 15px; font-weight: bold; color: ${C.textPrimary};">${jobTitle}</p>
              `, C.tealDarker) : ''}

              ${infoCard(`
                    ${sectionLabel('Subject')}
                    <p style="margin: 0 0 12px; font-family: ${F}; font-size: 15px; font-weight: bold; color: ${C.textPrimary};">${subject}</p>
                    ${sectionLabel('Message')}
                    <p style="margin: 0; font-family: ${F}; font-size: 14px; color: ${C.textSecondary}; line-height: 1.7; white-space: pre-wrap;">${preview}</p>
              `, C.tealDarker)}

              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 24px 0 0;">
                <tr>
                  <td>
                    ${primaryButton('View Full Message →', `${BASE_URL}/messages`)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`,
      `<p style="margin: 8px 0 0; font-family: ${F}; font-size: 11px; color: ${C.textDimmed};">
        Questions? Reply to this email or contact <a href="mailto:hello@pmhnphiring.com" style="color: ${C.textFaded}; text-decoration: none;">hello@pmhnphiring.com</a>
      </p>`,
      `${fromLine} sent you a message${jobTitle ? ` about "${jobTitle}"` : ''} — view it now!`
    );

    await resend.emails.send({
      from: EMAIL_FROM,
      to: recipientEmail,
      subject: `📩 New message from ${fromLine}${jobTitle ? ` — ${jobTitle}` : ''}`,
      html,
    });

    logger.info('Employer message notification sent', { recipientEmail, senderName });
    return { success: true };
  } catch (error) {
    logger.error('Error sending employer message notification', error, { recipientEmail });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send message notification',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEW CANDIDATE ALERT (DIGEST)
// ═══════════════════════════════════════════════════════════════════════════════

interface CandidateDigest {
  name: string;
  headline: string | null;
  profileUrl: string;
  specialties: string[];
  states: string[];
  experience: number | null;
}

export async function sendNewCandidateAlertEmail(
  recipientEmail: string,
  employerName: string,
  candidates: CandidateDigest[]
): Promise<EmailResult> {
  try {
    const candidateRows = candidates.slice(0, 10).map(c => `
      <tr>
        <td style="padding: 14px 16px; border-bottom: 1px solid ${C.borderLight};">
          <div style="font-family: ${F};">
            <div style="font-size: 15px; font-weight: 600; color: ${C.textPrimary}; margin-bottom: 4px;">
              ${c.name}
            </div>
            ${c.headline ? `<div style="font-size: 13px; color: ${C.textMuted}; margin-bottom: 6px;">${c.headline}</div>` : ''}
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              ${c.specialties.slice(0, 3).map(s => badge(s, 'rgba(139,92,246,0.15)', '#A78BFA', 'rgba(139,92,246,0.3)')).join(' ')}
              ${c.states.slice(0, 3).map(s => badge(s)).join(' ')}
              ${c.experience !== null ? badge(`${c.experience}+ yrs`, 'rgba(45,212,191,0.15)', '#2DD4BF', 'rgba(45,212,191,0.3)') : ''}
            </div>
          </div>
        </td>
        <td style="padding: 14px 16px; border-bottom: 1px solid ${C.borderLight}; vertical-align: middle;">
          ${primaryButton('View →', c.profileUrl)}
        </td>
      </tr>
    `).join('');

    const html = emailShell(
      `${amberHeader('🔔 New Matching Candidates', `${candidates.length} new candidate${candidates.length !== 1 ? 's' : ''} match your criteria`)}
       ${infoCard(`
         <table width="100%" style="border-collapse: collapse;">
           ${candidateRows}
         </table>
       `)}
       <div style="text-align: center; margin: 24px 0;">
         ${primaryButton('View All Candidates', `${SITE_URL}/employer/candidates`)}
       </div>`,
      `<p style="margin: 8px 0 0; font-family: ${F}; font-size: 11px; color: ${C.textDimmed};">
         To stop these alerts, update your preferences in <a href="${SITE_URL}/employer/settings" style="color: ${C.textFaded}; text-decoration: none;">Employer Settings</a>.
       </p>`,
      `${candidates.length} new PMHNP candidates match your criteria — view them now!`
    );

    await resend.emails.send({
      from: EMAIL_FROM,
      to: recipientEmail,
      subject: `🔔 ${candidates.length} new candidate${candidates.length !== 1 ? 's' : ''} match your criteria`,
      html,
    });

    logger.info('New candidate alert sent', { recipientEmail, count: candidates.length });
    return { success: true };
  } catch (error) {
    logger.error('Error sending new candidate alert', error, { recipientEmail });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send candidate alert',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN BROADCAST EMAIL
// ═══════════════════════════════════════════════════════════════════════════════

export function buildBroadcastHtml(body: string, preheaderText: string = ''): string {
  return emailShell(`
          ${headerBlock('PMHNP Hiring', 'A message from the team')}
          <tr>
            <td class="content-pad" style="padding: 32px 40px;">
              <div style="font-family: ${F}; font-size: 15px; color: ${C.textSecondary}; line-height: 1.8;">
                ${body}
              </div>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 28px 0 0;">
                <tr>
                  <td>
                    ${primaryButton('Visit PMHNP Hiring →', `${BASE_URL}`)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`,
    `<p style="margin: 8px 0 0; font-family: ${F}; font-size: 11px; color: ${C.textDimmed};">
        <a href="${BASE_URL}/unsubscribe" style="color: ${C.textFaded}; text-decoration: none;">Unsubscribe</a>
        &nbsp;·&nbsp;
        <a href="mailto:hello@pmhnphiring.com" style="color: ${C.textFaded}; text-decoration: none;">Contact us</a>
      </p>`,
    preheaderText || 'A message from PMHNP Hiring'
  );
}

export async function sendBroadcastEmail(
  to: string,
  subject: string,
  htmlBody: string
): Promise<EmailResult> {
  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject,
      html: htmlBody,
    });
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to send broadcast';
    return { success: false, error: msg };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEW APPLICATION NOTIFICATION (Employer — Platform Apply)
// ═══════════════════════════════════════════════════════════════════════════════

interface NewApplicationEmailParams {
  employerEmail: string;
  employerName: string;
  jobTitle: string;
  candidateName: string;
  candidateHeadline?: string;
  candidateExperience?: number | null;
  hasResume: boolean;
  hasCoverLetter: boolean;
}

export async function sendNewApplicationEmail(params: NewApplicationEmailParams): Promise<EmailResult> {
  const {
    employerEmail,
    employerName,
    jobTitle,
    candidateName,
    candidateHeadline,
    candidateExperience,
    hasResume,
    hasCoverLetter,
  } = params;

  try {
    const greeting = employerName ? `Hi ${employerName.split(' ')[0]},` : 'Hi there,';

    const html = emailShell(`
          ${headerBlock('New Application Received!', jobTitle)}
          <tr>
            <td class="content-pad" style="padding: 32px 40px;">
              <p style="margin: 0 0 20px; font-family: ${F}; font-size: 15px; color: ${C.textSecondary}; line-height: 1.7;">
                ${greeting} a candidate has applied for your job posting on PMHNP Hiring.
              </p>

              ${infoCard(`
                    ${sectionLabel('Candidate')}
                    <p style="margin: 0 0 4px; font-family: ${F}; font-size: 17px; font-weight: bold; color: ${C.textPrimary};">${candidateName}</p>
                    ${candidateHeadline ? `<p style="margin: 0 0 4px; font-family: ${F}; font-size: 13px; color: ${C.textMuted};">${candidateHeadline}</p>` : ''}
                    ${candidateExperience ? `<p style="margin: 0; font-family: ${F}; font-size: 13px; color: ${C.textMuted};">${candidateExperience}+ years experience</p>` : ''}
              `, C.tealDarker)}

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                ${featureRow(hasResume ? '✅' : '❌', 'Resume', hasResume ? 'Resume attached' : 'No resume submitted')}
                ${featureRow(hasCoverLetter ? '✅' : '—', 'Cover Letter', hasCoverLetter ? 'Cover letter included' : 'No cover letter')}
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    ${primaryButton('View Applicant →', `${BASE_URL}/employer/dashboard`)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`,
      `<p style="margin: 8px 0 0; font-family: ${F}; font-size: 11px; color: ${C.textDimmed};">
        Questions? Reply to this email or contact <a href="mailto:hello@pmhnphiring.com" style="color: ${C.textFaded}; text-decoration: none;">hello@pmhnphiring.com</a>
      </p>`,
      `${candidateName} applied for "${jobTitle}" — view their application now!`
    );

    await resend.emails.send({
      from: EMAIL_FROM,
      to: employerEmail,
      subject: `📋 New application for "${jobTitle}" — ${candidateName}`,
      html,
    });

    logger.info('New application notification sent', { employerEmail, jobTitle, candidateName });
    return { success: true };
  } catch (error) {
    logger.error('Error sending new application notification', error, { employerEmail });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send application notification',
    };
  }
}


