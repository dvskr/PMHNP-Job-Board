import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

type JobAlertRow = {
  id: string;
  token: string;
  email: string;
  name: string | null;
  keyword: string | null;
  location: string | null;
  mode: string | null;
  jobType: string | null;
  minSalary: number | null;
  maxSalary: number | null;
  frequency: string;
  isActive: boolean;
  lastSentAt: Date | null;
  createdAt: Date;
};

// GET - Get all alerts for the authenticated caller's own email.
//
// SECURITY: this endpoint returns each alert's `token`, which is the bearer
// credential used to edit (PATCH /api/job-alerts/[token]) and delete
// (DELETE /api/job-alerts?token=) that alert. It must therefore ONLY ever
// return a caller's own alerts. We require a logged-in session whose email
// matches the requested address; otherwise knowing any victim's email (public
// info) would hand over their management tokens (IDOR).
//
// Email-link management does NOT use this route — those links carry ?token=
// and resolve via GET /api/job-alerts?token=.
export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, 'job-alerts-by-email', RATE_LIMITS.jobAlerts);
    if (limited) return limited;

    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Email is required' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase();

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }
    if ((user.email ?? '').toLowerCase() !== normalizedEmail) {
      return NextResponse.json(
        { success: false, error: 'You can only view alerts for your own email' },
        { status: 403 }
      );
    }

    const jobAlerts = await prisma.jobAlert.findMany({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      alerts: (jobAlerts as unknown as JobAlertRow[]).map((alert: JobAlertRow) => ({
        id: alert.id,
        token: alert.token,
        email: alert.email,
        name: alert.name,
        keyword: alert.keyword,
        location: alert.location,
        mode: alert.mode,
        jobType: alert.jobType,
        minSalary: alert.minSalary,
        maxSalary: alert.maxSalary,
        frequency: alert.frequency,
        isActive: alert.isActive,
        lastSentAt: alert.lastSentAt,
        createdAt: alert.createdAt,
      })),
    });
  } catch (error) {
    console.error('Error fetching job alerts by email:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch job alerts' },
      { status: 500 }
    );
  }
}

