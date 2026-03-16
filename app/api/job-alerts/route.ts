import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { sanitizeJobAlert } from '@/lib/sanitize';
import { syncToBeehiiv } from '@/lib/beehiiv';
import { logger } from '@/lib/logger';
import { emailShell, headerBlock, primaryButton, secondaryButton, F, C } from '@/lib/email-service';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com';
const EMAIL_FROM = process.env.EMAIL_FROM_MARKETING || process.env.EMAIL_FROM || 'PMHNP Hiring <alerts@pmhnphiring.com>';
const EMAIL_REPLY_TO = 'hello@pmhnphiring.com';
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

  return parts.length > 0 ? parts.join(' · ') : 'all PMHNP jobs';
}

// Send alert confirmation email with Salary Guide — enterprise design system
async function sendAlertConfirmationEmail(
  email: string,
  frequency: string,
  criteriaSummary: string,
  token: string
): Promise<void> {
  try {
    const unsubUrl = `${BASE_URL}/job-alerts/unsubscribe?token=${token}`;

    const html = emailShell(`
          ${headerBlock('Job Alert Activated!', 'You\'ll never miss a matching job')}
          <tr>
            <td class="content-pad" style="padding: 32px 40px;">
              <p style="margin: 0 0 20px; font-family: ${F}; font-size: 15px; color: ${C.textSecondary}; line-height: 1.7;">
                Your alert is live! Here's what you'll receive:
              </p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid ${C.borderLight};">
                    <table role="presentation" cellspacing="0" cellpadding="0"><tr>
                      <td style="width: 28px; vertical-align: top; padding-top: 2px;">
                        <span style="font-family: ${F}; font-size: 16px; color: ${C.teal};">&#9993;</span>
                      </td>
                      <td>
                        <p style="margin: 0; font-family: ${F}; font-size: 14px; color: ${C.textPrimary}; font-weight: bold;">
                          ${frequency === 'daily' ? 'Daily' : 'Weekly'} Job Alerts
                        </p>
                        <p style="margin: 2px 0 0; font-family: ${F}; font-size: 13px; color: ${C.textMuted};">
                          New jobs matching: ${criteriaSummary}
                        </p>
                      </td>
                    </tr></table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid ${C.borderLight};">
                    <table role="presentation" cellspacing="0" cellpadding="0"><tr>
                      <td style="width: 28px; vertical-align: top; padding-top: 2px;">
                        <span style="font-family: ${F}; font-size: 16px; color: ${C.teal};">&#10003;</span>
                      </td>
                      <td>
                        <p style="margin: 0; font-family: ${F}; font-size: 14px; color: ${C.textPrimary}; font-weight: bold;">
                          Smart Matching
                        </p>
                        <p style="margin: 2px 0 0; font-family: ${F}; font-size: 13px; color: ${C.textMuted};">
                          Only relevant PMHNP positions — no spam
                        </p>
                      </td>
                    </tr></table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 10px 0;">
                    <table role="presentation" cellspacing="0" cellpadding="0"><tr>
                      <td style="width: 28px; vertical-align: top; padding-top: 2px;">
                        <span style="font-family: ${F}; font-size: 16px; color: ${C.teal};">&#9889;</span>
                      </td>
                      <td>
                        <p style="margin: 0; font-family: ${F}; font-size: 14px; color: ${C.textPrimary}; font-weight: bold;">
                          Be First to Apply
                        </p>
                        <p style="margin: 2px 0 0; font-family: ${F}; font-size: 13px; color: ${C.textMuted};">
                          Jobs delivered before they fill up
                        </p>
                      </td>
                    </tr></table>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding-right: 12px;">
                    ${primaryButton('Browse Jobs Now →', `${BASE_URL}/jobs`)}
                  </td>
                  <td>
                    ${secondaryButton('Manage Alert', `${BASE_URL}/job-alerts/manage?token=${token}`)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Salary Guide Section -->
          <tr>
            <td class="content-pad" style="padding: 0 40px 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top: 1px solid ${C.borderLight};">
                <tr>
                  <td style="padding-top: 28px;">
                    <p style="margin: 0 0 6px; font-family: ${F}; font-size: 13px; font-weight: bold; color: ${C.teal}; text-transform: uppercase; letter-spacing: 1px;">&#9733; FREE BONUS</p>
                    <p style="margin: 0 0 12px; font-family: ${F}; font-size: 18px; font-weight: bold; color: ${C.textPrimary};">2026 PMHNP Salary Guide</p>
                    <p style="margin: 0 0 16px; font-family: ${F}; font-size: 14px; color: ${C.textSecondary}; line-height: 1.6;">Salary ranges by state &middot; Remote vs in-person pay &middot; Negotiation tips</p>
                    ${primaryButton('Download Salary Guide (PDF)', SALARY_GUIDE_URL)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`,
      `<p style="margin: 8px 0 0; font-family: ${F}; font-size: 11px; color: ${C.textDimmed};">
        <a href="${BASE_URL}/job-alerts/manage?token=${token}" style="color: ${C.textFaded}; text-decoration: none;">Manage alert</a>
        &nbsp;&middot;&nbsp;
        <a href="${unsubUrl}" style="color: ${C.textFaded}; text-decoration: none;">Unsubscribe</a>
      </p>`,
      `Your PMHNP job alert is live! Browse 10,000+ jobs now.`
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
      subject: 'Job Alert Activated + Free Salary Guide',
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
          subject: 'Job Alert Activated + Free Salary Guide',
          emailType: 'welcome_alert',
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

    // Dedup: check if an alert with the same criteria already exists for this email
    let jobAlert;
    const existing = await prisma.jobAlert.findFirst({
      where: {
        email: normalizedEmail,
        isActive: true,
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

    // Build criteria summary and send confirmation email
    const criteriaSummary = buildCriteriaSummary(body);
    await sendAlertConfirmationEmail(normalizedEmail, frequency, criteriaSummary, jobAlert.token);

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

