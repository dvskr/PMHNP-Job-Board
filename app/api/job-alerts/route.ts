import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { sanitizeJobAlert } from '@/lib/sanitize';
import { logger } from '@/lib/logger';

const resend = new Resend(process.env.RESEND_API_KEY);
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const EMAIL_FROM = process.env.EMAIL_FROM || 'PMHNP Hiring <noreply@pmhnphiring.com>';

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

// Send alert confirmation email
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
      subject: 'Job Alert Created - PMHNP Jobs',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 20px;">Job Alert Created!</h1>
            
            <p style="font-size: 16px; margin-bottom: 16px;">
              You'll receive <strong>${frequency}</strong> emails for: <strong>${criteriaSummary}</strong>
            </p>
            
            <p style="font-size: 16px; margin-bottom: 24px;">
              We'll notify you when new jobs matching your criteria are posted.
            </p>
            
            <a href="${BASE_URL}/jobs" style="display: inline-block; background-color: #3b82f6; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 16px;">Browse Jobs Now</a>
            
            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
              <p>You're receiving this because you created a job alert at PMHNPHiring.com</p>
              <p><a href="${BASE_URL}/job-alerts/manage?token=${token}" style="color: #3b82f6;">Manage this alert</a> | <a href="${BASE_URL}/api/job-alerts?token=${token}" style="color: #3b82f6;">Delete alert</a></p>
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

    // Check if EmailLead exists, create if not
    const existingLead = await prisma.emailLead.findUnique({
      where: { email: normalizedEmail },
    });

    if (!existingLead) {
      // Create EmailLead for the new subscriber
      await prisma.emailLead.create({
        data: {
          email: normalizedEmail,
          source: 'job_alert',
        },
      });
    }

    // Create the job alert
    const jobAlert = await prisma.jobAlert.create({
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

