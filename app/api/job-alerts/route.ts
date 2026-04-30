import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { sanitizeJobAlert } from '@/lib/sanitize';
import { syncToBeehiiv } from '@/lib/beehiiv';
import { logger } from '@/lib/logger';
import {
  emailShellV2, headerBlockV2, primaryButtonV2, secondaryButtonV2,
  spacerV2, closeContentV2, featureRowV2, dividerV2, unsubscribeFooterV2,
  bodyTextV2, V2, SANS, SERIF,
} from '@/lib/email-templates-v2';
import { Resend } from 'resend';
import { brand } from '@/config/brand';

const resend = new Resend(process.env.RESEND_API_KEY);
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || brand.baseUrl;
const EMAIL_FROM = process.env.EMAIL_FROM_MARKETING || process.env.EMAIL_FROM || brand.email.marketingFrom;
const EMAIL_REPLY_TO = brand.email.replyTo;
const SALARY_GUIDE_URL = process.env.SALARY_GUIDE_URL || 'https://sggccmqjzuimwlahocmy.supabase.co/storage/v1/object/public/resources/PMHNP_Salary_Guide_2026.pdf';

interface CreateAlertBody {
  email: string;
  name?: string;
  keyword?: string;
  location?: string;
  mode?: string;
  jobType?: string;
  minSalary?: number;
  maxSalary?: number;
  frequency?: string;
  newsletterOptIn?: boolean;
}

// Helper to build criteria summary for email
function buildCriteriaSummary(alert: CreateAlertBody): string {
  const parts: string[] = [];

  if (alert.keyword) parts.push(`"${alert.keyword}"`);
  if (alert.location) parts.push(`in ${alert.location}`);
  if (alert.mode) parts.push(alert.mode);
  if (alert.jobType) parts.push(alert.jobType);
  if (alert.minSalary || alert.maxSalary) {
    if (alert.minSalary && alert.maxSalary) {
      parts.push(`$${alert.minSalary.toLocaleString()}-$${alert.maxSalary.toLocaleString()}`);
    } else if (alert.minSalary) {
      parts.push(`$${alert.minSalary.toLocaleString()}+`);
    } else if (alert.maxSalary) {
      parts.push(`up to $${alert.maxSalary.toLocaleString()}`);
    }
  }

  return parts.length > 0 ? parts.join(' · ') : `all ${brand.niche.short} jobs`;
}

