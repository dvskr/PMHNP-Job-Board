import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { sanitizeJobAlert } from '@/lib/sanitize';
import { syncToBeehiiv } from '@/lib/beehiiv';
import { logger } from '@/lib/logger';
import { sendWelcomeEmail } from '@/lib/email-service';
import { buildCriteriaSummary, buildFilteredJobsUrl } from '@/lib/job-alerts-service';

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

    // Upsert EmailLead — create if new, optionally flip newsletterOptIn.
    // Newsletter consent is EXPLICIT opt-in only: creating a job alert must
    // never silently subscribe someone to the newsletter.
    const newsletterOptIn = body.newsletterOptIn === true;
    await prisma.emailLead.upsert({
      where: { email: normalizedEmail },
      update: newsletterOptIn ? { newsletterOptIn: true } : {},
      create: {
        email: normalizedEmail,
        source: 'job_alert',
        newsletterOptIn,
      },
    });

    // Sync to Beehiiv newsletter (fire-and-forget) — ONLY with explicit consent.
    if (newsletterOptIn) {
      syncToBeehiiv(normalizedEmail, { utmSource: 'job_alert' });
    }

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

    // Single opt-in: alerts are created already confirmed. Skipping the double-
    // opt-in confirmation email increases conversion through the funnel. Tradeoff:
    // weaker signal to ISPs (Gmail/Yahoo) about consent, slightly higher abuse risk
    // (someone signing up another person's email). The /api/job-alerts/confirm
    // endpoint stays in place for grandfathering any in-flight pending alerts from
    // the old flow.
    const now = new Date();

    // Re-submitting identical criteria signals intent to receive alerts, so a
    // paused alert IS reactivated — but never silently: the response carries
    // `reactivated` so the UI says so instead of pretending a new alert was
    // created (the unsubscribe page's Pause option must not be undone without
    // the user being told).
    const wasPaused = !!existing && !existing.isActive;
    if (existing) {
      jobAlert = await prisma.jobAlert.update({
        where: { id: existing.id },
        data: {
          frequency,
          name: name || existing.name,
          isActive: true,
          confirmedAt: existing.confirmedAt ?? now,
        },
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
          isActive: true,
          confirmedAt: now,
        },
      });
    }

    // Send the welcome / "alerts are active" email immediately. This is what users
    // would have received after clicking Confirm under the old double-opt-in flow.
    // Only send for newly confirmed alerts to avoid spamming on every form submit.
    const isNewlyConfirmed = !existing || !existing.confirmedAt;
    if (isNewlyConfirmed) {
      // Personalized welcome: echo the alert's criteria + frequency back to the
      // subscriber and deep-link the CTA to the matching /jobs search.
      await sendWelcomeEmail(normalizedEmail, jobAlert.token, {
        criteriaSummary: buildCriteriaSummary(jobAlert),
        filteredJobsUrl: buildFilteredJobsUrl(jobAlert),
        frequency: jobAlert.frequency,
        location: jobAlert.location,
      });
    }

    return NextResponse.json({
      success: true,
      reactivated: wasPaused,
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

