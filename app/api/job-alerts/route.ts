import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { sanitizeJobAlert } from '@/lib/sanitize';
import { logger } from '@/lib/logger';

const resend = new Resend(process.env.RESEND_API_KEY);
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://pmhnphiring.com';
const EMAIL_FROM = process.env.EMAIL_FROM || 'PMHNP Hiring <noreply@pmhnphiring.com>';
const SALARY_GUIDE_URL = process.env.SALARY_GUIDE_URL || 'https://zdmpmncrcpgpmwdqvekg.supabase.co/storage/v1/object/public/resources/PMHNP_Salary_Guide_2026.pdf';

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

  return parts.length > 0 ? parts.join(' ') : 'all PMHNP jobs';
}

// Send alert confirmation email with Salary Guide
async function sendAlertConfirmationEmail(
  email: string,
  frequency: string,
  criteriaSummary: string,
  token: string
): Promise<void> {
  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: '🎉 Welcome! Your Job Alerts + Free Salary Guide',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #0d9488; font-size: 24px; margin-bottom: 20px;">Welcome to PMHNP Hiring! 🎉</h1>
            
            <p style="font-size: 16px; margin-bottom: 16px;">
              Thanks for signing up! Here's what you'll get:
            </p>
            
            <ul style="font-size: 15px; margin-bottom: 20px; padding-left: 20px;">
              <li>📧 <strong>${frequency === 'daily' ? 'Daily' : 'Weekly'}</strong> emails with new PMHNP jobs</li>
              <li>🎯 Jobs matching: <strong>${criteriaSummary}</strong></li>
              <li>💰 Only relevant psychiatric NP positions</li>
            </ul>

            <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;" />

            <h2 style="color: #0d9488; font-size: 20px; margin-bottom: 16px;">🎁 Your Free Salary Guide</h2>
            
            <p style="font-size: 15px; margin-bottom: 16px;">
              As promised, here's your <strong>2026 PMHNP Salary Guide</strong>:
            </p>
            
            <p style="margin-bottom: 20px;">
              <a href="${SALARY_GUIDE_URL}" 
                 style="display: inline-block; background: #0d9488; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                📊 Download Salary Guide (PDF)
              </a>
            </p>

            <p style="color: #6b7280; font-size: 14px; margin-bottom: 8px;">
              Inside you'll find:
            </p>
            <ul style="color: #6b7280; font-size: 14px; padding-left: 20px; margin-bottom: 24px;">
              <li>Salary ranges by state</li>
              <li>Remote vs in-person pay comparison</li>
              <li>Negotiation tips to get paid what you deserve</li>
            </ul>

            <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;" />
            
            <p style="margin-bottom: 20px;">
              <a href="${BASE_URL}/jobs" style="display: inline-block; background-color: #14B8A6; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 15px;">Browse Jobs Now</a>
            </p>
            
            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
              <p>You're receiving this because you signed up at PMHNPHiring.com</p>
              <p><a href="${BASE_URL}/job-alerts/manage?token=${token}" style="color: #14B8A6;">Manage your alerts</a> · <a href="${BASE_URL}/job-alerts/unsubscribe?token=${token}" style="color: #14B8A6;">Unsubscribe</a></p>
            </div>
          </body>
        </html>
      `,
    });
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

    // Dedup: if this is a generic signup (no custom filters), reuse an existing active alert
    const isGenericSignup = !keyword && !location && !mode && !jobType && !minSalary && !maxSalary;
    let jobAlert;

    if (isGenericSignup) {
      const existing = await prisma.jobAlert.findFirst({
        where: {
          email: normalizedEmail,
          isActive: true,
          keyword: null,
          location: null,
          mode: null,
          jobType: null,
          minSalary: null,
          maxSalary: null,
        },
      });
      if (existing) {
        // Update frequency if changed, otherwise just reuse
        jobAlert = await prisma.jobAlert.update({
          where: { id: existing.id },
          data: { frequency, name: name || existing.name },
        });
      }
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

// GET - Get alert details by token
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

    const jobAlert = await prisma.jobAlert.findUnique({
      where: { token },
    });

    if (!jobAlert) {
      return NextResponse.json(
        { success: false, error: 'Job alert not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      alert: {
        id: jobAlert.id,
        email: jobAlert.email,
        name: jobAlert.name,
        keyword: jobAlert.keyword,
        location: jobAlert.location,
        mode: jobAlert.mode,
        jobType: jobAlert.jobType,
        minSalary: jobAlert.minSalary,
        maxSalary: jobAlert.maxSalary,
        frequency: jobAlert.frequency,
        isActive: jobAlert.isActive,
        lastSentAt: jobAlert.lastSentAt,
        createdAt: jobAlert.createdAt,
      },
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