// Send the confirm-your-subscription email (CASL / GDPR double opt-in).
// The alert is created inactive; the cron only fires for confirmed alerts.
async function sendAlertConfirmationEmail(
  email: string,
  frequency: string,
  criteriaSummary: string,
  token: string,
  confirmationToken: string,
): Promise<void> {
  try {
    const unsubUrl = `${BASE_URL}/job-alerts/unsubscribe?token=${token}`;
    const confirmUrl = `${BASE_URL}/api/job-alerts/confirm?token=${confirmationToken}`;

    const html = emailShellV2(`
      ${headerBlockV2('One last step', 'Confirm your job alert subscription')}
      ${spacerV2(8)}
      <tr><td class="content-pad" style="padding:0 40px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          ${featureRowV2('&#9993;', `${frequency === 'daily' ? 'Daily' : 'Weekly'} Job Alerts`, `Once confirmed, we'll email new jobs matching: ${criteriaSummary}`)}
          ${featureRowV2('&#10003;', 'Smart Matching', `Only relevant ${brand.niche.short} positions \u2014 no spam`)}
          ${featureRowV2('&#9889;', 'Be First to Apply', 'Jobs delivered before they fill up')}
        </table>
      </td></tr>
      ${spacerV2(24)}
      <tr><td class="content-pad" style="padding:0 40px;">
        <table role="presentation" cellspacing="0" cellpadding="0"><tr class="stack">
          <td style="padding-right:12px;">${primaryButtonV2('Confirm Subscription \u2192', confirmUrl)}</td>
          <td>${secondaryButtonV2('Manage Alert', `${BASE_URL}/job-alerts/manage?token=${token}`)}</td>
        </tr></table>
      </td></tr>
      ${spacerV2(32)}
      ${dividerV2()}
      ${spacerV2(24)}
      <tr><td class="content-pad" style="padding:0 40px;">
        <p style="margin:0 0 6px;font-family:${SANS};font-size:12px;font-weight:700;color:${V2.teal};text-transform:uppercase;letter-spacing:1px;">&#9733; FREE BONUS</p>
        <p style="margin:0 0 12px;font-family:${SERIF};font-size:22px;font-weight:700;color:${V2.textHeading};">2026 PMHNP Salary Guide</p>
        <p style="margin:0 0 16px;font-family:${SANS};font-size:14px;color:${V2.textBody};line-height:1.6;">Salary ranges by state &middot; Remote vs in-person pay &middot; Negotiation tips</p>
        ${primaryButtonV2('Download Salary Guide (PDF)', SALARY_GUIDE_URL)}
      </td></tr>
      ${spacerV2(48)}
      ${closeContentV2()}`,
      unsubscribeFooterV2(token),
      'Your PMHNP job alert is live! Browse 10,000+ jobs now.'
    );

    // Strip HTML for plain text
    const text = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n')
      .replace(/<a[^>]+href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '$2 ($1)')
      .replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').replace(/&middot;/gi, '·')
      .replace(/&amp;/gi, '&').replace(/&#9733;/gi, '★').replace(/&#9993;/gi, '✉')
      .replace(/&#10003;/gi, '✓').replace(/&#9889;/gi, '⚡')
      .replace(/\n{3,}/g, '\n\n').trim();

    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      replyTo: EMAIL_REPLY_TO,
      subject: `Confirm your ${brand.niche.short} job alert subscription`,
      html,
      text,
      headers: {
        'List-Unsubscribe': `<${unsubUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });

    // Log to email_sends (non-blocking)
    try {
      await prisma.emailSend.create({
        data: {
          to: email,
          subject: `Confirm your ${brand.niche.short} job alert subscription`,
          emailType: 'alert_confirm',
        },
      });
    } catch { /* non-blocking */ }

    logger.info('Alert confirmation email sent', { email });
  } catch (error) {
    logger.error('Error sending alert confirmation email', error, { email });
  }
}

