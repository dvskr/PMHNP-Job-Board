import { Resend } from 'resend';
import { slugify } from '@/lib/utils';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import {
  emailShellV2, headerBlockV2,
  primaryButtonV2, spacerV2, closeContentV2,
  unsubscribeFooterV2, bodyTextV2,
  sectionLabelV2, infoCardV2,
  V2, SANS as SANS_V2, SERIF as SERIF_V2,
} from '@/lib/email-templates-v2';

const resend = new Resend(process.env.RESEND_API_KEY);

// Use env var for email links (falls back to production)
const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com').replace(/\/$/, '');
const SITE_URL = BASE_URL; // alias for backward compatibility
const IMG = `${BASE_URL}/images/email`;

/** Icon-beside-text layout — matches the v2-templates.ts simple() pattern */
function simpleBlock(iconFile: string, bodyHtml: string): string {
  return `<tr><td class="content-pad" style="padding:0 40px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
    <td width="100" height="100" valign="middle" style="padding-right:20px;width:100px;min-width:100px;height:100px;overflow:hidden;">
      <img src="${IMG}/${iconFile}" alt="" width="100" height="100" style="width:100px;min-width:100px;height:100px;min-height:100px;max-height:100px;border-radius:12px;display:block;" />
    </td>
    <td valign="top">
      <p style="margin:0;font-family:${SERIF_V2};font-size:17px;color:${V2.textBody};line-height:1.7;">${bodyHtml}</p>
    </td>
  </tr></table>
</td></tr>`;
}

/** Step row — icon + title + description (matches v2 step pattern) */
function stepBlock(iconFile: string, title: string, desc: string): string {
  return `<tr><td class="content-pad" style="padding:0 40px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td width="80" height="80" valign="middle" style="padding-right:16px;width:80px;min-width:80px;height:80px;overflow:hidden;"><img src="${IMG}/${iconFile}" alt="${title}" width="80" height="80" style="width:80px;min-width:80px;height:80px;min-height:80px;max-height:80px;border-radius:12px;display:block;" /></td><td valign="middle"><p style="margin:0 0 4px;font-family:${SANS_V2};font-size:15px;font-weight:700;color:${V2.textHeading};">${title}</p><p style="margin:0;font-family:${SANS_V2};font-size:14px;color:${V2.textMuted};line-height:1.5;">${desc}</p></td></tr></table></td></tr>`;
}

/** Section heading — matches v2 sectionHead */
function sectionHeadV2(text: string): string {
  return `<tr><td class="content-pad" style="padding:0 40px;"><p style="margin:0;font-family:${SERIF_V2};font-size:26px;font-weight:700;color:${V2.textHeading};text-align:center;">${text}</p></td></tr>`;
}

/** Stat card — matches v2 stat */
function statBlockV2(value: string, label: string): string {
  return `<td width="33%" style="padding:16px 12px;background:#ffffff;text-align:center;border-radius:12px;border:1px solid #E8ECE9;box-shadow:0 2px 6px rgba(0,0,0,0.04);"><div style="font-family:${SANS_V2};font-size:30px;font-weight:800;color:${V2.teal};letter-spacing:-0.5px;">${value}</div><div style="font-family:${SANS_V2};font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1.5px;margin-top:6px;">${label}</div></td>`;
}
const SALARY_GUIDE_URL = process.env.SALARY_GUIDE_URL || 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/resources/PMHNP_Salary_Guide_2026.pdf';

// ── Sender addresses — separate transactional from marketing ──
const EMAIL_FROM_TRANSACTIONAL = process.env.EMAIL_FROM || 'PMHNP Hiring <noreply@pmhnphiring.com>';
const EMAIL_FROM_MARKETING = process.env.EMAIL_FROM_MARKETING || 'PMHNP Hiring <alerts@pmhnphiring.com>';
const EMAIL_FROM = EMAIL_FROM_TRANSACTIONAL; // backward compat
const EMAIL_REPLY_TO = 'support@pmhnphiring.com';

// Marketing email types — these use the marketing sender address
const MARKETING_EMAIL_TYPES = new Set([
  'welcome_alert', 'job_alert', 'salary_guide', 'broadcast',
  'profile_nudge', 'performance_report', 'saved_job_reminder',
  'candidate_alert',
]);

