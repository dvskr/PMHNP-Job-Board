import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/employer/analytics
 * Return view + apply-click time-series data for an employer's jobs.
 * Query params: jobId (optional), days (default 30)
 */
export async function GET(req: NextRequest) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const jobIdFilter = searchParams.get('jobId');
    const days = parseInt(searchParams.get('days') || '30', 10);
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Get all job IDs owned by this employer
    const employerJobs = await prisma.employerJob.findMany({
        where: {
            OR: [
                { userId: user.id },
                { contactEmail: user.email! },
            ],
        },
        select: { jobId: true, job: { select: { id: true, title: true, viewCount: true, applyClickCount: true } } },
    });

    const jobIds = jobIdFilter ? [jobIdFilter] : employerJobs.map(ej => ej.jobId);

    if (jobIds.length === 0) {
        return NextResponse.json({ views: [], clicks: [], summary: { totalViews: 0, totalClicks: 0, ctr: 0 }, jobs: [] });
    }

    // Fetch apply clicks grouped by date (last N days)
    const applyClicks = await prisma.applyClick.groupBy({
        by: ['jobId'],
        where: {
            jobId: { in: jobIds },
            timestamp: { gte: since },
        },
        _count: { id: true },
    });

    // Build per-job summary
    const jobSummaries = employerJobs.map(ej => ({
        id: ej.job.id,
        title: ej.job.title,
        views: ej.job.viewCount,
        clicks: ej.job.applyClickCount,
        ctr: ej.job.viewCount > 0
            ? Math.round((ej.job.applyClickCount / ej.job.viewCount) * 1000) / 10
            : 0,
    }));

    const totalViews = jobSummaries.reduce((sum, j) => sum + j.views, 0);
    const totalClicks = jobSummaries.reduce((sum, j) => sum + j.clicks, 0);
    const ctr = totalViews > 0 ? Math.round((totalClicks / totalViews) * 1000) / 10 : 0;

    // Recent apply clicks (last N days) per day
    const recentClicks = await prisma.applyClick.findMany({
        where: {
            jobId: { in: jobIds },
            timestamp: { gte: since },
        },
        select: { timestamp: true },
        orderBy: { timestamp: 'asc' },
    });

    // Group clicks by date string
    const clicksByDate: Record<string, number> = {};
    recentClicks.forEach(click => {
        const dateKey = click.timestamp.toISOString().split('T')[0];
        clicksByDate[dateKey] = (clicksByDate[dateKey] || 0) + 1;
    });

    // Generate date labels for last N days
    const dateLabels: string[] = [];
    const clickSeries: number[] = [];
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateKey = d.toISOString().split('T')[0];
        dateLabels.push(dateKey);
        clickSeries.push(clicksByDate[dateKey] || 0);
    }

    return NextResponse.json({
        summary: { totalViews, totalClicks, ctr },
        jobs: jobSummaries,
        chart: {
            labels: dateLabels,
            clicks: clickSeries,
        },
    });
}
