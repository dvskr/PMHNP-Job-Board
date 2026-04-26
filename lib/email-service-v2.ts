import { Resend } from 'resend';
import { slugify } from '@/lib/utils';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import {
  emailShellV2, headerBlockV2, amberHeaderV2,
  primaryButtonV2, secondaryButtonV2,
  infoCardV2, noteCardV2, warningCardV2,
  featureRowV2, statCardV2, dividerV2,
  sectionLabelV2, salaryBadgeV2, badgeV2,
  bodyTextV2, mutedTextV2,
  spacerV2, closeContentV2,
  unsubscribeFooterV2, contactFooterV2,
  V2, SANS, SERIF,
} from '@/lib/email-templates-v2';

const resend = new Resend(process.env.RESEND_API_KEY);

// Use env var for email links (falls back to production)
const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com').replace(/\/$/, '');
const SITE_URL = BASE_URL; // alias for backward compatibility
const SALARY_GUIDE_URL = process.env.SALARY_GUIDE_URL || 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/resources/PMHNP_Salary_Guide_2026.pdf';

// ── Sender addresses — separate transactional from marketing ──
const EMAIL_FROM_TRANSACTIONAL = process.env.EMAIL_FROM || 'PMHNP Hiring <noreply@pmhnphiring.com>';
const EMAIL_FROM_MARKETING = process.env.EMAIL_FROM_MARKETING || 'PMHNP Hiring <alerts@pmhnphiring.com>';
const EMAIL_FROM = EMAIL_FROM_TRANSACTIONAL; // backward compat
const EMAIL_REPLY_TO = 'hello@pmhnphiring.com';

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

// ═══════════════════════════════════════════════════════════════════════════════
// 1. WELCOME EMAIL (Job Alert Subscription)
// ═══════════════════════════════════════════════════════════════════════════════

