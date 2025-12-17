import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

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

// GET - Get all alerts for an email
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Email is required' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase();

    const jobAlerts = await prisma.jobAlert.findMany({
      where: { email: normalizedEmail },
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