// ── HTML sanitization — prevents XSS in user-supplied content ──
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Strip HTML to plain text for multipart emails ──
function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' | ')
    .replace(/<a[^>]+href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&middot;/gi, '·')
    .replace(/&copy;/gi, '©')
    .replace(/&mdash;/gi, '—')
    .replace(/&zwnj;/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Email send wrapper — logs every email to EmailSend table ──
async function sendAndLog(
  params: { from: string; to: string; subject: string; html: string },
  emailType: string,
  metadata?: Record<string, unknown>,
  unsubscribeUrl?: string
) {
  const isMarketing = MARKETING_EMAIL_TYPES.has(emailType);
  const from = isMarketing ? EMAIL_FROM_MARKETING : EMAIL_FROM_TRANSACTIONAL;

  const sendParams: Parameters<typeof resend.emails.send>[0] = {
    ...params,
    from,
    replyTo: EMAIL_REPLY_TO,
    text: htmlToPlainText(params.html),
    headers: {},
  };

  // Add List-Unsubscribe headers for compliance (required by Gmail/Yahoo)
  if (unsubscribeUrl) {
    sendParams.headers = {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    };
  }

  const result = await resend.emails.send(sendParams);

  // Non-blocking log — don't let logging failure break email sending
  try {
    await prisma.emailSend.create({
      data: {
        resendId: result?.data?.id ?? null,
        to: params.to,
        subject: params.subject,
        emailType,
        metadata: metadata ? (metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  } catch (e) {
    logger.error('Failed to log email send', e, { emailType, to: params.to });
  }
  return result;
}

// ── Suppression check — returns true if email should NOT be sent ──
export async function isEmailSuppressed(email: string): Promise<boolean> {
  const [emailLead, userProfile] = await Promise.all([
    prisma.emailLead.findUnique({ where: { email }, select: { isSuppressed: true } }),
    prisma.userProfile.findUnique({ where: { email }, select: { emailSuppressed: true } }),
  ]);
  return !!(emailLead?.isSuppressed || userProfile?.emailSuppressed);
}

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

export const F = "Arial, Helvetica, sans-serif";

export const C = {
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
              <img src="${BASE_URL}/logo.png" width="80" height="80" alt="PMHNP Hiring" style="display: block; width: 80px; height: 80px; margin: 0 auto 14px;" />
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
              <img src="${BASE_URL}/logo.png" width="80" height="80" alt="PMHNP Hiring" style="display: block; width: 80px; height: 80px; margin: 0 auto 14px;" />
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
                <a href="${BASE_URL}/job-alerts/manage" style="color: ${C.textFaded}; text-decoration: none;">Manage preferences</a>
                &nbsp;·&nbsp;
                <a href="${BASE_URL}/unsubscribe?token=${unsubscribeToken}" style="color: ${C.textFaded}; text-decoration: none;">Unsubscribe</a>
              </p>`;
}

// Get or create an unsubscribe token for any email address
async function getOrCreateUnsubToken(email: string): Promise<string> {
  const existing = await prisma.emailLead.findUnique({
    where: { email },
    select: { unsubscribeToken: true },
  });
  if (existing) return existing.unsubscribeToken;

  // Create an EmailLead entry for this user so they can manage preferences
  const created = await prisma.emailLead.create({
    data: { email, isSubscribed: true, source: 'auto' },
    select: { unsubscribeToken: true },
  });
  return created.unsubscribeToken;
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
            <div style="width: 36px; height: 36px; background-color: ${C.bgCardAlt}; border-radius: 50%; text-align: center; line-height: 36px; font-size: 16px; font-weight: bold; color: ${C.teal}; border: 1px solid ${C.borderLight};">${icon}</div>
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
    const html = emailShellV2(`
      ${headerBlockV2('Your Alerts Are Live', '')}
      ${spacerV2(12)}
      ${simpleBlock('hero-alert-subscription.png', 'Your job alerts are now active. We scan thousands of PMHNP positions daily and deliver matches straight to your inbox \u2014 so you never miss the right opportunity.')}
      ${spacerV2(32)}
      <tr><td class="content-pad" style="padding:0 40px;text-align:center;">
        ${primaryButtonV2('Browse Open Positions', `${BASE_URL}/jobs`)}
      </td></tr>
      ${spacerV2(48)}
      ${closeContentV2()}`,
      unsubscribeFooterV2(unsubscribeToken),
      'Your PMHNP job alerts are active.'
    );

    await sendAndLog({
      from: EMAIL_FROM,
      to: email,
      subject: 'Welcome — Your Job Alerts Are Active!',
      html,
    }, 'welcome_alert', undefined, `${BASE_URL}/unsubscribe?token=${unsubscribeToken}`);

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
                ${featureRow('+', 'Post in Minutes', 'Create and publish job listings with our guided form')}
                ${featureRow('&gt;', 'Reach PMHNPs', 'Your listing is seen by 10,000+ qualified candidates')}
                ${featureRow('&#9776;', 'Track Everything', 'View counts, apply clicks, and applicant analytics')}
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

    let html: string;
    if (isEmployer) {
      html = emailShellV2(`
      ${headerBlockV2('Your Employer Account Is Ready', '')}
      ${spacerV2(12)}
      ${bodyTextV2('Post positions, track engagement, and connect with qualified Psychiatric Mental Health Nurse Practitioners \u2014 all from one dashboard.')}
      ${spacerV2(36)}
      ${sectionHeadV2('Three steps to your first hire')}
      ${spacerV2(20)}
      ${stepBlock('icon-emp-megaphone.png', 'Publish your listing', 'Our guided form takes under five minutes. Add role details, compensation, and requirements.')}
      ${spacerV2(16)}
      ${stepBlock('icon-emp-analytics.png', 'Track engagement', 'Monitor views, apply clicks, and applicant quality in real time.')}
      ${spacerV2(16)}
      ${stepBlock('icon-emp-handshake.png', 'Connect with candidates', 'Message qualified PMHNPs directly through the platform.')}
      ${spacerV2(32)}
      <tr><td class="content-pad" style="padding:0 40px;text-align:center;">
        ${primaryButtonV2('Post Your First Job', `${SITE_URL}/post-job`)}
      </td></tr>
      ${spacerV2(48)}
      ${closeContentV2()}`,
        unsubscribeFooterV2('sample'),
        'Your employer account is ready \u2014 start hiring PMHNPs today.'
      );
    } else {
      const IMG = `${BASE_URL}/images/email`;
      html = emailShellV2(`
            ${headerBlockV2('Welcome to PMHNP Hiring', '')}
            <tr><td style="padding:0 40px;"><img src="${IMG}/welcome-email-hero.png" alt="" width="520" style="width:100%;max-width:520px;height:auto;display:block;border-radius:12px;margin:0 auto;" /></td></tr>
            ${spacerV2(28)}
            <tr><td class="content-pad" style="padding:0 40px;"><p style="margin:0;font-family:${SERIF_V2};font-size:17px;color:${V2.textBody};line-height:1.7;">You have unlocked a new way to find your perfect role. Search curated positions, get matched by AI, and connect directly with hiring managers \u2014 no recruiters, no middlemen.</p></td></tr>
            ${spacerV2(36)}
            <tr><td class="content-pad" style="padding:0 40px;"><p style="margin:0;font-family:${SERIF_V2};font-size:26px;font-weight:700;color:${V2.textHeading};text-align:center;">Here is how to get started</p></td></tr>
            ${spacerV2(20)}
            <tr><td class="content-pad" style="padding:0 40px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td width="80" height="80" valign="middle" style="padding-right:16px;width:80px;min-width:80px;height:80px;overflow:hidden;"><img src="${IMG}/step-build-profile.png" alt="Build profile" width="80" height="80" style="width:80px;min-width:80px;height:80px;min-height:80px;max-height:80px;border-radius:12px;display:block;" /></td><td valign="middle"><p style="margin:0 0 4px;font-family:${SANS_V2};font-size:15px;font-weight:700;color:${V2.textHeading};">Build your profile</p><p style="margin:0;font-family:${SANS_V2};font-size:14px;color:${V2.textMuted};line-height:1.5;">Take 60 seconds to add your credentials, specialties, and location preferences.</p></td></tr></table></td></tr>
            ${spacerV2(16)}
            <tr><td class="content-pad" style="padding:0 40px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td width="80" height="80" valign="middle" style="padding-right:16px;width:80px;min-width:80px;height:80px;overflow:hidden;"><img src="${IMG}/step-ai-alerts.png" alt="AI alerts" width="80" height="80" style="width:80px;min-width:80px;height:80px;min-height:80px;max-height:80px;border-radius:12px;display:block;" /></td><td valign="middle"><p style="margin:0 0 4px;font-family:${SANS_V2};font-size:15px;font-weight:700;color:${V2.textHeading};">Turn on AI alerts</p><p style="margin:0;font-family:${SANS_V2};font-size:14px;color:${V2.textMuted};line-height:1.5;">Get notified the exact minute a perfectly matched role lands on the board.</p></td></tr></table></td></tr>
            ${spacerV2(16)}
            <tr><td class="content-pad" style="padding:0 40px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td width="80" height="80" valign="middle" style="padding-right:16px;width:80px;min-width:80px;height:80px;overflow:hidden;"><img src="${IMG}/step-connect.png" alt="Connect" width="80" height="80" style="width:80px;min-width:80px;height:80px;min-height:80px;max-height:80px;border-radius:12px;display:block;" /></td><td valign="middle"><p style="margin:0 0 4px;font-family:${SANS_V2};font-size:15px;font-weight:700;color:${V2.textHeading};">Connect directly</p><p style="margin:0;font-family:${SANS_V2};font-size:14px;color:${V2.textMuted};line-height:1.5;">Connect to hiring managers directly, no recruiters involved.</p></td></tr></table></td></tr>
            ${spacerV2(32)}
            <tr><td class="content-pad" style="padding:0 40px;text-align:center;">${primaryButtonV2('Explore Your Dashboard', `${BASE_URL}/dashboard`)}</td></tr>
            ${spacerV2(16)}
            <tr><td class="content-pad" style="padding:0 40px;text-align:center;"><p style="margin:0;font-family:${SANS_V2};font-size:14px;color:${V2.textMuted};line-height:1.6;">Want the data first? <a href="${BASE_URL}/salary-guide" style="color:${V2.teal};text-decoration:underline;">Download the 2026 Salary Guide</a>.</p></td></tr>
            ${spacerV2(48)}
            ${closeContentV2()}`,
          unsubscribeFooterV2('sample'),
          `Welcome ${firstName || ''} \u2014 find your perfect PMHNP role.`
      );
    }

    await sendAndLog({
      from: EMAIL_FROM,
      to: email,
      subject: isEmployer
        ? 'Welcome to PMHNP Hiring — Start Hiring Today'
        : `Welcome to PMHNP Hiring, ${firstName || 'there'}!`,
      html,
    }, 'welcome_signup', { role });

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
    const dashboardUrl = `${BASE_URL}/employer/dashboard`;

    const html = emailShellV2(`
      ${headerBlockV2('Your Listing Is Live', '')}
      ${spacerV2(12)}
      ${simpleBlock('hero-job-post.png', `Your posting is now visible to over 10,000 PMHNPs actively searching for their next role. The listing will remain active for ${config.durationDays} days.`)}
      ${spacerV2(32)}
      <tr><td class="content-pad" style="padding:0 40px;text-align:center;">
        ${primaryButtonV2('View Your Listing', `${BASE_URL}/jobs/${jobSlug}`)}
      </td></tr>
      ${spacerV2(16)}
      <tr><td class="content-pad" style="padding:0 40px;text-align:center;"><p style="margin:0;font-family:${SANS_V2};font-size:14px;color:${V2.textMuted};line-height:1.6;">Need to edit? <a href="${BASE_URL}/employer/dashboard" style="color:${V2.teal};text-decoration:underline;">Open your dashboard</a>.</p></td></tr>
      ${spacerV2(48)}
      ${closeContentV2()}`,
      unsubscribeFooterV2('sample'),
      'Your job posting is now live.'
    );

    await sendAndLog({
      from: EMAIL_FROM,
      to: employerEmail,
      subject: `✅ Your PMHNP job post is live — "${jobTitle}"`,
      html,
    }, 'job_confirmation', { jobId });

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
  const COLORS = ['#4DB6AC', '#E8937A', '#7C8CF5', '#F59E0B', '#EC4899', '#8B5CF6', '#06B6D4', '#10B981', '#F97316', '#6366F1'];

  const v2Badge = (text: string, bg: string, fg: string, border: string) =>
    `<span style="display:inline-block;padding:5px 14px;border-radius:20px;font-family:${SANS_V2};font-size:11px;font-weight:600;letter-spacing:0.3px;background:${bg};color:${fg};border:1px solid ${border};">${escapeHtml(text)}</span>`;

  const jobCardsHtml = displayJobs.map((job, index) => {
    const jobUrl = `${BASE_URL}/jobs/${job.slug || slugify(job.title, job.id)}`;
    const salaryText = job.minSalary ? `$${(job.minSalary / 1000).toFixed(0)}k${job.maxSalary ? `\u2013$${(job.maxSalary / 1000).toFixed(0)}k` : '+'}` : '';
    const color = COLORS[index % COLORS.length];
    const initial = escapeHtml(job.employer.charAt(0).toUpperCase());
    const badges: string[] = [];
    if (job.mode) badges.push(v2Badge(job.mode, job.mode === 'Remote' ? '#ECFDF5' : '#F3F6F4', job.mode === 'Remote' ? '#065F46' : '#374151', job.mode === 'Remote' ? '#A7F3D0' : '#E0E5E1'));
    if (job.jobType) badges.push(v2Badge(job.jobType, '#F3F6F4', '#374151', '#E0E5E1'));

    return `
        <tr><td style="padding:0 40px ${index < displayJobs.length - 1 ? '16px' : '0'};">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #E8ECE9;border-radius:14px;box-shadow:0 2px 8px rgba(0,0,0,0.04);">
            <tr><td style="height:4px;background:${color};border-radius:14px 14px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
            <tr><td style="padding:24px 24px 20px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
                <td width="48" valign="top" style="padding-right:16px;">
                  <div style="width:48px;height:48px;border-radius:12px;background:${color};color:#fff;font-size:20px;font-weight:700;text-align:center;line-height:48px;">${initial}</div>
                </td>
                <td valign="top" style="width:100%;">
                  <a href="${jobUrl}" style="font-family:${SERIF_V2};font-size:18px;font-weight:700;color:${V2.textHeading};text-decoration:none;line-height:1.35;display:block;">${escapeHtml(job.title)}</a>
                  <p style="margin:4px 0 0;font-family:${SANS_V2};font-size:13px;font-weight:500;color:${V2.textMuted};">${escapeHtml(job.employer)} &middot; ${escapeHtml(job.location)}</p>
                </td>
                ${salaryText ? `<td valign="top" align="right" style="white-space:nowrap;padding-left:12px;">
                  <span style="display:inline-block;padding:6px 16px;border-radius:8px;font-family:${SANS_V2};font-size:14px;font-weight:700;background:#E6FAF8;color:#0d9488;">${salaryText}</span>
                </td>` : ''}
              </tr></table>
              ${badges.length > 0 ? `<div style="border-top:1px solid #F0F3F1;margin:16px 0;"></div>
              <table role="presentation" cellspacing="0" cellpadding="0"><tr>
                ${badges.map((b, i) => `<td${i < badges.length - 1 ? ' style="padding-right:6px;"' : ''}>${b}</td>`).join('')}
              </tr></table>` : ''}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:16px;"><tr>
                <td align="right" valign="middle">
                  <table role="presentation" cellspacing="0" cellpadding="0"><tr>
                    <td style="padding-right:8px;">
                      <a href="${jobUrl}" style="display:inline-block;padding:8px 18px;border-radius:10px;font-family:${SANS_V2};font-size:13px;font-weight:600;color:#374151;background:#F3F6F4;border:1px solid #E0E5E1;text-decoration:none;">View Job &rarr;</a>
                    </td>
                    <td>
                      <a href="${jobUrl}" style="display:inline-block;padding:8px 20px;border-radius:10px;font-family:${SANS_V2};font-size:13px;font-weight:700;color:#fff;background:#0d9488;text-decoration:none;box-shadow:0 2px 6px rgba(13,148,136,0.25);">Apply Now</a>
                    </td>
                  </tr></table>
                </td>
              </tr></table>
            </td></tr>
          </table>
        </td></tr>`;
  }).join('');

  const html = emailShellV2(`
      ${headerBlockV2(`${jobCount} New Job${jobCount > 1 ? 's' : ''} Match Your Alert`, '')}
      ${spacerV2(12)}
      ${bodyTextV2(`We found <strong>${jobCount} new position${jobCount > 1 ? 's' : ''}</strong> matching your preferences. Apply early for the best response rates.`)}
      ${spacerV2(20)}
      ${jobCardsHtml}
      ${jobCount > 10 ? `${spacerV2(12)}
      <tr><td class="content-pad" style="padding:0 40px;text-align:center;">
        <p style="margin:0;font-family:${SANS_V2};font-size:13px;color:${V2.textMuted};">+ ${jobCount - 10} more matching jobs</p>
      </td></tr>` : ''}
      ${spacerV2(28)}
      <tr><td class="content-pad" style="padding:0 40px;text-align:center;">
        ${primaryButtonV2('View All Matching Jobs \u2192', `${BASE_URL}/jobs`)}
      </td></tr>
      ${spacerV2(48)}
      ${closeContentV2()}`,
    `<p style="margin:0 0 4px;font-family:${SANS_V2};font-size:12px;color:${V2.textMuted};">
      <a href="${BASE_URL}/job-alerts/manage?token=${alertToken}" style="color:${V2.textMuted};text-decoration:underline;">Manage alert</a>
      &nbsp;&middot;&nbsp;
      <a href="${BASE_URL}/job-alerts/unsubscribe?token=${alertToken}" style="color:${V2.textMuted};text-decoration:underline;">Delete alert</a>
    </p>`,
    `${jobCount} new PMHNP jobs matching your alert \u2014 view them before they're filled!`
  );

  await sendAndLog({
    from: EMAIL_FROM,
    to: email,
    subject: `\uD83D\uDD14 ${jobCount} New PMHNP Job${jobCount > 1 ? 's' : ''} Match Your Alert`,
    html,
  }, 'job_alert', { jobCount }, `${BASE_URL}/job-alerts/unsubscribe?token=${alertToken}`);
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

    const html = emailShellV2(`
      ${headerBlockV2('Listing Renewed Successfully', '')}
      ${spacerV2(12)}
      ${simpleBlock('hero-renewal.png', `Your posting for <strong>${escapeHtml(jobTitle)}</strong> has been renewed and will remain active until ${expiryStr}.`)}
      ${spacerV2(32)}
      <tr><td class="content-pad" style="padding:0 40px;text-align:center;">
        ${primaryButtonV2('View Your Dashboard', `${BASE_URL}/employer/dashboard`)}
      </td></tr>
      ${spacerV2(48)}
      ${closeContentV2()}`,
      unsubscribeFooterV2(unsubscribeToken),
      'Your job listing has been renewed.'
    );

    await sendAndLog({
      from: EMAIL_FROM,
      to: email,
      subject: `✅ Job Renewed — "${jobTitle}" is live again`,
      html,
    }, 'renewal_confirmation', { jobTitle }, `${BASE_URL}/unsubscribe?token=${unsubscribeToken}`);

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

    const html = emailShellV2(`
      ${headerBlockV2(`Your Listing Expires in ${daysUntilExpiry} Days`, '')}
      ${spacerV2(12)}
      <tr><td class="content-pad" style="padding:0 40px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
          <td width="22%" valign="top" style="padding-right:16px;">
            <img src="${IMG}/hero-expiry-warning.png" alt="" style="width:100%;height:auto;display:block;border-radius:12px;" />
          </td>
          <td width="78%" valign="top">
            <p style="margin:0;font-family:${SERIF_V2};font-size:17px;color:${V2.textBody};line-height:1.7;">Your posting for <strong>${escapeHtml(jobTitle)}</strong> will expire on ${expiryDateStr}. Renew now to maintain visibility and continue receiving applications.</p>
          </td>
        </tr></table>
      </td></tr>
      ${spacerV2(24)}
      <tr><td class="content-pad" style="padding:0 40px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>${statBlockV2(viewCount.toLocaleString(), 'Views')}<td width="8"></td>${statBlockV2(applyClickCount.toLocaleString(), 'Applies')}<td width="8"></td>${statBlockV2('—', 'Saved')}</tr></table></td></tr>
      ${spacerV2(28)}
      <tr><td class="content-pad" style="padding:0 40px;text-align:center;">
        ${primaryButtonV2('Renew Your Listing', `${BASE_URL}/employer/dashboard`)}
      </td></tr>
      ${spacerV2(48)}
      ${closeContentV2()}`,
      unsubscribeFooterV2(unsubscribeToken || 'sample'),
      `Your listing expires in ${daysUntilExpiry} days — renew now.`
    );

    await sendAndLog({
      from: EMAIL_FROM,
      to: email,
      subject: `⏰ Your job posting expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''} — Renew Now`,
      html,
    }, 'expiry_warning', { jobTitle, daysUntilExpiry }, unsubscribeToken ? `${BASE_URL}/unsubscribe?token=${unsubscribeToken}` : undefined);

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

    const html = emailShellV2(`
      ${headerBlockV2('Your Draft Is Saved', '')}
      ${spacerV2(12)}
      ${simpleBlock('hero-draft-saved.png', 'We saved your progress. Your draft is ready whenever you are \u2014 pick up right where you left off. This link expires in 30 days.')}
      ${spacerV2(32)}
      <tr><td class="content-pad" style="padding:0 40px;text-align:center;">
        ${primaryButtonV2('Continue Your Posting', resumeUrl)}
      </td></tr>
      ${spacerV2(48)}
      ${closeContentV2()}`,
      unsubscribeFooterV2('sample'),
      'Your job posting draft has been saved.'
    );

    await sendAndLog({
      from: EMAIL_FROM,
      to: email,
      subject: '📝 Continue your PMHNP job posting',
      html,
    }, 'draft_saved');

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
  return emailShellV2(`
    ${headerBlockV2('We Received Your Message', '')}
    ${spacerV2(12)}
    <tr><td class="content-pad" style="padding:0 40px;text-align:center;">
      <div style="display:inline-block;padding:10px 24px;border-radius:30px;background:#ECFDF5;border:1px solid #A7F3D0;">
        <span style="font-family:${SANS_V2};font-size:14px;font-weight:600;color:#065F46;">&#10003; Message received</span>
      </div>
    </td></tr>
    ${spacerV2(24)}
    ${bodyTextV2(`Thank you for reaching out, ${escapeHtml(name)}. Our team will review your inquiry and respond within <strong>one business day</strong>.`)}
    ${spacerV2(20)}
    <tr><td style="padding:0 40px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #E8ECE9;border-radius:12px;box-shadow:0 2px 6px rgba(0,0,0,0.04);">
        <tr><td style="padding:16px 20px;border-bottom:1px solid #F0F3F1;">
          <p style="margin:0 0 2px;font-family:${SANS_V2};font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1.5px;">Your Subject</p>
          <p style="margin:0;font-family:${SERIF_V2};font-size:16px;font-weight:600;color:${V2.textHeading};">${escapeHtml(subject)}</p>
        </td></tr>
        <tr><td style="padding:16px 20px;">
          <p style="margin:0 0 2px;font-family:${SANS_V2};font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1.5px;">Expected Response</p>
          <p style="margin:0;font-family:${SANS_V2};font-size:14px;color:${V2.textBody};">Within 24 hours &middot; Mon&ndash;Fri 9AM&ndash;5PM CT</p>
        </td></tr>
      </table>
    </td></tr>
    ${spacerV2(28)}
    <tr><td class="content-pad" style="padding:0 40px;text-align:center;">
      ${primaryButtonV2('Browse Jobs While You Wait', `${BASE_URL}/jobs`)}
    </td></tr>
    ${spacerV2(48)}
    ${closeContentV2()}`,
    unsubscribeFooterV2('sample'),
    'We received your message.'
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 9. CONTACT FORM NOTIFICATION (Internal / Support Team)
// ═══════════════════════════════════════════════════════════════════════════════

export function buildContactNotificationHtml(name: string, email: string, subject: string, message: string): string {
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeSubject = escapeHtml(subject);
  const safeMessage = escapeHtml(message);
  const field = (label: string, value: string, isLast = false) =>
    `<tr><td style="padding:14px 20px;${isLast ? '' : 'border-bottom:1px solid #F0F3F1;'}">
      <p style="margin:0 0 3px;font-family:${SANS_V2};font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1.5px;">${label}</p>
      <p style="margin:0;font-family:${SANS_V2};font-size:14px;color:${V2.textBody};line-height:1.5;">${value}</p>
    </td></tr>`;
  return emailShellV2(`
    ${headerBlockV2('New Contact Submission', '')}
    ${spacerV2(12)}
    <tr><td class="content-pad" style="padding:0 40px;text-align:center;">
      <table role="presentation" cellspacing="0" cellpadding="0"><tr>
        <td style="padding-right:10px;">
          <span style="display:inline-block;padding:6px 14px;border-radius:20px;background:#FEF3C7;border:1px solid #FDE68A;font-family:${SANS_V2};font-size:11px;font-weight:700;color:#92400E;">● New Lead</span>
        </td>
        <td>
          <span style="font-family:${SANS_V2};font-size:12px;color:#9CA3AF;">${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </td>
      </tr></table>
    </td></tr>
    ${spacerV2(20)}
    <tr><td style="padding:0 40px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #E8ECE9;border-radius:12px;box-shadow:0 2px 6px rgba(0,0,0,0.04);">
        ${field('From', `<strong style="color:${V2.textHeading};">${safeName}</strong>`)}
        ${field('Email', `<a href="mailto:${safeEmail}" style="color:${V2.teal};text-decoration:none;">${safeEmail}</a>`)}
        ${field('Subject', `<strong style="color:${V2.textHeading};">${safeSubject}</strong>`)}
        ${field('Message', safeMessage, true)}
      </table>
    </td></tr>
    ${spacerV2(24)}
    <tr><td class="content-pad" style="padding:0 40px;text-align:center;">
      <table role="presentation" cellspacing="0" cellpadding="0"><tr>
        <td style="padding-right:10px;">
          ${primaryButtonV2('Reply to Sender', `mailto:${safeEmail}`)}
        </td>
        <td>
          <a href="${BASE_URL}/admin" style="display:inline-block;padding:10px 24px;border-radius:10px;font-family:${SANS_V2};font-size:14px;font-weight:600;color:#374151;background:#F3F6F4;border:1px solid #E0E5E1;text-decoration:none;">View in Admin</a>
        </td>
      </tr></table>
    </td></tr>
    ${spacerV2(48)}
    ${closeContentV2()}`,
    unsubscribeFooterV2('sample'),
    `New contact form submission from ${safeName}.`
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 10. SALARY GUIDE DELIVERY EMAIL
// ═══════════════════════════════════════════════════════════════════════════════

export function buildSalaryGuideHtml(pdfUrl: string, unsubscribeToken: string): string {
  return emailShellV2(`
    ${headerBlockV2('Your 2026 Salary Guide', '')}
    ${spacerV2(12)}
    ${simpleBlock('hero-salary-guide.png', 'Your comprehensive PMHNP compensation report is ready. It includes salary ranges across all 50 states, remote versus in-person pay differentials, and negotiation strategies.')}
    ${spacerV2(32)}
    <tr><td class="content-pad" style="padding:0 40px;text-align:center;">
      ${primaryButtonV2('Download Salary Guide (PDF)', pdfUrl)}
    </td></tr>
    ${spacerV2(16)}
    <tr><td class="content-pad" style="padding:0 40px;text-align:center;"><p style="margin:0;font-family:${SANS_V2};font-size:14px;color:${V2.textMuted};line-height:1.6;">Looking for opportunities? <a href="${BASE_URL}/jobs" style="color:${V2.teal};text-decoration:underline;">Browse open positions</a>.</p></td></tr>
    ${spacerV2(48)}
    ${closeContentV2()}`,
    unsubscribeFooterV2(unsubscribeToken),
    'Your 2026 PMHNP Salary Guide is ready.'
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
    const greeting = recipientFirstName ? `Hi ${escapeHtml(recipientFirstName)},` : 'Hi there,';
    const fromLine = senderCompany ? `${escapeHtml(senderName)} from ${escapeHtml(senderCompany)}` : escapeHtml(senderName);
    const preview = messageBody.length > 200 ? escapeHtml(messageBody.substring(0, 200)) + '…' : escapeHtml(messageBody);

    const initial = escapeHtml(senderName.charAt(0).toUpperCase());

    const html = emailShellV2(`
      ${headerBlockV2('New Message Received', '')}
      ${spacerV2(12)}
      ${bodyTextV2(`${greeting} a candidate has reached out about a potential opportunity. Respond within 24 hours for the best results.`)}
      ${spacerV2(20)}
      <tr><td style="padding:0 40px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #E8ECE9;border-radius:14px;box-shadow:0 2px 8px rgba(0,0,0,0.04);">
          <tr><td style="padding:20px 24px;border-bottom:1px solid #F0F3F1;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
              <td width="44" valign="top" style="padding-right:14px;">
                <div style="width:44px;height:44px;border-radius:50%;background:#7C8CF5;color:#fff;font-size:18px;font-weight:700;text-align:center;line-height:44px;">${initial}</div>
              </td>
              <td valign="middle" style="width:100%;">
                <p style="margin:0;font-family:${SANS_V2};font-size:15px;font-weight:700;color:${V2.textHeading};">${fromLine}</p>
              </td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:16px 24px;${jobTitle ? 'border-bottom:1px solid #F0F3F1;' : ''}">
            <p style="margin:0;font-family:${SANS_V2};font-size:14px;color:${V2.textBody};line-height:1.6;"><em>&ldquo;${preview}&rdquo;</em></p>
          </td></tr>
          ${jobTitle ? `<tr><td style="padding:14px 24px;background:#FAFBFA;">
            <p style="margin:0;font-family:${SANS_V2};font-size:11px;font-weight:600;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;">Regarding</p>
            <p style="margin:3px 0 0;font-family:${SERIF_V2};font-size:14px;font-weight:600;color:${V2.textHeading};">${escapeHtml(jobTitle)}</p>
          </td></tr>` : ''}
        </table>
      </td></tr>
      ${spacerV2(24)}
      <tr><td class="content-pad" style="padding:0 40px;text-align:center;">
        <table role="presentation" cellspacing="0" cellpadding="0"><tr>
          <td style="padding-right:10px;">
            ${primaryButtonV2('Reply Now', `${BASE_URL}/messages`)}
          </td>
          <td>
            <a href="${BASE_URL}/employer/dashboard" style="display:inline-block;padding:12px 24px;border-radius:10px;font-family:${SANS_V2};font-size:14px;font-weight:600;color:#374151;background:#F3F6F4;border:1px solid #E0E5E1;text-decoration:none;">View Profile</a>
          </td>
        </tr></table>
      </td></tr>
      ${spacerV2(48)}
      ${closeContentV2()}`,
      unsubscribeFooterV2('sample'),
      `${fromLine} sent you a message${jobTitle ? ` about "${escapeHtml(jobTitle)}"` : ''} \u2014 view it now!`
    );

    await sendAndLog({
      from: EMAIL_FROM,
      to: recipientEmail,
      subject: `📩 New message from ${fromLine}${jobTitle ? ` — ${jobTitle}` : ''}`,
      html,
    }, 'employer_message', { senderName, jobTitle });

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
// CANDIDATE INQUIRY NOTIFICATION (candidate → employer)
// ═══════════════════════════════════════════════════════════════════════════════

export async function sendCandidateInquiryNotification(
  recipientEmail: string,
  recipientFirstName: string | null,
  candidateName: string,
  subject: string,
  messageBody: string,
  jobTitle: string | null
): Promise<EmailResult> {
  try {
    const greeting = recipientFirstName ? `Hi ${escapeHtml(recipientFirstName)},` : 'Hi there,';
    const preview = messageBody.length > 200 ? escapeHtml(messageBody.substring(0, 200)) + '…' : escapeHtml(messageBody);

    const initial = escapeHtml(candidateName.charAt(0).toUpperCase());

    const html = emailShellV2(`
      ${headerBlockV2('New Inquiry from a Candidate', '')}
      ${spacerV2(12)}
      ${bodyTextV2(`${greeting} a candidate has reached out about your job posting. Review their message and respond at your convenience.`)}
      ${spacerV2(20)}
      <tr><td style="padding:0 40px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #E8ECE9;border-radius:14px;box-shadow:0 2px 8px rgba(0,0,0,0.04);">
          <tr><td style="padding:20px 24px;border-bottom:1px solid #F0F3F1;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
              <td width="44" valign="top" style="padding-right:14px;">
                <div style="width:44px;height:44px;border-radius:12px;background:#E8937A;color:#fff;font-size:18px;font-weight:700;text-align:center;line-height:44px;">${initial}</div>
              </td>
              <td valign="middle" style="width:100%;">
                <p style="margin:0;font-family:${SANS_V2};font-size:15px;font-weight:700;color:${V2.textHeading};">${escapeHtml(candidateName)}</p>
              </td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:16px 24px;${jobTitle ? 'border-bottom:1px solid #F0F3F1;' : ''}">
            <p style="margin:0;font-family:${SANS_V2};font-size:14px;color:${V2.textBody};line-height:1.6;"><em>&ldquo;${preview}&rdquo;</em></p>
          </td></tr>
          ${jobTitle ? `<tr><td style="padding:14px 24px;background:#FAFBFA;">
            <p style="margin:0;font-family:${SANS_V2};font-size:11px;font-weight:600;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;">Regarding</p>
            <p style="margin:3px 0 0;font-family:${SERIF_V2};font-size:14px;font-weight:600;color:${V2.textHeading};">${escapeHtml(jobTitle)}</p>
          </td></tr>` : ''}
        </table>
      </td></tr>
      ${spacerV2(24)}
      <tr><td class="content-pad" style="padding:0 40px;text-align:center;">
        <table role="presentation" cellspacing="0" cellpadding="0"><tr>
          <td style="padding-right:10px;">
            ${primaryButtonV2('View & Reply', `${BASE_URL}/employer/messages`)}
          </td>
          <td>
            <a href="${BASE_URL}/employer/dashboard" style="display:inline-block;padding:12px 24px;border-radius:10px;font-family:${SANS_V2};font-size:14px;font-weight:600;color:#374151;background:#F3F6F4;border:1px solid #E0E5E1;text-decoration:none;">View Listing</a>
          </td>
        </tr></table>
      </td></tr>
      ${spacerV2(48)}
      ${closeContentV2()}`,
      unsubscribeFooterV2('sample'),
      `${escapeHtml(candidateName)} has a question about your "${escapeHtml(jobTitle || 'job')}" posting \u2014 reply now!`
    );

    await sendAndLog({
      from: EMAIL_FROM,
      to: recipientEmail,
      subject: `💬 ${candidateName} has a question about your "${jobTitle || 'job posting'}"`,
      html,
    }, 'candidate_inquiry', { candidateName, jobTitle });

    logger.info('Candidate inquiry notification sent', { recipientEmail, candidateName });
    return { success: true };
  } catch (error) {
    logger.error('Error sending candidate inquiry notification', error, { recipientEmail });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send candidate inquiry notification',
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
              ${escapeHtml(c.name)}
            </div>
            ${c.headline ? `<div style="font-size: 13px; color: ${C.textMuted}; margin-bottom: 6px;">${escapeHtml(c.headline)}</div>` : ''}
            <table role="presentation" cellspacing="0" cellpadding="0"><tr>
              ${c.specialties.slice(0, 3).map(s => `<td style="padding-right: 4px;">${badge(escapeHtml(s), 'rgba(139,92,246,0.15)', '#A78BFA', 'rgba(139,92,246,0.3)')}</td>`).join('')}
              ${c.states.slice(0, 3).map(s => `<td style="padding-right: 4px;">${badge(escapeHtml(s))}</td>`).join('')}
              ${c.experience !== null ? `<td>${badge(`${c.experience}+ yrs`, 'rgba(45,212,191,0.15)', '#2DD4BF', 'rgba(45,212,191,0.3)')}</td>` : ''}
            </tr></table>
          </div>
        </td>
        <td style="padding: 14px 16px; border-bottom: 1px solid ${C.borderLight}; vertical-align: middle;">
          ${primaryButton('View →', c.profileUrl)}
        </td>
      </tr>
    `).join('');

    const html = emailShellV2(`
      ${headerBlockV2('New Candidate Match', '')}
      ${spacerV2(12)}
      ${simpleBlock('hero-new-candidate.png', `A new candidate matching your hiring criteria has joined the platform. They specialize in psychiatric mental health nursing and are open to new positions.`)}
      ${spacerV2(32)}
      <tr><td class="content-pad" style="padding:0 40px;text-align:center;">
        ${primaryButtonV2('View Candidate Profile', `${SITE_URL}/employer/candidates`)}
      </td></tr>
      ${spacerV2(48)}
      ${closeContentV2()}`,
      unsubscribeFooterV2('sample'),
      `A new candidate matching your criteria just joined.`
    );

    await sendAndLog({
      from: EMAIL_FROM,
      to: recipientEmail,
      subject: `🔔 ${candidates.length} new candidate${candidates.length !== 1 ? 's' : ''} match your criteria`,
      html,
    }, 'candidate_alert', { candidateCount: candidates.length });

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

export function buildBroadcastHtml(body: string, preheaderText: string = '', unsubscribeToken?: string): string {
  return emailShellV2(`
    ${headerBlockV2('PMHNP Hiring', '')}
    ${spacerV2(12)}
    ${bodyTextV2(body)}
    ${spacerV2(32)}
    <tr><td class="content-pad" style="padding:0 40px;text-align:center;">
      ${primaryButtonV2('Visit PMHNP Hiring', `${BASE_URL}`)}
    </td></tr>
    ${spacerV2(48)}
    ${closeContentV2()}`,
    unsubscribeFooterV2(unsubscribeToken || 'sample'),
    preheaderText || 'A message from PMHNP Hiring'
  );
}

export async function sendBroadcastEmail(
  to: string,
  subject: string,
  htmlBody: string
): Promise<EmailResult> {
  try {
    const unsubToken = await getOrCreateUnsubToken(to);
    await sendAndLog({
      from: EMAIL_FROM,
      to,
      subject,
      html: htmlBody,
    }, 'broadcast', undefined, `${BASE_URL}/unsubscribe?token=${unsubToken}`);
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
    const initial = candidateName.charAt(0).toUpperCase();

    const html = emailShellV2(`
      ${headerBlockV2('New Application Received', '')}
      ${spacerV2(12)}
      ${simpleBlock('hero-new-application.png', `A new application has been submitted for <strong>${escapeHtml(jobTitle)}</strong>.${candidateHeadline ? ` The candidate ${escapeHtml(candidateHeadline)}.` : ''}${candidateExperience ? ` ${candidateExperience}+ years of experience.` : ''}`)}
      ${spacerV2(32)}
      <tr><td class="content-pad" style="padding:0 40px;text-align:center;">
        ${primaryButtonV2('Review Application', `${BASE_URL}/employer/dashboard`)}
      </td></tr>
      ${spacerV2(48)}
      ${closeContentV2()}`,
      unsubscribeFooterV2('sample'),
      `New application received for your job posting.`
    );

    await sendAndLog({
      from: EMAIL_FROM,
      to: employerEmail,
      subject: `📋 New application for "${jobTitle}" — ${candidateName}`,
      html,
    }, 'application_notification', { jobTitle, candidateName });

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


// ═══════════════════════════════════════════════════════════════════════════════
// APPLICATION CONFIRMATION — sent to the CANDIDATE after they apply
// ═══════════════════════════════════════════════════════════════════════════════

interface ApplicationConfirmationEmailParams {
  candidateEmail: string;
  candidateName: string;
  jobTitle: string;
  employerName: string;
  hasResume: boolean;
  hasCoverLetter: boolean;
}

export async function sendApplicationConfirmationEmail(params: ApplicationConfirmationEmailParams): Promise<EmailResult> {
  const {
    candidateEmail,
    candidateName,
    jobTitle,
    employerName,
    hasResume,
    hasCoverLetter,
  } = params;

  try {
    const greeting = candidateName ? `Hi ${candidateName.split(' ')[0]},` : 'Hi there,';

    const html = emailShellV2(`
      ${headerBlockV2('Application Submitted', '')}
      ${spacerV2(12)}
      ${simpleBlock('hero-app-confirm.png', `Your application for <strong>${escapeHtml(jobTitle)}</strong> at ${escapeHtml(employerName)} has been submitted successfully. The employer will review your profile and respond if there is a match.`)}
      ${spacerV2(32)}
      <tr><td class="content-pad" style="padding:0 40px;text-align:center;">
        ${primaryButtonV2('Track Your Applications', `${BASE_URL}/my-applications`)}
      </td></tr>
      ${spacerV2(48)}
      ${closeContentV2()}`,
      unsubscribeFooterV2('sample'),
      `Your application has been submitted successfully.`
    );

    await sendAndLog({
      from: EMAIL_FROM,
      to: candidateEmail,
      subject: `✅ Application received — ${jobTitle} at ${employerName}`,
      html,
    }, 'application_confirmation', { jobTitle, employerName });

    logger.info('Application confirmation sent to candidate', { candidateEmail, jobTitle });
    return { success: true };
  } catch (error) {
    logger.error('Error sending application confirmation', error, { candidateEmail });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send confirmation',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATUS UPDATE — sent to the CANDIDATE when their application status changes
// ═══════════════════════════════════════════════════════════════════════════════

const STATUS_LABELS: Record<string, { label: string; emoji: string; message: string }> = {
  screening: { label: 'Under Review', emoji: '🔍', message: 'Your application is being reviewed.' },
  interview: { label: 'Interview', emoji: '🎉', message: 'Great news! The employer would like to move forward with an interview.' },
  offered: { label: 'Offer Extended', emoji: '🎊', message: 'Congratulations! An offer has been extended for this position.' },
  hired: { label: 'Hired', emoji: '🥳', message: 'Congratulations! You have been hired for this position.' },
  rejected: { label: 'Not Selected', emoji: '📋', message: 'After careful consideration, the employer has decided to move forward with other candidates.' },
};

interface StatusUpdateEmailParams {
  candidateEmail: string;
  candidateName: string;
  jobTitle: string;
  employerName: string;
  newStatus: string;
}

export async function sendStatusUpdateEmail(params: StatusUpdateEmailParams): Promise<EmailResult> {
  const { candidateEmail, candidateName, jobTitle, employerName, newStatus } = params;

  const statusInfo = STATUS_LABELS[newStatus];
  if (!statusInfo) return { success: true }; // Don't email for statuses like 'applied'

  try {
    const greeting = candidateName ? `Hi ${candidateName.split(' ')[0]},` : 'Hi there,';

    const statusColors: Record<string, { bg: string; fg: string; border: string }> = {
      screening: { bg: '#EFF6FF', fg: '#1E40AF', border: '#BFDBFE' },
      interview: { bg: '#ECFDF5', fg: '#065F46', border: '#A7F3D0' },
      offered: { bg: '#ECFDF5', fg: '#065F46', border: '#A7F3D0' },
      hired: { bg: '#ECFDF5', fg: '#065F46', border: '#A7F3D0' },
      rejected: { bg: '#FEF2F2', fg: '#991B1B', border: '#FECACA' },
    };
    const sc = statusColors[newStatus] || statusColors.screening;

    const html = emailShellV2(`
      ${headerBlockV2('Application Status Update', '')}
      ${spacerV2(12)}
      ${simpleBlock('hero-status-update.png', `There is an update on your application for <strong>${escapeHtml(jobTitle)}</strong> at <strong>${escapeHtml(employerName)}</strong>. Your application has moved to the <strong>${statusInfo.label.toLowerCase()}</strong> stage. ${statusInfo.message}`)}
      ${spacerV2(32)}
      <tr><td class="content-pad" style="padding:0 40px;text-align:center;">
        ${primaryButtonV2('View Application Details', `${BASE_URL}/my-applications`)}
      </td></tr>
      ${spacerV2(48)}
      ${closeContentV2()}`,
      unsubscribeFooterV2('sample'),
      `Update on your application \u2014 moved to ${statusInfo.label.toLowerCase()} stage.`
    );

    await sendAndLog({
      from: EMAIL_FROM,
      to: candidateEmail,
      subject: `${statusInfo.emoji} Application update — ${jobTitle} at ${employerName}`,
      html,
    }, 'status_update', { jobTitle, newStatus });

    logger.info('Status update email sent', { candidateEmail, jobTitle, newStatus });
    return { success: true };
  } catch (error) {
    logger.error('Error sending status update email', error, { candidateEmail });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send status update',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// I6. PROFILE INCOMPLETE NUDGE EMAIL
// ═══════════════════════════════════════════════════════════════════════════════

export async function sendProfileIncompleteEmail(
  email: string,
  firstName: string | null,
  completedPercentage: number,
  missingFields: string[]
): Promise<EmailResult> {
  try {
    const name = firstName || 'there';
    const topMissing = missingFields.slice(0, 4);
    const unsubToken = await getOrCreateUnsubToken(email);

    const missingListHtml = topMissing.map((f, i) =>
      `<tr><td style="padding:12px 20px;${i < topMissing.length - 1 ? 'border-bottom:1px solid #F0F3F1;' : ''}">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
          <td width="24" style="font-family:${SANS_V2};font-size:14px;color:#D1D5DB;">&#9744;</td>
          <td style="font-family:${SANS_V2};font-size:14px;color:${V2.textBody};">${escapeHtml(f)}</td>
        </tr></table>
      </td></tr>`
    ).join('');

    const html = emailShellV2(`
      ${headerBlockV2('Your Profile Is Almost There', '')}
      ${spacerV2(12)}
      ${bodyTextV2(`Your profile is ${completedPercentage} percent complete. Candidates with finished profiles receive 3 times more visibility from employers. Take a moment to fill in the remaining details.`)}
      ${spacerV2(36)}
      ${sectionHeadV2('What to add next')}
      ${spacerV2(20)}
      ${stepBlock('icon-profile-credential.png', 'Add your credentials', 'List your certifications, licenses, and education to stand out.')}
      ${spacerV2(16)}
      ${stepBlock('icon-profile-location.png', 'Set location preferences', 'Tell us where you want to work so we can match you accurately.')}
      ${spacerV2(16)}
      ${stepBlock('icon-profile-specialty.png', 'Choose your specialties', 'Select your areas of focus to receive the most relevant opportunities.')}
      ${spacerV2(32)}
      <tr><td class="content-pad" style="padding:0 40px;text-align:center;">
        ${primaryButtonV2('Complete Your Profile', `${BASE_URL}/settings/profile`)}
      </td></tr>
      ${spacerV2(48)}
      ${closeContentV2()}`,
      unsubscribeFooterV2(unsubToken),
      `Your profile is ${completedPercentage}% complete \u2014 finish it to boost visibility.`
    );

    await sendAndLog({
      from: EMAIL_FROM,
      to: email,
      subject: `📋 Your profile is ${completedPercentage}% complete — finish it to get noticed`,
      html,
    }, 'profile_nudge', { completedPercentage }, `${BASE_URL}/unsubscribe?token=${unsubToken}`);

    logger.info('Profile incomplete email sent', { email, completedPercentage });
    return { success: true };
  } catch (error) {
    logger.error('Error sending profile incomplete email', error, { email });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send profile email',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// I8. EMPLOYER PERFORMANCE REPORT EMAIL
// ═══════════════════════════════════════════════════════════════════════════════

interface JobPerformance {
  title: string;
  views: number;
  applyClicks: number;
  applications: number;
  dashboardToken: string;
}

export async function sendPerformanceReportEmail(
  email: string,
  employerName: string,
  jobs: JobPerformance[],
  periodLabel: string
): Promise<EmailResult> {
  try {
    const totalViews = jobs.reduce((s, j) => s + j.views, 0);
    const totalClicks = jobs.reduce((s, j) => s + j.applyClicks, 0);
    const totalApps = jobs.reduce((s, j) => s + j.applications, 0);
    const unsubToken = await getOrCreateUnsubToken(email);

    const jobRowsHtml = jobs.slice(0, 5).map((job, i) => {
      const isLast = i === Math.min(jobs.length, 5) - 1;
      const ctr = job.views > 0 ? ((job.applyClicks / job.views) * 100).toFixed(1) : '0';
      return `<tr><td style="padding:14px 20px;${!isLast ? 'border-bottom:1px solid #F0F3F1;' : ''}">
        <p style="margin:0 0 4px;font-family:${SANS_V2};font-size:14px;font-weight:700;color:${V2.textHeading};">${escapeHtml(job.title)}</p>
        <p style="margin:0;font-family:${SANS_V2};font-size:12px;color:${V2.textMuted};">${job.views.toLocaleString()} views &middot; ${job.applyClicks.toLocaleString()} clicks &middot; ${job.applications} apps &middot; ${ctr}% CTR</p>
      </td></tr>`;
    }).join('');

    const statPill = (val: string, label: string) =>
      `<td style="width:25%;padding:4px;">
        <div style="background:#ffffff;border:1px solid #E8ECE9;border-radius:12px;padding:16px 12px;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,0.04);">
          <p style="margin:0;font-family:${SANS_V2};font-size:24px;font-weight:800;color:${V2.textHeading};letter-spacing:-0.5px;">${val}</p>
          <p style="margin:4px 0 0;font-family:${SANS_V2};font-size:11px;font-weight:600;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;">${label}</p>
        </div>
      </td>`;

    const html = emailShellV2(`
      ${headerBlockV2('Your Monthly Hiring Report', '')}
      ${spacerV2(12)}
      ${simpleBlock('hero-performance.png', `Here is how your listings performed this ${periodLabel.toLowerCase()}. Use these insights to optimize your postings and attract stronger candidates.`)}
      ${spacerV2(24)}
      <tr><td class="content-pad" style="padding:0 40px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>${statBlockV2(totalViews.toLocaleString(), 'Views')}<td width="8"></td>${statBlockV2(totalClicks.toLocaleString(), 'Applies')}<td width="8"></td>${statBlockV2(totalApps.toLocaleString(), 'Messages')}</tr></table></td></tr>
      ${spacerV2(28)}
      <tr><td class="content-pad" style="padding:0 40px;text-align:center;">
        ${primaryButtonV2('View Full Report', `${BASE_URL}/employer/dashboard/${jobs[0]?.dashboardToken || ''}`)}
      </td></tr>
      ${spacerV2(48)}
      ${closeContentV2()}`,
      unsubscribeFooterV2(unsubToken),
      `Your ${periodLabel.toLowerCase()} report: ${totalViews} views, ${totalClicks} clicks, ${totalApps} applications`
    );

    await sendAndLog({
      from: EMAIL_FROM,
      to: email,
      subject: `📊 ${periodLabel} Report: ${totalViews} views, ${totalApps} applications — ${employerName}`,
      html,
    }, 'performance_report', { employerName, totalViews, totalApps }, `${BASE_URL}/unsubscribe?token=${unsubToken}`);

    logger.info('Performance report sent', { email, employerName, periodLabel });
    return { success: true };
  } catch (error) {
    logger.error('Error sending performance report', error, { email });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send performance report',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// I5. SAVED JOB REMINDER EMAIL
// ═══════════════════════════════════════════════════════════════════════════════

export async function sendSavedJobReminderEmail(
  email: string,
  firstName: string | null,
  jobs: Array<{ title: string; employer: string; location: string; slug: string }>
): Promise<EmailResult> {
  try {
    const name = firstName || 'there';
    const unsubToken = await getOrCreateUnsubToken(email);

    const COLORS = ['#4DB6AC', '#E8937A', '#7C8CF5', '#F59E0B', '#EC4899'];
    const jobCardsHtml = jobs.slice(0, 5).map((job, i) => {
      const color = COLORS[i % COLORS.length];
      const initial = job.employer.charAt(0).toUpperCase();
      return `<tr><td style="padding:0 40px ${i < jobs.length - 1 ? '12px' : '0'};">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #E8ECE9;border-radius:14px;box-shadow:0 2px 8px rgba(0,0,0,0.04);">
          <tr><td style="height:4px;background:${color};border-radius:14px 14px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="padding:20px 24px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
              <td width="40" valign="top" style="padding-right:14px;">
                <div style="width:40px;height:40px;border-radius:10px;background:${color};color:#fff;font-size:18px;font-weight:700;text-align:center;line-height:40px;">${escapeHtml(initial)}</div>
              </td>
              <td valign="middle" style="width:100%;">
                <a href="${BASE_URL}/jobs/${job.slug}" style="font-family:${SERIF_V2};font-size:16px;font-weight:700;color:${V2.textHeading};text-decoration:none;display:block;">${escapeHtml(job.title)}</a>
                <p style="margin:3px 0 0;font-family:${SANS_V2};font-size:12px;color:${V2.textMuted};">${escapeHtml(job.employer)} &middot; ${escapeHtml(job.location)}</p>
              </td>
              <td valign="middle" align="right" style="padding-left:12px;">
                <a href="${BASE_URL}/jobs/${job.slug}" style="display:inline-block;padding:7px 16px;border-radius:8px;font-family:${SANS_V2};font-size:12px;font-weight:700;color:#fff;background:#0d9488;text-decoration:none;">Apply</a>
              </td>
            </tr></table>
          </td></tr>
        </table>
      </td></tr>`;
    }).join('');

    const firstJob = jobs[0];
    const bodyMsg = jobs.length === 1
      ? `You saved <strong>${escapeHtml(firstJob.title)}</strong> at ${escapeHtml(firstJob.employer)} recently. This position is still accepting applications \u2014 do not miss your window.`
      : `You saved <strong>${jobs.length} jobs</strong> recently. These positions are still accepting applications \u2014 do not miss your window.`;

    const html = emailShellV2(`
      ${headerBlockV2('Your Saved Job Is Still Open', '')}
      ${spacerV2(12)}
      ${simpleBlock('hero-saved-job.png', bodyMsg)}
      ${spacerV2(32)}
      <tr><td class="content-pad" style="padding:0 40px;text-align:center;">
        ${primaryButtonV2('View and Apply', `${BASE_URL}/saved`)}
      </td></tr>
      ${spacerV2(48)}
      ${closeContentV2()}`,
      unsubscribeFooterV2(unsubToken),
      `The job you saved is still open.`
    );

    await sendAndLog({
      from: EMAIL_FROM,
      to: email,
      subject: `💾 ${jobs.length} job${jobs.length !== 1 ? 's' : ''} you saved ${jobs.length !== 1 ? 'are' : 'is'} still open — apply now!`,
      html,
    }, 'saved_job_reminder', { jobCount: jobs.length }, `${BASE_URL}/unsubscribe?token=${unsubToken}`);

    logger.info('Saved job reminder sent', { email, jobCount: jobs.length });
    return { success: true };
  } catch (error) {
    logger.error('Error sending saved job reminder', error, { email });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send saved job reminder',
    };
  }
}
