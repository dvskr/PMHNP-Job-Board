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
import { renderJobCardHtml } from '@/lib/utils/render-job-card';
import { buildListUnsubscribeHeaders } from '@/lib/email/list-unsubscribe';

const resend = new Resend(process.env.RESEND_API_KEY);

// Use env var for email links (falls back to production)
const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com').replace(/\/$/, '');
const SITE_URL = BASE_URL; // alias for backward compatibility
const IMG = process.env.EMAIL_ASSETS_URL || `${BASE_URL}/images/email`;

/** Body text block — keeps the iconFile param for API compat but renders text only.
 *  The heading → text → CTA pattern is cleaner without a sandwiched image. */
function simpleBlock(_iconFile: string, bodyHtml: string): string {
  return `<tr><td class="content-pad" style="padding:0 40px;">
  <p style="margin:0;font-family:${SERIF_V2};font-size:17px;color:${V2.textBody};line-height:1.7;text-align:center;">${bodyHtml}</p>
</td></tr>`;
}

/** Step row — icon + title + description (matches v2 step pattern) */
function stepBlock(iconFile: string, title: string, desc: string): string {
  return `<tr><td class="content-pad" style="padding:0 40px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td width="80" height="80" valign="middle" style="padding-right:16px;width:80px;min-width:80px;height:80px;overflow:hidden;" bgcolor="${V2.bgCardAlt}"><img src="${IMG}/${iconFile}" alt="${title}" width="80" height="80" style="width:80px;min-width:80px;height:80px;min-height:80px;max-height:80px;border-radius:12px;display:block;border:0;background-color:${V2.bgCardAlt};color:${V2.teal};font-family:${SANS_V2};font-size:11px;font-weight:700;text-align:center;line-height:80px;" /></td><td valign="middle"><p style="margin:0 0 4px;font-family:${SANS_V2};font-size:15px;font-weight:700;color:${V2.textHeading};">${title}</p><p style="margin:0;font-family:${SANS_V2};font-size:14px;color:${V2.textMuted};line-height:1.5;">${desc}</p></td></tr></table></td></tr>`;
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
// Defaults match config/brand.ts; runtime values come from env (validated in lib/env.ts).
const EMAIL_FROM_TRANSACTIONAL = process.env.EMAIL_FROM || 'PMHNP Hiring <noreply@pmhnphiring.com>';
const EMAIL_FROM_MARKETING = process.env.EMAIL_FROM_MARKETING || 'PMHNP Hiring <alerts@pmhnphiring.com>';
// PD outreach gets its own from-name — the campaign is a personal pitch
// from Sathish, not an automated job-board notification. Falls back to
// EMAIL_FROM_MARKETING if unset (the previous behavior).
const EMAIL_FROM_PD_OUTREACH =
  process.env.EMAIL_FROM_PD_OUTREACH || EMAIL_FROM_MARKETING;
const EMAIL_FROM = EMAIL_FROM_TRANSACTIONAL; // backward compat
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || 'support@pmhnphiring.com';

// Canonical EmailType union — every value the platform sends should be in this list.
// Drives MARKETING_EMAIL_TYPES below and is the type for `sendAndLog`'s emailType param,
// so a typo or new type added without thinking gets caught at compile time.
export type EmailType =
  | 'welcome_alert'
  | 'welcome_signup'
  | 'job_confirmation'
  | 'job_alert'
  | 'renewal_confirmation'
  | 'refund_confirmation'
  | 'expiry_warning'
  | 'draft_saved'
  | 'employer_message'
  | 'candidate_inquiry'
  | 'candidate_alert'
  | 'broadcast'
  | 'application_notification'
  | 'application_confirmation'
  | 'status_update'
  | 'performance_report'
  | 'saved_job_reminder'
  | 'salary_guide'
  | 'contact_confirmation'
  | 'contact_internal'
  | 'employer_outreach'
  | 'email_job'
  | 'auth_confirm'
  | 'recommendation_digest'
  | 'pd_outreach';

// Marketing email types — these use the marketing sender address
const MARKETING_EMAIL_TYPES = new Set<EmailType>([
  'welcome_alert', 'job_alert', 'salary_guide', 'broadcast',
  'performance_report', 'saved_job_reminder',
  'candidate_alert',
  'recommendation_digest',
  'pd_outreach',
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
//
// Every send across the platform should go through this wrapper so we get:
//   • NOTE: this wrapper does NOT check suppression. Callers that send marketing/
//     bulk mail MUST gate with isEmailSuppressed(to) themselves before calling it
//     (job-alerts and candidate-alerts already do). Transactional mail is exempt.
//   • Sender-domain selection (transactional vs marketing, based on emailType)
//   • List-Unsubscribe header injection (Gmail/Yahoo bulk-sender rule)
//   • EmailSend row in the DB for analytics + webhook status updates
//   • Plain-text fallback computed from HTML
export async function sendAndLog(
  params: { from: string; to: string; subject: string; html: string },
  emailType: EmailType,
  metadata?: Record<string, unknown>,
  unsubscribeUrl?: string
) {
  const isMarketing = MARKETING_EMAIL_TYPES.has(emailType);
  // PD outreach gets a personal from-name. Everything else marketing
  // (job alerts, broadcasts, candidate alerts) stays on the generic
  // brand address so subscribers don't see "Sathish" in their inbox
  // when it's actually an automated digest.
  const from =
    emailType === 'pd_outreach'
      ? EMAIL_FROM_PD_OUTREACH
      : isMarketing
        ? EMAIL_FROM_MARKETING
        : EMAIL_FROM_TRANSACTIONAL;

  const sendParams: Parameters<typeof resend.emails.send>[0] = {
    ...params,
    from,
    replyTo: EMAIL_REPLY_TO,
    text: htmlToPlainText(params.html),
    headers: {},
  };

  // Add List-Unsubscribe headers for compliance (required by Gmail/Yahoo).
  // E1: the machine-POST URL points at the real /api/one-click-unsubscribe
  // endpoint (not the client-only page that 405s), with the human page as a
  // second fallback. No token in the URL → plain unsubscribe link, no false
  // one-click claim.
  const unsubHeaders = buildListUnsubscribeHeaders(unsubscribeUrl, BASE_URL);
  if (unsubHeaders) {
    sendParams.headers = unsubHeaders;
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
// V1 DESIGN SYSTEM REMOVED — All emails now use V2 "Warm Diorama"
// See: lib/email-templates-v2.ts for the active design system
// ═══════════════════════════════════════════════════════════════════════════════

// Get or create an unsubscribe token for any email address
export async function getOrCreateUnsubToken(email: string): Promise<string> {
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

    let html: string;
    if (isEmployer) {
      html = emailShellV2(`
      ${headerBlockV2('Your Employer Account Is Ready', '')}
      ${spacerV2(12)}
      ${bodyTextV2('Post positions, track engagement, and connect with qualified Psychiatric Mental Health Nurse Practitioners \u2014 all from one dashboard.')}
      ${spacerV2(20)}
      <tr><td class="content-pad" style="padding:0 40px;">
        <div style="background:#F0FDFA;border:1px solid rgba(13,148,136,0.15);border-radius:12px;padding:16px 20px;text-align:center;">
          <p style="margin:0 0 4px;font-family:${SANS_V2};font-size:13px;font-weight:700;color:${V2.teal};text-transform:uppercase;letter-spacing:0.05em;">Welcome offer</p>
          <p style="margin:0;font-family:${SANS_V2};font-size:15px;color:${V2.textPrimary};line-height:1.5;">Your first ${config.freePostsPerEmail} job posts are <strong>completely free</strong> \u2014 no credit card required.</p>
        </div>
      </td></tr>
      ${spacerV2(28)}
      ${sectionHeadV2('Three steps to your first hire')}
      ${spacerV2(20)}
      ${stepBlock('icon-emp-megaphone.png', 'Publish your listing', `Our guided form takes under five minutes. ${config.durationDays}-day listing with Featured badge, ${config.limits.candidateUnlocksPerPosting} unlocks, ${config.limits.inmailsPerPosting} InMails included.`)}
      ${spacerV2(16)}
      ${stepBlock('icon-emp-analytics.png', 'Track engagement', 'Monitor views, apply clicks, and applicant quality in real time.')}
      ${spacerV2(16)}
      ${stepBlock('icon-emp-handshake.png', 'Connect with candidates', 'Message qualified PMHNPs directly through the platform. Candidates you unlock stay accessible forever.')}
      ${spacerV2(32)}
      <tr><td class="content-pad" style="padding:0 40px;text-align:center;">
        ${primaryButtonV2('Post Your First Job', `${SITE_URL}/post-job`)}
      </td></tr>
      ${spacerV2(48)}
      ${closeContentV2()}`,
        unsubscribeFooterV2('sample'),
        `Your employer account is ready \u2014 your first ${config.freePostsPerEmail} posts are free.`
      );
    } else {
      html = emailShellV2(`
            ${headerBlockV2('Welcome to PMHNP Hiring', '')}
            ${spacerV2(20)}
            <tr><td class="content-pad" style="padding:0 40px;"><p style="margin:0;font-family:${SERIF_V2};font-size:17px;color:${V2.textBody};line-height:1.7;text-align:center;">You have unlocked a new way to find your perfect role. Search curated positions, get matched by AI, and connect directly with hiring managers \u2014 no recruiters, no middlemen.</p></td></tr>
            ${spacerV2(36)}
            <tr><td class="content-pad" style="padding:0 40px;"><p style="margin:0;font-family:${SERIF_V2};font-size:26px;font-weight:700;color:${V2.textHeading};text-align:center;">Here is how to get started</p></td></tr>
            ${spacerV2(20)}
            ${stepBlock('step-build-profile.png', 'Build your profile', 'Take 60 seconds to add your credentials, specialties, and location preferences.')}
            ${spacerV2(16)}
            ${stepBlock('step-ai-alerts.png', 'Turn on AI alerts', 'Get notified the exact minute a perfectly matched role lands on the board.')}
            ${spacerV2(16)}
            ${stepBlock('step-connect.png', 'Connect directly', 'Connect to hiring managers directly, no recruiters involved.')}
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

    const unsubToken = await getOrCreateUnsubToken(email);
    await sendAndLog({
      from: EMAIL_FROM,
      to: email,
      subject: isEmployer
        ? 'Welcome to PMHNP Hiring — Start Hiring Today'
        : `Welcome to PMHNP Hiring, ${firstName || 'there'}!`,
      html,
    }, 'welcome_signup', { role }, `${BASE_URL}/unsubscribe?token=${unsubToken}`);

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

export interface InvoiceLinks {
  invoicePdfUrl?: string | null;
  hostedInvoiceUrl?: string | null;
  invoiceNumber?: string | null;
}

export async function sendConfirmationEmail(
  employerEmail: string,
  jobTitle: string,
  jobId: string,
  dashboardToken?: string,
  unsubscribeToken?: string,
  // Audit #30: confirmation email duration must match the actual expiry
  // written to the DB — free posts run 30 days, paid posts run 60. Caller
  // passes the right value; defaults to the paid duration for backward compat.
  durationDays: number = config.durationDays,
  invoice?: InvoiceLinks,
): Promise<EmailResult> {
  try {
    const jobSlug = slugify(jobTitle, jobId);
    // Token-based dashboard URL when available so employers without an account
    // can still access their listing/analytics from this email.
    const dashboardUrl = dashboardToken
      ? `${BASE_URL}/employer/dashboard/${dashboardToken}`
      : `${BASE_URL}/employer/dashboard`;

    const featuresLine = `${durationDays}-day listing · Featured badge · ${config.limits.candidateUnlocksPerPosting} candidate unlocks · ${config.limits.inmailsPerPosting} InMails · Full analytics`;

    const invoiceBlock = (invoice?.invoicePdfUrl || invoice?.hostedInvoiceUrl)
      ? `
        ${spacerV2(16)}
        <tr><td class="content-pad" style="padding:0 40px;">
          <div style="background:#F8FAFC;border:1px solid rgba(0,0,0,0.06);border-radius:12px;padding:16px 20px;">
            <p style="margin:0 0 6px;font-family:${SANS_V2};font-size:13px;font-weight:700;color:${V2.textPrimary};text-transform:uppercase;letter-spacing:0.05em;">Receipt &amp; Invoice</p>
            <p style="margin:0 0 8px;font-family:${SANS_V2};font-size:14px;color:${V2.textPrimary};line-height:1.6;">${invoice.invoiceNumber ? `Invoice #${invoice.invoiceNumber}` : 'Your payment receipt is ready.'}</p>
            ${invoice.invoicePdfUrl ? `<a href="${invoice.invoicePdfUrl}" style="display:inline-block;margin-right:12px;font-family:${SANS_V2};font-size:14px;color:${V2.teal};text-decoration:underline;">Download PDF</a>` : ''}
            ${invoice.hostedInvoiceUrl ? `<a href="${invoice.hostedInvoiceUrl}" style="display:inline-block;font-family:${SANS_V2};font-size:14px;color:${V2.teal};text-decoration:underline;">View online</a>` : ''}
          </div>
        </td></tr>`
      : '';

    const html = emailShellV2(`
      ${headerBlockV2('Your Listing Is Live', '')}
      ${spacerV2(12)}
      ${simpleBlock('hero-job-post.png', `Your posting is now visible to thousands of PMHNPs actively searching for their next role. The listing will remain active for ${durationDays} days.`)}
      ${spacerV2(20)}
      <tr><td class="content-pad" style="padding:0 40px;">
        <div style="background:#F0FDFA;border:1px solid rgba(13,148,136,0.15);border-radius:12px;padding:16px 20px;">
          <p style="margin:0 0 6px;font-family:${SANS_V2};font-size:13px;font-weight:700;color:${V2.teal};text-transform:uppercase;letter-spacing:0.05em;">What's Included</p>
          <p style="margin:0;font-family:${SANS_V2};font-size:14px;color:${V2.textPrimary};line-height:1.6;">${featuresLine}</p>
          <p style="margin:8px 0 0;font-family:${SANS_V2};font-size:12px;color:${V2.textMuted};line-height:1.5;">Candidates you unlock stay in your dashboard forever — even after this posting expires.</p>
        </div>
      </td></tr>${invoiceBlock}
      ${spacerV2(28)}
      <tr><td class="content-pad" style="padding:0 40px;text-align:center;">
        ${primaryButtonV2('View Your Listing', `${BASE_URL}/jobs/${jobSlug}`)}
      </td></tr>
      ${spacerV2(16)}
      <tr><td class="content-pad" style="padding:0 40px;text-align:center;"><p style="margin:0;font-family:${SANS_V2};font-size:14px;color:${V2.textMuted};line-height:1.6;">Manage your posting from your <a href="${dashboardUrl}" style="color:${V2.teal};text-decoration:underline;">dashboard</a>.</p></td></tr>
      ${spacerV2(48)}
      ${closeContentV2()}`,
      unsubscribeFooterV2('sample'),
      'Your job posting is now live.'
    );

    const unsubToken = await getOrCreateUnsubToken(employerEmail);
    await sendAndLog({
      from: EMAIL_FROM,
      to: employerEmail,
      subject: `✅ Your PMHNP job post is live — "${jobTitle}"`,
      html,
    }, 'job_confirmation', { jobId }, `${BASE_URL}/unsubscribe?token=${unsubToken}`);

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
// 4. JOB ALERT EMAIL — moved to lib/job-alerts-service.ts
// ═══════════════════════════════════════════════════════════════════════════════
// The previous `sendJobAlertEmail` here was an orphan (no callers). The actual
// production sender is `sendJobAlerts()` in lib/job-alerts-service.ts which is
// invoked by /api/cron/send-alerts. Removed 2026-04-30 — see audit issue 10.


// ═══════════════════════════════════════════════════════════════════════════════
// 5. RENEWAL CONFIRMATION EMAIL
// ═══════════════════════════════════════════════════════════════════════════════

export async function sendRenewalConfirmationEmail(
  email: string,
  jobTitle: string,
  newExpiresAt: Date,
  dashboardToken: string,
  unsubscribeToken: string,
  invoice?: InvoiceLinks,
): Promise<EmailResult> {
  try {
    const expiryStr = newExpiresAt.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const dashboardUrl = `${BASE_URL}/employer/dashboard/${dashboardToken}`;

    const invoiceLine = invoice?.invoicePdfUrl || invoice?.hostedInvoiceUrl
      ? `${invoice.invoiceNumber ? `Invoice #${invoice.invoiceNumber} · ` : ''}${invoice.invoicePdfUrl ? `<a href="${invoice.invoicePdfUrl}" style="color:${V2.teal};text-decoration:underline;">Download PDF</a>` : ''}${invoice.invoicePdfUrl && invoice.hostedInvoiceUrl ? ' · ' : ''}${invoice.hostedInvoiceUrl ? `<a href="${invoice.hostedInvoiceUrl}" style="color:${V2.teal};text-decoration:underline;">View online</a>` : ''}`
      : 'A formal invoice is available from your dashboard.';

    const html = emailShellV2(`
      ${headerBlockV2('Listing Renewed Successfully', '')}
      ${spacerV2(12)}
      ${simpleBlock('hero-renewal.png', `Your posting for <strong>${escapeHtml(jobTitle)}</strong> has been renewed and will remain active until ${expiryStr}.`)}
      ${spacerV2(20)}
      <tr><td class="content-pad" style="padding:0 40px;">
        <div style="background:#F0FDFA;border:1px solid rgba(13,148,136,0.15);border-radius:12px;padding:16px 20px;">
          <p style="margin:0 0 6px;font-family:${SANS_V2};font-size:13px;font-weight:700;color:${V2.teal};text-transform:uppercase;letter-spacing:0.05em;">Receipt</p>
          <p style="margin:0;font-family:${SANS_V2};font-size:14px;color:${V2.textPrimary};line-height:1.6;">Renewal — $${config.renewalPrice}.00 · ${invoiceLine}</p>
          <p style="margin:8px 0 0;font-family:${SANS_V2};font-size:12px;color:${V2.textMuted};line-height:1.5;">You also got a fresh ${config.limits.candidateUnlocksPerPosting} candidate unlocks and ${config.limits.inmailsPerPosting} InMails for this renewal cycle.</p>
        </div>
      </td></tr>
      ${spacerV2(28)}
      <tr><td class="content-pad" style="padding:0 40px;text-align:center;">
        ${primaryButtonV2('View Your Dashboard', dashboardUrl)}
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

    const dashboardUrl = `${BASE_URL}/employer/dashboard/${dashboardToken}`;
    const discountPct = Math.round((1 - config.renewalPrice / config.postingPrice) * 100);

    const html = emailShellV2(`
      ${headerBlockV2(`Your Listing Expires in ${daysUntilExpiry} Days`, '')}
      ${spacerV2(12)}
      ${bodyTextV2(`Your posting for <strong>${escapeHtml(jobTitle)}</strong> will expire on ${expiryDateStr}. Renew now to maintain visibility and continue receiving applications.`)}
      ${spacerV2(24)}
      <tr><td class="content-pad" style="padding:0 40px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>${statBlockV2(viewCount.toLocaleString(), 'Views')}<td width="8"></td>${statBlockV2(applyClickCount.toLocaleString(), 'Applies')}<td width="8"></td>${statBlockV2('—', 'Saved')}</tr></table></td></tr>
      ${spacerV2(20)}
      <tr><td class="content-pad" style="padding:0 40px;">
        <div style="background:#F0FDFA;border:1px solid rgba(13,148,136,0.15);border-radius:12px;padding:16px 20px;">
          <p style="margin:0 0 6px;font-family:${SANS_V2};font-size:13px;font-weight:700;color:${V2.teal};text-transform:uppercase;letter-spacing:0.05em;">Renew for $${config.renewalPrice} (Save ${discountPct}%)</p>
          <p style="margin:0;font-family:${SANS_V2};font-size:14px;color:${V2.textPrimary};line-height:1.6;">Adds ${config.durationDays} days to your current expiration plus a fresh ${config.limits.candidateUnlocksPerPosting} unlocks and ${config.limits.inmailsPerPosting} InMails. Renewing early doesn't lose any remaining days.</p>
          <p style="margin:8px 0 0;font-family:${SANS_V2};font-size:12px;color:${V2.textMuted};line-height:1.5;">Heads up: even after expiry, candidates you've already unlocked stay accessible in your dashboard.</p>
        </div>
      </td></tr>
      ${spacerV2(24)}
      <tr><td class="content-pad" style="padding:0 40px;text-align:center;">
        ${primaryButtonV2('Renew Your Listing', dashboardUrl)}
      </td></tr>
      ${spacerV2(48)}
      ${closeContentV2()}`,
      unsubscribeFooterV2(unsubscribeToken || 'sample'),
      `Your listing expires in ${daysUntilExpiry} days — renew for $${config.renewalPrice} (save ${discountPct}%).`
    );

    // Always pass a real unsubscribe token; mint one if the caller didn't.
    const unsubToken = unsubscribeToken ?? await getOrCreateUnsubToken(email);
    await sendAndLog({
      from: EMAIL_FROM,
      to: email,
      subject: `⏰ Your job posting expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''} — Renew Now`,
      html,
    }, 'expiry_warning', { jobTitle, daysUntilExpiry }, `${BASE_URL}/unsubscribe?token=${unsubToken}`);

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
// 6b. REFUND CONFIRMATION EMAIL (audit #28)
// ═══════════════════════════════════════════════════════════════════════════════

export async function sendRefundConfirmationEmail(
  email: string,
  jobTitle: string,
  amountCents: number,
  isPartial: boolean,
  unsubscribeToken: string | null,
): Promise<EmailResult> {
  try {
    const formattedAmount = `$${(amountCents / 100).toFixed(2)}`;
    const refundType = isPartial ? 'Partial refund' : 'Refund';

    const html = emailShellV2(
      `
      ${headerBlockV2('Refund processed', '')}
      ${spacerV2(12)}
      ${bodyTextV2(`We've processed a ${refundType.toLowerCase()} of <strong>${formattedAmount}</strong> for your job posting <strong>${escapeHtml(jobTitle)}</strong>.`)}
      ${spacerV2(20)}
      <tr><td class="content-pad" style="padding:0 40px;">
        <div style="background:#F0FDFA;border:1px solid rgba(13,148,136,0.15);border-radius:12px;padding:16px 20px;">
          <p style="margin:0 0 6px;font-family:${SANS_V2};font-size:13px;font-weight:700;color:${V2.teal};text-transform:uppercase;letter-spacing:0.05em;">${refundType}</p>
          <p style="margin:0;font-family:${SANS_V2};font-size:14px;color:${V2.textPrimary};line-height:1.6;">${formattedAmount} will appear on the original payment method within <strong>5–10 business days</strong>, depending on your bank or card issuer.</p>
          <p style="margin:8px 0 0;font-family:${SANS_V2};font-size:12px;color:${V2.textMuted};line-height:1.5;">Reference for your records: this refund relates to the posting "${escapeHtml(jobTitle)}".</p>
        </div>
      </td></tr>
      ${spacerV2(28)}
      <tr><td class="content-pad" style="padding:0 40px;text-align:center;"><p style="margin:0;font-family:${SANS_V2};font-size:14px;color:${V2.textMuted};line-height:1.6;">Questions? Reply to this email or contact <a href="mailto:support@pmhnphiring.com" style="color:${V2.teal};text-decoration:underline;">support@pmhnphiring.com</a>.</p></td></tr>
      ${spacerV2(48)}
      ${closeContentV2()}`,
      unsubscribeFooterV2(unsubscribeToken || 'sample'),
      `${refundType} of ${formattedAmount} processed — appears in 5–10 business days.`,
    );

    const unsubToken = unsubscribeToken ?? await getOrCreateUnsubToken(email);
    await sendAndLog(
      {
        from: EMAIL_FROM,
        to: email,
        subject: `${refundType} processed — ${formattedAmount} for "${jobTitle}"`,
        html,
      },
      'refund_confirmation',
      { jobTitle, amountCents, isPartial },
      `${BASE_URL}/unsubscribe?token=${unsubToken}`,
    );

    logger.info('Refund confirmation email sent', { email, jobTitle, amountCents, isPartial });
    return { success: true };
  } catch (error) {
    logger.error('Error sending refund confirmation email', error, { email });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send refund email',
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
    // E3: gate on suppression so we never mail bounced/complained/unsubscribed
    // employer addresses (this path previously skipped the check entirely).
    if (await isEmailSuppressed(recipientEmail)) {
      logger.info('Candidate alert suppressed', { recipientEmail });
      return { success: false, error: 'suppressed' };
    }

    // E3: thread a REAL per-recipient unsubscribe token (was the literal 'sample')
    // so the footer link works and sendAndLog can attach the List-Unsubscribe header.
    const unsubToken = await getOrCreateUnsubToken(recipientEmail);
    const unsubscribeUrl = `${BASE_URL}/unsubscribe?token=${unsubToken}`;

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
      unsubscribeFooterV2(unsubToken),
      `A new candidate matching your criteria just joined.`
    );

    await sendAndLog({
      from: EMAIL_FROM,
      to: recipientEmail,
      subject: `🔔 ${candidates.length} new candidate${candidates.length !== 1 ? 's' : ''} match your criteria`,
      html,
    }, 'candidate_alert', { candidateCount: candidates.length }, unsubscribeUrl);

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
    // Convert adverb form to noun for "this {period}" prose. "Monthly"
    // → "month" reads natural ("performed this month"), avoids the
    // awkward "performed this monthly" the previous template produced.
    const periodNoun: string =
      ({ Monthly: 'month', Weekly: 'week', Daily: 'day', Quarterly: 'quarter' } as Record<string, string>)[periodLabel]
      ?? periodLabel.toLowerCase().replace(/ly$/, '');

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
      ${headerBlockV2(`Your ${periodLabel} Hiring Report`, '')}
      ${spacerV2(12)}
      ${simpleBlock('hero-performance.png', `Here is how your listings performed this ${periodNoun}. Use these insights to optimize your postings and attract stronger candidates.`)}
      ${spacerV2(24)}
      <tr><td class="content-pad" style="padding:0 40px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>${statBlockV2(totalViews.toLocaleString(), 'Views')}<td width="8"></td>${statBlockV2(totalClicks.toLocaleString(), 'Apply Clicks')}<td width="8"></td>${statBlockV2(totalApps.toLocaleString(), 'Applications')}</tr></table></td></tr>
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
  jobs: Array<{
    id?: string;
    title: string;
    employer: string;
    location: string;
    slug: string;
    minSalary?: number | null;
    maxSalary?: number | null;
    normalizedMinSalary?: number | null;
    normalizedMaxSalary?: number | null;
    mode?: string | null;
    jobType?: string | null;
    isFeatured?: boolean | null;
    applyOnPlatform?: boolean | null;
    sourceType?: string | null;
    createdAt?: Date;
  }>
): Promise<EmailResult> {
  try {
    const name = firstName || 'there';
    const unsubToken = await getOrCreateUnsubToken(email);

    const jobCardsHtml = jobs.slice(0, 5).map((job, i) => {
      const minK = (job.normalizedMinSalary || job.minSalary) && (job.normalizedMinSalary || job.minSalary)! > 0
        ? Math.round((job.normalizedMinSalary || job.minSalary)! / 1000) : 0;
      const maxK = (job.normalizedMaxSalary || job.maxSalary) && (job.normalizedMaxSalary || job.maxSalary)! > 0
        ? Math.round((job.normalizedMaxSalary || job.maxSalary)! / 1000) : 0;
      const salaryText = minK && maxK ? `$${minK}k–$${maxK}k` : minK ? `$${minK}k+` : maxK ? `Up to $${maxK}k` : '';
      return renderJobCardHtml({
        title: job.title,
        employer: job.employer,
        location: job.location,
        jobType: job.jobType ?? null,
        mode: job.mode ?? null,
        isFeatured: job.isFeatured ?? null,
        applyOnPlatform: job.applyOnPlatform ?? null,
        sourceType: job.sourceType ?? null,
        salaryText,
        jobUrl: `${BASE_URL}/jobs/${job.slug}`,
      }, i, i === jobs.slice(0, 5).length - 1);
    }).join('');

    const headline = jobs.length === 1 ? 'Your Saved Job Is Still Open' : `${jobs.length} Saved Jobs Still Open`;
    const bodyMsg = jobs.length === 1
      ? `You saved this position recently. It's still accepting applications \u2014 do not miss your window.`
      : `You saved <strong>${jobs.length} jobs</strong> recently. These positions are still accepting applications \u2014 do not miss your window.`;

    const html = emailShellV2(`
      ${headerBlockV2(headline, '')}
      ${spacerV2(12)}
      ${bodyTextV2(bodyMsg)}
      ${spacerV2(20)}
      ${jobCardsHtml}
      ${spacerV2(28)}
      <tr><td class="content-pad" style="padding:0 40px;text-align:center;">
        ${primaryButtonV2('View All Saved \u2192', `${BASE_URL}/saved`)}
      </td></tr>
      ${spacerV2(48)}
      ${closeContentV2()}`,
      unsubscribeFooterV2(unsubToken),
      jobs.length === 1 ? `The job you saved is still open.` : `${jobs.length} saved jobs are still open.`
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
