import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

const VALID_REASONS = ['expired', 'wrong_salary', 'scam', 'duplicate', 'wrong_info', 'other'];
const AUTO_UNPUBLISH_THRESHOLD = 3;

// Simple in-memory rate limit (per IP, 5 reports per hour)
const reportCounts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const entry = reportCounts.get(ip);
    if (!entry || now > entry.resetAt) {
        reportCounts.set(ip, { count: 1, resetAt: now + 3600000 });
        return false;
    }
    if (entry.count >= 5) return true;
    entry.count++;
    return false;
}

function hashIp(ip: string): string {
    // Simple hash for privacy — not storing raw IPs
    let hash = 0;
    for (let i = 0; i < ip.length; i++) {
        const chr = ip.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0;
    }
    return hash.toString(36);
}

export async function POST(request: NextRequest) {
    // Rate limiting
    const rateLimitResult = await rateLimit(request, 'job-report', RATE_LIMITS.feedback);
    if (rateLimitResult) return rateLimitResult;

    try {
        // Auth check
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json(
                { error: 'Authentication required' },
                { status: 401 }
            );
        }

        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || request.headers.get('x-real-ip')
            || 'unknown';

        if (isRateLimited(ip)) {
            return NextResponse.json(
                { error: 'Too many reports. Please try again later.' },
                { status: 429 }
            );
        }

        const body = await request.json();
        const { jobId, reason, details } = body;

        if (!jobId || !reason) {
            return NextResponse.json(
                { error: 'jobId and reason are required' },
                { status: 400 }
            );
        }

        if (!VALID_REASONS.includes(reason)) {
            return NextResponse.json(
                { error: `Invalid reason. Must be one of: ${VALID_REASONS.join(', ')}` },
                { status: 400 }
            );
        }

        // Verify job exists
        const job = await prisma.job.findUnique({
            where: { id: jobId },
            select: { id: true, title: true, employer: true, isPublished: true },
        });

        if (!job) {
            return NextResponse.json(
                { error: 'Job not found' },
                { status: 404 }
            );
        }

        // Look up reporter's profile for name
        const profile = await prisma.userProfile.findUnique({
            where: { supabaseId: user.id },
            select: { firstName: true, lastName: true, email: true },
        });

        const reporterEmail = profile?.email || user.email || null;
        const reporterName = profile?.firstName
            ? `${profile.firstName} ${profile.lastName || ''}`.trim()
            : null;

        // De-dup per reporter: one logged-in account must not be able to drive
        // the auto-unpublish threshold by filing the same job 3× (that would let
        // any single user take down any competitor's listing). If this reporter
        // already reported this job, acknowledge without creating a duplicate.
        const existingReport = reporterEmail
            ? await prisma.jobReport.findFirst({
                where: { jobId, reporterEmail },
                select: { id: true },
            })
            : null;

        let report = existingReport;
        if (!existingReport) {
            report = await prisma.jobReport.create({
                data: {
                    jobId,
                    reason,
                    details: details?.slice(0, 500) || null,
                    ipHash: hashIp(ip),
                    reporterEmail,
                    reporterName,
                },
                select: { id: true },
            });
        }

        // Threshold is measured in DISTINCT reporters, not raw report rows, so
        // legacy duplicate rows can't inflate it either.
        const distinctReporters = await prisma.jobReport.findMany({
            where: { jobId },
            distinct: ['reporterEmail'],
            select: { reporterEmail: true },
        });
        const reportCount = distinctReporters.length;

        let autoUnpublished = false;
        if (reportCount >= AUTO_UNPUBLISH_THRESHOLD && job.isPublished) {
            await prisma.job.update({
                where: { id: jobId },
                data: { isPublished: false },
            });
            autoUnpublished = true;
            logger.warn(`[Report] Auto-unpublished job "${job.title}" (${jobId}) after ${reportCount} reports`);
        }

        logger.info(`[Report] Job "${job.title}" reported: ${reason} (total: ${reportCount})`);

        return NextResponse.json({
            success: true,
            reportId: report?.id ?? null,
            alreadyReported: !!existingReport,
            totalReports: reportCount,
            autoUnpublished,
        });
    } catch (error) {
        logger.error('[Report] Error:', error);
        return NextResponse.json(
            { error: 'Failed to submit report' },
            { status: 500 }
        );
    }
}