// POST - Create new job alert
export async function POST(request: NextRequest) {
  // Rate limiting
  const rateLimitResult = await rateLimit(request, 'jobAlerts', RATE_LIMITS.jobAlerts);
  if (rateLimitResult) return rateLimitResult;

  try {
    const body: CreateAlertBody = await request.json();

    // Sanitize inputs
    const sanitized = sanitizeJobAlert(body);
    const { email, name, keyword, location, mode, jobType, minSalary, maxSalary } = sanitized;
    const frequency = sanitized.frequency || 'weekly';

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email address' },
        { status: 400 }
      );
    }

    // Validate frequency
    if (frequency && !['daily', 'weekly'].includes(frequency)) {
      return NextResponse.json(
        { success: false, error: 'Frequency must be "daily" or "weekly"' },
        { status: 400 }
      );
    }

    // Validate salary values
    if (minSalary !== undefined && (typeof minSalary !== 'number' || minSalary < 0)) {
      return NextResponse.json(
        { success: false, error: 'Invalid minimum salary' },
        { status: 400 }
      );
    }
    if (maxSalary !== undefined && (typeof maxSalary !== 'number' || maxSalary < 0)) {
      return NextResponse.json(
        { success: false, error: 'Invalid maximum salary' },
        { status: 400 }
      );
    }
    if (minSalary && maxSalary && minSalary > maxSalary) {
      return NextResponse.json(
        { success: false, error: 'Minimum salary cannot be greater than maximum salary' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase();

    // Upsert EmailLead — create if new, optionally flip newsletterOptIn
    const newsletterOptIn = body.newsletterOptIn !== false; // default true
    await prisma.emailLead.upsert({
      where: { email: normalizedEmail },
      update: newsletterOptIn ? { newsletterOptIn: true } : {},
      create: {
        email: normalizedEmail,
        source: 'job_alert',
        newsletterOptIn,
      },
    });

    // Sync to Beehiiv newsletter (fire-and-forget)
    syncToBeehiiv(normalizedEmail, { utmSource: 'job_alert' });

    // Dedup: match BOTH confirmed (is_active = true) and unconfirmed
    // alerts. Without checking the unconfirmed bucket too, a user who
    // resubmits the same form before clicking the confirmation link
    // would receive a fresh email per submission. We dedupe instead and
    // re-send the existing confirmation if the original is still pending.
    let jobAlert;
    const existing = await prisma.jobAlert.findFirst({
      where: {
        email: normalizedEmail,
        keyword: keyword || null,
        location: location || null,
        mode: mode || null,
        jobType: jobType || null,
        minSalary: minSalary || null,
        maxSalary: maxSalary || null,
      },
    });

    if (existing) {
      // Update frequency if changed, otherwise just reuse
      jobAlert = await prisma.jobAlert.update({
        where: { id: existing.id },
        data: { frequency, name: name || existing.name },
      });
    }

    if (!jobAlert) {
      jobAlert = await prisma.jobAlert.create({
        data: {
          email: normalizedEmail,
          name,
          keyword,
          location,
          mode,
          jobType,
          minSalary,
          maxSalary,
          frequency,
        },
      });
    }

    // Build criteria summary and send confirm-your-subscription email.
    // The alert was inserted with isActive=false; the cron only fires
    // for alerts where confirmedAt is set, which happens at /api/job-
    // alerts/confirm when the user clicks the link in this email.
    // Reuse the existing token if the row was already confirmed (the
    // dedup branch above) so we don't re-prompt subscribed users.
    const criteriaSummary = buildCriteriaSummary(body);
    if (!jobAlert.confirmedAt) {
      await sendAlertConfirmationEmail(
        normalizedEmail,
        frequency,
        criteriaSummary,
        jobAlert.token,
        jobAlert.confirmationToken ?? jobAlert.token,
      );
    }

    return NextResponse.json({
      success: true,
      alert: {
        id: jobAlert.id,
        token: jobAlert.token,
      },
    });
  } catch (error) {
    logger.error('Error creating job alert', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create job alert' },
      { status: 500 }
    );
  }
}

// GET - Get all alerts for an email (look up email from token)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Token is required' },
        { status: 400 }
      );
    }

    // First find the alert to get the email
    const jobAlert = await prisma.jobAlert.findUnique({
      where: { token },
    });

    if (!jobAlert) {
      return NextResponse.json(
        { success: false, error: 'Job alert not found' },
        { status: 404 }
      );
    }

    // Now find ALL alerts for this email
    const allAlerts = await prisma.jobAlert.findMany({
      where: { email: jobAlert.email },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      alerts: allAlerts.map(a => ({
        id: a.id,
        token: a.token,
        email: a.email,
        name: a.name,
        keyword: a.keyword,
        location: a.location,
        mode: a.mode,
        jobType: a.jobType,
        minSalary: a.minSalary,
        maxSalary: a.maxSalary,
        frequency: a.frequency,
        isActive: a.isActive,
        lastSentAt: a.lastSentAt,
        createdAt: a.createdAt,
      })),
    });
  } catch (error) {
    logger.error('Error fetching job alert', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch job alert' },
      { status: 500 }
    );
  }
}

// DELETE - Delete alert by token
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Token is required' },
        { status: 400 }
      );
    }

    const jobAlert = await prisma.jobAlert.findUnique({
      where: { token },
    });

    if (!jobAlert) {
      return NextResponse.json(
        { success: false, error: 'Job alert not found' },
        { status: 404 }
      );
    }

    await prisma.jobAlert.delete({
      where: { token },
    });

    return NextResponse.json({
      success: true,
      message: 'Job alert deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting job alert', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete job alert' },
      { status: 500 }
    );
  }
}