export async function sendWelcomeEmail(email: string, unsubscribeToken: string): Promise<EmailResult> {
  try {
    const html = emailShellV2(`
          ${headerBlockV2('Welcome to PMHNP Hiring!', 'Your job alerts are now active')}

                <!-- Feature rows -->
                <tr>
                  <td class="content-pad" style="padding:0 40px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      ${featureRowV2('🔍', 'Smart Matching', 'Jobs curated to your location, specialty, and salary preferences')}
                      ${featureRowV2('💰', 'Salary Intel', 'Real compensation data from 10,000+ listings nationwide')}
                      ${featureRowV2('⚡', 'First to Know', 'Alerts delivered daily — before positions get filled')}
                    </table>
                  </td>
                </tr>

                ${spacerV2(32)}

                <!-- CTA buttons -->
                <tr>
                  <td class="content-pad" style="padding:0 40px;text-align:center;">
                    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto;">
                      <tr class="stack">
                        <td style="padding-right:12px;">
                          ${primaryButtonV2('Browse Jobs →', `${BASE_URL}/jobs`)}
                        </td>
                        <td>
                          ${secondaryButtonV2('Manage Alerts', `${BASE_URL}/job-alerts`)}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                ${spacerV2(48)}
          ${closeContentV2()}`,
      unsubscribeFooterV2(unsubscribeToken),
      'Your PMHNP job alerts are active — personalized matches coming your way!'
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

    const employerFeatures = `
                <tr>
                  <td class="content-pad" style="padding:0 40px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      ${featureRowV2('📝', 'Post in Minutes', 'Create and publish job listings with our guided form')}
                      ${featureRowV2('👥', 'Reach PMHNPs', 'Your listing is seen by 10,000+ qualified candidates')}
                      ${featureRowV2('📊', 'Track Everything', 'View counts, apply clicks, and applicant analytics')}
                    </table>
                  </td>
                </tr>

                ${spacerV2(32)}

                <tr>
                  <td class="content-pad" style="padding:0 40px;text-align:center;">
                    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto;">
                      <tr class="stack">
                        <td style="padding-right:12px;">${primaryButtonV2('Post a Job →', `${SITE_URL}/post-job`)}</td>
                        <td>${secondaryButtonV2('Dashboard', `${SITE_URL}/employer/dashboard`)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>`;

    const seekerFeatures = `
                <tr>
                  <td class="content-pad" style="padding:0 40px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      ${featureRowV2('✓', 'Browse 10,000+ Jobs', 'Remote, travel, full-time, per diem — all PMHNP specialties')}
                      ${featureRowV2('✉', 'Smart Alerts', 'Get notified instantly when matching jobs are posted')}
                      ${featureRowV2('⚡', 'One-Click Apply', 'Save jobs, track applications, and apply fast')}
                    </table>
                  </td>
                </tr>

                ${spacerV2(32)}

                <tr>
                  <td class="content-pad" style="padding:0 40px;text-align:center;">
                    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto;">
                      <tr class="stack">
                        <td style="padding-right:12px;">${primaryButtonV2('Browse Jobs →', `${SITE_URL}/jobs`)}</td>
                        <td>${secondaryButtonV2('Set Up Alerts', `${SITE_URL}/job-alerts`)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>

                ${spacerV2(32)}
                ${dividerV2()}
                ${spacerV2(24)}

                <!-- Salary Guide Bonus -->
                <tr>
                  <td class="content-pad" style="padding:0 40px;">
                    ${sectionLabelV2('★ FREE BONUS', V2.teal)}
                    <p style="margin:0 0 12px;font-family:${SERIF};font-size:22px;font-weight:700;color:${V2.textHeading};">2026 PMHNP Salary Guide</p>
                    <p style="margin:0 0 16px;font-family:${SANS};font-size:14px;color:${V2.textBody};line-height:1.6;">Salary ranges by state · Remote vs in-person pay · Negotiation tips</p>
                    ${primaryButtonV2('Download Salary Guide (PDF)', SALARY_GUIDE_URL)}
                  </td>
                </tr>`;

    const html = emailShellV2(`
          ${headerBlockV2(greeting, isEmployer ? 'Your employer account is ready' : 'Your PMHNP career starts here')}

                <!-- Body intro -->
                <tr>
                  <td class="content-pad" style="padding:0 40px;">
                    <p style="margin:0 0 24px;font-family:${SERIF};font-size:19px;color:${V2.textBody};line-height:1.6;">
                      ${isEmployer
                        ? 'Your employer account is ready. Start posting jobs and connect with qualified PMHNPs nationwide.'
                        : 'Welcome to the #1 job board built exclusively for Psychiatric Mental Health Nurse Practitioners.'}
                    </p>
                  </td>
                </tr>

                ${spacerV2(8)}
                ${isEmployer ? employerFeatures : seekerFeatures}

                ${spacerV2(48)}
          ${closeContentV2()}`,
      contactFooterV2(),
      isEmployer ? 'Your employer account is ready — start posting jobs today!' : `Welcome ${firstName || ''} — browse 10,000+ PMHNP jobs now!`
    );

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
          ${headerBlockV2('Your Job Post is Live!', 'Now visible to thousands of PMHNPs')}

                <!-- Job title card -->
                ${infoCardV2(`
                  ${sectionLabelV2('Published', V2.emerald)}
                  <p style="margin:0;font-family:${SERIF};font-size:18px;font-weight:700;color:${V2.textHeading};">${jobTitle}</p>
                `, V2.emerald)}

                ${spacerV2(24)}

                <!-- Status timeline -->
                <tr>
                  <td class="content-pad" style="padding:0 40px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td width="33%" style="text-align:center;padding:12px 4px;">
                          <div style="width:32px;height:32px;background:${V2.teal};border-radius:50%;margin:0 auto 8px;line-height:32px;font-size:14px;color:#fff;">✓</div>
                          <div style="font-family:${SANS};font-size:11px;font-weight:600;color:${V2.teal};">Posted</div>
                        </td>
                        <td width="33%" style="text-align:center;padding:12px 4px;">
                          <div style="width:32px;height:32px;background:${V2.teal};border-radius:50%;margin:0 auto 8px;line-height:32px;font-size:14px;color:#fff;">✓</div>
                          <div style="font-family:${SANS};font-size:11px;font-weight:600;color:${V2.teal};">Live</div>
                        </td>
                        <td width="33%" style="text-align:center;padding:12px 4px;">
                          <div style="width:32px;height:32px;background:${V2.bgCardAlt};border-radius:50%;margin:0 auto 8px;line-height:32px;font-size:14px;color:${V2.textMuted};border:2px dashed ${V2.borderMed};">⏳</div>
                          <div style="font-family:${SANS};font-size:11px;color:${V2.textMuted};">Receiving Views</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                ${spacerV2(16)}

                <tr>
                  <td class="content-pad" style="padding:0 40px;">
                    <p style="margin:0;font-family:${SANS};font-size:14px;color:${V2.textMuted};line-height:1.6;">
                      Your listing is active for <strong style="color:${V2.textHeading};">${config.durationDays} days</strong>. We'll notify you when it's time to renew.
                    </p>
                  </td>
                </tr>

                ${spacerV2(24)}

                <!-- CTA buttons -->
                <tr>
                  <td class="content-pad" style="padding:0 40px;text-align:center;">
                    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto;">
                      <tr class="stack">
                        <td style="padding-right:12px;">${primaryButtonV2('View Job →', `${BASE_URL}/jobs/${jobSlug}`)}</td>
                        <td>${secondaryButtonV2('Edit Job', `${BASE_URL}/jobs/edit/${editToken}`)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>

                ${spacerV2(24)}

                <!-- Dashboard card -->
                ${infoCardV2(`
                  <p style="margin:0 0 8px;font-family:${SANS};font-size:14px;font-weight:600;color:${V2.textHeading};">📊 Your Employer Dashboard</p>
                  <p style="margin:0 0 16px;font-family:${SANS};font-size:13px;color:${V2.textMuted};line-height:1.5;">Track views, clicks, and manage all your job postings in one place.</p>
                  ${primaryButtonV2('Open Dashboard', dashboardUrl)}
                `, V2.blue)}

                ${spacerV2(48)}
          ${closeContentV2()}`,
      contactFooterV2(),
      `Your job "${jobTitle}" is now live on PMHNP Hiring!`
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
